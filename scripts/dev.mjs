import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import worker from '../src/worker.js'

const root = fileURLToPath(new URL('../', import.meta.url))

// Only the development server imports this file. Production binds actual D1 and R2.
class LocalD1 {
  constructor(filename) {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  }
  prepare(sql) {
    const statement = this.db.prepare(sql)
    function bound(values) {
      const args = values.map(value => value === undefined ? null : value)
      return {
        bind(...next) { return bound(next) },
        first(field) {
          const row = statement.get(...args)
          return (field ? row?.[field] : row) ?? null
        },
        all() { return { success: true, results: statement.all(...args), meta: {} } },
        run() {
          const { changes, lastInsertRowid } = statement.run(...args)
          return { success: true, results: [], meta: { changes, last_row_id: lastInsertRowid } }
        }
      }
    }
    return bound([])
  }
  batch(statements) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const rows = statements.map(statement => statement.run())
      this.db.exec('COMMIT')
      return rows
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  exec(sql) { return this.db.exec(sql) }
}

class LocalR2 {
  constructor(directory) { this.directory = directory }
  filename(key) { return path.join(this.directory, createHash('sha256').update(key).digest('hex')) }
  async put(key, value, options = {}) {
    const filename = this.filename(key)
    const temporary = filename + '.' + randomUUID()
    const hash = createHash('sha256')
    const digest = new Transform({
      transform(chunk, _, next) { hash.update(chunk); next(null, chunk) }
    })
    try {
      await pipeline(Readable.fromWeb(new Response(value).body), digest, createWriteStream(temporary, { mode: 0o600 }))
      const { size } = await stat(temporary)
      const meta = { key, size, etag: hash.digest('hex'), httpMetadata: options.httpMetadata || {} }
      await writeFile(temporary + '.json', JSON.stringify(meta))
      await rename(temporary, filename)
      await rename(temporary + '.json', filename + '.json')
      return this.head(key)
    } finally {
      await Promise.all([temporary, temporary + '.json'].map(file => rm(file, { force: true })))
    }
  }
  async head(key) {
    let object
    try { object = JSON.parse(await readFile(this.filename(key) + '.json', 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
    object.httpEtag = '"' + object.etag + '"'
    object.writeHttpMetadata = headers => {
      const supported = { contentType: 'content-type', contentDisposition: 'content-disposition', cacheControl: 'cache-control', contentEncoding: 'content-encoding', contentLanguage: 'content-language' }
      for (const [field, header] of Object.entries(supported)) {
        if (object.httpMetadata[field]) headers.set(header, object.httpMetadata[field])
      }
    }
    return object
  }
  async get(key, options = {}) {
    const object = await this.head(key)
    if (!object) return null
    const range = options.range || {}
    const start = range.suffix ? Math.max(0, object.size - range.suffix) : (range.offset || 0)
    const end = Math.min(object.size, start + (range.length ?? object.size)) - 1
    if (options.range) object.range = { offset: start, length: Math.max(0, end - start + 1) }
    object.body = end < start ? new Blob([]).stream() : Readable.toWeb(createReadStream(this.filename(key), { start, end }))
    object.arrayBuffer = () => new Response(object.body).arrayBuffer()
    return object
  }
  async delete(keys) {
    for (const key of [keys].flat()) {
      const filename = this.filename(key)
      await Promise.all([filename, filename + '.json'].map(file => rm(file, { force: true })))
    }
  }
}

async function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)')
  const dir = path.join(root, 'migrations')
  for (const name of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first()) continue
    const sql = await readFile(path.join(dir, name), 'utf8')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO local_migrations VALUES (?)').bind(name).run()
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

function localLogin(request, secret) {
  if (request.method === 'GET') {
    return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>JoltFeed local sign-in</title><main style="max-width:26rem;margin:12vh auto;padding:24px;font:16px system-ui"><h1>Local sign-in</h1><p>Enter the token printed by the development server.</p><form method="post"><label>Local admin token <input required autofocus type="password" name="token"></label> <button>Sign in</button></form></main>', { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  return (async () => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 })
    const input = Buffer.from(String((await request.formData()).get('token') ?? ''))
    const expected = Buffer.from(secret)
    if (input.length !== expected.length || !timingSafeEqual(input, expected)) return new Response('Invalid token', { status: 403 })
    return new Response(null, { status: 303, headers: {
      Location: '/admin', 'Cache-Control': 'no-store', 'Set-Cookie': 'jf_local=' + secret + '; Path=/; HttpOnly; SameSite=Strict'
    } })
  })()
}

export async function createLocalApp({ directory, token }) {
  const uploads = path.join(directory, 'uploads')
  await mkdir(uploads, { recursive: true, mode: 0o700 })
  const db = new LocalD1(path.join(directory, 'joltfeed.sqlite'))
  await migrate(db)
  const env = { DB: db, MEDIA: new LocalR2(uploads), LOCAL_DEV: true, LOCAL_ADMIN_TOKEN: token }
  return {
    env,
    close() { db.db.close() },
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/_local/login') return localLogin(request, token)
      return worker.fetch(request, env, { waitUntil(work) { Promise.resolve(work).catch(console.error) } })
    }
  }
}

async function run() {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(name)
    return index < 0 ? fallback : process.argv[index + 1]
  }
  const port = Number(option('--port', process.env.PORT || 8787))
  const hostname = option('--host', option('--hostname', process.env.HOST || '127.0.0.1'))
  const directory = path.resolve(process.env.JOLTFEED_DATA_DIR || path.join(root, '.local'))
  const token = process.env.LOCAL_ADMIN_TOKEN || randomBytes(30).toString('base64url')
  if (!/^[a-zA-Z0-9_-]{16,}$/.test(token)) throw Error('Use a LOCAL_ADMIN_TOKEN with at least 16 URL-safe characters.')
  const app = await createLocalApp({ directory, token })
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, 'http://' + incoming.headers.host)
      const init = { method: incoming.method, headers: incoming.headers }
      if (!['GET', 'HEAD'].includes(incoming.method)) Object.assign(init, { body: Readable.toWeb(incoming), duplex: 'half' })
      const response = await app.fetch(new Request(url, init))
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing)
      else outgoing.end()
    } catch (error) {
      if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') return
      console.error(error)
      if (!outgoing.headersSent) outgoing.writeHead(500)
      outgoing.end('Request failed')
    }
  })
  server.listen(port, hostname, () => {
    console.log('JoltFeed at http://' + hostname + ':' + server.address().port)
    console.log('Local sign-in: /_local/login')
    if (!process.env.LOCAL_ADMIN_TOKEN) console.log('Local admin token: ' + token)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.close(); process.exit(0) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().catch(error => { console.error(error); process.exitCode = 1 })
}

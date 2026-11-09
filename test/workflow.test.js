import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const token = 'integration-test-local-token'
const canonical = 'https://joltfeed-test.example'
const desktop = { 'Sec-CH-UA-Mobile': '?0', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/128' }
const mobile = { 'Sec-CH-UA-Mobile': '?1', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari' }

async function boot(directory) {
  const child = spawn(process.execPath, ['scripts/dev.mjs', '--host', '127.0.0.1', '--port', '0'], {
    cwd: project, env: { ...process.env, JOLTFEED_DATA_DIR: directory, LOCAL_ADMIN_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe']
  })
  let logs = ''
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Local server did not start: ' + logs)) }, 10000)
    child.stderr.on('data', part => { logs += part })
    child.stdout.on('data', part => {
      logs += part
      const match = logs.match(/JoltFeed at (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
    child.once('exit', code => { clearTimeout(timer); reject(Error('Local server exited (' + code + '): ' + logs)) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
  })
  return { url, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return
    const finished = once(child, 'exit')
    child.kill('SIGTERM')
    await finished
  } }
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], m[2] ?? m[3]]))
}
function meta(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = attributes(tag)
    if ((attrs.property ?? attrs.name) === name) return attrs.content
  }
}
function oneAndOrdered(html, markers) {
  let last = -1
  for (const marker of markers) {
    const current = html.indexOf(marker)
    assert.ok(current > last, 'Expected in order: ' + marker)
    assert.equal(html.indexOf(marker, current + marker.length), -1, 'Expected exactly once: ' + marker)
    last = current
  }
}
function fixture(name) { return readFile(path.join(project, 'fixtures', 'media', name)) }

test('publishing, media, ad placements, social HTML and restart through HTTP', { timeout: 60000 }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'joltfeed-test-'))
  let server
  t.after(async () => { await server?.stop(); await rm(dir, { recursive: true, force: true }) })
  server = await boot(dir)
  const get = (route, headers = {}) => fetch(server.url + route, { headers, redirect: 'manual' })
  const admin = { Cookie: 'jf_local=' + token }
  const login = await fetch(server.url + '/_local/login', {
    method: 'POST', headers: { Origin: server.url }, body: new URLSearchParams({ token }), redirect: 'manual'
  })
  assert.equal(login.status, 303)
  assert.match(login.headers.get('Set-Cookie'), /jf_local=.*HttpOnly.*SameSite=Strict/)
  assert.equal(login.headers.get('Location'), '/admin')
  const write = (route, record, extra = {}) => fetch(server.url + '/admin/api/' + route, {
    method: 'POST', headers: { ...admin, Origin: server.url, ...(record instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...extra },
    body: record instanceof FormData ? record : JSON.stringify(record), redirect: 'manual'
  })
  const save = async (route, record) => {
    const response = await write(route, record)
    const body = await response.text()
    assert.ok(response.ok, route + ' returned ' + response.status + ': ' + body)
    return JSON.parse(body)
  }
  const upload = async (file, type) => {
    const form = new FormData()
    form.set('file', new Blob([await fixture(file)], { type }), file)
    if (type === 'image/jpeg') {
      const small = file.replace('.jpg', '-480.jpg')
      form.set('small', new Blob([await fixture(small)], { type: 'image/jpeg' }), small)
    }
    return (await save('media', form)).media
  }
  const read = async (route, headers) => {
    const response = await get(route, headers)
    assert.equal(response.status, 200, route)
    return response.text()
  }
  const denied = async (route, headers) => {
    const response = await get(route, headers)
    assert.ok([302,303,307,401,403,404].includes(response.status), route + ' needs authorization')
  }

  await denied('/admin/api/state')
  await denied('/admin/api/state', { Cookie: 'jf_local=invalid' })
  const anonymousWrite = await write('posts', { title: 'Unauthorized', action: 'publish' }, { Cookie: '' })
  assert.ok([302,303,307,401,403].includes(anonymousWrite.status))
  const malicious = await write('posts', { title: 'CSRF', action: 'publish' }, { Origin: 'https://elsewhere.example' })
  assert.equal(malicious.status, 403)
  const photo = await upload('garden-pavilion.jpg', 'image/jpeg')
  const fallback = await upload('apricot-dahlia.jpg', 'image/jpeg')
  const video = await upload('garden-study.mp4', 'video/mp4')
  await denied(photo.url)
  await save('settings', { siteName: 'JoltFeed', publicUrl: canonical, defaultSocialImage: fallback.id, maxAds: 4, bootstrapCode: '<script data-bootstrap-marker="site-once"></script>' })

  const cases = [
    ['Above the headline', 'beforeTitle', 'QA_UNIT_ABOVE'],
    ['Paragraph three', 'beforeParagraph', 'QA_UNIT_THREE'],
    ['Halfway point', 'percentage', 'QA_UNIT_HALF'],
    ['After story', 'afterPost', 'QA_UNIT_END']
  ]
  for (const [name, placement, marker] of cases) {
    await save('ads', { name, placement, code: '<span>' + marker + '</span>', enabled: true, device: 'all', priority: 10, number: 3, percentage: 50 })
  }

  const short = await save('posts', { action: 'publish', title: 'The next chapter', slug: 'next-chapter', blocks: [{ type:'paragraph', text: 'A brief follow-up.' }] })
  const noAds = await save('posts', { action: 'publish', title: 'Quiet edition', slug: 'quiet-edition', disableAds: true, blocks: [{ type: 'paragraph', text: 'Read without units.' }] })
  assert.ok(short.id && noAds.id)
  const markers = Array.from({ length: 8 }, (_, i) => 'Paragraph' + (i + 1) + ' describes the garden after dawn.')
  const blocks = [{ type: 'heading', level: 2, text: 'Field notes' }]
  for (const [index, text] of markers.entries()) {
    blocks.push({ type: 'paragraph', text })
    if (index === 0) blocks.push({ type: 'image', mediaId: photo.id, alt: 'A garden pavilion', caption: 'Morning light.' })
    if (index === 2) blocks.push({ type: 'video', mediaId: video.id, posterId: photo.id })
  }
  const initial = await save('posts', { action: 'save', title: 'A garden opens', slug: 'a-garden-opens', featured: true, author: 'JoltFeed desk', category: 'Places', excerpt: 'The garden in the morning.', featuredImage: photo.id, blocks })
  const story = '/story/a-garden-opens'
  const preview = '/admin/preview/' + initial.id
  await denied(preview)
  assert.equal((await get(story)).status, 404)
  assert.doesNotMatch(await read('/sitemap.xml'), /a-garden-opens/)
  const privateResponse = await get(preview, admin)
  assert.equal(privateResponse.status, 200)
  assert.match(privateResponse.headers.get('Cache-Control') || '', /no-store/)
  const live = await save('posts', { id: initial.id, revision: initial.post.revision, action: 'publish' })
  assert.match(await read('/'), /A garden opens/)
  assert.ok((await read('/sitemap.xml')).includes(canonical + story))

  const verifyOrder = html => {
    const body = html.split(/<body\b[^>]*>/i).at(-1)
    const title = body.match(/<h1\b[^>]*>[^<]*A garden opens[^<]*<\/h1>/i)?.[0]
    assert.ok(title, 'Server-rendered headline')
    oneAndOrdered(body, ['QA_UNIT_ABOVE', title, 'Field notes', markers[0], 'Morning light.', markers[1], 'QA_UNIT_THREE', markers[2], '<video', markers[3], 'QA_UNIT_HALF', markers[4], markers[5], markers[6], markers[7], 'QA_UNIT_END'])
    assert.equal((html.match(/data-bootstrap-marker=/g) || []).length, 1, 'Bootstrap exactly once')
    assert.ok(body.indexOf('QA_UNIT_END') < body.indexOf('Share this story'))
    assert.ok(body.indexOf('Share this story') < body.indexOf('More stories'))
  }
  for (const profile of [mobile, desktop]) {
    const html = await read(story, profile)
    verifyOrder(html)
    assert.equal(meta(html, 'og:url'), canonical + story)
    assert.equal(meta(html, 'og:image'), canonical + photo.url)
    assert.equal(meta(html, 'og:site_name'), 'JoltFeed')
    assert.equal(meta(html, 'og:type'), 'article')
    assert.equal(meta(html, 'og:title'), 'A garden opens')
    assert.equal(meta(html, 'og:description'), 'The garden in the morning.')
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image')
    assert.ok((html.match(/<link\b[^>]*>/gi) || []).map(attributes).some(a => a.rel === 'canonical' && a.href === canonical + story))
    const link = (html.match(/<a\b[^>]*>/gi) || []).map(attributes).find(a => a.href?.endsWith('/story/next-chapter'))?.href
    assert.ok(link, 'Internal story link')
    const another = await read(new URL(link, server.url).pathname, profile)
    assert.doesNotMatch(another, /QA_UNIT_THREE/)
    assert.equal(meta(another, 'og:image'), canonical + fallback.url)
    verifyOrder(await read(story, profile))
  }

  const mobileUnit = await save('ads', { name: 'Mobile override', placement: 'beforeTitle', device: 'mobile', priority: 20, enabled: true, code: '<span>QA_MOBILE_ONLY</span>' })
  const mobileVersion = await read(story, mobile)
  assert.match(mobileVersion, /QA_MOBILE_ONLY/)
  assert.doesNotMatch(mobileVersion, /QA_UNIT_ABOVE/)
  const deskVersion = await read(story, desktop)
  assert.doesNotMatch(deskVersion, /QA_MOBILE_ONLY/)
  assert.match(deskVersion, /QA_UNIT_ABOVE/)
  await save('ads', { ...mobileUnit.ad, id: mobileUnit.id, name: 'Mobile override', placement: 'beforeTitle', enabled: false })

  const diagnostic = await read('/admin/preview/' + short.id + '?placements=1&device=mobile', admin)
  assert.match(diagnostic, /Post has 1 paragraphs?, rule requires 3/i)
  assert.doesNotMatch(diagnostic, /QA_UNIT_ABOVE|QA_UNIT_THREE|QA_UNIT_HALF|QA_UNIT_END/)
  const disabledHtml = await read('/story/quiet-edition')
  for (const [, , marker] of cases) assert.ok(!disabledHtml.includes(marker))
  assert.ok(!disabledHtml.includes('data-bootstrap-marker'))
  assert.equal((await get(photo.url)).status, 200)
  assert.equal((await get(photo.url + '?w=480')).headers.get('Content-Type'), 'image/jpeg')
  assert.match(await read(story), /srcset="[^"]*480w/)
  const stateResponse = await get('/admin/api/state', admin)
  assert.match(stateResponse.headers.get('Cache-Control') || '', /no-store/)
  const range = await get(video.url, { Range: 'bytes=4-15' })
  assert.equal(range.status, 206)
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), (await fixture('garden-study.mp4')).subarray(4, 16))

  const draft = await save('posts', { id: live.id, revision: live.post.revision, action: 'save', title: 'Working headline' })
  assert.equal(meta(await read(story), 'og:title'), 'A garden opens')
  assert.ok((await read(preview, admin)).includes('Working headline'))
  const stale = await write('posts', { id: live.id, revision: live.post.revision, action: 'publish', title: 'Stale draft' })
  assert.equal(stale.status, 409)
  await save('posts', { id: draft.id, revision: draft.post.revision, action: 'publish', title: 'Opening day', socialTitle: 'The garden returns', socialDescription: 'An updated story.', socialImage: fallback.id, hideFeaturedImage: true })
  const updated = await read(story)
  assert.ok(updated.includes('Opening day'))
  assert.equal(meta(updated, 'og:title'), 'The garden returns')
  assert.equal(meta(updated, 'og:description'), 'An updated story.')
  assert.equal(meta(updated, 'og:image'), canonical + fallback.url)
  assert.match(await read('/'), /Opening day/)
  assert.doesNotMatch(updated, /<figure class="hero-photo">/)
  assert.ok(updated.includes('class="body"'), 'Body photograph stays visible when the featured image is hidden')

  await server.stop()
  server = await boot(dir)
  assert.equal(meta(await read(story), 'og:title'), 'The garden returns')
  assert.equal((await get(video.url)).status, 200)
  await save('posts', { id: live.id, action: 'unpublish' })
  assert.equal((await get(story)).status, 404)
  assert.doesNotMatch(await read('/'), /Opening day/)
  assert.doesNotMatch(await read('/sitemap.xml'), /a-garden-opens/)
  await denied(video.url)
  assert.equal((await get(video.url, admin)).status, 200)
  await save('posts', { id: live.id, action: 'trash' })
  assert.equal((JSON.parse(await read('/admin/api/state', admin))).posts.find(p => p.id === live.id)?.status, 'trash')
  assert.equal((await get(preview, admin)).status, 404)
})

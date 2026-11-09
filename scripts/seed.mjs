// Publish fixtures through the same authenticated API the editor uses.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { demoStories, qaStories, qaAds, mediaFiles } from '../fixtures/stories.mjs'

export async function seed(mode, { request, origin, log = () => {} }) {
  if (!['demo','qa'].includes(mode)) throw Error('Use demo or qa.')
  const state = await request('/admin/api/state')
  const stories = mode === 'qa' ? qaStories : demoStories
  const expected = new Set(stories({}).map(post => post.slug))
  if (mode === 'qa' && (state.posts.some(post => !expected.has(post.slug)) ||
      state.ads.some(ad => !qaAds.some(unit => unit.name === ad.name)))) {
    throw Error('QA installs sitewide test ads. Run it on an empty, dedicated test instance.')
  }
  const referenced = mode === 'qa' ? ['garden', 'film', 'dahlia'] : ['garden', 'hopper', 'dahlia']
  const media = {}
  for (const key of referenced) {
    const [name, type] = mediaFiles[key]
    const matches = state.media.filter(item => item.name === name && item.type === type)
    if (matches.length > 1) throw Error('Multiple existing media items match ' + name + '. Choose an empty test instance.')
    if (matches[0]) media[key] = matches[0].id
    else {
      const data = new FormData()
      const bytes = await readFile(new URL('../fixtures/media/' + name, import.meta.url))
      data.set('file', new Blob([bytes], {type}), name)
      if (type.startsWith('image/')) {
        const small = name.replace(/\.jpg$/, '-480.jpg')
        const variant = await readFile(new URL('../fixtures/media/' + small, import.meta.url))
        data.set('small', new Blob([variant], {type:'image/jpeg'}), small)
      }
      media[key] = (await request('/admin/api/media', data)).media.id
    }
  }
  if (mode === 'qa') {
    if (!state.settings.defaultSocialImage) {
      await request('/admin/api/settings', {...state.settings, defaultSocialImage: media.dahlia})
    }
    for (const ad of qaAds) {
      if (!state.ads.some(existing => existing.name === ad.name)) await request('/admin/api/ads', ad)
    }
  }
  for (const post of stories(media)) {
    if (state.posts.some(existing => existing.slug === post.slug)) {
      log('Already exists: ' + post.slug)
      continue
    }
    await request('/admin/api/posts', {...post, action: 'publish'})
    log('Published ' + new URL('/story/' + post.slug, origin))
  }
  return media
}

async function run() {
  const mode = process.argv[2]
  const origin = new URL(process.env.JOLT_BASE_URL || 'http://127.0.0.1:8787').origin
  const local = ['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)
  if (!local && (!process.argv.includes('--allow-remote') || !origin.startsWith('https://'))) {
    throw Error('Use an HTTPS preview origin and pass --allow-remote to publish fixtures outside localhost.')
  }
  const headers = {Origin: origin}
  if (process.env.JOLT_COOKIE) headers.Cookie = process.env.JOLT_COOKIE
  else if (local && process.env.LOCAL_ADMIN_TOKEN) headers.Cookie = 'jf_local=' + process.env.LOCAL_ADMIN_TOKEN
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET
  }
  async function request(path, payload) {
    const json = payload !== undefined && !(payload instanceof FormData)
    const res = await fetch(origin + path, {
      method: payload === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: {...headers, ...(json ? {'Content-Type':'application/json'} : {})},
      body: json ? JSON.stringify(payload) : payload,
    })
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
      const message = res.headers.get('content-type')?.includes('application/json') ? (await res.json()).error : ''
      throw Error(path + ' returned HTTP ' + res.status + '. ' + (message || 'Check the origin and admin credentials.'))
    }
    return res.json()
  }
  await seed(mode, {origin, request, log: console.log})
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(err => {console.error(err.message); process.exitCode = 1})
}

// Imported exclusively by the managed preview build, which bundles JPEGs as base64.
import garden from '../fixtures/media/garden-pavilion.jpg'
import gardenSmall from '../fixtures/media/garden-pavilion-480.jpg'
import hopper from '../fixtures/media/grace-hopper.jpg'
import hopperSmall from '../fixtures/media/grace-hopper-480.jpg'
import dahlia from '../fixtures/media/apricot-dahlia.jpg'
import dahliaSmall from '../fixtures/media/apricot-dahlia-480.jpg'
import { demoStories, mediaFiles } from '../fixtures/stories.mjs'

const photos = [
  {key:'garden', source:garden, small:gardenSmall, width:640, height:427},
  {key:'dahlia', source:dahlia, small:dahliaSmall, width:640, height:427},
  {key:'hopper', source:hopper, small:hopperSmall, width:512, height:600},
]
const pending = new WeakMap()
const marker = 'WHERE EXISTS (SELECT 1 FROM demo_installation WHERE id = 1 AND install_owner = ?)'

export function ensureDemo(env) {
  let task = pending.get(env.DB)
  if (!task) {
    task = installDemo(env).catch(error => {
      pending.delete(env.DB)
      throw error
    })
    pending.set(env.DB, task)
  }
  return task
}

async function installDemo({DB, MEDIA}) {
  if (await DB.prepare('SELECT 1 FROM demo_installation WHERE id = 1').first()) return
  const token = crypto.randomUUID()
  const now = Date.now()
  // A simultaneous editor or another isolate may win. Only the transaction that
  // acquired the new marker on a fresh database may add example records.
  const statements = [DB.prepare(`INSERT OR IGNORE INTO demo_installation (id, install_owner)
    SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM posts) OR EXISTS (SELECT 1 FROM media)
      OR EXISTS (SELECT 1 FROM settings) OR EXISTS (SELECT 1 FROM ads)
      THEN 'existing-content' ELSE ? END`).bind(token)]
  const ids = {}
  for (const {key, source, small, width, height} of photos) {
    const id = 'demo-photo-' + key
    ids[key] = id
    const original = Uint8Array.from(atob(source), c => c.charCodeAt(0))
    const variant = Uint8Array.from(atob(small), c => c.charCodeAt(0))
    const metadata = {httpMetadata:{contentType:'image/jpeg'}}
    // Deterministic keys and identical bytes make concurrent attempts safe.
    // Write objects first so a visible post never references a partial upload.
    await Promise.all([MEDIA.put(id, original, metadata), MEDIA.put(id + '-480', variant, metadata)])
    statements.push(DB.prepare(`INSERT INTO media(id,name,type,size,created_at,width,height,variants)
      SELECT ?,?,?,?,?,?,?,? ` + marker).bind(id,mediaFiles[key][0],'image/jpeg',original.length,
      new Date(now).toISOString(),width,height,JSON.stringify([{width:480,type:'image/jpeg',size:variant.length}]),token))
  }
  const stories = demoStories(ids)
  stories.forEach((story, index) => {
    const timestamp = new Date(now - (stories.length-1-index)*86400000).toISOString()
    const document = JSON.stringify(story)
    statements.push(DB.prepare(`INSERT INTO posts(id,draft,live,live_slug,live_media,published_at,updated_at)
      SELECT ?,?,?,?,?,?,? ` + marker).bind('demo-story-' + story.slug,document,document,story.slug,
      JSON.stringify([story.featuredImage]),timestamp,timestamp,token))
  })
  await DB.batch(statements)
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const quill = await readFile(new URL('node_modules/quill/dist/quill.js', root), 'utf8')
const social = await readFile(new URL('assets/social.png', root), 'base64')
await mkdir(new URL('.generated/', root), {recursive:true})
await writeFile(new URL('.generated/assets.js', root), 'export const quill = '+JSON.stringify(quill)+';\nexport const social = '+JSON.stringify(social)+';\n')

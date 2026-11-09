import './assets.mjs'
import {build} from 'esbuild'
import {mkdir,readFile,readdir,writeFile,cp} from 'node:fs/promises'

const options={bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',loader:{'.jpg':'base64'}}
await build({...options,entryPoints:['src/worker.js'],outfile:'dist/cloudflare/index.js'})
if (process.argv.includes('--managed')) await buildManagedPreview()

async function buildManagedPreview() {
  // The managed preview alone includes sample stories and platform identity support.
  await build({...options,entryPoints:['src/managed.js'],outfile:'dist/server/index.js'})
  await mkdir('dist/.openai',{recursive:true})
  await cp('.openai/hosting.json','dist/.openai/hosting.json')
  await mkdir('drizzle/meta',{recursive:true})
  const migrations=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()
  const entries=[]
  for(const [idx,file] of migrations.entries()){
    const tag=file.slice(0,-4)
    const sql=await readFile('migrations/'+file,'utf8')
    await writeFile('drizzle/'+file,sql.replace(/;\s*\n(?=\S)/g,';\n--> statement-breakpoint\n'))
    entries.push({idx,version:'6',when:1760000000000+idx,tag,breakpoints:true})
  }
  await writeFile('drizzle/meta/_journal.json',JSON.stringify({version:'7',dialect:'sqlite',entries},null,2))
}

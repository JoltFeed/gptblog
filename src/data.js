const defaults = {siteName: 'JoltFeed', publicUrl: '', logo: '', favicon: '', defaultSocialImage: '', maxAds: 4, bootstrapCode: ''};
const placements = new Set(['beforeTitle','afterTitle','beforeFirst','beforeParagraph','afterParagraph','every','percentage','afterPost','manual']);
const kinds = new Set(['paragraph','heading','quote','list','image','video','embed','ad']);
const MAX_MEDIA = 32 * 1024 * 1024;

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function check(condition, message, status) {
  if (!condition) throw new InputError(message, status);
}
function str(value, max = 2000) {
  const s = value ?? '';
  check(typeof s === 'string' && s.length <= max, 'Invalid or overlong text.');
  return s;
}
function integer(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  check(Number.isSafeInteger(n) && n >= min && n <= max, 'A number is outside its allowed range.');
  return n;
}
function flag(value) { return value === true; }
function ref(value) {
  const id = str(value, 100);
  check(!id || /^[a-zA-Z0-9_-]+$/.test(id), 'Invalid media or record reference.');
  return id;
}
function external(value, protocols = ['https:', 'http:']) {
  let u;
  try { u = new URL(str(value)); } catch { throw new InputError('Enter a valid absolute URL.'); }
  check(protocols.includes(u.protocol) && !u.username && !u.password, 'Unsupported URL.');
  return u;
}
function safeLink(value) {
  if (!value) return undefined;
  if (/^\/(?![/\\])[^\\]*$/.test(value)) return str(value);
  return external(value, ['https:', 'http:', 'mailto:', 'tel:']).href;
}
function block(b) {
  check(b && typeof b === 'object' && kinds.has(b.type), 'Unrecognized content block.');
  const type = b.type;
  if (['paragraph','heading','quote'].includes(type)) {
    const result = {type, text: str(b.text,100000)};
    if (b.runs != null) {
      check(Array.isArray(b.runs) && b.runs.length <= 2000, 'Invalid rich text.');
      result.runs = b.runs.map(r => ({text:str(r.text,100000),bold:flag(r.bold),italic:flag(r.italic),href:safeLink(r.href)}));
      if (result.runs.length) result.text = result.runs.map(r=>r.text).join('');
    }
    if (type === 'heading') result.level = integer(b.level,2,2,4);
    return result;
  }
  if (type === 'list') {
    check(Array.isArray(b.items) && b.items.length <= 500, 'Invalid list.');
    return {type,ordered:flag(b.ordered),items:b.items.map(item=>str(item,20000))};
  }
  if (type === 'ad') return {type,adId:ref(b.adId)};
  if (type === 'embed') {
    if (!b.url) return {type,url:''};
    const u = external(b.url,['https:']);
    check(/^(?:(?:www\.|m\.)?youtube\.com|(?:www\.)?youtube-nocookie\.com|youtu\.be|(?:www\.|player\.)?vimeo\.com)$/.test(u.hostname), 'Use a YouTube or Vimeo URL.');
    return {type,url:u.href};
  }
  const result = {type, mediaId:ref(b.mediaId),caption:str(b.caption,2000)};
  if (type === 'image') result.alt = str(b.alt,1000);
  else result.posterId = ref(b.posterId);
  return result;
}
function postData(p) {
  check(Array.isArray(p.blocks ?? []) && (p.blocks ?? []).length <= 1500, 'Too many content blocks.');
  const title = str(p.title,350);
  const slug = str(p.slug || title.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || '',200);
  check(!slug || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Use lowercase letters, digits and hyphens for the slug.');
  return {title,slug,excerpt:str(p.excerpt,10000),author:str(p.author,200),category:str(p.category,200),
    featuredImage:ref(p.featuredImage),socialImage:ref(p.socialImage),socialTitle:str(p.socialTitle,350),
    socialDescription:str(p.socialDescription,10000),featured:flag(p.featured),disableAds:flag(p.disableAds),
    hideFeaturedImage:flag(p.hideFeaturedImage),blocks:(p.blocks ?? []).map(block)};
}
function usedMedia(p) {
  return [...new Set([p.featuredImage,p.socialImage,...p.blocks.flatMap(b=>[b.mediaId,b.posterId])].filter(Boolean))];
}
function mediaRow(r) {
  return {id:r.id,name:r.name,type:r.type,url:'/media/'+r.id,width:r.width,height:r.height,variants:JSON.parse(r.variants).map(v=>({width:v.width,url:'/media/'+r.id+'?w='+v.width}))};
}
async function mediaMap(env, ids) {
  if (!ids.length) return {};
  const records = await env.DB.prepare('SELECT * FROM media WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all();
  return Object.fromEntries(records.results.map(r=>[r.id,mediaRow(r)]));
}
async function hydrate(env, posts) {
  const mapping = await mediaMap(env,[...new Set(posts.flatMap(usedMedia))]);
  return posts.map(p=>({...p,media:Object.fromEntries(usedMedia(p).filter(id=>mapping[id]).map(id=>[id,mapping[id]]))}));
}
function postRow(r, useLive=false) {
  return {...JSON.parse(useLive?r.live:r.draft),id:r.id,status:r.trashed?'trash':r.live?'published':'draft',revision:r.revision,publishedAt:r.published_at,updatedAt:r.updated_at};
}
export async function published(env,limit=-1,excludeId='') {
  const count=limit===-1?-1:integer(limit,12,1,50000);
  const {results}=await env.DB.prepare(`SELECT id, live_slug AS slug, published_at AS publishedAt, updated_at AS updatedAt,
    json_extract(live,'$.title') AS title, json_extract(live,'$.excerpt') AS excerpt,
    json_extract(live,'$.author') AS author, json_extract(live,'$.category') AS category,
    json_extract(live,'$.featured') AS featured, json_extract(live,'$.featuredImage') AS featuredImage
    FROM posts WHERE live IS NOT NULL AND id<>? ORDER BY published_at DESC,id DESC LIMIT ?`).bind(excludeId||'',count).all();
  const media=await mediaMap(env,[...new Set(results.map(row=>row.featuredImage).filter(Boolean))]);
  return results.map(row=>({...row,featured:!!row.featured,media:media[row.featuredImage]?{[row.featuredImage]:media[row.featuredImage]}:{}}));
}
export async function publishedIndex(env) {
  const {results}=await env.DB.prepare('SELECT live_slug AS slug, published_at AS publishedAt FROM posts WHERE live IS NOT NULL ORDER BY published_at DESC,id DESC').all();
  return results;
}
export async function getPublished(env,slug) {
  const r=await env.DB.prepare('SELECT * FROM posts WHERE live_slug=? AND trashed=0').bind(slug).first();
  return r ? (await hydrate(env,[postRow(r,true)]))[0] : null;
}
export async function getDraft(env,id) {
  const r=await env.DB.prepare('SELECT * FROM posts WHERE id=? AND trashed=0').bind(id).first();
  return r ? (await hydrate(env,[postRow(r)]))[0] : null;
}
export async function getSettings(env,origin) {
  const r = await env.DB.prepare('SELECT data,media FROM settings WHERE id=1').first();
  const s = {...defaults,...(r?JSON.parse(r.data):{})};
  return {...s,publicUrl:s.publicUrl||env.PUBLIC_URL||origin,media:await mediaMap(env,r?JSON.parse(r.media):[])};
}
export async function listAds(env) {
  const r = await env.DB.prepare('SELECT id,data FROM ads ORDER BY id').all();
  return r.results.map(a=>({...JSON.parse(a.data),id:a.id}));
}
export async function state(env,origin='') {
  const [postRows,mediaRows,ads,settings] = await Promise.all([
    env.DB.prepare('SELECT * FROM posts ORDER BY updated_at DESC').all(),
    env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all(), listAds(env),getSettings(env,origin)
  ]);
  const media = mediaRows.results.map(mediaRow);
  const mapping = Object.fromEntries(media.map(m=>[m.id,m]));
  return {posts:postRows.results.map(r=>{const p=postRow(r);return {...p,media:Object.fromEntries(usedMedia(p).map(id=>[id,mapping[id]]))};}),media,ads,settings};
}

async function savePost(env,input) {
  const action=input.action||'save';
  check(['save','publish','unpublish','trash'].includes(action),'Unknown post action.');
  let id=ref(input.id);
  const now=new Date().toISOString();
  const existing=id?await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first():null;
  if (id) check(existing,'Post not found.',404);
  if (!id) id=crypto.randomUUID();
  if (existing && input.revision!=null) check(Number(input.revision)===existing.revision,'This story was edited elsewhere. Reload before saving.',409);
  const priorDraft=existing?JSON.parse(existing.draft):{};
  const p=postData({...priorDraft,...input});
  if (action==='publish') check(p.title.trim() && p.slug,'Enter a headline and slug before publishing.');
  const ids=usedMedia(p);
  const media=await mediaMap(env,ids);
  check(ids.every(k=>media[k]),'A selected media item is missing.');
  for (const key of [p.featuredImage,p.socialImage,...p.blocks.map(b=>b.posterId)].filter(Boolean)) {
    check(media[key]?.type.startsWith('image/'),'Select an image for the featured photo, poster or social card.');
  }
  for (const b of p.blocks) {
    if (b.type==='image'||b.type==='video') {
      if (b.mediaId) check(media[b.mediaId].type.startsWith(b.type+'/'),'The media format does not match its block.');
      else if (action==='publish') throw new InputError('Choose media for every photo and video block before publishing.');
    }
    if (action==='publish' && b.type==='embed') check(b.url,'Enter a URL for each embed before publishing.');
  }
  const serialized=JSON.stringify(p);
  const publishing=action==='publish', removing=action==='unpublish'||action==='trash';
  const live=publishing?serialized:removing?null:existing?.live??null;
  const slug=publishing?p.slug:removing?null:existing?.live_slug??null;
  const refs=publishing?JSON.stringify(ids):removing?'[]':existing?.live_media??'[]';
  const publishedAt=publishing?existing?.published_at||now:removing?null:existing?.published_at??null;
  const values=[serialized,live,slug,refs,publishedAt,now,Number(action==='trash')];
  try {
    if (existing) {
      const r=await env.DB.prepare('UPDATE posts SET draft=?,live=?,live_slug=?,live_media=?,published_at=?,updated_at=?,trashed=?,revision=revision+1 WHERE id=? AND revision=?').bind(...values,id,existing.revision).run();
      check(r.meta.changes===1,'Another save completed first. Reload before saving.',409);
    } else {
      await env.DB.prepare('INSERT INTO posts(draft,live,live_slug,live_media,published_at,updated_at,trashed,id) VALUES(?,?,?,?,?,?,?,?)').bind(...values,id).run();
    }
  } catch(err) {
    if ((String(err)+' '+String(err.cause)).includes('UNIQUE')) throw new InputError('Another published post uses this slug.',409);
    throw err;
  }
  return {id,post:action==='trash'?{...p,id,status:'trash',revision:(existing?.revision||0)+1}:await getDraft(env,id)};
}

async function saveAd(env,input) {
  const id=ref(input.id)||crypto.randomUUID();
  const name=str(input.name,160).trim();
  check(name && placements.has(input.placement),'Enter an ad name and choose a placement.');
  const device=input.device||'all';
  check(['all','mobile','desktop'].includes(device),'Invalid device.');
  const ad={name,code:str(input.code,200000),placement:input.placement,device,enabled:flag(input.enabled),
    number:integer(input.number,1,1,10000),interval:integer(input.interval,3,1,10000),
    start:integer(input.start,3,1,10000),maxRepeats:integer(input.maxRepeats,1,1,10000),
    percentage:integer(input.percentage,50,1,100),minWords:integer(input.minWords,0,0,1000000),
    priority:integer(input.priority,0,-10000,10000),height:integer(input.height,100,0,2000)};
  await env.DB.prepare('INSERT INTO ads(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(ad)).run();
  return {id,ad:{...ad,id}};
}
async function saveSettings(env,input) {
  const u=input.publicUrl?external(input.publicUrl):null;
  if (u) check(u.pathname==='/'&&!u.search&&!u.hash,'The public site URL must be an origin.');
  const s={siteName:str(input.siteName,100).trim()||'JoltFeed',publicUrl:u?.origin??'',logo:ref(input.logo),favicon:ref(input.favicon),
    defaultSocialImage:ref(input.defaultSocialImage),maxAds:integer(input.maxAds,4,0,100),
    bootstrapCode:str(input.bootstrapCode,200000)};
  const ids=[s.logo,s.favicon,s.defaultSocialImage].filter(Boolean);
  const media=await mediaMap(env,ids);
  check(ids.every(k=>media[k]?.type.startsWith('image/')),'Select an image from Media for each branding asset.');
  await env.DB.prepare('INSERT INTO settings(id,data,media) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,media=excluded.media').bind(JSON.stringify(s),JSON.stringify(ids)).run();
  return {settings:s};
}

// Determine served type from the file itself. Uploaded active documents are never served inline.
async function inspectMedia(file) {
  const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer());
  const view=new DataView(bytes.buffer);
  const sig=(pos,s)=>Array.from(s).every((c,i)=>bytes[pos+i]===c.charCodeAt(0));
  if (bytes.length>=24 && sig(0,'\x89PNG\r\n\x1a\n') && sig(12,'IHDR'))
    return {type:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
  if (bytes.length>=10 && (sig(0,'GIF89a')||sig(0,'GIF87a')))
    return {type:'image/gif',width:view.getUint16(6,true),height:view.getUint16(8,true)};
  if (bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {
    for(let i=2;i+8<bytes.length;) {
      if(bytes[i++]!==255) break;
      while(bytes[i]===255) i++;
      const marker=bytes[i++];
      if(marker===218||marker===217) break;
      const length=view.getUint16(i);
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
        return {type:'image/jpeg',height:view.getUint16(i+3),width:view.getUint16(i+5)};
      if(length<2) break;
      i+=length;
    }
    return {type:'image/jpeg'};
  }
  if(bytes.length>=30 && sig(0,'RIFF') && sig(8,'WEBP')) {
    let width,height;
    if(sig(12,'VP8X')) {
      width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);
      height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
    } else if(sig(12,'VP8 ')) {
      width=view.getUint16(26,true)&16383; height=view.getUint16(28,true)&16383;
    } else if(sig(12,'VP8L')) {
      const bits=view.getUint32(21,true);
      width=1+(bits&16383);height=1+((bits>>>14)&16383);
    }
    return {type:'image/webp',width,height};
  }
  if(bytes.length>=16 && sig(4,'ftyp') && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|qt  )$/.test(String.fromCharCode(...bytes.slice(8,12))))
    return {type:'video/mp4'};
  if(bytes.length>=4 && bytes[0]===26 && bytes[1]===69 && bytes[2]===223 && bytes[3]===163)
    return {type:'video/webm'};
  throw new InputError('Choose a JPEG, PNG, GIF, WebP, MP4 or WebM file.');
}
async function upload(request,env) {
  check((Number(request.headers.get('content-length'))||0)<=MAX_MEDIA+6*1024*1024,'Upload exceeds the 32 MiB original limit.',413);
  const form=await request.formData();
  const file=form.get('file');
  check(file && typeof file.arrayBuffer==='function' && file.size>0,'Select a file.');
  check(file.size<=MAX_MEDIA,'Upload exceeds 32 MiB.',413);
  const id=crypto.randomUUID(), info=await inspectMedia(file);
  const name=str(String(file.name||'Upload').slice(0,255),255);
  const objects=[{key:id,file,type:info.type}], variants=[];
  for (const [field,width] of [['small',480],['medium',960]]) {
    const v=form.get(field);
    if (!v || !info.type.startsWith('image/')) continue;
    check(typeof v.arrayBuffer==='function' && v.size>0 && v.size<=3*1024*1024,'Invalid responsive image.');
    const photo=await inspectMedia(v);
    check(photo.type.startsWith('image/') && photo.width===width,'Incorrect responsive image dimensions.');
    variants.push({width,type:photo.type,size:v.size});
    objects.push({key:id+'-'+width,file:v,type:photo.type});
  }
  const written=[];
  try {
    for (const obj of objects) {
      await env.MEDIA.put(obj.key,obj.file.stream(),{httpMetadata:{contentType:obj.type}});
      written.push(obj.key);
    }
    const created=new Date().toISOString();
    await env.DB.prepare('INSERT INTO media(id,name,type,size,created_at,width,height,variants) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id,name,info.type,file.size,created,info.width||null,info.height||null,JSON.stringify(variants)).run();
  } catch(err) {
    await Promise.allSettled(written.map(key=>env.MEDIA.delete(key)));
    throw err;
  }
  return {media:mediaRow({id,name,...info,variants:JSON.stringify(variants)})};
}
export async function mediaResponse(request,env,id,authenticated=false) {
  if(!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(!authenticated) {
    const accessible=await env.DB.prepare(`SELECT 1 FROM posts,json_each(posts.live_media) m WHERE live IS NOT NULL AND m.value=?
      UNION ALL SELECT 1 FROM settings,json_each(settings.media) m WHERE m.value=? LIMIT 1`).bind(id,id).first();
    if(!accessible) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  }
  const r=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  if(!r) return new Response('Not found',{status:404});
  const w=new URL(request.url).searchParams.get('w');
  const variant=w && JSON.parse(r.variants).find(v=>String(v.width)===w);
  if(w&&!variant) return new Response('Not found',{status:404});
  const size=variant?variant.size:r.size, key=variant?id+'-'+w:id;
  const headers=new Headers({'Content-Type':variant?variant.type:r.type,'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes','Content-Length':String(size),
    'Cache-Control':authenticated?'private, no-store':'public, max-age=0, must-revalidate',ETag:'"'+key+'"'});
  if(request.headers.get('if-none-match')===headers.get('etag')) return new Response(null,{status:304,headers});
  const rangeHeader=request.headers.get('range');
  let range;
  if(rangeHeader && (!request.headers.has('if-range')||request.headers.get('if-range')===headers.get('etag'))) {
    const m=/^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const start=m?.[1]?Number(m[1]):Math.max(0,size-Number(m?.[2]));
    const end=m?.[1] && m[2]?Math.min(size-1,Number(m[2])):size-1;
    if(!m||(!m[1]&&!m[2])||!Number.isSafeInteger(start)||start>=size||end<start)
      return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
    range={offset:start,length:end-start+1};
    headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
    headers.set('Content-Length',String(range.length));
  }
  if(request.method==='HEAD') return new Response(null,{status:range?206:200,headers});
  const object=await env.MEDIA.get(key,range?{range}:undefined);
  if(!object) return new Response('Not found',{status:404});
  return new Response(object.body,{status:range?206:200,headers});
}
function json(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
// Caller authenticates the admin on every API request; this boundary also rejects cross-origin writes.
export async function adminApi(request,env) {
  const u=new URL(request.url);
  const path=u.pathname.replace(/^\/admin\/api/,'');
  try {
    if(request.method==='GET' && path==='/state') return json(await state(env,u.origin));
    if (!['POST','DELETE'].includes(request.method)) return json({error:'Not found'},404);
    const origin=request.headers.get('origin');
    check((!origin || origin===u.origin) && request.headers.get('sec-fetch-site')!=='cross-site','Origin mismatch.',403);
    if(request.method==='DELETE') {
      const m=/^\/ads\/([a-zA-Z0-9_-]+)$/.exec(path);
      if(!m) return json({error:'Not found'},404);
      await env.DB.prepare('DELETE FROM ads WHERE id=?').bind(m[1]).run();
      return json({});
    }
    if(path==='/media') return json(await upload(request,env),201);
    check(request.headers.get('content-type')?.includes('application/json'),'Use application/json.',415);
    check((Number(request.headers.get('content-length'))||0)<=2_000_000,'Request is too large.',413);
    const body=await request.text();
    check(body.length<=2_000_000,'Request is too large.',413);
    let input;
    try { input=JSON.parse(body); } catch {throw new InputError('Invalid JSON.');}
    check(input && typeof input==='object' && !Array.isArray(input),'Invalid request.');
    if(path==='/posts') return json(await savePost(env,input));
    if(path==='/settings') return json(await saveSettings(env,input));
    if(path==='/ads') return json(await saveAd(env,input));
    return json({error:'Not found'},404);
  } catch(err) {
    if(err instanceof InputError) return json({error:err.message},err.status);
    throw err;
  }
}

import { adminStyle } from './admin-style.js'

export function adminPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Publishing desk</title><style>${adminStyle}</style></head><body>
  <div class="app"><aside><a class="brand" href="/admin"><span class="mark">J</span><span id="siteName">JoltFeed</span></a><nav class="nav" aria-label="Publishing desk"></nav><div class="footnav"><a href="/" target="_blank" rel="noopener">View site ↗</a><a href="/admin/logout">Log out</a></div></aside>
  <main class="main" id="main" aria-label="Admin workspace"><p>Opening publishing desk…</p></main></div><div class="toast" role="status" aria-live="polite"></div><dialog id="dialog"></dialog>
  <script src="/admin/vendor/quill.js" defer></script><script>document.addEventListener('DOMContentLoaded',${adminClient.toString()})</script></body></html>`
}

function adminClient() {
  const $ = (s, root = document) => root.querySelector(s)
  const $$ = (s, root = document) => [...root.querySelectorAll(s)]
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const btn = (id, title, cls='') => `<button type="button" id="${id}" class="${cls}">${esc(title)}</button>`
  const field = (title, key, value='', opts={}) => {
    const attrs = `data-key="${key}" ${opts.required ? 'required' : ''} ${opts.attrs || ''}`
    const input = opts.choices ? `<select ${attrs}>${opts.choices.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select>`
      : opts.area ? `<textarea ${attrs} class="${opts.cls||''}">${esc(value)}</textarea>`
      : `<input ${attrs} type="${opts.type||'text'}" class="${opts.cls||''}" value="${esc(value)}">`
    return `<label class="field">${esc(title)}${input}</label>`
  }
  const check = (label,key,yes) => `<label class="check"><input data-key="${key}" type="checkbox" ${yes?'checked':''}>${esc(label)}</label>`
  const main = $('#main'), dialog = $('#dialog'), toast = $('.toast')
  let state, tab='Posts', post=null, activeAd=null, dirty=false, saveTimer, saveQueue=Promise.resolve(), editEpoch=0, toastTimer
  const icons={Posts:'<path d="M5 4h11l3 3v13H5zM8 10h8M8 14h8"/>',Media:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m4 17 5-5 4 4 3-3 4 4"/><circle cx="15" cy="9" r="1"/>',Ads:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h9M7 13h6"/>','Site Settings':'<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'}
  const placements = {beforeTitle:'Before title',afterTitle:'After title',beforeFirst:'Before first paragraph',beforeParagraph:'Before paragraph number',afterParagraph:'After paragraph number',every:'Every N paragraphs',percentage:'By percentage of article length',afterPost:'After post',manual:'Manual position'}
  const blockNames={paragraph:'Paragraph',heading:'Heading',quote:'Quote',list:'List',image:'Photo',video:'Uploaded video',embed:'YouTube or Vimeo',ad:'Ad slot'}
  const mediaById = id => state.media.find(m=>String(m.id)===String(id))
  const eligible = (m,kind) => !kind||String(m.type).startsWith(kind+'/')
  const mediaURL = id => '/admin/media/'+encodeURIComponent(id)
  const notify = (msg,bad=false) => {clearTimeout(toastTimer);toast.classList.toggle('bad',bad);toast.textContent=msg;toastTimer=setTimeout(()=>{toast.textContent=''},bad?12000:3200)}
  function handle(fn){return async ev=>{try{await fn(ev)}catch(e){notify(e.message,true)}}}
  function bind(id,fn,root=document){const el=$('#'+id,root);if(el)el.onclick=handle(fn)}
  async function api(path, data, method) {
    const init={method:method||(data?'POST':'GET'),credentials:'same-origin',headers:{Accept:'application/json'}}
    if(data instanceof FormData)init.body=data
    else if(data){init.headers['Content-Type']='application/json';init.body=JSON.stringify(data)}
    const res=await fetch('/admin/api'+path,init), body=await res.json().catch(()=>null)
    if(!res.ok)throw new Error(body?.error||body?.message||`Request failed (${res.status}). Refresh the page to check your session.`)
    return body
  }
  async function refresh(){state=await api('/state');$('#siteName').textContent=state.settings.siteName||'JoltFeed'}
  function capture(root,obj,onChange=()=>{}) {
    for (const input of $$('[data-key]',root)) {
      input.oninput=()=>{obj[input.dataset.key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;onChange(input.dataset.key)}
    }
  }
  function nav(){
    $('.nav').innerHTML=Object.entries(icons).map(([label,icon])=>`<button type="button" data-tab="${esc(label)}" ${label===tab?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${esc(label)}</button>`).join('')
    $$('[data-tab]').forEach(el=>el.onclick=handle(()=>go(el.dataset.tab)))
  }
  async function leavePost(){
    if(!post)return
    clearTimeout(saveTimer)
    await saveQueue.catch(()=>{})
    if(dirty){
      if(!post.title.trim()){if(!confirm('Leave this untitled draft and discard its changes?'))return false}
      else await savePost('save')
    }
    post=null;dirty=false;return true
  }
  async function go(next){if(await leavePost()===false)return;await refresh();activeAd=null;tab=next;nav();({Posts:posts,Media:media,Ads:ads,'Site Settings':settings})[tab]()}
  const heading = (title,actions='')=>`<div class="headline"><h1>${esc(title)}</h1><div class="row">${actions}</div></div>`
  const empty = msg=>`<p class="empty">${esc(msg)}</p>`
  function posts(){
    main.innerHTML=heading('Posts',btn('new','New post','primary'))+`<div class="toolrow"><input id="search" type="search" aria-label="Search posts by title" placeholder="Search by title…"><select id="status" aria-label="Filter by status"><option value="">All posts</option><option value="draft">Draft</option><option value="published">Published</option><option value="trash">Trash</option></select></div><div id="results"></div>`
    function results(){
      const filter=$('#status').value,needle=$('#search').value.trim().toLowerCase()
      const list=state.posts.filter(p=>(filter?p.status===filter:p.status!=='trash')&&p.title.toLowerCase().includes(needle))
      $('#results').innerHTML=list.length?`<div class="listing"><table><thead><tr><th>Title</th><th>Status</th><th class="hidden-phone">Author</th><th class="hidden-phone">Updated</th></tr></thead><tbody>${list.map(p=>`<tr><td><button class="linkbtn" data-post="${esc(p.id)}">${esc(p.title||'Untitled')}</button></td><td><span class="pill ${p.status==='published'?'live':''}">${esc(p.status)}</span></td><td class="hidden-phone">${esc(p.author||'—')}</td><td class="hidden-phone">${p.updatedAt?esc(new Date(p.updatedAt).toLocaleDateString()):'—'}</td></tr>`).join('')}</tbody></table></div>`:empty(state.posts.length?'No matching posts.':'Your first story starts here. Choose New post to write it.')
      $$('[data-post]').forEach(el=>el.onclick=()=>startPost(state.posts.find(p=>String(p.id)===el.dataset.post)))
    }
    bind('new',()=>startPost());$('#search').oninput=results;$('#status').onchange=results;results()
  }
  const defaultBlock = type => ({type,...(['paragraph','heading','quote'].includes(type)?{text:'',runs:[]}:type==='list'?{ordered:false,items:[]}:type==='image'?{mediaId:'',alt:'',caption:''}:type==='video'?{mediaId:'',posterId:'',caption:''}:type==='ad'?{adId:''}:{url:''})})
  function startPost(existing){
    post=existing?structuredClone(existing):{title:'',slug:'',author:'',category:'',excerpt:'',blocks:[defaultBlock('paragraph')],status:'draft',featuredImage:'',socialImage:''}
    dirty=false;editEpoch=0;editor()
  }
  function saveStatus(msg){const el=$('#savestate');if(el)el.textContent=msg}
  function changed(){
    dirty=true;editEpoch++;saveStatus(post.title.trim()?'Unsaved changes':'Add a title to autosave')
    clearTimeout(saveTimer)
    if(post.title.trim()&&post.status!=='trash')saveTimer=setTimeout(()=>savePost('save').catch(e=>notify(e.message,true)),1000)
  }
  function savePost(action){
    clearTimeout(saveTimer)
    const work=async()=>{
      if(!post)return
      if(action==='save'&&!dirty&&post.id&&post.status!=='trash')return
      if(!post.title.trim())throw new Error('Give the post a title first.')
      const editing=post,epoch=editEpoch
      saveStatus('Saving…')
      try{
        const result=await api('/posts',{...editing,action})
        if(post!==editing)return
        post.id=result.id||result.post.id;post.status=result.post.status;post.revision=result.post.revision
        if(!post.slug && epoch===editEpoch)post.slug=result.post.slug||''
        if(epoch===editEpoch)dirty=false
        saveStatus(dirty?'Unsaved changes':'Draft saved')
      }catch(e){saveStatus('Save failed');throw e}
    }
    saveQueue=saveQueue.catch(()=>{}).then(work);return saveQueue
  }
  function mediaField(label,key,id){
    const m=mediaById(id)
    return `<div><strong style="font-size:13px">${esc(label)}</strong><div class="mediachoice" data-media-field="${esc(key)}">${m&&eligible(m,'image')?`<img class="thumb" src="${esc(mediaURL(id))}" alt="">`:''}<small>${esc(m?.name||(id?'Unavailable media':'None selected'))}</small><button type="button" class="icon choose">Choose</button>${id?'<button type="button" class="icon clear">Clear</button>':''}</div></div>`
  }
  function wireMedia(root,key,obj,kind,after){
    const holder=$('[data-media-field="'+key+'"]',root)
    if(!holder)return
    $('.choose',holder).onclick=handle(()=>picker(kind,m=>{obj[key]=m.id;after()}))
    if($('.clear',holder))$('.clear',holder).onclick=()=>{obj[key]='';after()}
  }
  function editor(){
    const p=post,live=p.status==='published'
    main.innerHTML=`<div class="switchback">${btn('back','← Posts','linkbtn')}</div>`+heading(p.id?'Edit post':'New post',`<span class="save-state" id="savestate" aria-live="polite">${p.id?esc(p.status):'New draft'}</span>`+btn('preview','Preview')+btn('publish',live?'Update published story':'Publish','primary'))+`<div class="editorgrid"><div><section id="basics" class="sheet">${field('Title','title',p.title,{cls:'posttitle',required:true})}${field('Excerpt','excerpt',p.excerpt,{area:true})}</section><section class="sheet"><h2>Article body</h2><div id="blocks" class="blocks"></div><div class="slotadd"><select id="blocktype" aria-label="New block type">${Object.entries(blockNames).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>${btn('addblock','Add block')}</div></section></div><div><section class="sheet" id="details"><h2>Story details</h2>${field('URL slug','slug',p.slug,{attrs:'placeholder="Generated from your headline"'})}${field('Author','author',p.author)}${field('Category','category',p.category)}${mediaField('Featured image','featuredImage',p.featuredImage)}${check('Lead feature on homepage','featured',p.featured)}${check('Hide featured image on article','hideFeaturedImage',p.hideFeaturedImage)}${check('Disable ads on this post','disableAds',p.disableAds)}</section><details class="panel" id="social"><summary>Social preview overrides</summary>${field('Social title','socialTitle',p.socialTitle)}${field('Social description','socialDescription',p.socialDescription,{area:true})}${mediaField('Social image','socialImage',p.socialImage)}</details><section class="sheet"><h2>Publication</h2><div class="row">${btn('save',p.status==='trash'?'Restore as draft':'Save draft')}${live?btn('unpublish','Unpublish'):''}${p.id&&p.status!=='trash'?btn('trash','Move to trash','danger'):''}</div></section></div></div>`
    ;['basics','details','social'].forEach(id=>capture($('#'+id),p,changed))
    for(const [id,key] of [['details','featuredImage'],['social','socialImage']])wireMedia($('#'+id),key,p,'image',()=>{changed();editor();if(id==='social')$('#social').open=true})
    bind('back',()=>go('Posts'));bind('preview',async()=>{await savePost('save');preview(p.id,false)})
    bind('save',async()=>{await savePost('save');notify('Draft saved');editor()})
    for(const action of ['publish','unpublish','trash'])bind(action,async()=>{
      if(action!=='publish'&&!confirm(action==='trash'?'Move this post to trash?':'Remove this story from public access?'))return
      await savePost(action);notify(action==='publish'?'Story published':action==='unpublish'?'Story unpublished':'Post moved to trash')
      if(action==='trash')await go('Posts');else editor()
    })
    bind('addblock',()=>{p.blocks.push(defaultBlock($('#blocktype').value));changed();drawBlocks();focusBlock(p.blocks.length-1)})
    drawBlocks()
  }
  function focusBlock(i){const root=$('[data-index="'+i+'"]');const el=root?.querySelector('.ql-editor,[contenteditable=true],textarea,input,select,.choose');el?.focus()}
  function safeLink(raw){if(typeof raw==='string' && /^\/(?![/\\])[^\\]*$/.test(raw))return raw;try{const url=new URL(raw);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:''}catch{return ''}}
  function cleanRun(text,attrs={}){
    const run={text};if(attrs.bold)run.bold=true;if(attrs.italic)run.italic=true
    const link=safeLink(attrs.href||attrs.link);if(link)run.href=link
    return run
  }
  function runsFor(b){return Array.isArray(b.runs)&&b.runs.length?b.runs:[{text:b.text||''}]}
  function runsHTML(runs){return runs.map(r=>{
    let s=esc(r.text);if(r.bold)s='<strong>'+s+'</strong>';if(r.italic)s='<em>'+s+'</em>'
    return safeLink(r.href)?`<a href="${esc(safeLink(r.href))}">${s}</a>`:s
  }).join('')}
  function nativeRuns(root){
    const out=[]
    function walk(node,fmt){
      if(node.nodeType===3){if(node.textContent)out.push(cleanRun(node.textContent,fmt));return}
      if(node.nodeType!==1)return
      const t=node.tagName.toLowerCase(),next={...fmt}
      if(t==='b'||t==='strong')next.bold=true;if(t==='i'||t==='em')next.italic=true
      if(t==='a')next.href=node.getAttribute('href')
      if(t==='br'){out.push({text:' '});return}
      if(t==='div'&&node!==root&&out.length)out.push({text:' '})
      node.childNodes.forEach(n=>walk(n,next))
    }
    walk(root,{});return out
  }
  function splitLines(runs){
    const lines=[[]]
    for(const run of runs){
      String(run.text).split(/\r?\n/).forEach((part,i)=>{if(i)lines.push([]);if(part)lines.at(-1).push({...run,text:part})})
    }
    return lines
  }
  function richText(holder,block,idx){
    const root=$('.rich',holder)
    const write = (b,runs)=>{b.runs=runs;b.text=runs.map(r=>r.text).join('')}
    const storeRuns=(runs)=>{
      const lines=splitLines(runs)
      write(block,lines[0])
      if(lines.length>1){
        const extra=lines.slice(1).map(line=>{const b=defaultBlock('paragraph');write(b,line);return b})
        post.blocks.splice(idx+1,0,...extra);drawBlocks();focusBlock(idx+lines.length-1)
      }
      changed()
    }
    if(window.Quill){
      const quill=new window.Quill(root,{theme:null,formats:['bold','italic','link'],modules:{toolbar:false}})
      quill.root.setAttribute('aria-label',blockNames[block.type]+' text')
      quill.setContents([...runsFor(block).map(r=>({insert:r.text,attributes:{...(r.bold?{bold:true}:{}),...(r.italic?{italic:true}:{}),...(safeLink(r.href)?{link:safeLink(r.href)}:{})}})),{insert:'\n'}],'silent')
      quill.on('text-change',()=>{
        const ops=quill.getContents().ops.map(op=>cleanRun(typeof op.insert==='string'?op.insert:'',op.attributes))
        if(ops.at(-1)?.text.endsWith('\n'))ops.at(-1).text=ops.at(-1).text.slice(0,-1)
        storeRuns(ops.filter(r=>r.text))
      })
      $$('.format button',holder).forEach(b=>{
        b.onmousedown=e=>e.preventDefault()
        b.onclick=()=>{
          const range=quill.getSelection(true),fmt=quill.getFormat(range),key=b.dataset.format
          if(key==='link'){const raw=prompt('Link URL',fmt.link||'https://');if(raw===null)return;const link=safeLink(raw);if(raw&&!link)return notify('Use an https, http or mailto link.',true);quill.format(key,link||false)}
          else quill.format(key,!fmt[key])
        }
      })
    }else{
      root.contentEditable='true';root.setAttribute('role','textbox');root.setAttribute('aria-label',blockNames[block.type]+' text')
      root.innerHTML=runsHTML(runsFor(block));root.oninput=()=>storeRuns(nativeRuns(root))
      root.onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain').replace(/\r?\n/g,' '))}
      root.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){
        e.preventDefault()
        const s=getSelection();if(!s.rangeCount)return
        const range=s.getRangeAt(0);range.deleteContents()
        const right=document.createRange();right.selectNodeContents(root);right.setStart(range.startContainer,range.startOffset)
        const tail=document.createElement('div');tail.appendChild(right.extractContents())
        const next=defaultBlock('paragraph');write(block,nativeRuns(root));write(next,nativeRuns(tail))
        post.blocks.splice(idx+1,0,next);changed();drawBlocks();focusBlock(idx+1)
      }}
      $$('.format button',holder).forEach(b=>{
        b.onmousedown=e=>e.preventDefault()
        b.onclick=()=>{
          const key=b.dataset.format
          if(key==='link'){const raw=prompt('Link URL','https://');if(!raw)return;const link=safeLink(raw);if(!link)return notify('Use an https, http or mailto link.',true);document.execCommand('createLink',false,link)}
          else document.execCommand(key)
          storeRuns(nativeRuns(root))
        }
      })
    }
  }
  function drawBlocks(){
    const holder=$('#blocks')
    holder.innerHTML=post.blocks.map((b,i)=>{
      let inner
      if(['paragraph','heading','quote'].includes(b.type))inner='<div class="format"><button type="button" data-format="bold" aria-label="Bold"><strong>B</strong></button><button type="button" data-format="italic" aria-label="Italic"><em>I</em></button><button type="button" data-format="link">Link</button></div><div class="rich"></div>'
      else if(b.type==='list')inner=field('Items, one per line','items',(b.items||[]).join('\n'),{area:true})+check('Numbered list','ordered',b.ordered)
      else if(b.type==='image')inner=mediaField('Photo','mediaId',b.mediaId)+field('Alt text','alt',b.alt)+field('Caption','caption',b.caption)
      else if(b.type==='video')inner=mediaField('Video','mediaId',b.mediaId)+mediaField('Poster image','posterId',b.posterId)+field('Caption','caption',b.caption)
      else if(b.type==='ad')inner=field('Named manual ad','adId',b.adId,{choices:[['','Choose an ad'],...state.ads.filter(a=>a.placement==='manual').map(a=>[a.id,a.name])]})
      else inner=field('YouTube or Vimeo URL','url',b.url,{type:'url'})
      return `<div class="block" data-index="${i}"><div class="itemhead"><strong>${esc(blockNames[b.type])}</strong><span class="row"><button type="button" class="icon" data-act="up" aria-label="Move block up" ${i===0?'disabled':''}>↑</button><button type="button" class="icon" data-act="down" aria-label="Move block down" ${i===post.blocks.length-1?'disabled':''}>↓</button><button type="button" class="icon" data-act="remove" aria-label="Remove block">×</button></span></div>${inner}</div>`
    }).join('')
    for(const el of $$('[data-index]',holder)){
      const i=Number(el.dataset.index),b=post.blocks[i]
      capture(el,b,key=>{if(key==='items')b.items=b.items.split(/\r?\n/);changed()})
      if($('.rich',el))richText(el,b,i)
      if(['image','video'].includes(b.type))wireMedia(el,'mediaId',b,b.type,()=>{changed();drawBlocks()})
      if(b.type==='video')wireMedia(el,'posterId',b,'image',()=>{changed();drawBlocks()})
      $$('[data-act]',el).forEach(button=>button.onclick=()=>{
        const action=button.dataset.act
        if(action==='remove')post.blocks.splice(i,1)
        else {const k=action==='up'?i-1:i+1;[post.blocks[k],post.blocks[i]]=[post.blocks[i],post.blocks[k]]}
        changed();drawBlocks()
      })
    }
  }
  async function imageVariants(file,data){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!window.createImageBitmap)return
    let bitmap
    try{
      bitmap=await createImageBitmap(file)
      for(const [key,width] of [['small',480],['medium',960]]){
        if(bitmap.width<=width)continue
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.max(1,Math.round(bitmap.height*width/bitmap.width))
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));if(blob)data.append(key,blob,key+'.webp')
      }
    }finally{bitmap?.close()}
  }
  function gallery(items,allowPick){
    if(!items.length)return empty('No media found.')
    return `<div class="gallery">${items.map(m=>`<${allowPick?'button type="button"':'div'} class="tile" data-asset="${esc(m.id)}">${eligible(m,'image')?`<img src="${esc(mediaURL(m.id))}" loading="lazy" alt="">`:'<div class="videotile">Video</div>'}<span>${esc(m.name)}</span></${allowPick?'button':'div'}>`).join('')}</div>`
  }
  function mediaPanel(root,kind,select){
    root.innerHTML=`<form class="upload"><label><strong>Upload ${kind==='video'?'video':kind==='image'?'image':'media'}</strong><br><input type="file" required aria-label="Choose upload" accept="${kind==='video'?'video/mp4,video/webm':kind==='image'?'image/jpeg,image/png,image/webp,image/gif':'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'}"></label><button type="submit">Upload</button></form><div class="assets">${gallery(state.media.filter(m=>eligible(m,kind)),!!select)}</div>`
    if(select)$$('[data-asset]',root).forEach(el=>el.onclick=()=>{dialog.close();select(mediaById(el.dataset.asset))})
    $('form',root).onsubmit=handle(async ev=>{
      ev.preventDefault();const file=$('input[type=file]',root).files[0];if(!file)return
      const button=$('button[type=submit]',root);button.disabled=true;button.textContent='Uploading…'
      try{
        const data=new FormData();data.append('file',file);await imageVariants(file,data)
        const {media:m}=await api('/media',data);state.media.unshift(m)
        if(select){dialog.close();select(m)}else mediaPanel(root,kind,select)
        notify('Upload complete')
      }finally{button.disabled=false;button.textContent='Upload'}
    })
  }
  function modal(title,content){
    if(dialog.open)dialog.close()
    dialog.innerHTML=`<div class="headline"><h2 id="dialogtitle">${esc(title)}</h2>${btn('closeModal','Close')}</div><div id="dialogbody">${content}</div>`
    dialog.setAttribute('aria-labelledby','dialogtitle');bind('closeModal',()=>dialog.close(),dialog);dialog.showModal()
    return $('#dialogbody')
  }
  function picker(kind,select){mediaPanel(modal(kind==='video'?'Choose video':'Choose image',''),kind,select)}
  function media(){main.innerHTML=heading('Media')+'<section class="sheet" id="library"></section>';mediaPanel($('#library'),null,null)}
  function preview(id,placementsOn){
    const available=state.posts.filter(p=>p.status!=='trash')
    if(placementsOn&&!available.length)throw new Error('Save a post first to preview ad placements.')
    const select=placementsOn?field('Post','post',id||available[0].id,{choices:available.map(p=>[p.id,p.title])}):''
    const root=modal(placementsOn?'Preview placements':'Preview story',`<div class="columns">${select}${field('Device','device','desktop',{choices:[['desktop','Desktop'],['mobile','Mobile']]})}</div><iframe class="preview" title="Private article preview" sandbox="allow-same-origin"></iframe>`)
    const frame=$('iframe',root)
    function show(){
      const device=$('[data-key="device"]',root).value,pid=placementsOn?$('[data-key="post"]',root).value:id
      frame.classList.toggle('mobile',device==='mobile')
      frame.src='/admin/preview/'+encodeURIComponent(pid)+'?device='+device+(placementsOn?'&placements=1':'')
    }
    $$('select',root).forEach(el=>el.onchange=show);show()
  }
  function ads(){
    main.innerHTML=heading('Ads',btn('placements','Preview placements')+btn('newad','New ad','primary'))+`<div class="listing"><table><thead><tr><th>Name</th><th>Placement</th><th>Enabled</th><th class="hidden-phone">Priority</th></tr></thead><tbody>${state.ads.map(a=>`<tr><td><button class="linkbtn" data-ad="${esc(a.id)}">${esc(a.name)}</button></td><td>${esc(placements[a.placement])}</td><td>${a.enabled?'Yes':'No'}</td><td class="hidden-phone">${esc(a.priority)}</td></tr>`).join('')}</tbody></table>${state.ads.length?'':'<div style="padding:0 16px">'+empty('Add your first unit and choose where it appears.')+'</div>'}</div><section id="limits" class="sheet" style="margin-top:20px"><h2>Sitewide ad settings</h2><form>${num('Maximum ads per article','maxAds',state.settings.maxAds??4,0)}${field('Provider bootstrap code · once per article','bootstrapCode',state.settings.bootstrapCode,{area:true,cls:'code'})}<button type="submit">Save ad settings</button></form></section>`
    bind('placements',()=>preview(null,true));bind('newad',()=>editAd())
    $$('[data-ad]').forEach(el=>el.onclick=()=>editAd(state.ads.find(a=>String(a.id)===el.dataset.ad)))
    const draft={...state.settings};capture($('#limits'),draft)
    $('#limits form').onsubmit=handle(async ev=>{ev.preventDefault();await api('/settings',draft);await refresh();notify('Ad settings saved')})
  }
  function num(label,key,value,min=0,max){return field(label,key,value,{type:'number',required:true,attrs:`step="1" min="${min}" ${max==null?'':'max="'+max+'"'}`})}
  function editAd(existing){
    activeAd=existing?structuredClone(existing):{name:'',code:'',placement:'beforeTitle',enabled:true,number:3,interval:3,start:3,maxRepeats:2,percentage:50,minWords:0,device:'all',priority:0,height:100}
    function draw(){
      const a=activeAd
      let rules=''
      if(['beforeParagraph','afterParagraph'].includes(a.placement))rules=num('Paragraph number','number',a.number,1)
      if(a.placement==='every')rules=num('First insertion after paragraph','start',a.start,1)+num('Repeat every N paragraphs','interval',a.interval,1)+num('Maximum insertions','maxRepeats',a.maxRepeats,1)
      if(a.placement==='percentage')rules=num('Percentage of body words','percentage',a.percentage,1,100)+'<div class="row">'+[25,50,75].map(n=>`<button type="button" data-percent="${n}">${n}%</button>`).join('')+'</div>'
      main.innerHTML=`<div class="switchback">${btn('adsback','← Ads','linkbtn')}</div>`+heading(existing?'Edit ad':'New ad')+`<form id="adform"><section class="sheet">${field('Ad name','name',a.name,{required:true})}${field('Placement','placement',a.placement,{choices:Object.entries(placements)})}<div id="rules">${rules}</div>${check('Enabled','enabled',a.enabled)}${field('Provider code (HTML, iframe or script)','code',a.code,{area:true,cls:'code'})}<p class="hint">An empty unit can be tested in Preview placements.</p></section><section class="sheet"><h2>Display rules</h2><div class="columns">${num('Minimum article length in words','minWords',a.minWords)}${field('Device','device',a.device,{choices:[['all','All devices'],['mobile','Mobile'],['desktop','Desktop']]})}${num('Priority · higher wins','priority',a.priority,-10000,10000)}${num('Reserved height (px)','height',a.height,1,1200)}</div></section><div class="row"><button type="submit" class="primary">Save ad</button>${existing?btn('deletead','Delete ad','danger'):''}</div></form>`
      capture($('#adform'),a,key=>{if(key==='placement')draw()});bind('adsback',ads)
      $$('[data-percent]').forEach(el=>el.onclick=()=>{a.percentage=Number(el.dataset.percent);$('[data-key="percentage"]').value=a.percentage})
      $('#adform').onsubmit=handle(async ev=>{ev.preventDefault();await api('/ads',a);await refresh();ads();notify('Ad saved')})
      bind('deletead',async()=>{if(!confirm('Delete this ad?'))return;await api('/ads/'+encodeURIComponent(a.id),null,'DELETE');await refresh();ads();notify('Ad deleted')})
    }
    draw()
  }
  function settings(){
    const draft={...state.settings}
    function draw(){
      main.innerHTML=heading('Site Settings')+`<form id="settings"><section class="sheet"><h2>Publication</h2>${field('Site name','siteName',draft.siteName,{required:true})}${field('Public site URL','publicUrl',draft.publicUrl,{type:'url',attrs:'placeholder="https://your-publication.workers.dev"'})}${mediaField('Logo','logo',draft.logo)}${mediaField('Favicon','favicon',draft.favicon)}${mediaField('Default social-sharing image','defaultSocialImage',draft.defaultSocialImage)}</section><button class="primary" type="submit">Save settings</button></form>`
      const form=$('#settings');capture(form,draft);['logo','favicon','defaultSocialImage'].forEach(k=>wireMedia(form,k,draft,'image',draw))
      form.onsubmit=handle(async ev=>{ev.preventDefault();await api('/settings',draft);await refresh();notify('Site settings saved')})
    }
    draw()
  }
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}})
  refresh().then(()=>{nav();posts()}).catch(e=>{main.innerHTML=heading('Publishing desk')+`<p class="error">${esc(e.message)}</p><a class="button" href="/admin">Try again</a>`})
}

import {adminPage} from './admin.js'
import {article, home, sitemap} from './public.js'
import {getPublished, published, publishedIndex, getDraft, getSettings, listAds, mediaResponse, adminApi} from './data.js'
import {isAdmin} from './auth.js'
import {quill, social} from '../.generated/assets.js'

const privateCache = 'private, no-store'
const html = 'text/html; charset=utf-8'
function response(body,status=200,type=html,headers={}) {
  return new Response(body,{status,headers:{'Content-Type':type,'Cache-Control':privateCache,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...headers}})
}
function deviceFor(request) {
  const hint=request.headers.get('sec-ch-ua-mobile')
  return (hint ? hint==='?1' : /Mobile|Android|iPhone|iPod|Opera Mini/i.test(request.headers.get('user-agent')||'')) ? 'mobile' : 'desktop'
}
async function cacheable(request,body,type=html) {
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))
  const tag='"'+Array.from(hash.slice(0,12),b=>b.toString(16).padStart(2,'0')).join('')+'"'
  const headers={'Cache-Control':'public, max-age=0, must-revalidate','ETag':tag,'Vary':'User-Agent, Sec-CH-UA-Mobile','Accept-CH':'Sec-CH-UA-Mobile'}
  return request.headers.get('if-none-match')===tag ? response(null,304,type,headers) : response(body,200,type,headers)
}
async function route(request,env) {
  const url=new URL(request.url)
  const path=url.pathname.replace(/\/+$/,'')||'/'
  const reading=request.method==='GET'||request.method==='HEAD'
  const admin=path==='/admin'||path.startsWith('/admin/')
  const origin=env.MANAGED_ORIGIN || env.PUBLIC_URL || url.origin
  if (admin) {
    if (!reading && request.headers.get('Origin')!==url.origin && !(env.managedPreview && request.headers.get('Origin')===env.MANAGED_ORIGIN)) return response('Invalid origin',403,'text/plain')
    if (!await isAdmin(request,env)) {
      if (path==='/admin' && reading && env.LOCAL_DEV===true) return response(null,302,html,{Location:'/_local/login'})
      return response('Administrator sign-in required. Use the configured publishing account.',401,'text/plain')
    }
    if (path==='/admin/logout') {
      const location=env.LOCAL_DEV===true?'/_local/login':env.managedPreview?'/signout-with-chatgpt?return_to=%2F':'/cdn-cgi/access/logout'
      return response(null,303,html,{Location:location,'Set-Cookie':'jf_local=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict'})
    }
    if (path.startsWith('/admin/api/')) return adminApi(request,env)
    if (!reading) return response('Method not allowed',405,'text/plain')
    if (path.startsWith('/admin/media/')) return mediaResponse(request,env,path.slice('/admin/media/'.length),true)
    if (path==='/admin') return response(adminPage(),200,html,{'Content-Security-Policy':"frame-ancestors 'self'; object-src 'none'; base-uri 'self'",'X-Robots-Tag':'noindex'})
    if (path==='/admin/vendor/quill.js') return response(quill,200,'application/javascript')
    if (path.startsWith('/admin/preview/')) {
      const [post,ads,settings]=await Promise.all([getDraft(env,path.slice('/admin/preview/'.length)),listAds(env),getSettings(env,origin)])
      if (!post) return response('Story not found',404,'text/plain')
      // Keep draft image and video requests inside the Access-protected path.
      for(const map of [post.media,settings.media]){
        for(const item of Object.values(map || {})){
          item.url=item.url.replace('/media/','/admin/media/')
          for(const variant of item.variants||[]) variant.url=variant.url.replace('/media/','/admin/media/')
        }
      }
      const device=url.searchParams.get('device')==='mobile'?'mobile':'desktop'
      return response(article(post,ads,settings,{preview:true,placements:url.searchParams.get('placements')==='1',device}),200,html,{'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"frame-ancestors 'self'; object-src 'none'; base-uri 'self'"})
    }
    return response('Not found',404,'text/plain')
  }
  if (!reading) return response('Method not allowed',405,'text/plain')
  if (path.startsWith('/media/')) return mediaResponse(request,env,path.slice(7),await isAdmin(request,env))
  if (path==='/assets/social.png') return response(Uint8Array.from(atob(social),v=>v.charCodeAt(0)),200,'image/png',{'Cache-Control':'public, max-age=86400'})
  const settings=await getSettings(env,origin)
  if (path==='/') return cacheable(request,home(await published(env),settings))
  if (path==='/sitemap.xml') return cacheable(request,sitemap(await publishedIndex(env),settings),'application/xml; charset=utf-8')
  if (path==='/robots.txt') return response('User-agent: *\nDisallow: /admin\nSitemap: '+settings.publicUrl.replace(/\/$/,'')+'/sitemap.xml\n',200,'text/plain')
  if (path.startsWith('/story/')) {
    const post=await getPublished(env,path.slice(7))
    if (post) {
      const [ads,related]=await Promise.all([listAds(env),published(env,2,post.id)])
      return cacheable(request,article(post,ads,settings,{device:deviceFor(request),related}))
    }
  }
  return response('<!doctype html><meta name="viewport" content="width=device-width"><main style="max-width:44rem;margin:12vh auto;padding:1rem;font:18px system-ui"><h1>Story unavailable</h1><p>This page is no longer available at this address.</p><a href="/">Return to the homepage</a></main>',404)
}
export default {async fetch(request,env) {
  try {
    const result=await route(request,env)
    if (request.method==='HEAD') return new Response(null,{status:result.status,headers:result.headers})
    return result
  } catch(error) {
    console.error('Request failed:',error.name,error.message)
    return response('The publication is temporarily unavailable.',500,'text/plain')
  }
}}

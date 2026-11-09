import {createRemoteJWKSet, jwtVerify} from 'jose'

const keysets = new Map()
function cookie(request, name) {
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)
}
export async function isAdmin(request, env) {
  if (env.LOCAL_DEV === true) return Boolean(env.LOCAL_ADMIN_TOKEN && cookie(request,'jf_local') === env.LOCAL_ADMIN_TOKEN)
  // The managed preview gateway authenticates this header. Standalone Workers always use Access.
  if (env.managedPreview === true && env.MANAGED_OWNER_EMAIL) {
    return request.headers.get('oai-authenticated-user-email')?.toLowerCase() === env.MANAGED_OWNER_EMAIL.toLowerCase()
  }
  const team = env.ACCESS_TEAM_DOMAIN
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request, 'CF_Authorization')
  if (!token || !env.ACCESS_AUD || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team || '')) return false
  const issuer = 'https://' + team
  if (!keysets.has(issuer)) keysets.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')))
  try {
    const {payload} = await jwtVerify(token,keysets.get(issuer),{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','email']})
    return typeof payload.email === 'string' && (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s=>s.trim()).includes(payload.email.toLowerCase())
  } catch { return false }
}

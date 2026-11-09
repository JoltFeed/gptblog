import app from './worker.js'
import {ensureDemo} from './preview-demo.js'

export default {
  async fetch(request,env,ctx) {
    await ensureDemo(env)
    const previewEnv={...env,DB:env.DB,MEDIA:env.MEDIA,managedPreview:true,PUBLIC_URL:env.MANAGED_ORIGIN}
    return app.fetch(request,previewEnv,ctx)
  }
}

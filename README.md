# JoltFeed

A mobile-first publication for JoltFeed/gptblog. Stories are rendered as HTML on Cloudflare Workers. Cloudflare D1 stores drafts, published versions, ads and settings. A private R2 bucket stores photos, responsive variants, video and posters. The Quill editor is served from your Worker when you open the publishing desk.

## 1. Get the files and run the blog

Install Node.js 24 LTS and Git. In a terminal, run the commands below. After the pull request is merged, you can use the default branch instead.

```sh
git clone --branch feature/publishing https://github.com/JoltFeed/gptblog.git
cd gptblog
npm ci
npm test
npm run build
npm run dev
```

Open **http://127.0.0.1:8787/admin** and enter the temporary local token from the terminal. The homepage is **http://127.0.0.1:8787/**. The local server uses SQLite and a filesystem upload directory under `.local/`. Restart it with the same data directory to keep your posts. The server generates a fresh login token each time unless you set `LOCAL_ADMIN_TOKEN` to a random string of at least 16 URL-safe characters. Keep the local development server on loopback.

## 2. Deploy to your Cloudflare account

1. Sign into Cloudflare and enable Workers, D1 and R2 on that account. In Workers & Pages, choose a workers.dev subdomain if prompted. Use a fresh Worker name and fresh storage resources for this installation. The supplied names are `joltfeed`, `joltfeed-content` and `joltfeed-media`. Change them in `wrangler.jsonc` if your account already uses those names.
2. From the project directory, authenticate, build, and deploy. Wrangler will provision the D1 database and R2 bucket on the first deployment. Keep the resulting bindings and database UUID for future deployments. Never replace them when publishing code updates.

   ```sh
   npx wrangler login
   npx wrangler whoami
   npm run deploy
   npx wrangler d1 migrations apply DB --remote
   ```

3. Copy the **workers.dev URL printed by Wrangler**. The public routes are ready after the migrations finish. The admin requires the sign-in configuration below.
4. For later releases, apply reviewed migrations and run `npm run deploy` from the same checkout and Cloudflare account. Track Wrangler's resource IDs in your own configuration. Keep a D1 export and a separate copy of your R2 uploads before changing storage resources. The supplied configuration uses workers.dev and contains no custom-domain routes.

## 3. Create the first administrator and enable recovery

1. In Cloudflare Zero Trust, enable the **One-time PIN** login method or connect your existing identity provider.
2. Go to **Access → Applications → Add an application → Self-hosted**. Select the Worker's exact workers.dev hostname and the **admin** path. Protect both the exact `/admin` URL and its descendants (add `admin/*` to the same application if necessary). Leave the homepage and `/story/*` publicly readable.
3. Add an **Allow** policy with **Include → Emails → your exact editor email address**. Enable the desired login method for this application. Copy the application's **AUD tag** and your team's **team-name.cloudflareaccess.com** hostname.
4. From the project directory, run the following one at a time. Each command prompts for its value privately. Using Worker secrets keeps your actual configuration through subsequent CLI deployments.

   ```sh
   npx wrangler secret put ACCESS_TEAM_DOMAIN
   npx wrangler secret put ACCESS_AUD
   npx wrangler secret put ADMIN_EMAILS
   npx wrangler secret put PUBLIC_URL
   ```

   | Name | Value |
   | --- | --- |
   | ACCESS_TEAM_DOMAIN | Team hostname, without https or a trailing slash |
   | ACCESS_AUD | Audience tag of this admin Access application |
   | ADMIN_EMAILS | Your email, or an explicit comma-separated editor allowlist |
   | PUBLIC_URL | Full HTTPS origin printed by Wrangler, with no path |

5. Visit **your-worker-address/admin**, enter the approved email and use the emailed code. These steps create the first publishing administrator. All allowed administrators can publish and edit executable ad code. To add another, update both the Access policy and the Worker allowlist.
6. End a session with **Log out**. For recovery, request a fresh email code or use your connected identity provider's recovery flow. If the mailbox itself is lost, a Cloudflare account administrator must change both email allowlists to a mailbox you control.
7. In **Site Settings**, save the publication name, logo, favicon, default social image and public URL. If moving to a new origin later, update both the public URL setting and the Access application. In a private browser window, verify a public story opens anonymously and the admin asks you to sign in.

Cloudflare documentation covers [Workers path protection](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [one-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [D1 migrations](https://developers.cloudflare.com/workers/wrangler/commands/d1/) and [automatic provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/).

## 4. Publish your first story

1. Open **Posts → New post**. Enter a title, excerpt and author. Edit the generated slug if desired. Choose **Lead feature on homepage** to make this story eligible for the lead position.
2. Write in **Article body**. Enter starts another paragraph. Use the block selector to add headings, lists, quotes, photos, video, embeds or manual ad slots. Use the arrows to reorder them.
3. Choose a **Featured image** from the media library or upload one. Select **Hide featured image on article** to retain the card and social preview image while hiding the large article image. Body photos accept captions and alt text. An uploaded video supports an optional separate poster. Supported uploads are JPEG, PNG, WebP, GIF, MP4 and WebM, with a 32 MiB maximum per original. Use a YouTube or Vimeo embed for longer films.
4. Use **Preview**, switch between **Mobile** and **Desktop**, then **Publish**. Titled drafts autosave. Editing a published story keeps the previous version public until **Update published story**. **Unpublish** removes the story from the homepage, its URL and the sitemap. **Move to trash** retains a restorable copy in the Trash filter.
5. At the article footer, test the Facebook link, WhatsApp link or **Copy link**. Supported phones also offer native sharing. Social overrides are in the editor under **Social preview overrides**. Public crawlers need a publicly reachable production origin to fetch metadata and photos.

## 5. Configure your first advertisement

1. Open **Ads → New ad**. Name it *Paragraph three*, choose **Before paragraph number**, enter **3**, select **All devices** and enable the rule.
2. Set a reserved height close to your provider's unit height. For an initial placement check, leave code empty and use the preview. For an actual colored test unit, paste this HTML and save the ad.

   ```html
   <div style="padding:20px;text-align:center;background:#f0f0ec">Paragraph three test</div>
   ```

3. Open **Ads → Preview placements**, choose a real draft or published post, then switch device. You should see the unit immediately before the third nonempty top-level paragraph. The report lists rules that lost a priority conflict or failed an eligibility check.
4. Replace the test HTML with the trusted provider's unit code. If the provider supplies a shared loader, place it once in **Ads → Sitewide ad settings → Provider bootstrap code**, and keep only the individual unit snippet in the ad. The loader runs once on an eligible article that displays a unit. Trusted provider scripts execute on the public article origin. Previews use inert labels.
5. Choose the sitewide maximum in **Ads**, or turn on **Disable ads on this post** in the editor. For a manual unit, first create a named **Manual position** ad, then select it in an **Ad slot** block and position the block with its arrow controls.

Numbered rules count only nonempty top-level paragraphs. Percentage rules count text in the body, including headings, lists, quotes and captions, and choose a complete paragraph boundary. When a non-paragraph crosses the threshold, the next eligible paragraph is used. A higher numeric priority wins a shared boundary. Ad delivery, fill and click-through depend on your provider, approved domain, audience and traffic. Test the provider on its approved public hostname.

## 6. Reproduce the checks

`npm test` runs the placement planner and an HTTP integration suite on an isolated temporary database. The suite uploads real JPEG and MP4 bytes, creates and publishes drafts, checks mobile and desktop HTML order, checks private previews, republishes metadata, follows an internal story link, restarts the server, unpublishes and trashes the story. It also checks video ranges, conflicts between editors, social fallbacks, missing paragraph numbers and a post with ads disabled.

```sh
npm test
npm run build
npx wrangler deploy --dry-run
```

To inspect the fixtures interactively, start a fresh local server with a known `LOCAL_ADMIN_TOKEN`. In a second terminal, set the same value and run **one** of these commands. On Windows PowerShell set variables as `$env:LOCAL_ADMIN_TOKEN = 'your-local-random-token'`; set `JOLTFEED_DATA_DIR` to a separate directory for each dataset.

```sh
npm run seed -- demo
npm run seed -- qa
```

**demo** creates three illustrated stories. **qa** requires a dedicated test dataset and creates four test stories and four labeled units. On `/story/qa-eight-paragraphs`, check above the headline, before paragraph 3, after paragraph 4 at the 50% threshold, and after the final body block. Follow **Open the short article**, then go back. Verify one copy of each unit. Fixture photography credits are in [fixtures/CREDITS.md](fixtures/CREDITS.md).

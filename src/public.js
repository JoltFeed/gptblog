import { planAds } from './placements.js';
import { publicStyle } from './public-style.js';

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function rootUrl(settings) {
  const base = new URL(settings.publicUrl);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid public URL');
  return base.origin;
}

function storyPath(post) {
  return '/story/' + encodeURIComponent(post.slug || '');
}

function publicDate(raw) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return '<time datetime="' + esc(date.toISOString()) + '">' +
    new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date) + '</time>';
}

function srcFor(media) {
  if (!media) return '';
  if (typeof media === 'string') return '/media/' + encodeURIComponent(media);
  return media.url || '/media/' + encodeURIComponent(media.id);
}

function resolveMedia(id, post, settings) {
  return id ? (post?.media?.[id] || settings.media?.[id] || { id }) : null;
}

function photo(media, { alt = '', eager = false, sizes = '100vw', extra = '' } = {}) {
  if (!media) return '';
  const variants = (media.variants || []).filter(v => v.url && Number(v.width) > 0);
  const sources = variants.map(v => ({ url: v.url, width: Number(v.width) }));
  if (sources.length && Number(media.width) > 0 && !sources.some(v => v.width === Number(media.width))) {
    sources.push({ url: srcFor(media), width: Number(media.width) });
  }
  const srcset = sources.length ? ' srcset="' + esc(sources.sort((a,b) => a.width - b.width)
    .map(v => v.url + ' ' + v.width + 'w').join(', ')) + '" sizes="' + esc(sizes) + '"' : '';
  const w = Number(media.width), h = Number(media.height);
  const dimensions = w > 0 && h > 0 ? ' width="' + w + '" height="' + h + '"' : ' width="1200" height="675" class="size-fallback"';
  return '<img src="' + esc(srcFor(media)) + '"' + srcset + dimensions + ' alt="' + esc(alt) +
    '" decoding="async" ' + (eager ? 'fetchpriority="high"' : 'loading="lazy"') + extra + '>';
}

function brand(settings) {
  const name = settings.siteName || 'JoltFeed';
  const logo = resolveMedia(settings.logo, null, settings);
  if (logo) return '<a class="brand" href="/" aria-label="' + esc(name) + ' home">' + photo(logo, {alt:name}) + '</a>';
  return '<a class="brand" href="/"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span>' + esc(name) + '</a>';
}

function shell(settings, {title, head = '', body, sectionLink = '/', script = '', preview = false}) {
  const favicon = settings.favicon ? '<link rel="icon" href="' + esc(srcFor(resolveMedia(settings.favicon,null,settings))) + '">' : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="theme-color" content="#fcfbf8"><title>' + esc(title) + '</title>' + favicon + head +
    '<style>' + publicStyle + '</style></head><body id="top"><a class="skip" href="#content">Skip to content</a>' +
    '<header class="mast"><div class="wrap mast-inner">' + brand(settings) +
    '<nav aria-label="Main navigation"><a href="' + sectionLink + '">Latest stories</a></nav></div></header>' + body +
    '<footer class="footer"><div class="wrap footer-inner">' + brand(settings) +
    '<a class="link" href="' + (preview ? '/admin' : '#top') + '">' + (preview ? 'Editorial desk' : 'Back to top ↑') +
    '</a></div></footer>' + script + '</body></html>';
}

function byline(post) {
  return '<div class="byline">' + (post.author ? '<span>' + esc(post.author) + '</span>' : '') + publicDate(post.publishedAt) + '</div>';
}

function coverMedia(post, settings) {
  return resolveMedia(post.featuredImage || settings.defaultSocialImage, post, settings) || {url:'/assets/social.png',width:1200,height:630};
}

function cover(post, settings, hero = false) {
  return '<a class="cover" href="' + esc(storyPath(post)) + '" aria-hidden="true" tabindex="-1" style="display:block">' +
    photo(coverMedia(post, settings), {eager:hero, sizes:hero ? '(max-width:760px) 100vw, 620px' : '(max-width:760px) 100vw, 380px'}) + '</a>';
}

function card(post, settings) {
  return '<article class="card">' + cover(post,settings) + (post.category ? '<p class="eyebrow">' + esc(post.category) + '</p>' : '') +
    '<h3><a href="' + esc(storyPath(post)) + '">' + esc(post.title) + '</a></h3>' + publicDate(post.publishedAt) + '</article>';
}

function meta(key, val, property = true) {
  return '<meta ' + (property ? 'property' : 'name') + '="' + esc(key) + '" content="' + esc(val) + '">';
}

export function home(posts, settings) {
  const sorted = [...posts].sort((a,b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const lead = sorted.find(p => p.featured) || sorted[0];
  const others = sorted.filter(p => p !== lead);
  const name = settings.siteName || 'JoltFeed';
  const canonical = rootUrl(settings) + '/';
  const head = '<link rel="canonical" href="' + esc(canonical) + '">' + meta('og:title',name) + meta('og:type','website') + meta('og:site_name',name) + meta('og:url',canonical) +
    meta('og:image',new URL(srcFor(resolveMedia(settings.defaultSocialImage,null,settings)) || '/assets/social.png',canonical).href);
  const feature = lead ? '<section class="lead" aria-labelledby="lead-title"><div><p class="eyebrow">' +
    esc(lead.category || (lead.featured ? 'Featured story' : 'Latest story')) + '</p><h1 id="lead-title"><a href="' +
    esc(storyPath(lead)) + '">' + esc(lead.title) + '</a></h1>' + (lead.excerpt ? '<p class="excerpt">' + esc(lead.excerpt) + '</p>' : '') +
    byline(lead) + '<a class="read" href="' + esc(storyPath(lead)) + '">Read story <span aria-hidden="true">→</span></a></div>' +
    cover(lead,settings,true) + '</section>' : '<section class="empty"><p class="eyebrow">Latest stories</p><h1>Our first story is on its way.</h1></section>';
  const grid = others.length ? '<section class="stories" id="latest" aria-labelledby="latest-title"><div class="section-head"><h2 id="latest-title">Latest stories</h2></div>' +
    '<div class="grid">' + others.map(p => card(p,settings)).join('') + '</div></section>' : '';
  return shell(settings,{title:name,head,body:'<main class="wrap" id="content">' + feature + grid + '</main>',sectionLink:others.length ? '#latest' : '#content'});
}

function safeLink(raw) {
  if (!raw) return '';
  if (/^\/(?!\/)/.test(raw) && !raw.includes('\\')) return raw;
  try {
    const u = new URL(raw);
    if (['https:','http:','mailto:','tel:'].includes(u.protocol)) return u.href;
  } catch {}
  return '';
}

function richText(block) {
  if (!Array.isArray(block.runs) || !block.runs.length) return esc(block.text);
  return block.runs.map(run => {
    let html = esc(run.text);
    if (run.bold) html = '<strong>' + html + '</strong>';
    if (run.italic) html = '<em>' + html + '</em>';
    const link = safeLink(run.href);
    return link ? '<a href="' + esc(link) + '">' + html + '</a>' : html;
  }).join('');
}

function embedUrl(raw) {
  try {
    const u = new URL(raw), parts = u.pathname.split('/').filter(Boolean);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    const host = u.hostname.replace(/^www\./,'');
    const youtubeId = host === 'youtu.be' ? parts[0] :
      ['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host) ?
        (parts[0] === 'watch' ? u.searchParams.get('v') : ['embed','shorts','live'].includes(parts[0]) ? parts[1] : null) : null;
    if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) return 'https://www.youtube-nocookie.com/embed/' + youtubeId;
    if (['vimeo.com','player.vimeo.com'].includes(host)) {
      const id = parts.find(part => /^\d+$/.test(part));
      if (id) {
        const hash = u.searchParams.get('h') || parts[parts.indexOf(id)+1] || '';
        return 'https://player.vimeo.com/video/' + id + (/^[a-z\d]{6,32}$/i.test(hash) ? '?h=' + hash : '');
      }
    }
  } catch {}
  return '';
}

function blockHtml(block, index, post, settings) {
  const attr = ' data-block-index="' + index + '" data-block-type="' + esc(block.type) + '"';
  const tag = (name,inner) => '<' + name + attr + '>' + inner + '</' + name + '>';
  const media = resolveMedia(block.mediaId,post,settings);
  const caption = block.caption ? '<figcaption>' + esc(block.caption) + '</figcaption>' : '';
  switch (block.type) {
    case 'paragraph': return tag('p',richText(block));
    case 'heading': return tag('h' + ([2,3,4].includes(block.level) ? block.level : 2),richText(block));
    case 'quote': return tag('blockquote',richText(block));
    case 'list': return tag(block.ordered ? 'ol' : 'ul',(block.items || []).map(item => '<li>' + esc(item) + '</li>').join(''));
    case 'image': return media ? tag('figure',photo(media,{alt:block.alt || '',sizes:'(max-width:760px) 100vw, 710px'}) + caption) : '';
    case 'video': {
      const poster = resolveMedia(block.posterId,post,settings);
      return media ? tag('figure','<video controls playsinline preload="none" loading="lazy" aria-label="' + esc(block.caption || 'Article video') + '"' +
        (poster ? ' poster="' + esc(srcFor(poster)) + '"' : '') + ' src="' + esc(srcFor(media)) + '"></video>' + caption) : '';
    }
    case 'embed': {
      const url = embedUrl(block.url);
      return url ? tag('figure','<iframe class="embed" title="' + esc(block.caption || 'Embedded video') +
        '" src="' + esc(url) + '" loading="lazy" allow="fullscreen; picture-in-picture; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' + caption) : '';
    }
    default: return '';
  }
}

const shareScript = `<script>
(() => {
  const box = document.querySelector('.share-actions');
  if (!box) return;
  const url = box.dataset.url, title = box.dataset.title;
  const status = document.querySelector('#share-status');
  const copy = box.querySelector('[data-copy]'), native = box.querySelector('[data-share]');
  let timer;
  function inform(text) { status.textContent = text; clearTimeout(timer); timer = setTimeout(() => { status.textContent=''; }, 2800); }
  copy.addEventListener('click',async () => {
    try { await navigator.clipboard.writeText(url); inform('Link copied'); }
    catch { const field = document.createElement('textarea'); field.value = url; box.appendChild(field); field.select();
      const ok = document.execCommand('copy'); field.remove(); copy.focus(); if(ok) inform('Link copied'); else window.prompt('Copy the article link',url); }
  });
  if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
    native.hidden = false; native.addEventListener('click',async () => {
      try { await navigator.share({title,url}); } catch(e) { if(e.name !== 'AbortError') inform('Sharing is unavailable'); }
    });
  }
})();
</script>`;

function share(post, canonical) {
  const param = encodeURIComponent(canonical);
  return '<section class="share" aria-labelledby="share-heading"><h2 id="share-heading">Share this story</h2>' +
    '<div class="share-actions" data-url="' + esc(canonical) + '" data-title="' + esc(post.title) + '">' +
    '<a href="https://www.facebook.com/sharer/sharer.php?u=' + param + '" target="_blank" rel="noopener noreferrer">Facebook</a>' +
    '<a href="https://wa.me/?text=' + param + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
    '<button type="button" data-copy>Copy link</button><button type="button" data-share hidden>Share</button></div>' +
    '<p role="status" id="share-status" aria-live="polite"></p></section>';
}

export function article(post, ads, settings, {device='desktop',preview=false,placements=false,related=[]} = {}) {
  const canonical = rootUrl(settings) + storyPath(post);
  const socialTitle = post.socialTitle || post.title || 'Untitled story';
  const description = post.socialDescription || post.excerpt || (post.blocks || []).find(b => b.type === 'paragraph')?.text?.slice(0,200) || '';
  const social = resolveMedia(post.socialImage || post.featuredImage || settings.defaultSocialImage,post,settings);
  const imageUrl = new URL(srcFor(social) || '/assets/social.png',canonical).href;
  const head = meta('description',description,false) + (preview ? meta('robots','noindex,nofollow,noarchive',false) : '') +
    '<link rel="canonical" href="' + esc(canonical) + '">' + meta('og:type','article') + meta('og:url',canonical) +
    meta('og:site_name',settings.siteName || 'JoltFeed') + meta('og:title',socialTitle) + meta('og:description',description) + meta('og:image',imageUrl) +
    meta('twitter:card','summary_large_image',false) + meta('twitter:title',socialTitle,false) + meta('twitter:description',description,false) + meta('twitter:image',imageUrl,false);
  const {slots,skipped} = planAds(post,ads,settings,device);
  const testing = preview || placements;
  const unit = key => {
    const entry = slots[key];
    if (!entry) return '';
    const {ad,label} = entry;
    const height = Math.max(0,Math.min(1600,Number(ad.height) || 90));
    const props = ' data-ad-id="' + esc(ad.id) + '" data-boundary="' + esc(key) + '" style="--unit-height:' + height + 'px"';
    if (testing) return '<aside class="ad preview"' + props + '><strong>' + esc(ad.name) + '</strong><small>' + esc(label) + '</small></aside>';
    return '<aside class="ad" aria-label="Advertisement"' + props + '><div class="ad-label">Advertisement</div>' + (ad.code || '') + '</aside>';
  };
  const blocks = post.blocks || [];
  const bodyContent = blocks.map((b,i) => unit('b' + i) + blockHtml(b,i,post,settings)).join('') + unit('b' + blocks.length);
  const relatedPosts = related.filter(p => p.slug !== post.slug).slice(0,2);
  const more = relatedPosts.length ? '<section class="related"><h2>More stories</h2><div class="grid">' + relatedPosts.map(p => card(p,settings)).join('') + '</div></section>' : '';
  const report = placements ? '<section class="placement-report" aria-label="Placement report"><h2>Placement report</h2><p>' +
    esc(device === 'mobile' ? 'Mobile' : 'Desktop') + ' · ' + Object.keys(slots).length + ' placements</p>' +
    (skipped.length ? '<h3>Skipped rules</h3><ul>' + skipped.map(s => '<li><strong>' + esc(s.name) + '</strong> — ' + esc(s.reason) + '</li>').join('') + '</ul>' : '<p>No rules skipped.</p>') + '</section>' : '';
  const feature = post.hideFeaturedImage ? null : resolveMedia(post.featuredImage,post,settings);
  const page = '<main id="content"><article><header class="reader story-head">' +
    (post.category ? '<p class="eyebrow">' + esc(post.category) + '</p>' : '') + unit('beforeTitle') +
    '<h1>' + esc(post.title || 'Untitled story') + '</h1>' + (post.excerpt ? '<p class="excerpt">' + esc(post.excerpt) + '</p>' : '') +
    byline(post) + unit('afterTitle') + '</header>' +
    (feature ? '<figure class="hero-photo">' + photo(feature,{alt:feature.alt || '',eager:true,sizes:'(max-width:960px) 100vw, 960px'}) + '</figure>' : '') +
    '<div class="reader"><div class="body">' + bodyContent + '</div>' + unit('afterPost') + share(post,canonical) + '</div></article>' +
    '<div class="reader">' + report + more + '</div></main>';
  const bootstrap = !testing && Object.keys(slots).length && settings.bootstrapCode ? settings.bootstrapCode : '';
  return shell(settings,{title:(post.title || 'Untitled story') + ' · ' + (settings.siteName || 'JoltFeed'),head:head + bootstrap,body:page,script:shareScript,preview:testing});
}

export function sitemap(posts, settings) {
  const root = rootUrl(settings);
  const urls = posts.map(post => {
    const updated = new Date(post.updatedAt || post.publishedAt);
    const stamp = Number.isNaN(updated.getTime()) ? '' : '<lastmod>' + updated.toISOString() + '</lastmod>';
    return '<url><loc>' + esc(root + storyPath(post)) + '</loc>' + stamp + '</url>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + esc(root) + '/</loc></url>' + urls + '</urlset>';
}

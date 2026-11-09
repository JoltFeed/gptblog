// Unicode-aware segmentation also counts words in languages without spaces.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function wordCount(text) {
  let count = 0;
  for (const part of segmenter.segment(String(text ?? ''))) {
    if (part.isWordLike) count++;
  }
  return count;
}

function ordinal(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function resolveCandidates(candidates, limit, skipped) {
  const slots = {};
  const occupied = new Map();
  // The cap and collisions use the same ordering on every request, independent
  // of D1 query order. Repeated insertions of one rule prefer earlier positions.
  candidates.sort((a, b) => Number(b.ad.priority || 0) - Number(a.ad.priority || 0)
    || a.order - b.order || String(a.ad.id).localeCompare(String(b.ad.id)));
  for (const candidate of candidates) {
    const { ad, boundary, key, label } = candidate;
    const winner = occupied.get(boundary);
    if (winner) {
      skipped.push({ name: ad.name, reason: label + ' shares a position with ' + winner + ', which takes precedence.' });
    } else if (occupied.size >= limit) {
      skipped.push({ name: ad.name, reason: label + ' exceeds the sitewide maximum of ' + limit + ' ads.' });
    } else {
      occupied.set(boundary, ad.name);
      slots[key] = { ad, label };
    }
  }
  return { slots, skipped };
}

function blockText(block) {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return block.runs?.length ? block.runs.map(run => run.text).join('') : String(block.text ?? '');
    case 'list':
      return (block.items ?? []).join(' ');
    case 'image':
    case 'video':
      return String(block.caption ?? '');
    default:
      return '';
  }
}

export function planAds(post, ads, settings, device) {
  if (!ads.length) return { slots: {}, skipped: [] };
  if (post.disableAds) return {
    slots: {},
    skipped: ads.map(ad => ({ name: ad.name, reason: 'Ads are disabled for this post.' })),
  };
  const blocks = post.blocks ?? [];
  const needWordCount = ads.some(ad => ad.enabled && (ad.placement === 'percentage' || ad.minWords > 0));
  const paragraphs = [];
  const manual = new Map();
  // Consecutive manual markers occupy one physical boundary. Numbering body
  // boundaries by visible blocks makes a marker and a nearby rule collide.
  const physical = [0];
  let totalWords = 0;
  for (const [index, block] of blocks.entries()) {
    const text = blockText(block);
    if (needWordCount) totalWords += wordCount(text);
    if (block.type === 'paragraph' && text.trim()) {
      paragraphs.push({ index, endWords: totalWords });
    }
    if (block.type === 'ad') {
      if (!manual.has(block.adId)) manual.set(block.adId, []);
      manual.get(block.adId).push(index);
    }
    physical.push(physical[index] + (block.type === 'ad' ? 0 : 1));
  }

  const candidates = [];
  const skipped = [];
  for (const ad of ads) {
    const skip = reason => skipped.push({ name: ad.name, reason });
    if (!ad.enabled) { skip('Rule is disabled.'); continue; }
    if (ad.device && ad.device !== 'all' && ad.device !== device) {
      skip('Rule targets ' + ad.device + ' devices.'); continue;
    }
    if (totalWords < Number(ad.minWords ?? 0)) {
      skip('Post has ' + totalWords + ' words, rule requires ' + ad.minWords + '.'); continue;
    }

    const add = (key, boundary, order, label) => candidates.push({ ad, key, boundary, order, label });
    const addBody = (index, label) => add('b' + index, physical[index], index, label);
    const missing = n => skip('Post has ' + paragraphs.length + ' paragraphs, rule requires ' + n + '.');
    switch (ad.placement) {
      case 'beforeTitle':
        add('beforeTitle', 'beforeTitle', -2, 'Before title');
        break;
      case 'afterTitle':
        add('afterTitle', post.featuredImage && !post.hideFeaturedImage ? 'afterTitle' : 0, -1, 'After title');
        break;
      case 'afterPost':
        add('afterPost', physical.at(-1), blocks.length + 1, 'After post');
        break;
      case 'beforeFirst':
      case 'beforeParagraph':
      case 'afterParagraph': {
        const n = ad.placement === 'beforeFirst' ? 1 : ordinal(ad.number);
        if (!n) { skip('Choose a positive paragraph number.'); break; }
        if (n > paragraphs.length) { missing(n); break; }
        const after = ad.placement === 'afterParagraph';
        addBody(paragraphs[n-1].index + Number(after), (after ? 'After' : 'Before') + ' paragraph ' + n);
        break;
      }
      case 'every': {
        const first = ordinal(ad.start), interval = ordinal(ad.interval), max = ordinal(ad.maxRepeats);
        if (!first || !interval || !max) { skip('Choose a positive start, interval and repeat limit.'); break; }
        if (first > paragraphs.length) { missing(first); break; }
        for (let n = first, count = 0; n <= paragraphs.length && count < max; n += interval, count++) {
          addBody(paragraphs[n-1].index + 1, 'After paragraph ' + n);
        }
        break;
      }
      case 'percentage': {
        const percent = Number(ad.percentage);
        if (!(percent > 0 && percent <= 100)) { skip('Choose a percentage greater than 0 and at most 100.'); break; }
        const hit = paragraphs.find(p => p.endWords * 100 >= totalWords * percent);
        if (!hit || !totalWords) { skip('No paragraph ends at or beyond ' + percent + '% of article words.'); break; }
        addBody(hit.index + 1, percent + '% of article');
        break;
      }
      case 'manual': {
        const markers = manual.get(ad.id);
        if (!markers?.length) { skip('No manual slot selects this ad.'); break; }
        for (const index of markers) addBody(index, 'Manual position');
        break;
      }
      default:
        skip('Unknown placement.');
    }
  }
  const limit = Number(settings.maxAds ?? 4);
  return resolveCandidates(candidates, Number.isSafeInteger(limit) && limit >= 0 ? limit : 4, skipped);
}

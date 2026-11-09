const paragraph = (text) => ({type: 'paragraph', text})
const quote = (text) => ({type: 'quote', text})
const heading = (text) => ({type: 'heading', text})
const link = (text, href) => ({text, href})
const linkedParagraph = (...runs) => ({type: 'paragraph', text: runs.map(r => r.text).join(''), runs})

export const mediaFiles = {
  garden: ['garden-pavilion.jpg', 'image/jpeg', 'A tiled pavilion overlooking a lake, framed by trees.'],
  dahlia: ['apricot-dahlia.jpg', 'image/jpeg', 'An apricot dahlia with concentric rows of petals against a dark green background.'],
  hopper: ['grace-hopper.jpg', 'image/jpeg', 'Grace Hopper in U.S. Navy uniform against a blue backdrop and an American flag.'],
  film: ['garden-study.mp4', 'video/mp4', 'A slow, silent zoom into the garden pavilion photograph.'],
}

const gardenCredit = () => linkedParagraph(
  {text: 'Photography by '}, link('danielbuechele', 'https://www.flickr.com/photos/danielbuechele/6061409035/'),
  {text: ', licensed under '}, link('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'), {text: '.'},
)
const flowerCredit = () => linkedParagraph(
  {text: 'Photography from '}, link('vultilion', 'https://www.flickr.com/photos/vultilion/6056698931/'),
  {text: ' (credited to danielbuechele in scikit-learn), licensed under '},
  link('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'), {text: '.'},
)

export function demoStories(media) {
  const base = {author: 'JoltFeed Editors', featured: false, disableAds: false}
  return [
    {...base, slug: 'grace-hopper-a-nanosecond-in-your-hand', title: 'A nanosecond you could hold in your hand',
      category: 'People', featuredImage: media.hopper,
      excerpt: 'Grace Hopper could explain a billionth of a second with a piece of wire. The lesson still fits in a pocket.',
      blocks: [
        paragraph('In a photograph taken at a Navy ceremony in 1985, Grace Hopper is handing a colleague a length of wire. You might expect a computer scientist to bring a diagram. Hopper brought something you could take home.'),
        paragraph('The wire stood for the distance light travels in a nanosecond, about a foot. A billionth of a second is difficult to picture. The space between two hands is familiar.'),
        heading('An idea with a shape'),
        paragraph('It is easy to imagine that an explanation has landed because everyone in the room has stopped asking questions. A physical object offers a different test. Carry it across the room and see whether you can explain it to the next person.'),
        linkedParagraph(link('See the Navy archive photograph of Hopper handing over the wire.', 'https://www.history.navy.mil/content/history/nhhc/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-96000/NH-96931.html')),
        linkedParagraph({text: 'Portrait by James S. Davis, U.S. Navy, 1984. '}, link('View the public-domain photograph.', 'https://commons.wikimedia.org/wiki/File:Grace_Hopper.jpg')),
      ]},
    {...base, slug: 'inside-the-folds-of-a-dahlia', title: 'Inside the folds of a dahlia',
      category: 'Nature', featuredImage: media.dahlia,
      excerpt: 'At arm’s length, one orange flower. A little closer, a crowd of small, unruly shapes.',
      blocks: [
        paragraph('Start at the rim. The outer petals are wide, pale and almost flat. As your eye moves inward they curl into little cups, then narrow until the shadows between them are darker than the petals themselves.'),
        paragraph('Behind the open flower sits another one, lower in the frame. A few green leaves dissolve into blue. The lens grants detail to a small patch of the garden and lets the rest go soft.'),
        heading('Leave the imperfect petal in'),
        paragraph('Follow one ring around. The petals lean in different directions. One folds farther back than its neighbor. The small irregularities are what reward a second look.'),
        flowerCredit(),
      ]},
    {...base, slug: 'a-pavilion-at-the-waters-edge', title: 'A pavilion at the water’s edge',
      category: 'Places', featured: true, featuredImage: media.garden,
      excerpt: 'A lake, a tiled roof and the quiet pleasure of looking twice at a familiar shape.',
      blocks: [
        paragraph('Look at the top roof first. Its yellow tiles slope toward a thin green edge, then turn up just as the line seems ready to disappear into the trees. Below it, the same gesture repeats at a wider scale.'),
        paragraph('The pavilion gives a still photograph an unexpected rhythm. The eye steps down one level, then another, before finding the pale stretch of water on the right.'),
        heading('Between the branches'),
        paragraph('From this angle the building meets the trees at almost every edge. A branch covers part of a balcony. Another cuts across the railing. They make the view feel like something discovered along a walk.'),
        quote('The smallest boats are almost marks on the water. Only after you notice them does the lake begin to look large.'),
        paragraph('Try covering the lake with your hand. The photograph becomes a study of rooflines and painted wood. Uncover it, and the room beyond the balcony opens again.'),
        gardenCredit(),
      ]},
  ]
}

export const qaAds = [
  ['Above title', 'beforeTitle', {}],
  ['Before paragraph 3', 'beforeParagraph', {number: 3}],
  ['Halfway', 'percentage', {percentage: 50}],
  ['After story', 'afterPost', {}],
].map(([name, placement, options], index) => ({
  name: 'QA · ' + name, placement, enabled: true, device: 'all', priority: 10,
  minWords: 0, height: 60, number: 1, percentage: 50, ...options,
  code: '<div data-test-ad="' + placement + '" style="padding:12px;background:' +
    ['#e6efec', '#f3e9d9', '#e8e8f4', '#f5e4e1'][index] +
    ';color:#242524;text-align:center">QA · ' + name + '</div>',
}))

export function qaStories(media) {
  const base = {author: 'QA editor', featured: false, category: 'Placement tests', disableAds: false}
  const url = '/story/qa-short-story'
  return [
    {...base, slug: 'qa-short-story', title: 'QA · Three paragraphs', featuredImage: '',
      excerpt: 'A short article for paragraph bounds and return navigation.',
      blocks: [paragraph('One boat leaves the shore.'), paragraph('A second crosses the lake.'),
        linkedParagraph({text: 'Three boats are visible. '}, link('Return to the eight-paragraph article.', '/story/qa-eight-paragraphs'))]},
    {...base, slug: 'qa-ads-disabled', title: 'QA · Ads disabled', disableAds: true, featuredImage: '',
      excerpt: 'The sitewide ad rules must produce zero units here.',
      blocks: [paragraph('This page has every article-level advertisement disabled.')]},
    {...base, slug: 'qa-social-fallback', title: 'QA · Sitewide social fallback', featuredImage: '',
      excerpt: 'Inspect the raw HTML for the sitewide share image.',
      blocks: [paragraph('This article has no featured image and no custom social image.')]},
    {...base, slug: 'qa-eight-paragraphs', title: 'QA · Eight paragraphs at the pavilion', featured: true,
      featuredImage: media.garden, excerpt: 'A reproducible article for testing paragraph boundaries, media, sharing, and navigation.',
      blocks: [
        heading('At the water'),
        paragraph('One. The pavilion stands near a lake, with a line of orange roof tiles rising above its wooden balconies and the trees nearby.'),
        {type: 'image', mediaId: media.garden, alt: mediaFiles.garden[2], caption: 'Pavilion by danielbuechele, CC BY 2.0.'},
        paragraph('Two. Pale water stretches beyond the branches, where distant boats draw small marks and the opposite shore fades into the afternoon haze.'),
        paragraph('Three. The painted eaves repeat around the building, each level turning outward to catch a narrow band of light along its edge.'),
        paragraph('Four. At the far side, a tree almost conceals the lower level, leaving only its green roof and a corner of the railing visible.'),
        {type: 'video', mediaId: media.film, posterId: media.garden, caption: 'Silent crop and zoom of the photograph by danielbuechele, CC BY 2.0.'},
        paragraph('Five. Behind the pavilion, the water appears almost white beside the saturated green leaves.'),
        paragraph('Six. A gap between branches reveals several tiny boats moving across the lake.'),
        paragraph('Seven. The orange roofline curves up before disappearing against the pale sky.'),
        linkedParagraph({text: 'Eight. '}, link('Open the short article.', url), {text: ' Photo and adapted video from '},
          link('danielbuechele', 'https://www.flickr.com/photos/danielbuechele/6061409035/'), {text: ', '},
          link('CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'), {text: '.'}),
      ]},
  ]
}

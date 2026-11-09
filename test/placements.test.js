import assert from 'node:assert/strict';
import test from 'node:test';
import { planAds } from '../src/placements.js';

const p = text => ({ type: 'paragraph', text });
const post = {
  blocks: [
    { type: 'heading', text: 'Intro' },
    p('One two.'),
    { type: 'image', caption: 'Photo', alt: 'excluded alternative description' },
    p('Three four.'),
    p('Five six.'),
    { type: 'video', caption: '' },
    p('Seven eight.'),
    p('Nine ten.'),
    p('Eleven twelve.'),
    p('Thirteen fourteen.'),
    p('Fifteen sixteen.'),
  ],
};
const ad = (placement, fields = {}) => ({
  id: placement, name: placement, enabled: true, placement, device: 'all', priority: 0, ...fields,
});
const plan = (rules, story = post, maxAds = 20, device = 'mobile') =>
  planAds(story, rules, { maxAds }, device);
const positions = result => Object.keys(result.slots).sort();

for (const device of ['mobile', 'desktop']) {
  test('eight-paragraph story has four exact placements on ' + device, () => {
    const result = plan([
      ad('percentage', { percentage: 50 }), ad('afterPost'), ad('beforeTitle'),
      ad('beforeParagraph', { number: 3 }),
    ], post, 4, device);
    assert.deepEqual(positions(result), ['afterPost', 'b4', 'b7', 'beforeTitle']);
    assert.equal(result.slots.b4.label, 'Before paragraph 3');
    assert.equal(result.slots.b7.label, '50% of article');
    assert.deepEqual(result.skipped, []);
  });
}

test('only nonempty top-level paragraphs count in numbered rules', () => {
  const mixed = { blocks: [
    { type: 'video' }, { type: 'heading', text: 'Opening' }, p(' \n '),
    { type: 'quote', text: 'Quotation.' }, { type: 'list', items: ['One', 'Two'] },
    { type: 'paragraph', runs: [{ text: 'hi', bold: true }, { text: ' there' }] },
    { type: 'embed' }, p('Next.'),
  ] };
  assert.deepEqual(positions(plan([ad('beforeFirst'), ad('afterParagraph', { number: 2 })], mixed)), ['b5', 'b8']);
});

test('short articles and disabled stories have explicit reasons', () => {
  const short = { blocks: [p('a'), p('b'), p('c')] };
  const result = plan([ad('afterParagraph', { number: 5 }), ad('every', { start: 5, interval: 2, maxRepeats: 4 })], short);
  assert.deepEqual(positions(result), []);
  assert.ok(result.skipped.every(item => item.reason === 'Post has 3 paragraphs, rule requires 5.'));
  assert.match(plan([ad('beforeTitle')], { ...post, disableAds: true }).skipped[0].reason, /disabled for this post/);
});

test('repeating rules obey first insertion, interval and repeat limit', () => {
  const result = plan([ad('every', { start: 2, interval: 3, maxRepeats: 2 })]);
  assert.deepEqual(positions(result), ['b4', 'b8']);
});

test('visual boundaries deduplicate adjacent manual blocks, numbered rules and after-post', () => {
  const mixed = { blocks: [p('one'), { type: 'ad', adId: 'manual' }, { type: 'ad', adId: 'manual' }, p('two')] };
  const result = plan([
    ad('afterParagraph', { number: 1 }),
    ad('manual', { priority: 5 }),
    ad('beforeParagraph', { number: 2 }),
    ad('afterParagraph', { id: 'last', number: 2 }),
    ad('afterPost', { priority: 3 }),
  ], mixed);
  assert.deepEqual(positions(result), ['afterPost', 'b1']);
  assert.equal(result.skipped.length, 4);
});

test('site cap and priority are stable across database query ordering', () => {
  const rules = [ad('beforeTitle'), ad('afterPost', { priority: 9 }), ad('beforeParagraph', { number: 2, priority: 4 })];
  assert.deepEqual(positions(plan(rules, post, 2)), ['afterPost', 'b3']);
  assert.deepEqual(plan(rules, post, 2), plan([...rules].reverse(), post, 2));
  assert.deepEqual(positions(plan(rules, post, 0)), []);
});

test('device, minimum word count and enabled switches apply to manual and automatic rules', () => {
  const result = plan([ad('manual', { device: 'desktop' }), ad('beforeTitle', { minWords: 19 }), ad('afterPost', { enabled: false })]);
  assert.deepEqual(positions(result), []);
  assert.match(result.skipped[0].reason, /desktop/);
  assert.match(result.skipped[1].reason, /18 words/);
  assert.match(result.skipped[2].reason, /disabled/);
});

test('weighted percentage defers nonparagraph crossings to the next complete paragraph', () => {
  const mixed = { blocks: [p('a'), { type: 'list', items: ['b c d e f g'] }, p('h i'), { type: 'quote', text: 'j' }] };
  assert.deepEqual(positions(plan([ad('percentage', { percentage: 50 })], mixed)), ['b3']);
  assert.deepEqual(positions(plan([ad('percentage', { percentage: 100 })], mixed)), []);
});

test('empty posts, unknown options and invalid numeric values never produce a bogus body ad', () => {
  const rules = [ad('beforeFirst'), ad('afterParagraph', { number: -1 }), ad('manual'), ad('percentage', { percentage: 50 }), ad('every', { start: 1, interval: 0, maxRepeats: 1 })];
  const result = plan(rules, { blocks: [] });
  assert.equal(result.skipped.length, rules.length);
  assert.deepEqual(positions(result), []);
});

test('the after-title rule collides with the first paragraph only when no lead image separates them', () => {
  const rules = [ad('afterTitle', { priority: 3 }), ad('beforeFirst')];
  const story = { blocks: [p('First.')], featuredImage: 'photo' };
  assert.deepEqual(positions(plan(rules, story)), ['afterTitle', 'b0']);
  assert.deepEqual(positions(plan(rules, { ...story, hideFeaturedImage: true })), ['afterTitle']);
  assert.deepEqual(positions(plan(rules, { ...story, featuredImage: '' })), ['afterTitle']);
});

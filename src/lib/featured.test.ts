import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFeatured } from './featured.ts';

const known = new Set(['a', 'b', 'c', 'd']);

test('returns the configured order, not the input order of the set', () => {
  assert.deepEqual(pickFeatured(['c', 'a', 'b'], known, 10), ['c', 'a', 'b']);
});

test('truncates to the limit', () => {
  assert.deepEqual(pickFeatured(['a', 'b', 'c'], known, 2), ['a', 'b']);
});

test('throws on a slug that no project provides', () => {
  assert.throws(
    () => pickFeatured(['a', 'nope', 'zilch'], known, 10),
    /unknown slug\(s\): nope, zilch/,
  );
});

test('throws on a repeated slug', () => {
  assert.throws(() => pickFeatured(['a', 'b', 'a'], known, 10), /repeats slug\(s\): a/);
});

test('an empty order is a valid "fall back to the date sort" signal', () => {
  assert.deepEqual(pickFeatured([], known, 10), []);
});

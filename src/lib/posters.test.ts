import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcsetFor } from './posters.ts';

test('builds a width-descriptor srcset in the given order', () => {
  assert.equal(
    srcsetFor('btv-comedy', [480, 960], 'avif', ''),
    '/posters/opt/btv-comedy-480.avif 480w, /posters/opt/btv-comedy-960.avif 960w',
  );
});

test('applies a non-root base path to every entry', () => {
  assert.equal(
    srcsetFor('tikves', [480], 'avif', '/new'),
    '/new/posters/opt/tikves-480.avif 480w',
  );
});

test('a single width still gets its descriptor', () => {
  assert.equal(srcsetFor('x', [640], 'avif', ''), '/posters/opt/x-640.avif 640w');
});

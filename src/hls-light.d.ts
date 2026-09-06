/** hls.js publishes types for its main entry but not for the `./light`
 *  subpath (package.json has no typesVersions), so importing the light build
 *  resolves to `any` and silently loses type-checking on every hls.js call.
 *
 *  The light build is the same API with optional features (EME, subtitles,
 *  alt-audio) compiled out — not a different surface — so re-exporting the
 *  package's own declarations is accurate rather than a convenient lie.
 *  It is used instead of the full build because it is ~116 KB gzip against
 *  ~181 KB, and none of the omitted features are used here. */
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}

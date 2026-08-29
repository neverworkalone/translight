// These build values are replaced by Vite for extension builds. The typeof
// fallback keeps source-level tests and non-Vite consumers on the production
// path by default.
const buildKind = typeof __TRANSLIGHT_BUILD_KIND__ === 'string'
  ? __TRANSLIGHT_BUILD_KIND__
  : 'production';
const buildIdentifier = typeof __TRANSLIGHT_BUILD_IDENTIFIER__ === 'string'
  ? __TRANSLIGHT_BUILD_IDENTIFIER__
  : buildKind;
const buildCommit = typeof __TRANSLIGHT_BUILD_COMMIT__ === 'string'
  ? __TRANSLIGHT_BUILD_COMMIT__
  : null;

export const BUILD_INFO = Object.freeze({
  kind: buildKind,
  identifier: buildIdentifier,
  commit: buildCommit,
  testBuild: buildKind === 'test'
});

export const IS_TEST_BUILD = BUILD_INFO.testBuild;

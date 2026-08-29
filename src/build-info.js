// These identifiers are replaced by Vite for extension builds. The typeof
// fallback keeps source-level tests and non-Vite consumers on the production
// path by default.
const buildKind = typeof __TRANSLIGHT_BUILD_KIND__ === 'string'
  ? __TRANSLIGHT_BUILD_KIND__
  : 'production';
const buildIdentifier = typeof __TRANSLIGHT_BUILD_IDENTIFIER__ === 'string'
  ? __TRANSLIGHT_BUILD_IDENTIFIER__
  : buildKind;

export const BUILD_INFO = Object.freeze({
  kind: buildKind,
  identifier: buildIdentifier,
  testBuild: buildKind === 'test'
});

export const IS_TEST_BUILD = BUILD_INFO.testBuild;

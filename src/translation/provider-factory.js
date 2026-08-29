import {BUILD_INFO} from '../build-info.js';
import {ChromeTranslateProvider} from './chrome-provider.js';
import {TranslationProviderError} from './provider.js';

export const PROVIDER_TYPES = Object.freeze({
  CHROME: 'chrome',
  DUMMY: 'dummy'
});

export function assertDummyProviderAllowed(testBuild = BUILD_INFO.testBuild) {
  if (testBuild === true) return;
  throw new TranslationProviderError(
    'TEST_BUILD_REQUIRED',
    'The dummy translation provider is available only in a test build.'
  );
}

export function createTranslationProvider({
  type = PROVIDER_TYPES.CHROME,
  targetLanguage = 'ko',
  profile,
  delayMs
} = {}) {
  if (type === PROVIDER_TYPES.DUMMY) {
    assertDummyProviderAllowed();
    throw new TranslationProviderError(
      'TEST_BUILD_REQUIRED',
      'The dummy translation provider is not included in the production build.'
    );
  }
  if (type !== PROVIDER_TYPES.CHROME) {
    throw new TranslationProviderError(
      'UNSUPPORTED_PROVIDER',
      `Unsupported translation provider: ${type}`
    );
  }
  return new ChromeTranslateProvider({targetLanguage});
}

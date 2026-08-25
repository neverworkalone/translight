export const MODEL_MANAGEMENT_URL = 'chrome://on-device-translation-internals/';

export function openModelManagement({tabs = globalThis.chrome?.tabs} = {}) {
  if (typeof tabs?.create !== 'function') return false;

  try {
    const pending = tabs.create({url: MODEL_MANAGEMENT_URL});
    pending?.catch?.(() => {});
    return true;
  } catch {
    return false;
  }
}

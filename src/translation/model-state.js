export const MODEL_STATE = Object.freeze({
  DOWNLOADABLE: 'Downloadable',
  DOWNLOADING: 'Downloading',
  AVAILABLE: 'Available',
  DOWNLOAD_FAILED: 'Download Failed',
  UNAVAILABLE: 'Unavailable'
});

export function normalizeModelState(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  switch (normalized) {
    case 'downloadable':
      return MODEL_STATE.DOWNLOADABLE;
    case 'downloading':
      return MODEL_STATE.DOWNLOADING;
    case 'available':
      return MODEL_STATE.AVAILABLE;
    case 'download failed':
    case 'failed':
      return MODEL_STATE.DOWNLOAD_FAILED;
    case 'unavailable':
    case 'unsupported':
      return MODEL_STATE.UNAVAILABLE;
    default:
      return MODEL_STATE.UNAVAILABLE;
  }
}

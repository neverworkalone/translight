export class TranslationProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'TranslationProviderError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
  }
}

export class TranslationCancelledError extends TranslationProviderError {
  constructor(message = '번역 작업이 취소되었습니다.') {
    super('CANCELLED', message, { recoverable: true });
    this.name = 'TranslationCancelledError';
  }
}

export class TranslationProvider {
  async getModelState() {
    throw new Error('TranslationProvider.getModelState()를 구현해야 합니다.');
  }

  async prepare() {
    throw new Error('TranslationProvider.prepare()를 구현해야 합니다.');
  }

  async translate() {
    throw new Error('TranslationProvider.translate()를 구현해야 합니다.');
  }

  cancel() {}

  close() {}
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new TranslationCancelledError();
}

export function isTranslationCancelled(error) {
  return error instanceof TranslationCancelledError || error?.code === 'CANCELLED';
}

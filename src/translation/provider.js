export class TranslationProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'TranslationProviderError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
  }
}

export class TranslationCancelledError extends TranslationProviderError {
  constructor(message = 'The translation was cancelled.') {
    super('CANCELLED', message, { recoverable: true });
    this.name = 'TranslationCancelledError';
  }
}

export class TranslationProvider {
  async getModelState() {
    throw new Error('TranslationProvider.getModelState() must be implemented.');
  }

  async prepare() {
    throw new Error('TranslationProvider.prepare() must be implemented.');
  }

  async translate() {
    throw new Error('TranslationProvider.translate() must be implemented.');
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

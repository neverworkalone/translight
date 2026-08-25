<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {t} from '../../i18n/index.js';
import {ChromeTranslateProvider} from '../../translation/chrome-provider.js';
import {MODEL_STATE} from '../../translation/model-state.js';
import {isTranslationCancelled} from '../../translation/provider.js';
import {openModelManagement} from '../model-management.js';

const props = defineProps({
  settings: {type: Object, required: true},
  disabled: {type: Boolean, default: false}
});

const provider = ref(null);
const modelState = ref(null);
const progress = ref(null);
const refreshing = ref(true);
const downloading = ref(false);
const error = ref('');
let disposed = false;
let operationSequence = 0;
let operationController = null;

const statusLabel = computed(() => {
  switch (modelState.value) {
    case MODEL_STATE.DOWNLOADABLE: return t('serviceStatusDownloadable');
    case MODEL_STATE.DOWNLOADING: return t('serviceStatusDownloading');
    case MODEL_STATE.AVAILABLE: return t('serviceStatusAvailable');
    case MODEL_STATE.DOWNLOAD_FAILED: return t('serviceStatusDownloadFailed');
    case MODEL_STATE.UNAVAILABLE: return t('serviceStatusUnavailable');
    default: return t('serviceStatusChecking');
  }
});

const statusClass = computed(() => {
  switch (modelState.value) {
    case MODEL_STATE.AVAILABLE: return 'status-success';
    case MODEL_STATE.DOWNLOADING: return 'status-info';
    case MODEL_STATE.DOWNLOADABLE: return 'status-warning';
    case MODEL_STATE.DOWNLOAD_FAILED:
    case MODEL_STATE.UNAVAILABLE: return 'status-danger';
    default: return 'status-neutral';
  }
});

const providerStatusLabel = computed(() => {
  if (modelState.value === MODEL_STATE.DOWNLOAD_FAILED) return t('serviceProviderError');
  if (modelState.value === MODEL_STATE.UNAVAILABLE) return t('serviceStatusUnavailable');
  return t('serviceProviderActive');
});

const progressPercent = computed(() => {
  if (!Number.isFinite(progress.value)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress.value * 100)));
});

function createProvider() {
  provider.value?.close?.();
  provider.value = new ChromeTranslateProvider({
    sourceLanguage: 'en',
    targetLanguage: props.settings.targetLanguage
  });
  return provider.value;
}

function beginOperation() {
  operationController?.abort();
  operationController = new AbortController();
  return {id: ++operationSequence, signal: operationController.signal};
}

function isCurrentOperation(id, nextProvider) {
  return !disposed && id === operationSequence && provider.value === nextProvider;
}

function updateDownloadState({state, progress: nextProgress}) {
  modelState.value = state;
  if (Number.isFinite(nextProgress)) progress.value = nextProgress;
  else if (state === MODEL_STATE.AVAILABLE) progress.value = 1;
}

async function prepareDownloading(nextProvider, {id, signal, retry = false}) {
  downloading.value = true;
  progress.value = 0;
  try {
    await nextProvider.prepare({
      retry,
      signal,
      onStateChange: (event) => {
        if (!isCurrentOperation(id, nextProvider)) return;
        updateDownloadState(event);
      }
    });
    if (!isCurrentOperation(id, nextProvider)) return;
    modelState.value = MODEL_STATE.AVAILABLE;
    progress.value = 1;
  } catch (cause) {
    if (!isCurrentOperation(id, nextProvider) || isTranslationCancelled(cause)) return;
    modelState.value = cause?.code === 'UNAVAILABLE'
      ? MODEL_STATE.UNAVAILABLE
      : MODEL_STATE.DOWNLOAD_FAILED;
    progress.value = null;
    error.value = cause?.message || t('serviceDownloadFailedDescription');
  } finally {
    if (isCurrentOperation(id, nextProvider)) downloading.value = false;
  }
}

async function refreshModelState() {
  refreshing.value = true;
  error.value = '';
  const {id, signal} = beginOperation();
  const nextProvider = createProvider();
  try {
    const nextState = await nextProvider.getModelState();
    if (!isCurrentOperation(id, nextProvider)) return;
    modelState.value = nextState;
    progress.value = nextState === MODEL_STATE.AVAILABLE ? 1 : null;
    if (nextState === MODEL_STATE.DOWNLOADING) {
      await prepareDownloading(nextProvider, {id, signal});
    }
  } catch (cause) {
    if (!isCurrentOperation(id, nextProvider) || isTranslationCancelled(cause)) return;
    modelState.value = MODEL_STATE.UNAVAILABLE;
    progress.value = null;
    error.value = cause?.message || t('serviceStateCheckFailed');
  } finally {
    if (isCurrentOperation(id, nextProvider)) refreshing.value = false;
  }
}

async function downloadModel() {
  if (downloading.value || props.disabled) return;
  const {id, signal} = beginOperation();
  downloading.value = true;
  refreshing.value = false;
  error.value = '';
  progress.value = 0;
  const shouldRetry = modelState.value === MODEL_STATE.DOWNLOAD_FAILED;
  modelState.value = MODEL_STATE.DOWNLOADING;
  const nextProvider = createProvider();
  await prepareDownloading(nextProvider, {id, signal, retry: shouldRetry});
}

onMounted(() => { void refreshModelState(); });
onUnmounted(() => {
  disposed = true;
  operationSequence += 1;
  operationController?.abort();
  provider.value?.close?.();
});
</script>

<template>
  <div class="settings-page service-page">
    <div class="service-columns">
      <div class="service-column">
        <div class="service-intro">
          <h2>{{ t('servicePageTitle') }}</h2>
          <p>{{ t('servicePageDescription') }}</p>
        </div>

        <section class="service-card target-language-card">
          <h3>{{ t('serviceTargetLanguage') }}</h3>
          <p>{{ t('serviceTargetLanguageDescription') }}</p>
          <label class="static-select">
            <span class="sr-only">{{ t('serviceTargetLanguage') }}</span>
            <select v-model="props.settings.targetLanguage" :disabled="disabled" aria-label="Target language">
              <option value="ko">{{ t('serviceKorean') }}</option>
            </select>
          </label>
        </section>

        <section class="service-card provider-card">
          <h3>{{ t('serviceProviderTitle') }}</h3>
          <p>{{ t('serviceProviderDescription') }}</p>
          <div class="provider-option selected">
            <span class="provider-accent" />
            <div>
              <strong>{{ t('serviceProviderChrome') }}</strong>
              <small>{{ t('serviceProviderChromeDescription') }}</small>
            </div>
            <span class="status-badge" :class="statusClass">{{ providerStatusLabel }}</span>
          </div>
        </section>
      </div>

      <div class="service-column details-column">
        <div class="service-intro">
          <h2>{{ t('serviceDetailsTitle') }}</h2>
          <p>{{ t('serviceDetailsDescription') }}</p>
        </div>

        <section class="service-card details-card">
          <h3>{{ t('serviceProviderChrome') }}</h3>
          <p class="service-description">{{ t('serviceChromeDescription') }}</p>

          <div class="model-heading">
            <h4>{{ t('serviceModelTitle') }}</h4>
            <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
          </div>
          <div class="model-row">
            <span>{{ t('serviceModelPair') }}</span>
            <code>en → ko</code>
          </div>

          <button
            v-if="modelState === MODEL_STATE.DOWNLOADABLE || modelState === MODEL_STATE.DOWNLOAD_FAILED"
            type="button"
            class="service-action"
            :disabled="disabled || refreshing || downloading"
            @click="downloadModel"
          >
            {{ modelState === MODEL_STATE.DOWNLOAD_FAILED ? t('serviceRetry') : t('serviceDownload') }}
          </button>
          <div v-else-if="modelState === MODEL_STATE.DOWNLOADING" class="download-progress" aria-live="polite">
            <div class="progress-copy">
              <span>{{ t('serviceDownloading') }}</span>
              <span v-if="Number.isFinite(progress)">{{ progressPercent }}%</span>
            </div>
            <div class="progress-track"><span :style="{width: `${progressPercent}%`}" /></div>
          </div>
          <p v-if="modelState === MODEL_STATE.AVAILABLE" class="available-note">{{ t('serviceAvailableDescription') }}</p>
          <div v-if="modelState === MODEL_STATE.UNAVAILABLE" class="service-alert" role="alert">
            <strong>{{ t('serviceUnavailableTitle') }}</strong>
            <p>{{ t('serviceUnavailableDescription') }}</p>
          </div>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>

          <div class="service-divider" />
          <div class="management-link-row">
            <button type="button" class="management-link" @click="openModelManagement()">
              {{ t('serviceManagementLink') }}
            </button>
            <span class="management-link-icon" aria-hidden="true">↗</span>
          </div>
          <p class="management-help">{{ t('serviceManagementHelp') }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {t} from '../../i18n/index.js';
import {ChromeTranslateProvider} from '../../translation/chrome-provider.js';
import {MODEL_STATE} from '../../translation/model-state.js';

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

async function refreshModelState() {
  refreshing.value = true;
  error.value = '';
  try {
    const nextProvider = createProvider();
    modelState.value = await nextProvider.getModelState();
    progress.value = modelState.value === MODEL_STATE.AVAILABLE ? 1 : null;
  } catch (cause) {
    modelState.value = MODEL_STATE.UNAVAILABLE;
    progress.value = null;
    error.value = cause?.message || t('serviceStateCheckFailed');
  } finally {
    refreshing.value = false;
  }
}

async function downloadModel() {
  if (downloading.value || props.disabled) return;
  downloading.value = true;
  error.value = '';
  progress.value = 0;
  const shouldRetry = modelState.value === MODEL_STATE.DOWNLOAD_FAILED;
  modelState.value = MODEL_STATE.DOWNLOADING;
  const nextProvider = createProvider();
  try {
    await nextProvider.prepare({
      retry: shouldRetry,
      onStateChange: ({state, progress: nextProgress}) => {
        modelState.value = state;
        if (Number.isFinite(nextProgress)) progress.value = nextProgress;
      }
    });
    modelState.value = MODEL_STATE.AVAILABLE;
    progress.value = 1;
  } catch (cause) {
    modelState.value = cause?.code === 'UNAVAILABLE'
      ? MODEL_STATE.UNAVAILABLE
      : MODEL_STATE.DOWNLOAD_FAILED;
    progress.value = null;
    error.value = cause?.message || t('serviceDownloadFailedDescription');
  } finally {
    downloading.value = false;
  }
}

onMounted(refreshModelState);
onUnmounted(() => provider.value?.close?.());
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
          <a class="management-link" href="chrome://on-device-translation-internals/" target="_blank" rel="noreferrer">
            {{ t('serviceManagementLink') }} <span aria-hidden="true">↗</span>
          </a>
          <p class="management-help">{{ t('serviceManagementHelp') }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

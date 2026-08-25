<script setup>
import {computed, onMounted, reactive, ref} from 'vue';
import {t} from '../i18n/index.js';
import {
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  serializeSettings,
  TRANSLATION_MODES,
  TRANSLATION_STYLES
} from '../settings.js';

const settings = reactive(createDefaultSettings());
const autoSitesText = ref('');
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

const version = globalThis.chrome?.runtime?.getManifest?.()?.version ?? '1.0';

const modeOptions = [
  {value: TRANSLATION_MODES.ORIGINAL_TRANSLATION, label: 'settingsModeOriginalTranslation'},
  {value: TRANSLATION_MODES.TRANSLATION_ORIGINAL, label: 'settingsModeTranslationOriginal'},
  {value: TRANSLATION_MODES.TRANSLATION_ONLY, label: 'settingsModeTranslationOnly'}
];

const styleOptions = [
  {value: TRANSLATION_STYLES.NONE, label: 'settingsStyleNone'},
  {value: TRANSLATION_STYLES.LEFT_BORDER, label: 'settingsStyleLeftBorder'},
  {value: TRANSLATION_STYLES.DOTTED_BORDER, label: 'settingsStyleDottedBorder'},
  {value: TRANSLATION_STYLES.SOLID_BORDER, label: 'settingsStyleSolidBorder'},
  {value: TRANSLATION_STYLES.DOTTED_UNDERLINE, label: 'settingsStyleDottedUnderline'},
  {value: TRANSLATION_STYLES.SOLID_UNDERLINE, label: 'settingsStyleSolidUnderline'},
  {value: TRANSLATION_STYLES.SEPARATOR, label: 'settingsStyleSeparator'},
  {value: TRANSLATION_STYLES.BACKGROUND, label: 'settingsStyleBackground'},
  {value: TRANSLATION_STYLES.HIGHLIGHT, label: 'settingsStyleHighlight'},
  {value: TRANSLATION_STYLES.MINI_HIGHLIGHT, label: 'settingsStyleMiniHighlight'}
];

const previewOrder = computed(() => {
  if (settings.translationMode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) return ['translation', 'original'];
  if (settings.translationMode === TRANSLATION_MODES.TRANSLATION_ONLY) return ['translation'];
  return ['original', 'translation'];
});

const previewStyle = computed(() => ({
  '--preview-style-color': settings.styleColor,
  '--preview-text-color': settings.textColor,
  fontWeight: settings.bold ? '700' : '400',
  fontStyle: settings.italic ? 'italic' : 'normal'
}));

function applyLoadedSettings(value) {
  const normalized = normalizeSettings(value);
  Object.assign(settings, normalized);
  autoSitesText.value = normalized.autoTranslateSites.join('\n');
}

onMounted(async () => {
  try {
    applyLoadedSettings(await loadSettings());
  } catch {
    error.value = t('settingsInvalid');
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  saved.value = false;
  error.value = '';
  try {
    const next = await saveSettings({...settings, autoTranslateSites: autoSitesText.value});
    applyLoadedSettings(next);
    saved.value = true;
    window.setTimeout(() => { saved.value = false; }, 1800);
  } catch {
    error.value = t('settingsInvalid');
  } finally {
    saving.value = false;
  }
}

function downloadSettings() {
  const blob = new Blob([serializeSettings({...settings, autoTranslateSites: autoSitesText.value})], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'translight-settings.json';
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <main class="options-shell">
    <header class="brand-header">
      <div class="brand-mark" aria-hidden="true">T</div>
      <div>
        <p class="eyebrow">{{ t('optionsBrandLabel') }}</p>
        <h1>{{ t('optionsHeading') }}</h1>
      </div>
      <span class="version">v{{ version }}</span>
    </header>

    <form class="settings-form" @submit.prevent="save">
      <section class="settings-card">
        <div class="section-heading">
          <div>
            <p class="section-label">{{ t('settingsAppearance') }}</p>
            <h2>{{ t('settingsTranslationMode') }}</h2>
          </div>
          <span v-if="loading" class="status-pill">…</span>
        </div>

        <fieldset :disabled="loading || saving">
          <legend class="sr-only">{{ t('settingsTranslationMode') }}</legend>
          <div class="choice-grid mode-grid">
            <label v-for="option in modeOptions" :key="option.value" class="choice-card">
              <input v-model="settings.translationMode" type="radio" name="translation-mode" :value="option.value">
              <span>{{ t(option.label) }}</span>
            </label>
          </div>

          <label class="field-label" for="display-style">{{ t('settingsDisplayStyle') }}</label>
          <select id="display-style" v-model="settings.displayStyle" class="control">
            <option v-for="option in styleOptions" :key="option.value" :value="option.value">
              {{ t(option.label) }}
            </option>
          </select>

          <div class="field-row color-row">
            <label class="color-field">
              <span class="field-label">{{ t('settingsStyleColor') }}</span>
              <span class="color-control">
                <input v-model="settings.styleColor" type="color" aria-label="Style color">
                <input v-model="settings.styleColor" class="control color-text" inputmode="text" maxlength="7">
              </span>
            </label>
            <label class="color-field">
              <span class="field-label">{{ t('settingsTextColor') }}</span>
              <span class="color-control">
                <input v-model="settings.textColor" type="color" aria-label="Text color">
                <input v-model="settings.textColor" class="control color-text" inputmode="text" maxlength="7">
              </span>
            </label>
          </div>

          <div class="check-row">
            <label class="check-label"><input v-model="settings.bold" type="checkbox"> {{ t('settingsBold') }}</label>
            <label class="check-label"><input v-model="settings.italic" type="checkbox"> {{ t('settingsItalic') }}</label>
          </div>
        </fieldset>

        <div class="preview-card" :style="previewStyle">
          <p class="preview-caption">{{ t('settingsPreviewOriginal') }}</p>
          <div class="preview-flow" :class="`preview-style-${settings.displayStyle}`">
            <p v-for="item in previewOrder" :key="item" :class="`preview-${item}`">
              {{ item === 'original' ? t('settingsPreviewOriginal') : t('settingsPreviewTranslation') }}
            </p>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <p class="section-label">{{ t('settingsAutoTranslateSites') }}</p>
        <h2>{{ t('settingsAutoTranslateSites') }}</h2>
        <p class="field-hint">{{ t('settingsAutoTranslateSitesHint') }}</p>
        <textarea
          v-model="autoSitesText"
          class="control site-list"
          :placeholder="t('settingsAutoTranslateSitesPlaceholder')"
          rows="5"
          :disabled="loading || saving"
        />
      </section>

      <section class="settings-card intro-card">
        <p class="section-label">{{ t('optionsCurrentServiceLabel') }}</p>
        <h2>{{ t('optionsTranslatorName') }}</h2>
        <p>{{ t('optionsIntro') }}</p>
      </section>

      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="form-actions">
        <button class="secondary-button" type="button" :disabled="loading || saving" @click="downloadSettings">
          Export JSON
        </button>
        <button class="primary-button" type="submit" :disabled="loading || saving">
          {{ saved ? t('settingsSaved') : t('settingsSave') }}
        </button>
      </div>
    </form>
  </main>
</template>

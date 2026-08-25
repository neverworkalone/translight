<script setup>
import {computed} from 'vue';
import {t} from '../../i18n/index.js';
import {TRANSLATION_MODES, TRANSLATION_STYLES, isValidColor} from '../../settings.js';

const props = defineProps({
  settings: {type: Object, required: true},
  disabled: {type: Boolean, default: false}
});

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
  if (props.settings.translationMode === TRANSLATION_MODES.TRANSLATION_ORIGINAL) return ['translation', 'original'];
  if (props.settings.translationMode === TRANSLATION_MODES.TRANSLATION_ONLY) return ['translation'];
  return ['original', 'translation'];
});

const isStyleColorValid = computed(() => isValidColor(props.settings.styleColor));
const isTextColorValid = computed(() => isValidColor(props.settings.textColor));

function updateColor(field, value) {
  props.settings[field] = value;
}

function updatePicker(field, event) {
  updateColor(field, event.target.value.toUpperCase());
}

function updateText(field, event) {
  updateColor(field, event.target.value);
}
</script>

<template>
  <div class="settings-page appearance-page">
    <div class="page-intro">
      <h2>{{ t('appearancePageTitle') }}</h2>
      <p>{{ t('appearancePageDescription') }}</p>
    </div>

    <section class="settings-card appearance-card">
      <div class="setting-row mode-row">
        <div class="setting-copy">
          <h3>{{ t('settingsTranslationMode') }}</h3>
          <p>{{ t('settingsTranslationModeDescription') }}</p>
        </div>
        <label class="select-wrap mode-select">
          <span class="sr-only">{{ t('settingsTranslationMode') }}</span>
          <select v-model="props.settings.translationMode" :disabled="disabled" class="select-control">
            <option v-for="option in modeOptions" :key="option.value" :value="option.value">
              {{ t(option.label) }}
            </option>
          </select>
        </label>
      </div>

      <div class="style-gallery">
        <h3 class="gallery-heading">{{ t('settingsDisplayStyle') }}</h3>

        <div class="appearance-controls">
          <label class="appearance-control color-input-control">
            <span>{{ t('settingsStyleColor') }}</span>
            <span class="color-input">
              <input
                :value="props.settings.styleColor"
                class="color-hex"
                :class="{'is-invalid': !isStyleColorValid}"
                type="text"
                inputmode="text"
                maxlength="7"
                :aria-invalid="!isStyleColorValid"
                :disabled="disabled"
                @input="updateText('styleColor', $event)"
              >
              <input
                :value="isStyleColorValid ? props.settings.styleColor : '#000000'"
                class="color-picker"
                type="color"
                :aria-label="t('settingsStyleColor')"
                :disabled="disabled"
                @input="updatePicker('styleColor', $event)"
              >
            </span>
          </label>
          <label class="appearance-control color-input-control">
            <span>{{ t('settingsTextColor') }}</span>
            <span class="color-input">
              <input
                :value="props.settings.textColor"
                class="color-hex"
                :class="{'is-invalid': !isTextColorValid}"
                type="text"
                inputmode="text"
                maxlength="7"
                :aria-invalid="!isTextColorValid"
                :disabled="disabled"
                @input="updateText('textColor', $event)"
              >
              <input
                :value="isTextColorValid ? props.settings.textColor : '#000000'"
                class="color-picker"
                type="color"
                :aria-label="t('settingsTextColor')"
                :disabled="disabled"
                @input="updatePicker('textColor', $event)"
              >
            </span>
          </label>
          <label class="appearance-control toggle-control">
            <span>{{ t('settingsBold') }}</span>
            <button
              type="button"
              class="switch"
              :class="{on: props.settings.bold}"
              role="switch"
              :aria-checked="props.settings.bold"
              :disabled="disabled"
              @click="props.settings.bold = !props.settings.bold"
            ><span /></button>
          </label>
          <label class="appearance-control toggle-control">
            <span>{{ t('settingsItalic') }}</span>
            <button
              type="button"
              class="switch"
              :class="{on: props.settings.italic}"
              role="switch"
              :aria-checked="props.settings.italic"
              :disabled="disabled"
              @click="props.settings.italic = !props.settings.italic"
            ><span /></button>
          </label>
        </div>

        <p v-if="!isStyleColorValid || !isTextColorValid" class="field-error" role="alert">
          {{ t('settingsColorInvalid') }}
        </p>

        <div class="style-grid" role="listbox" :aria-label="t('settingsDisplayStyle')">
          <button
            v-for="option in styleOptions"
            :key="option.value"
            type="button"
            class="style-tile"
            :class="{selected: props.settings.displayStyle === option.value}"
            role="option"
            :aria-selected="props.settings.displayStyle === option.value"
            :disabled="disabled"
            :style="{
              '--tile-style-color': isStyleColorValid ? props.settings.styleColor : '#F0F6FF',
              '--tile-text-color': isTextColorValid ? props.settings.textColor : '#111827'
            }"
            @click="props.settings.displayStyle = option.value"
          >
            <span class="style-tile-title">
              <span class="style-radio" aria-hidden="true">{{ props.settings.displayStyle === option.value ? '●' : '○' }}</span>
              <span>{{ t(option.label) }}</span>
            </span>
            <span
              class="style-preview"
              :class="`preview-style-${option.value}`"
              :style="{
                fontWeight: props.settings.bold ? '700' : '400',
                fontStyle: props.settings.italic ? 'italic' : 'normal'
              }"
            >
              <span>{{ t('settingsPreviewTranslation') }}</span>
            </span>
          </button>
        </div>
      </div>

      <div class="live-preview" :style="{
        '--preview-style-color': isStyleColorValid ? props.settings.styleColor : '#F0F6FF',
        '--preview-text-color': isTextColorValid ? props.settings.textColor : '#111827',
        fontWeight: props.settings.bold ? '700' : '400',
        fontStyle: props.settings.italic ? 'italic' : 'normal'
      }">
        <span class="live-preview-label">{{ t('settingsPreviewLabel') }}</span>
        <div class="live-preview-flow" :class="`preview-style-${props.settings.displayStyle}`">
          <p v-for="item in previewOrder" :key="item" :class="`preview-${item}`">
            {{ item === 'original' ? t('settingsPreviewOriginal') : t('settingsPreviewTranslation') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

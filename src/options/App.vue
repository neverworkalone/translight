<script setup>
import {computed, onMounted, onUnmounted, reactive, ref} from 'vue';
import {t} from '../i18n/index.js';
import {
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  settingsFingerprint,
  subscribeToSettings
} from '../settings.js';
import AppearancePage from './pages/AppearancePage.vue';
import TranslationServicePage from './pages/TranslationServicePage.vue';
import AdvancedPage from './pages/AdvancedPage.vue';
import SettingsDataPage from './pages/SettingsDataPage.vue';

const PAGE_NAMES = Object.freeze(['appearance', 'service', 'advanced', 'data']);
const PAGE_COMPONENTS = Object.freeze({
  appearance: AppearancePage,
  service: TranslationServicePage,
  advanced: AdvancedPage,
  data: SettingsDataPage
});

const settings = reactive(createDefaultSettings());
const savedSettings = ref(createDefaultSettings());
const autoSitesText = ref('');
const currentPage = ref(getInitialPage());
const loading = ref(true);
const saving = ref(false);
const savedPulse = ref(false);
const error = ref('');

const version = globalThis.chrome?.runtime?.getManifest?.()?.version ?? '1.1';
const iconUrl = globalThis.chrome?.runtime?.getURL?.('icon.png') ?? '/icon.png';
const pageComponent = computed(() => PAGE_COMPONENTS[currentPage.value]);
const draftSettings = computed(() => normalizeSettings({
  ...settings,
  autoTranslateSites: autoSitesText.value
}));
const isDirty = computed(() => loading.value === false &&
  settingsFingerprint(draftSettings.value) !== settingsFingerprint(savedSettings.value));
const hasInvalidColor = computed(() => !/^#[0-9A-Fa-f]{6}$/.test(String(settings.styleColor ?? '').trim()) ||
  !/^#[0-9A-Fa-f]{6}$/.test(String(settings.textColor ?? '').trim()));
const saveDisabled = computed(() => loading.value || saving.value || !isDirty.value || hasInvalidColor.value);
const saveStatus = computed(() => {
  if (saving.value) return t('settingsSaving');
  if (isDirty.value) return t('settingsUnsaved');
  return savedPulse.value ? t('settingsSaved') : t('settingsSaved');
});

let unsubscribeSettings = () => {};
let savedTimer = null;

function getInitialPage() {
  const hash = globalThis.location?.hash?.slice(1);
  return PAGE_NAMES.includes(hash) ? hash : 'appearance';
}

function isPageName(value) {
  return PAGE_NAMES.includes(value);
}

function navigate(page) {
  if (!isPageName(page)) return;
  currentPage.value = page;
  if (globalThis.location && globalThis.location.hash !== '#' + page) {
    globalThis.history?.replaceState?.(null, '', '#' + page);
  }
}

function applySavedSettings(value) {
  const normalized = normalizeSettings(value);
  Object.assign(settings, normalized);
  savedSettings.value = normalized;
  autoSitesText.value = normalized.autoTranslateSites.join('\n');
}

function handleStorageSettings(value) {
  const wasDirty = isDirty.value;
  const normalized = normalizeSettings(value);
  savedSettings.value = normalized;
  if (!wasDirty) {
    Object.assign(settings, normalized);
    autoSitesText.value = normalized.autoTranslateSites.join('\n');
  }
}

function showError(message = t('settingsInvalid')) {
  error.value = message;
}

async function persistSettings(value) {
  saving.value = true;
  error.value = '';
  try {
    const next = await saveSettings(value);
    applySavedSettings(next);
    savedPulse.value = true;
    if (savedTimer != null) globalThis.clearTimeout?.(savedTimer);
    savedTimer = globalThis.setTimeout?.(() => { savedPulse.value = false; }, 1800) ?? null;
    return true;
  } catch (cause) {
    showError(cause?.code === 'INVALID_SETTINGS' ? t('settingsInvalid') : t('settingsSaveFailed'));
    return false;
  } finally {
    saving.value = false;
  }
}

async function saveDraft() {
  if (saveDisabled.value) {
    if (hasInvalidColor.value) showError(t('settingsColorInvalid'));
    return;
  }
  await persistSettings(draftSettings.value);
}

function downloadJson(value) {
  const blob = new Blob([value], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'translight-settings.json';
  link.click();
  globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 0);
}

function exportSettings() {
  if (loading.value || hasInvalidColor.value) {
    showError(t('settingsColorInvalid'));
    return;
  }
  downloadJson(serializeSettings(draftSettings.value));
}

async function importSettings(serialized) {
  error.value = '';
  try {
    const imported = parseSettings(serialized);
    await persistSettings(imported);
  } catch {
    showError(t('settingsImportInvalid'));
  }
}

async function resetSettings() {
  if (!globalThis.confirm?.(t('dataResetConfirm'))) return;
  await persistSettings(createDefaultSettings());
}

function handleHashChange() {
  const nextPage = getInitialPage();
  if (nextPage !== currentPage.value) currentPage.value = nextPage;
}

onMounted(async () => {
  globalThis.addEventListener?.('hashchange', handleHashChange);
  try {
    applySavedSettings(await loadSettings());
    unsubscribeSettings = subscribeToSettings(handleStorageSettings);
  } catch {
    applySavedSettings(createDefaultSettings());
    showError(t('settingsLoadFailed'));
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  globalThis.removeEventListener?.('hashchange', handleHashChange);
  unsubscribeSettings();
  if (savedTimer != null) globalThis.clearTimeout?.(savedTimer);
});
</script>

<template>
  <main class="settings-app">
    <header class="settings-header">
      <div class="brand-lockup">
        <img :src="iconUrl" alt="" class="brand-logo">
        <div class="brand-text">
          <span class="brand-name">{{ t('optionsProductName') }}</span>
          <span class="brand-version">{{ version }}</span>
        </div>
      </div>
      <div class="header-actions">
        <span class="save-status" :class="{unsaved: isDirty, saving: saving}">{{ saveStatus }}</span>
        <button type="button" class="save-button" :disabled="saveDisabled" @click="saveDraft">{{ t('settingsSaveShort') }}</button>
      </div>
    </header>

    <div class="settings-body" :class="'page-' + currentPage">
      <aside class="settings-sidebar" aria-label="Settings navigation">
        <span class="sidebar-label">{{ t('settingsSidebarLabel') }}</span>
        <button
          v-for="page in PAGE_NAMES"
          :key="page"
          type="button"
          class="nav-item"
          :class="{selected: currentPage === page}"
          :aria-current="currentPage === page ? 'page' : undefined"
          @click="navigate(page)"
        >
          {{ t('settingsNav' + page[0].toUpperCase() + page.slice(1)) }}
        </button>
      </aside>

      <section class="settings-workspace">
        <component
          :is="pageComponent"
          :settings="settings"
          :sites-text="autoSitesText"
          :disabled="loading || saving"
          @update:sites-text="autoSitesText = $event"
          @export="exportSettings"
          @import="importSettings"
          @reset="resetSettings"
        />
        <p v-if="error" class="global-error" role="alert">{{ error }}</p>
      </section>
    </div>
  </main>
</template>

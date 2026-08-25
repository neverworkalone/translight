<script setup>
import {ref} from 'vue';
import {t} from '../../i18n/index.js';

defineProps({
  disabled: {type: Boolean, default: false}
});

const emit = defineEmits(['export', 'import', 'reset']);
const fileInput = ref(null);

function openFilePicker() {
  fileInput.value?.click();
}

async function importFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    emit('import', await file.text());
  } catch {
    emit('import', '');
  }
}
</script>

<template>
  <div class="settings-page data-page">
    <div class="data-columns">
      <div class="data-pane backup-pane">
        <div class="data-intro">
          <h2>{{ t('dataPageTitle') }}</h2>
          <p>{{ t('dataPageDescription') }}</p>
        </div>
        <section class="data-card backup-card">
          <h3>{{ t('dataBackupTitle') }}</h3>
          <p>{{ t('dataBackupDescription') }}</p>
          <div class="data-divider" />
          <div class="data-action-row">
            <div>
              <h4>{{ t('dataExportTitle') }}</h4>
              <p>{{ t('dataExportDescription') }}</p>
            </div>
            <button type="button" class="small-action" :disabled="disabled" @click="emit('export')">{{ t('dataExportButton') }}</button>
          </div>
          <div class="data-divider" />
          <div class="data-action-row">
            <div>
              <h4>{{ t('dataImportTitle') }}</h4>
              <p>{{ t('dataImportDescription') }}</p>
            </div>
            <button type="button" class="small-action" :disabled="disabled" @click="openFilePicker">{{ t('dataImportButton') }}</button>
          </div>
          <div class="data-divider bottom-divider" />
        </section>
      </div>

      <div class="data-pane reset-pane">
        <div class="data-intro reset-intro">
          <h2>{{ t('dataResetTitle') }}</h2>
        </div>
        <section class="data-card reset-card">
          <span class="danger-badge">{{ t('dataDangerBadge') }}</span>
          <h3>{{ t('dataResetHeading') }}</h3>
          <p>{{ t('dataResetDescription') }}</p>
          <button type="button" class="danger-action" :disabled="disabled" @click="emit('reset')">
            {{ t('dataResetButton') }}
          </button>
        </section>
      </div>
    </div>
    <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importFile">
  </div>
</template>

<script setup>
import {computed} from 'vue';
import {t} from '../../i18n/index.js';
import {normalizeHostnameList} from '../../settings.js';

const props = defineProps({
  settings: {type: Object, required: true},
  sitesText: {type: String, required: true},
  disabled: {type: Boolean, default: false}
});

const emit = defineEmits(['update:sitesText']);

const sites = computed(() => normalizeHostnameList(props.sitesText));

function updateSites(event) {
  emit('update:sitesText', event.target.value);
}

function removeSite(site) {
  emit('update:sitesText', sites.value.filter((entry) => entry !== site).join('\n'));
}

function toggle(field) {
  props.settings[field] = !props.settings[field];
}
</script>

<template>
  <div class="settings-page advanced-page">
    <div class="advanced-intro">
      <h2>{{ t('advancedPageTitle') }}</h2>
      <p>{{ t('advancedPageDescription') }}</p>
    </div>

    <section class="advanced-card behavior-card">
      <div class="card-heading">
        <h3>{{ t('advancedBehaviorTitle') }}</h3>
        <p>{{ t('advancedBehaviorDescription') }}</p>
      </div>
      <div class="behavior-setting">
        <div class="setting-copy">
          <h4>{{ t('advancedSameSiteTitle') }}</h4>
          <p>{{ t('advancedSameSiteDescription') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{on: props.settings.autoTranslateSameSite}"
          role="switch"
          :aria-checked="props.settings.autoTranslateSameSite"
          :disabled="disabled"
          @click="toggle('autoTranslateSameSite')"
        ><span /></button>
      </div>
      <div class="card-divider" />
      <div class="behavior-setting">
        <div class="setting-copy">
          <h4>{{ t('advancedPageTitleToggle') }}</h4>
          <p>{{ t('advancedPageTitleDescription') }}</p>
        </div>
        <button
          type="button"
          class="switch"
          :class="{on: props.settings.translatePageTitle}"
          role="switch"
          :aria-checked="props.settings.translatePageTitle"
          :disabled="disabled"
          @click="toggle('translatePageTitle')"
        ><span /></button>
      </div>
    </section>

    <section class="advanced-card sites-card">
      <h3>{{ t('advancedSitesTitle') }}</h3>
      <p class="sites-description">{{ t('advancedSitesDescription') }}</p>
      <textarea
        class="sites-textarea"
        :value="props.sitesText"
        :placeholder="t('advancedSitesPlaceholder')"
        rows="3"
        :disabled="disabled"
        @input="updateSites"
      />
      <div class="card-divider" />
      <h4 class="registered-heading">{{ t('advancedRegisteredSites') }}</h4>
      <div v-if="sites.length" class="site-chips" aria-live="polite">
        <span v-for="site in sites" :key="site" class="site-chip">
          {{ site }}
          <button type="button" :aria-label="t('advancedRemoveSite', site)" :disabled="disabled" @click="removeSite(site)">×</button>
        </span>
      </div>
      <p v-else class="empty-sites">{{ t('advancedNoSites') }}</p>
    </section>
  </div>
</template>

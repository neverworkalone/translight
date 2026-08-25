<script setup>
import { t } from '../i18n/index.js';

const version = '1.0';
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

    <section class="intro-card">
      <p class="section-label">{{ t('optionsCurrentServiceLabel') }}</p>
      <h2>{{ t('optionsTranslatorName') }}</h2>
      <p>{{ t('optionsIntro') }}</p>
    </section>

    <section class="notice-card">
      <strong>{{ t('optionsNoticeTitle') }}</strong>
      <p>{{ t('optionsNotice') }}</p>
    </section>
  </main>
</template>

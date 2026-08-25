import { createApp } from 'vue';
import { t } from '../i18n/index.js';
import App from './App.vue';
import './style.css';

document.documentElement.lang = globalThis.chrome?.i18n?.getUILanguage?.() || 'en';
document.title = t('optionsPageTitle');
createApp(App).mount('#app');

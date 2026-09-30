const translations = {
  ko: {
    metaDescription: "우리가 필요하다고 생각하는 소프트웨어를 만듭니다.",
    brandHomeLabel: "Never Work Alone 홈",
    navLabel: "주 메뉴",
    navProducts: "제품",
    navAbout: "소개",
    heroEyebrow: "독립 소프트웨어 개발팀",
    heroBody: "우리가 필요하다고 생각하는 소프트웨어를 만듭니다.",
    heroProducts: "제품 보기 ↓",
    heroGitHub: "GitHub에서 보기",
    productsKicker: "우리가 만드는 것",
    productsTitle: "제품",
    productsIntro: "공개되거나 개발 중인 제품들",
    translightTitle: "Translight · 빛번역",
    translationCategory: "번역 / 크롬 확장 프로그램",
    translightDescription: "원문은 그대로, 번역을 아래에 표시하는 웹페이지 번역 도구입니다.",
    naverdicTitle: "NaverDic · 네이버 영어사전",
    dictionaryCategory: "사전 / 크롬 확장 프로그램",
    typewriterCategory: "유의어 사전 / 크롬 확장 프로그램",
    naverdicDescription: "웹페이지에서 더블클릭하거나 드래그해 단어의 뜻을 확인합니다.",
    typewriterDescription: "작가를 위한, 말의 결을 찾는 사전",
    aboutKicker: "소개",
    aboutBodyJoiner: "",
    aboutBody:
      "은 팀워크를 중시하며 혼자 일하지 말자는 가치 아래 만들어진 1인 개발팀입니다. 우리가 필요하다고 생각하는 소프트웨어를 끝까지 만듭니다.",
    languageLabel: "언어 선택",
  },
  en: {
    metaDescription: "We make software that we believe should exist.",
    brandHomeLabel: "Never Work Alone home",
    navLabel: "Main navigation",
    navProducts: "Products",
    navAbout: "About",
    heroEyebrow: "Independent software team",
    heroBody: "We make software that we believe should exist.",
    heroProducts: "Explore products ↓",
    heroGitHub: "Find us on GitHub",
    productsKicker: "What we make",
    productsTitle: "Products",
    productsIntro: "Products available now or in development",
    translightTitle: "Translight · 빛번역",
    translationCategory: "Translation / Chrome extension",
    translightDescription:
      "A web page translation tool that displays translations below the original text.",
    naverdicTitle: "NaverDic · 네이버 영어사전",
    dictionaryCategory: "Dictionary / Chrome extension",
    typewriterCategory: "Thesaurus / Chrome extension",
    naverdicDescription: "Double-click or select a word on a web page to look up its meaning.",
    typewriterDescription: "A dictionary for writers looking for the right nuance.",
    aboutKicker: "About",
    aboutBodyJoiner: " ",
    aboutBody:
      "is a one-person development team built around teamwork and the belief that no one should work alone. We build the software we believe we need, through to completion.",
    languageLabel: "Language",
  },
};

const storageKey = "neverworkalone.language";
const languageButtons = Array.from(document.querySelectorAll("[data-language-choice]"));
const currentYear = document.querySelector("[data-current-year]");

if (currentYear) currentYear.textContent = String(new Date().getFullYear());

function getSavedLanguage() {
  try {
    const savedLanguage = window.localStorage.getItem(storageKey);
    return Object.hasOwn(translations, savedLanguage) ? savedLanguage : null;
  } catch {
    return null;
  }
}

function getBrowserLanguage() {
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "ko";
}

function applyLanguage(language, { persist = false } = {}) {
  const selectedLanguage = Object.hasOwn(translations, language) ? language : "ko";
  const copy = translations[selectedLanguage];

  document.documentElement.lang = selectedLanguage;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = copy[element.dataset.i18n];
    if (typeof value === "string") element.textContent = value;
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    const [attribute, key] = element.dataset.i18nAttr.split(":");
    const value = copy[key];
    if (attribute && typeof value === "string") element.setAttribute(attribute, value);
  });

  languageButtons.forEach((button) => {
    const isSelected = button.dataset.languageChoice === selectedLanguage;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (persist) {
    try {
      window.localStorage.setItem(storageKey, selectedLanguage);
    } catch {
      // The selected language still applies when storage is unavailable.
    }
  }
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.languageChoice, { persist: true });
  });
});

applyLanguage(getSavedLanguage() ?? getBrowserLanguage());

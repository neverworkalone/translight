<script setup>
const version = '1.0.0';
</script>

<template>
  <main class="options-shell">
    <header class="brand-header">
      <div class="brand-mark" aria-hidden="true">T</div>
      <div>
        <p class="eyebrow">TRANSLIGHT</p>
        <h1>설정</h1>
      </div>
      <span class="version">v{{ version }}</span>
    </header>

    <section class="intro-card">
      <p class="section-label">현재 번역 서비스</p>
      <h2>Chrome 내장 Translator</h2>
      <p>
        Translight는 원문을 바꾸지 않고 영어 문단 아래에 한국어 번역을 덧붙입니다.
        툴바의 T 아이콘을 눌러 현재 페이지에서 번역을 시작하거나 해제할 수 있습니다.
      </p>
    </section>

    <section class="notice-card">
      <strong>TASK 1–5 기반 설정 페이지</strong>
      <p>
        모양·자동 번역·설정 데이터는 다음 단계에서 연결됩니다. 번역 서비스가 지원되지 않는
        환경에서는 이 페이지에서 Chrome의 내장 Translator 지원 상태를 확인해 주세요.
      </p>
    </section>
  </main>
</template>

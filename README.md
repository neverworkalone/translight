# Translight

Chrome 내장 Translator API를 이용해 영어 페이지의 원문을 보존하고, 한국어 번역문을 원문 바로 아래에 표시하는 Manifest V3 확장 프로그램입니다.

## 현재 구현 범위

- Vue 3 + Vite 기반 Chrome 확장 구조
- Manifest V3 service worker와 content script
- 툴바 T 아이콘으로 현재 탭의 번역 시작·취소·해제
- `chrome.storage.session` 기반 탭별 상태와 action badge
- Chrome 내장 영어→한국어 Translator API 및 모델 다운로드 진행률
- 정적 페이지의 제목·문단·목록·인용문·캡션 추출
- 원문 DOM을 교체하지 않는 `<translight-translation translate="no">` 삽입
- 번역 해제 시 Translight가 추가한 노드·속성·스타일만 제거
- 별도 옵션 페이지의 기본 진입 화면

## 개발

```bash
npm install
npm run dev
npm test
npm run build
npm run package
```

`npm run build` 결과는 `dist/`에 생성되고, `npm run package`는 Chrome 개발자 모드에서 압축 해제 확장 프로그램으로 설치할 수 있는 `release/translight-1.0.0.zip`을 생성합니다.

설치 방법:

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드**를 선택하고 `dist/`를 지정합니다.
4. 영어 페이지에서 툴바의 Translight T 아이콘을 누릅니다.

Translator API와 모델은 Chrome이 지원하는 데스크톱 환경에서 동작하며, 최초 사용 시 기기 내 모델 다운로드가 필요할 수 있습니다. 외부 번역 서버로 원문을 전송하지 않습니다.

## 권한

`<all_urls>`는 사용자가 어느 영어 웹페이지에서든 툴바 액션으로 번역을 실행할 수 있도록 content script를 등록하기 위해 필요합니다. Translight 1.0은 페이지 내용을 외부 서버로 전송하지 않습니다.

## 라이선스와 고지

이 프로젝트의 자체 코드는 Apache License 2.0으로 배포합니다. 현재 TASK1–5 구현에는 NaverDic 소스 코드를 재사용하지 않았으며, 별도 제3자 고지 파일이 필요한 의존성은 포함하지 않습니다. 상세 조건은 [LICENSE](./LICENSE)를 확인해 주세요.

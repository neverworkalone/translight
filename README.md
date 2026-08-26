# Translight

Chrome 내장 Translator API를 이용해 영어 페이지의 원문을 보존하고, 한국어 번역문을 원문 바로 아래에 표시하는 Manifest V3 확장 프로그램입니다.

## 현재 구현 범위

- Vue 3 + Vite 기반 Chrome 확장 구조
- Manifest V3 service worker와 content script
- 툴바 T 아이콘으로 현재 탭의 번역 시작·취소·해제
- `chrome.storage.session` 기반 탭별 상태와 action badge
- Chrome 내장 영어→한국어 Translator API 및 모델 다운로드 진행률
- viewport 우선순위·제한 동시성·페이지 메모리 캐시를 사용하는 번역 큐
- 긴 문서의 현재 화면 우선 번역과 세션 generation 기반 늦은 결과 차단
- 정적 페이지의 제목·문단·목록·인용문·캡션·표 셀 추출
- 원문 DOM을 교체하지 않는 `<translight-translation translate="no">` 삽입
- 원문+번역문·번역문+원문·번역문만 표시 모드
- 10가지 번역 표시 스타일과 색상·굵기·기울임 설정
- MutationObserver 기반 동적 subtree·문자열 변경·SPA navigation 대응
- 같은 origin 수동 번역 지속과 등록 hostname 자동 번역
- 페이지 제목 번역 및 번역 해제 시 제목 복구
- 페이지 언어가 대상 언어와 같을 때 안전한 번역 건너뛰기
- 번역 해제 시 Translight가 추가한 노드·속성·스타일만 제거
- 설정 변경 시 열린 번역 페이지에 즉시 표시 설정 반영

## 개발

```bash
npm install
npm run dev
npm test
npm run check
npm run build
bash pack.sh
```

`npm run build` 결과는 `dist/`에 생성되고, `npm run package` 또는 `bash pack.sh`는 `~/Downloads/translight_1.0.zip`을 생성합니다. `TRANSLIGHT_ZIP_DIR` 환경 변수로 ZIP 출력 폴더를 바꿀 수 있습니다.

설치 방법:

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드**를 선택하고 `dist/`를 지정합니다.
4. 영어 페이지에서 툴바의 Translight T 아이콘을 누릅니다.

Translator API와 모델은 Chrome이 지원하는 데스크톱 환경에서 동작하며, 최초 사용 시 기기 내 모델 다운로드가 필요할 수 있습니다. 외부 번역 서버로 원문을 전송하지 않습니다.

현재 버전은 일반 DOM만 처리하며 Shadow DOM 내부는 번역하지 않습니다. 또한 `code`·`pre`·입력 컨트롤처럼 실행·편집에 영향을 줄 수 있는 영역은 원문 보존을 위해 번역 대상에서 제외합니다.

## 권한

`<all_urls>`는 사용자가 어느 영어 웹페이지에서든 툴바 액션으로 번역을 실행할 수 있도록 content script를 등록하기 위해 필요합니다. 설정은 `chrome.storage.local`, 탭별 실행 상태는 `chrome.storage.session`에 저장되며 페이지 내용은 외부 서버로 전송하지 않습니다. 이전 버전의 `chrome.storage.sync` 설정은 최초 로드 시 local로 마이그레이션합니다.

## 라이선스와 고지

이 프로젝트의 자체 코드는 Apache License 2.0으로 배포합니다. NaverDic 소스 코드를 재사용하지 않았으며, 별도 제3자 고지 파일이 필요한 의존성은 포함하지 않습니다. 상세 조건은 [LICENSE](./LICENSE)를 확인해 주세요.

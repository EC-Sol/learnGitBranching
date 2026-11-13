# 오프라인 스탠드얼론 패키징 가이드 (Offline Standalone Packaging)

이 문서는 LearnGitBranching을 **네트워크 연결 없이 동작하는 HTML 파일 1개**로
패키징하는 방법을 설명합니다. 생성된 파일 하나만 있으면 USB 메모리, 사내망 공유
폴더, 이메일 첨부 등 어떤 경로로든 배포할 수 있고, 브라우저에서 파일을 직접 열기만
하면(`file://`) 웹 버전과 동일하게 동작합니다.

## 요구 사항

- Node.js >= 20.19
- Yarn 1.x (`corepack enable` 또는 전역 설치)

## 빌드 방법

```bash
yarn install            # 최초 1회
yarn build:singlefile   # 단일 HTML 파일 생성
```

빌드가 끝나면 두 가지 산출물이 생성됩니다:

```
build-singlefile/learnGitBranching-standalone.html       <-- 일반형 (약 5 MB)
build-singlefile/learnGitBranching-standalone.min.html   <-- gzip 압축형 (약 2.9 MB)
```

두 파일 모두 단독으로 동작하며, `build-singlefile/` 안의 `index.html`과 `assets/`는
중간 산출물이므로 **HTML 파일 하나만 배포**하면 됩니다. 중간 산출물은
`.gitignore`에 등록되어 있어 커밋되지 않습니다.

### 일반형 vs gzip 압축형

| | `standalone.html` | `standalone.min.html` |
| --- | --- | --- |
| 크기 | 약 5 MB | 약 2.9 MB |
| 동작 방식 | JS/CSS를 그대로 인라인 | gzip + base64로 저장, 부팅 시 브라우저가 자가 복호화 |
| 필요 브라우저 | 대부분의 브라우저 | DecompressionStream 지원 (Chrome/Edge 103+, Firefox 113+, Safari 16.4+) |
| 초기 로딩 | 즉시 | gzip 복호화로 수백 ms 추가 |

압축형의 원리: HTTP `Content-Encoding`은 `file://`에서 적용되지 않으므로, HTML
내부에 아주 작은 부트스트랩 스크립트를 두고 브라우저 내장
`DecompressionStream('gzip')` API로 JS/CSS 페이로드를 복호화합니다. CSS는
복호화 후 `<style>`로 주입되고, JS는 Blob URL로 모듈 임포트됩니다. 미지원
브라우저에서는 안내 메시지가 표시됩니다. 배포 환경의 브라우저를 특정할 수
없다면 일반형을, 용량이 중요하다면 압축형을 권장합니다.

## 사용 방법

1. `learnGitBranching-standalone.html`을 아무 위치에나 복사합니다.
2. 더블클릭하거나 브라우저(Chrome / Edge / Firefox)로 엽니다.
3. 끝. 인터넷 연결이 전혀 필요 없습니다.

- 진행 상황(푼 레벨 등)은 브라우저 `localStorage`에 저장되며, `file://` 에서도
  동작합니다. 단, 브라우저/프로필별로 저장 위치가 다르므로 다른 PC로 파일을
  옮기면 진행 상황은 이전되지 않습니다.
- UI 언어는 브라우저 설정을 따라 자동 감지되며, 모든 로케일이 파일에 포함되어
  있으므로 오프라인에서도 언어 전환이 가능합니다.

## 빌드 파이프라인 내부 동작

`yarn build:singlefile`은 다음 단계를 수행합니다
(`scripts/build-singlefile.js` + `vite.singlefile.config.mjs`).

1. **매니페스트 재생성** — `scripts/generate.js`로 레벨/로케일 문자열 모듈을
   재생성합니다 (일반 `prebuild` 훅과 동일).
2. **코드 스플리팅 제거** — 웹 버전은 레벨과 로케일을 dynamic `import()`로
   필요할 때 내려받지만, 단일 파일에서는 불가능하므로
   `inlineDynamicImports: true`로 **모든 청크(레벨 36개 + 로케일 27개 언어)를
   JS 1개로 병합**합니다.
3. **JS/CSS 인라인** — 빌드된 `<script type="module" src=...>`과
   `<link rel="stylesheet">`를 파일 내용으로 치환합니다. 인라인되는 JS 내부의
   `</script` 문자열은 `<\/script`로 이스케이프되어 조기 태그 종료를 방지합니다.
4. **폰트 base64 인라인** — CSS가 참조하는 Font Awesome 웹폰트(woff2)와
   legacy 폰트(woff)를 data URI로 변환합니다. 용량 절약을 위해 ttf/eot/svg
   폴백 선언은 제거합니다(모든 최신 브라우저는 woff2/woff를 지원).
5. **파비콘 인라인** — `favicon.ico`를 data URI로 변환합니다.
6. **네트워크 전용 기능 제거**
   - Google Analytics(gtag) 스크립트 전체 제거
   - 프로모션 배너(BiteRead / WaitingFor.AI) 스크립트 제거 — 원격 이미지를
     로딩하는 기능이라 오프라인에서 무의미합니다. 숨겨진 마크업은 남지만
     표시되는 일은 없습니다.
7. **자동 검증** — 남아 있는 외부 `<script src>`, 스타일시트 링크, 상대 경로
   참조가 없는지 스캔하고, 하나라도 남으면 빌드를 실패시킵니다.

결과물은 `file://` 프로토콜에서 **네트워크 요청 0번**으로 동작함이 빌드 시점에
보장됩니다.

## 배포 시나리오

| 시나리오 | 방법 |
| --- | --- |
| 개인 사용 | 파일을 더블클릭 |
| USB / 사내망 공유 폴더 | 파일 1개만 복사 |
| LMS / 사내 포털 | 파일을 정적 서버에 올리고 링크 (예: `npx serve`) |
| 온라인 페이지 임베드 | 웹 서버를 통해 서빙되는 경우에만 `<iframe>` 임베드 가능 (`file://` 페이지는 다른 페이지에서 iframe으로 열 수 없음 — 브라우저 보안 정책) |

## 오프라인에서 동작하지 않는 기능

웹 버전의 일부 기능은 본질적으로 네트워크가 필요하며, 스탠드얼론에서는 동작하지
않거나 제한됩니다:

- **gist 레벨 임포트** (`import level`의 gist ID 조회, `?gist_level_id=` URL)
- **공유 퍼머링크** (URL 파라미터 기반 공유는 `file://`에서도 로컬로는 가능하지만
  다른 사람과 공유하려면 파일 자체를 전달해야 합니다)
- **GitHub 저장소 링크 / 프로모션 배너** 등 외부 링크 (클릭하면 브라우저가
  인터넷 연결 시에만 열립니다)

레벨 풀기, 샌드박스, `undo`/`reset`, git golf 기록, 언어 전환 등 핵심 학습
기능은 모두 오프라인에서 동일하게 동작합니다.

## 문제 해결 (Troubleshooting)

- **`yarn build:singlefile`이 `node_modules is missing`으로 실패**
  → `yarn install`을 먼저 실행하세요.
- **아이콘이 깨져 보임** → 매우 오래된 브라우저(woff 미지원)일 수 있습니다.
  Chrome/Edge/Firefox 최신 버전을 사용하세요.
- **파일이 너무 큼** → 모든 언어(27개 로케일)와 전체 레벨이 포함된 결과입니다.
  우선 gzip 압축형(`learnGitBranching-standalone.min.html`, 약 2.9 MB)을
  사용하세요. 추가로 줄이려면 특정 언어만 남기도록 `src/js/intl/`의 로케일
  로딩 구조(`src/js/intl/index.js`, `scripts/generateIntlStrings.js`)를 수정해
  dynamic import 대상을 줄인 뒤 재빌드해야 합니다.
- **진행 상황이 저장되지 않음** → 브라우저가 `file://`의 localStorage를 차단한
  경우입니다 (일부 엔터프라이즈 정책). 파일을 로컬 웹 서버로 서빙하세요
  (예: `npx serve build-singlefile`).
- **재빌드 방법** → 소스를 수정한 후 `yarn build:singlefile`을 다시 실행하면
  됩니다. 일반 웹 배포용 빌드(`yarn build`)에는 영향이 없습니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `vite.singlefile.config.mjs` | 스탠드얼론 전용 Vite 설정 (코드 스플리팅 비활성화) |
| `scripts/build-singlefile.js` | 빌드 + 인라인 + GA/업셀 제거 + 자동 검증 |
| `build-singlefile/learnGitBranching-standalone.html` | 최종 산출물 (gitignored) |

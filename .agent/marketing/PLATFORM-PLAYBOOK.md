# 플랫폼별 조작법 정본 — 「어떻게 했는지」

대표 지시(2026-09-17): **「플랫폼별로 어떻게 했는지 잘 기록하고 기억하고」**
이 파일은 «검증된 것만» 적는다. 추측·미확인은 적지 않는다. 새로 뚫으면 여기에 한 절을 추가한다.

## 0. 모든 웹 조작의 기본 원칙 (2026-09-17 대표 지적으로 확립)
> 「인간처럼 하면 되는것 아니야? 웹제어가 안되면 인간처럼 하면 되야 되는것이자나」

**DOM 주입이 실패하면 «즉시» 실제 마우스·키보드로 내려간다.** 지시받을 일이 아니다.

| 단계 | 방법 | 언제 |
|---|---|---|
| 1 | `page.evaluate` + `element.click()` | 단순 버튼. 좌표 렌더가 깨진 콘솔에서도 먹는다 |
| 2 | 섀도 DOM 딥 워커 | Play Console·Apple Ads. `document.body.innerText` 는 700~2,800자만 보여주는데 딥워크는 1,800~2,200 요소를 준다 |
| 3 | **실제 마우스 + `Input.insertText`** | React/Angular 에디터. 아래 §1 |
| 4 | 파일은 `setInputFiles` → 실패 시 drop 이벤트 → 실패 시 `ClipboardEvent('paste')` | §3 |

**공통 함정 4개**
1. **`element.value = x` 는 프레임워크가 못 본다.** 화면엔 보이는데 저장하면 사라진다. 네이티브 setter + `input` 이벤트를 쓰거나(Angular), 아예 실제 입력을 쓴다(React).
2. **`Cmd+A` 가 입력칸이 아니라 «페이지 전체»를 잡는 경우가 있다.** 그러면 지우기가 실패한다 → `End` 키 후 `Backspace` 반복.
3. **네이티브 대화상자는 CDP 를 통째로 막는다.** `window.confirm/alert` 를 먼저 가로채 **문구를 기록하면서** 진행한다. `acceptDialog()` 는 문구를 못 남긴다.
4. **스크롤 후 «다시 측정»한다.** 묵은 좌표로 클릭하면 엉뚱한 행을 누른다(Apple Ads 에서 실제로 잘못된 키워드를 골랐다).

---

## 1. 네이버 지식iN  ✅2026-09-17 첫 답변 게시
**계정** 대표 가입 완료(`iEldora`) · **태그** `from=naver_kin` · **채널 등급** A

### 왜 이 채널인가
네이버는 「최적화/저품질 블로그」 등급이 공식 부인됐고 VIEW 탭도 2024-02-01 폐지됐다. 블로그·카페는 등급·가입승인 벽이 있어 **지식iN 이 유일한 무게이트 문**이다. AI 브리핑이 우리 타깃 SERP 를 끌고 있고 네이버 메이트는 «AI 브리핑 누적 인용»으로 뽑으므로, 지식iN 답변이 인용원이 될 수 있다.

### 조작 절차 (검증됨)
1. 질문 찾기: `https://kin.naver.com/search/list.naver?query=<검색어>` → `a[href*="detail.naver"]` 를 긁는다. 카테고리 목록은 `https://kin.naver.com/qna/list.naver?dirId=40102`(주식·증권).
2. **답변 버튼은 `button._answerWriteButton` 이다.** 상단 내비의 「답변하기」(`a.item` → questionList.naver)를 누르면 **엉뚱한 페이지로 간다.** 실제로 한 번 틀렸다.
3. 에디터는 **SmartEditor ONE(React) + iframe** 이다. `[contenteditable="true"]` 로 잡히는 요소는 **폭 17px 짜리 함정**이다. 진짜 본문은 `.se-content`(약 730×412).
4. `.se-content` 중심 좌표로 **실제 마우스 클릭** → `activeElement` 가 `IFRAME` 이면 제대로 들어간 것.
5. **`Input.insertText` 로 한 줄씩** 넣고 줄바꿈은 **Enter 키**(`windowsVirtualKeyCode: 13`). `\n` 을 insertText 에 넣지 않는다.
6. **등록 전 `button._draftAnswerSaveButton`(임시저장)으로 검증한다.** 「임시저장 글 수 0 → 1」이면 모델이 텍스트를 본 것이다. 안 보였으면 `alert: 답변을 작성해주세요.` 가 뜬다.
7. 등록: `button._answerRegisterButton`. 성공하면 URL 에 `&answerNo=N` 이 붙는다.
8. 즉시 `node scripts/mkt-plan.js pub naver_kin <URL>` 기록 → **24시간 뒤 생존 확인**(Quora 는 8클릭 뒤 33분 만에 지웠다).

### 이 채널의 글쓰기 규칙
- **본문 무링크.** 네이버는 자기 사이트 링크를 광고로 신고받는다. 실제로 기존 답변 중 블로그 링크 스팸이 2건 있었다.
- **앱 이름 0~1회.** 나머지는 질문자가 실제로 쓸 수 있는 정보.
- **기존 답변을 먼저 읽고 «안 나온 것»을 쓴다.** 첫 답변 사례: 기존 7건이 전부 「인베스팅닷컴/야후파이낸스」였고 **추정 날짜(estimated) 함정**과 **BMO/AMC 한국시간 환산**을 말한 사람이 없었다 → 거기를 채웠다.
- 예측·투자권유 표현 0. 끝에 「종목을 사라 마라 하는 이야기가 아니다」를 명시한다.
- 하루 1편.

### 프로필 (미완 — 대표 확인 필요)
`https://kin.naver.com/myinfo/namecardProfileForm.naver`
- `summaryIntroduction`(한줄 소개, **30바이트** 한도 — 한글 10자), `introduction`(상세 200자), `urlDesc0`/`url0`(연관 링크) 전부 입력 완료
- **저장이 막힌다**: `alert: 프로필 정보 노출 영역을 확인하고 정보 공개에 동의해주세요.` → 정보공개 **동의 체크**가 필요하고, 이건 대표님 계정의 정보공개 동의라 내가 임의로 누르지 않는다.
- 연관 링크 섹션 안내문은 「운영하시는 네이버 스마트 플레이스, 블로그, 카페, **개별홈페이지 주소** 등을 입력하세요」 — 우리 도메인은 허용 범위다.

### 첫 게시물
`https://kin.naver.com/qna/detail.naver?dirId=40102&docId=493664277&answerNo=7`
「미국주식 실적 발표 모아놓은 사이트 있나요?」 — 716자·13줄·링크 0·앱 이름 1회

---

## 2. Google Play Console  ✅2026-09-17 WIM 1.0.4 제출
**계정** 회사 contact@signumhq.com (u/0) · 개발자 ID `4769683602295618218`
**앱 ID** SIGNUM `4974871698649706116` · UC `4976096296089482490` · WIM `4974011153222225088`
**프로덕션 트랙 ID** UC `4698411096118275380` · WIM `4697728196667220385`

### 릴리스 제출 6단계
1. 섀도 DOM 딥워커로 요소를 본다(`innerText` 만 보면 「콘솔이 깨졌다」고 오진한다).
2. **오류 항목의 `clear` 버튼을 전부 클릭한다.** 「Version code N has already been used」는 **초안에 이미 붙은 번들**을 업로드 위젯이 중복으로 보는 유령 오류이고, 이게 `Next` 를 `aria-disabled` 로 만든다. **이 한 가지가 두 사이클을 잡아먹었다.**
3. `input[type=file][accept=".aab"]` 에 `setInputFiles`(AAB 는 파일 입력을 받는다 — 스크린샷만 에셋 라이브러리 우회가 필요하다).
4. `Uploading …` 문자열이 사라질 때까지 폴링(12초).
5. 릴리스 노트는 **네이티브 setter + input 이벤트**로. `.value=` 만 하면 저장 시 13로케일 플레이스홀더로 되돌아간다(실측: 1,372자 → 842자 템플릿).
6. `Next` → `/review` → `Save` → `Publishing overview` → `Submit N change for review` → 대화상자 **`Send changes for review`** → `Changes in review`.

**절대 하지 말 것**: 저장 전 새로고침. 저장 안 된 업로드가 날아가고 그걸 「업로드 실패」로 오진한다.
**초안이 있으면** 「Create new release」는 무동작이다. 「Edit release」가 유일한 문이다.
**versionCode 는 초안이 소비한다.** 재시도할 땐 올려야 한다(WIM 4 → 5).

---

## 3. 이미지 첨부 — 플랫폼별로 «다르다»
| 플랫폼 | 되는 방법 |
|---|---|
| X | `setInputFiles` 그대로 |
| Quora Space | `input[type=file] >> nth=0` |
| Quora 답변 | **drop 이벤트**(setInputFiles 는 CDP 타임아웃) |
| Bluesky | drop + `ClipboardEvent('paste')` (파일 입력이 **0개**다) |
| Play 스크린샷 | 에셋 라이브러리 → 진짜 클릭 후 `a.select-button` |

---

## 4. App Store Connect — API 만으로 된다 (브라우저 0)
`scripts/asc_client.py`. 2FA 불필요. 검증된 것:
- 버전 생성 → `appInfoLocalizations`(이름·부제) / `appStoreVersionLocalizations`(키워드·설명) PATCH
- **`appInfo` 는 앱당 여러 개다.** `READY_FOR_SALE` 인 것을 고치면 「고쳤는데 반영 안 됨」이 된다. `PREPARE_FOR_SUBMISSION` 인 것만 고친다.
- 빌드·업로드·제출은 `scripts/ios-release.sh <signum|uc|wim> <버전> "<whats new>"` 한 줄
- **안 되는 것**: Analytics Reports API 는 `403`(키 자체가 막힘 — 역할 아님). `salesReports` 는 `406`(권한 통과, 판매자 번호만 없음) → t166

---

## 5. 클릭 측정
`node scripts/mkt-clicks.js` **만** 쓴다. 태그 목록을 머리에서 적으면 채널이 통째로 빠진다(`from=home` 412클릭을 21일간 못 셌다).
이 스크립트는 매번 라이브 HTML 에서 `from=` 을 긁어 channels.json 과 합집합을 만들고, 미등록 태그를 경고한다. 동시 12건·3회 재시도·**못 잰 건수 경고**(실패를 0 으로 삼키면 «없는 채널»이 생긴다).
날짜는 **ET** 다. UTC 로 물으면 0 이 나온다.

---

## 6. Google Play — 등록정보 수정 (빌드 불필요) ✅2026-09-17 UC 한국어 수리
**앱스토어와 다르다: Play 는 제목·설명을 빌드 없이 바꿀 수 있다.**
1. `/app/<id>/main-store-listing`
2. **언어 전환은 URL 파라미터로 안 된다**(`?language=ko-KR`·`?lang=ko-KR` 모두 무시). 화면 상단의 `Default – English (United States) – en-US` 드롭다운을 **실제 클릭**해서 `Korean – ko-KR` 을 고른다. 사이드바의 `Translations` 는 다른 것이다.
3. 필드는 폭 200 이상 + 값이 있는 input 순서로 [제목, 짧은 설명], textarea 가 전체 설명.
4. **덮어쓰기 전에 원문 길이를 읽고 기록한다**(Uptodown 설명 1,306자를 정렬 실수로 날린 적이 있다).
5. 입력은 실제 클릭 → `End` → `Backspace` 반복 → `Input.insertText`. **`Cmd+A` 는 쓰지 말 것**(입력칸이 아니라 페이지를 잡는다).
6. `Save` → `Publishing overview` → `Submit N changes for review` → `Send changes for review`.

### 설치·유입 데이터를 읽는 곳 (애플 API 가 막혀도 여기는 된다)
- **활성 설치**: 앱 목록 화면 `Installed audience` 열
- **유입 경로별 취득**: `/app/<id>/grow-overview` → `Show details for Device acquisitions` 클릭 → `Google Play explore / Paid and direct / Not attributed` 별 수치. **없는 행이 가장 중요하다**(Play search 행이 없으면 검색 설치 0)
- **스토어 전환율**: 같은 화면 `Your conversion rate is NN%` — **앱별로 따로 본다**(UC 22% 가 SIGNUM 60% 에 묻혀 있었다)
- 기간 기본값은 `Last 28 days`

---

## 7. Uptodown (서드파티 스토어) ✅2026-09-17 Claim 티켓
계정 = **개인** myjr0629 (GitHub OAuth). 콘솔 `uptodown.dev` → `/apps`
- 앱 상태를 **화면에서 직접 본다.** 우리 기록의 「3/3 제출 완료」는 허수였다(실제: UC=REJECTED · WIM=DRAFT · SIGNUM 없음).
- `CLAIM OWNERSHIP` 은 셀프서비스인데 우리에겐 비어 있다(「There are no organizations available to claim」) → `Contact Us` 로 간다.
- 티켓 양식: `select[name=ticketTypes]`(Issue/Request/**Claim**) · `input[name=ticketSubject]` · `textarea[name=ticketMessage]` · `input[type=file]`(accept=*)
- **본문 줄바꿈**: `Input.insertText` + Enter 키로는 줄바꿈이 사라진다(한 덩어리가 된다). **평범한 textarea 는 `page.fill` 을 쓴다** — 24줄이 그대로 들어간다.
- 첨부는 `setInputFiles` 로 된다. Play 콘솔 앱 목록 스크린샷 1장이면 소유권 증빙으로 충분하다(개발자 계정 ID + 3앱 + 패키지명이 한 화면에 나온다).
- **한계**: 티켓 목록 화면이 없다(`/tickets`·`/support` 404). 접수 확인은 `/notifications` 의 회신으로만 된다 → 「보냈다」와 「접수됐다」를 구분해 적는다.

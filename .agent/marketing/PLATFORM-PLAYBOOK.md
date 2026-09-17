# 플랫폼별 조작법 정본 — 「어떻게 했는지」

대표 지시(2026-09-17): **「플랫폼별로 어떻게 했는지 잘 기록하고 기억하고」**
이 파일은 «검증된 것만» 적는다. 추측·미확인은 적지 않는다. 새로 뚫으면 여기에 한 절을 추가한다.

## 정본 앱 ID — 짐작하지 말고 여기서 본다
2026-09-18 에 UC·WIM 의 App Store ID 를 짐작해서 404 를 냈다. 세 개다.

| 앱 | App Store (ASC) | 번들 ID | Play |
|---|---|---|---|
| SIGNUM HQ: Stock Market AI | `6783130444` | `com.signumhq.app` | `4974871698649706116` |
| Undercurrent: AI Stock News | `6788779895` | `com.signumhq.undercurrent` | `4976096296089482490` |
| Why'd It Move?: Stock Quiz | `6794356135` | `com.signumhq.wim` | — |

의심되면 `GET /apps?fields[apps]=name,bundleId` 한 번으로 전부 나온다. Play 개발자 ID 는 `4769683602295618218`.

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
   **입력과 등록을 «같은 스크립트 실행» 안에서 해야 한다.** ego 실행 경계를 넘으면 편집기 상태를 잃어 클릭이 나가도 `answerNo` 가 붙지 않는다(2026-09-18 실측). 또 **편집기가 열린 상태의 본문 검사는 오판이다** — 내 초안이 페이지에 보이는 것을 「게시됨」으로 읽을 뻔했다. 검증은 **페이지를 새로 열어 답변 블록 수가 늘었는지**로 한다.
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

---

## 8. 삼성 갤럭시 스토어 ✅2026-09-17 셀러 계정 + Developer API 확보
**계정** contact@signumhq.com (삼성 계정 = Google 연동, 비밀번호 없음) · **SIGNUM HQ, LLC · Corporate Seller · 미국 · Free Distribution Seller**

### 가입에서 실제로 막힌 것 두 개 (둘 다 «국가» 문제였다)
1. **Seller Portal 의 Country 칸은 `disabled` 이고 삼성 계정 국가를 그대로 따라간다.** 한국 계정이면 ①`사업자등록번호`(maxLength 10 = 한국 형식) 칸이 필수로 뜨고 ②State 목록이 한국 시·도 19개만 나온다. **미국으로 바꾸면 사업자등록번호 칸이 «사라진다».**
2. 계정 국가는 프로필에서 바꿀 수 있다: `account.samsung.com` → 프로필 → **개인정보 수정** → 국가 또는 지역 → (아코디언에서 **Americas 그룹을 펼쳐야** USA 가 보인다 — 접혀 있으면 Europe·Asia Pacific 둘만 보여서 「미국이 없다」고 오진한다) → 저장. **이메일 확인 링크(10분 유효)** 를 거쳐야 저장되고, 저장되면 기존 세션이 전부 로그아웃된다. **변경 후 180일 재변경 잠김.**
   · 전화 국가 목록(238개)에는 **한국이 의도적으로 빠져 있다**(Kiribati → Kosovo → Kuwait). 그래서 미국 번호가 필요하다 → 회사 정보 메모리 참조.

### ⛔안드로이드 신규 등록의 진짜 게이트
`application/main.as?platform=android` 는 `You do not have access to this function`, `?platform=watch` 는 열린다. 원인은 팝업 `checkAndroidAddNewPopup` 에 적혀 있다:
> To sell Android content, a status change to **corporate Commercial Distribution Seller** is necessary … you will not be able to register Android content.

**무료 앱도 예외가 없다.** 프로필의 `Request Commercial Seller Status` 로 승격해야 한다. Commercial 은 대금 수취가 전제라 은행·세금 정보를 요구할 가능성이 높다(= 내 금지선).

### ✅Developer API — 여기까지는 다 열었다
포털 UI 의 「Add New App」 다이얼로그는 Next 가 `<a href="#1">` 이고 jQuery 핸들러가 걸려 있어 합성 클릭으로 안 넘어간다. **API 가 그 전부를 건너뛴다.**
1. `Assistance → API Service` = `/content/apiConsole/main.as`
2. `Create Service Account` → **API 약관 동의창**(체크박스 `#termsCheck` + Agree)이 먼저 뜬다. 동의 후 다시 누르면 권한 선택창이 나온다: **Publishing & ITEM**(앱 등록·수정) · **GSS**(다운로드·매출 통계) — **둘 다 켠다.**
3. 생성 직후 **비밀키가 화면에 한 번만** 표시된다. `Download Key` 를 누르지 않고 **DOM 에서 정규식으로 뽑아 파일로 저장했다** — 패턴은 PEM 의 BEGIN/END 머리말을 앵커로 삼고 그 사이를 `[\s\S]*?` 로 최소일치시킨다.
   ⚠ `div` 로 넓게 잡으면 페이지 전체가 딸려온다 — 반드시 정규식으로 키만 자른다.
4. 저장 위치 `~/.galaxystore/service-account-private.pem` (mode 600, RSA 2048 — `openssl rsa -noout -check` 로 검증). 서비스 계정 ID 는 `.env.local` 의 `GALAXY_STORE_SERVICE_ACCOUNT_ID`.
5. 클라이언트 `scripts/galaxy_client.py` — JWT(RS256, `iss`=서비스계정ID, `scopes`=[publishing, gss]) → `POST /auth/accessToken` → 이후 **두 헤더를 «둘 다»** 보낸다: `Authorization: Bearer <token>` + `service-account-id: <id>`. 하나라도 빠지면 인증 오류.

**실동작 확인**: `GET /seller/contentList` → `[]` · `POST /seller/createUploadSessionId` → `{url, sessionId}`(24시간 유효).
**한계**: Content Publish API 에는 **«신규 앱 생성» 엔드포인트가 없다**(공식 레퍼런스 확인) — 첫 등록은 포털 필수. API 는 그 뒤의 바이너리 추가/교체·앱 정보 수정·단계적 배포·리뷰 답글·제출·통계를 담당한다.

### Promotion 도구 (경로 정본)
Badges `/product/badge/getBadgeList.as` · Coupons `/product/promotion/promotioncoupon.as` · Redeem Code `/product/redeemCode/redeemCodeList.as` · Discounts `/product/discount/discountList.as` · My Followers `/comment/getFollowerList.as` · 앱 목록 `/content/common/summaryContentList.as` · 사이트맵 `/help/siteMap.as`(막히면 여기서 경로를 받는다)

### Commercial Seller 승격 신청서 실무 (2026-09-18)
경로 `/member/getContractSeller.as` (프로필의 `Request Commercial Seller Status`)
1. **D-U-N-S 인증이 첫 관문이고, 넣으면 나머지가 자동으로 채워진다.** 우리 번호 `145040194`(애플 조직 계정 발급분) → 회사명·대표자·주소·ZIP+4 가 D&B 기록에서 그대로 들어온다. **번호가 우리 것인지는 「되돌아온 회사명·주소」로 확인한다** — 남의 번호면 그 회사에 묶인다.
2. **미국 셀러에게 숨겨지는 칸이 있다**: `Taxation Type`(한국 부가세 일반/간이과세자), `Business Registration Number`, `Corporation Registration Number` 는 라디오·입력이 `vis:false` 로 숨는다 → 라벨에 `*` 가 있어도 제출을 막지 않는다. **「필수인데 비어 있다」를 판정할 때 `getBoundingClientRect().width > 0` 를 반드시 같이 본다.**
3. **서류 2건은 미국 서류로 된다**
   · `Certificate of Business Registration` * → **델라웨어 설립증서**
   · `Online Sales Registration Number` * → 안내문이 「전자상거래법 제13조, 공정거래위원회」라고 명시한 **한국법 전용 번호**다. 미국 법인엔 없으니 **IRS EIN 확인서(147C)** 를 넣고 Comments 에 사정을 적는다.
   · 둘 다 `setInputFiles('#Image2' / '#Image3', …)` 로 그냥 붙는다(드롭·우회 불필요).
4. **Comments 는 1,500자 한도다.** 앱 소개를 쓰는 자리이고, 여기서 교리를 적용한다 — 기능 나열이 아니라 「무엇을 얻는가」, 무료·계정 불필요·다국어를 앞에.
5. **⛔막는 칸은 `Payment Account`** (Bank Account / PayPal 라디오)다. 결제 정보라 대표 영역.
6. **경고**: 접수·승인 뒤에는 Basic/Financial Information 을 못 바꾼다(Support 요청 필요). 한 번에 맞게 넣는다.

---

## 9. App Store 인앱 이벤트 (In-App Events)  ✅2026-09-18 3앱 전부 제출
**계정** ASC API 키(팀 키) · **태그** `from=iap_event` / `iap_event_uc` / `iap_event_wim` · **채널 등급** A(무료 표면)

### 왜 이 채널인가
인앱 이벤트는 앱 페이지 밖으로 나가는 **무료 노출 표면**이다 — App Store 검색 결과에 카드로 한 줄 더 붙고, Today/게임·앱 탭에 편집 선정될 수 있고, 이벤트 페이지 자체가 공유 가능한 링크를 갖는다. 빌드 없이 만들 수 있고 31일까지 돌 수 있다. 3앱 모두 0건이었다.

### 절차 (전부 API, 웹 UI 불필요)
`python3 scripts/asc_inapp_event.py <앱ID> <스펙.json>` 이 아래 6단계를 한 번에 돈다.

1. `POST /appEvents` — `badge`(SPECIAL_EVENT·CHALLENGE·COMPETITION·LIVE_EVENT·MAJOR_UPDATE·NEW_SEASON·PREMIERE), `purpose`(ATTRACT_NEW_USERS), `primaryLocale`, `priority`, `purchaseRequirement`, `deepLink`, `territorySchedules: []`
2. `POST /appEventLocalizations` — `locale`·`name`(30자)·`shortDescription`(50자)·`longDescription`(120자)
3. `POST /appEventScreenshots` — `fileSize`·`fileName`·**`appEventAssetType`**(EVENT_CARD / EVENT_DETAILS_PAGE) + `appEventLocalization` 관계
4. `PUT` 각 `uploadOperations`
5. `PATCH /appEventScreenshots/{id}` — **`uploaded:true` 만.** `sourceFileChecksum` 은 이 리소스에 없다(409)
6. `assetDeliveryState.state == COMPLETE` 폴링 → `PATCH /appEvents/{id}` 로 `territorySchedules` → `POST /reviewSubmissions` → `POST /reviewSubmissionItems`(appEvent 관계) → `PATCH submitted:true`

### 이미지 규격 (여기서 두 번 실패했다)
| 에셋 | 비율 | 최소 | 최대 |
|---|---|---|---|
| EVENT_CARD | **16:9** | 1920×1080 | 3840×2160 |
| EVENT_DETAILS_PAGE | **9:16** | 1080×1920 | 2160×3840 |

- 형식 `.jpg`/`.jpeg`/`.png`, 최대 500MB
- **글자·로고·CTA 금지.** 애플이 이름·짧은설명을 카드 위에 덮는다 → 앱 화면만 쓴다
- 중요한 요소는 가운데로. 크롭된다
- 렌더 정본: `/tmp/evcard/render_app.py`(브랜드 그라디언트 + 둥근 모서리 + 그림자, 로케일별 실제 화면)

### 일정
`territorySchedules: [{ territories:[…], publishStart, eventStart, eventEnd }]` — 시각은 UTC(`…Z`). 판매국가는 **`/v2/appAvailabilities/{appId}/territoryAvailabilities`** 에서 읽는다(v1 에 없는 경로). id 가 base64 JSON 이라 디코딩해야 국가코드가 나온다. 3앱 전부 174개국.

### 게시 이력 (2026-09-18)
| 앱 | 이벤트 ID | 배지 | 로케일 | 일정 |
|---|---|---|---|---|
| SIGNUM | `6813171830` Earnings Week | SPECIAL_EVENT | en/ko/ja | 09-28 → 10-23 |
| UC | `6813176541` Earnings Week News | SPECIAL_EVENT | en/ko/ja | 09-28 → 10-23 |
| WIM | `6813176699` Earnings Week Quiz | CHALLENGE | en | 09-28 → 10-23 |

**남은 일** WIM 의 ko·ja 로케일(한국어·일본어 앱 화면을 렌더해야 붙일 수 있다) · 심사 결과 확인 · `publishStart`(09-24) 전까지 승인이 안 나면 일정을 미룬다.

---

## 10. Google Play 맞춤 스토어 등록정보 (Custom store listings)  ✅2026-09-18 1호 제출
**계정** 회사 contact@signumhq.com (u/0) · **태그** `listing=home` · **채널 등급** A(무료·자격 게이트 없음·앱당 50개)

### 왜 이 채널인가
같은 앱에 **다른 문안·다른 그래픽**을 오디언스별로 보여줄 수 있다. 기본 등록정보는 검색어에 맞춰야 하니까 문안이 딱딱해지는데, **URL 타깃 맞춤 등록정보는 기본 등록정보의 검색 순위에 영향을 주지 않는다** — 그래서 거기선 검색어 최적화를 버리고 «순수 설득»으로 쓸 수 있다. 우리 실측 Play 방문 31명·CTR 29% 이므로 전환율이 곧 설치다.

### 경로
`play.google.com/console/u/0/developers/<개발자ID>/app/<앱ID>/store-listings` → 우상단 **Create custom listing**
(`custom-store-listings` 같은 경로는 없다 — 개발자 홈으로 튕긴다)

### 4단계
1. **Setup** — `Duplicate an existing listing` 이 기본값이고 가장 빠르다(에셋 재사용, 새 업로드 불필요). `Select listing` → `Default store listing`
2. **Details** — 참조 이름(**나중에 변경 불가**), 롤아웃 %(**내릴 수 없다**, 올리기만 가능), 기간, **Target audience**
3. **Assets** — 언어별 앱이름·짧은설명(80)·긴설명(4000). 앱의 **모든 언어가 이미 들어 있고** 각 언어는 기본 등록정보 문안을 상속한다 → **고칠 언어만 고치면 된다**
4. **Review** — AI 에셋 선언(그래픽을 생성 AI 로 만들지 않았으면 «Don't label assets») → **Save** → 「Publishing overview 에서 심사 전송」 → `Submit N changes for review`

### Target audience 6종 (실측)
| 종류 | 설명 |
|---|---|
| Buyer state ▸ | 구매 이력 |
| User state ▸ | 신규/복귀/비활성 |
| Ads traffic | 내 광고로 온 사용자 |
| Country/region | 특정 지역 |
| Pre-registration state | 사전등록 가능 사용자 |
| **Search keyword** | **Play 검색어로 들어온 사용자** |
| **URL** | **특정 URL 파라미터로 들어온 사용자** ← 우리가 고른 것 |

우리는 **URL** 을 골랐다. 이유: Play 검색 설치가 실측 0 이고(유입은 explore 90일 15건), 클릭은 우리 자체 채널에서 온다(`from=home` 21일 412클릭·52%). 파라미터 규칙은 **소문자 영숫자와 `- . _ ~`**.

### 조작 함정 (전부 밟았다 — ENGINE §32·§33)
- **드롭다운 옵션 클릭이 안 먹는다**: 열기와 고르기를 «다른 스크립트 실행»으로 나누면 실패한다. 한 실행 안에서.
- **버튼이 화면 밖이면 클릭이 허공으로 간다**: `y>900` 은 뷰포트 밖이다. `scrollIntoView` 후 **좌표 재측정** + `inView` 확인.
- **언어 전환은 드롭다운이 아니라 「Next language →」 버튼으로** 된다(드롭다운 옵션 클릭은 실패했다). 12개 언어를 돌면서 ko-KR·ja-JP 를 만나면 그 자리에서 채운다.
- **긴 칸(1871자) 교체는 백스페이스로 하지 말 것**: 실제 클릭으로 포커스 → `document.execCommand('selectAll')` → `Input.insertText` 가 한 번에 된다(선택만 DOM 으로 하고 입력은 CDP 로 하니 앵귤러가 본다).
- **placeholder 는 값이 들어가면 지워진다** → 칸을 `placeholder` 로 찾지 말고 **값의 길이·태그**로 찾는다.

### 1호 (2026-09-18)
`web home (listing=home)` · URL 타깃 `home` · 롤아웃 50%(의도적 A/B, 최대 채널에서 맞춤 문안 효과 첫 측정) · 무기한 · en-US·ko-KR·ja-JP 3개 언어 새로 씀 · **14개 언어 항목 Changes in review**

**활성화에 남은 한 줄** `src/lib/marketing/storeRedirect.ts` 의 `playUrlWithReferrer()`(39~44행)에 `from` 이 맞춤 등록정보 목록에 있으면 `&listing=<from>` 을 붙인다. 지금은 웹 코드 무수정 안전선이라 손대지 않았다 → **t186**.

## 11. TikTok  ⛔2026-09-18 계정 오류 발견
**게시는 되지만 계정이 틀렸다.** ego lite 세션은 `@signumhq` 가 아니라 **`@daldalkelly`**(대표 개인·쿠팡 파트너스 살림템 리뷰)다. 2026-08-31 우리 앱 게시물도 그 계정에 있다(68회).
- **핸들 확정법**: 스튜디오 `tiktokstudio/content` 의 `a[href*="/video/"]` 경로. 패스포트 API 의 `screen_name`(「JY Naru」)·프로필 텍스트·소개 문구는 근거가 안 된다(ENGINE §34).
- 사진 게시 절차: `tiktokstudio/upload` → **「사진」 탭** → `setInputFiles('input[type=file]', [3장])` → 제목(90) + 본문(4000, contenteditable) → **스크롤 후** 「게시」.
- 게시 직후 상태는 **「콘텐츠 검토 중 · 나만」** — 「게시물 수 1→2」는 제출 증거이고 공개 증거가 아니다.
- **대표 확인 필요(t187)**: `@signumhq` 로 로그인 전환 + 개인 계정에 남은 우리 게시물 2건(8/31 공개·9/18 검토중) 처리 방침.

---

## 12. App Store 맞춤 제품 페이지 (CPP)  ✅2026-09-18 3앱 전부 제출
**계정** ASC API 키 · **태그** `?ppid=<uuid>` · **채널 등급** A(무료·앱당 35개·검색광고 광고그룹에 붙일 수 있음)

### 왜 이 채널인가
CPP 는 **자기 URL(`?ppid=…`)** 을 갖고 **스크린샷·앱 프리뷰·홍보문구를 따로** 둘 수 있다. 기본 등록정보는 검색어에 묶이지만 CPP 는 안 묶이므로 «순수 설득»으로 쓸 수 있다. 애플 검색광고 광고그룹에도 붙는다. 앱당 35개, 전부 무료. 3앱 모두 0건이었다.

### 절차 — `python3 scripts/asc_custom_product_page.py <앱ID> <스펙.json>`
1. `POST /appCustomProductPages` — **버전과 로케일을 «인라인»으로 함께** 보낸다(`included` + `${}` 링키지). 둘 다 필수 관계라 따로 만들면 409 `RELATIONSHIP.REQUIRED`
2. `POST /appScreenshotSets` — 관계는 **`appCustomProductPageLocalization`**, `screenshotDisplayType: APP_IPHONE_65`
3. `POST /appScreenshots` → `PUT` uploadOperations → `PATCH {uploaded:true, sourceFileChecksum}`
   (**`appScreenshots` 에는 `sourceFileChecksum` 이 있다.** `appEventScreenshots` 와 다르다 — §31)
4. `assetDeliveryState == COMPLETE` 폴링
5. `POST /reviewSubmissions` → `POST /reviewSubmissionItems`(**`appCustomProductPageVersion`** 관계) → `PATCH {submitted:true}`

### 규격·한도
- 스크린샷 6.5" = **1242×2688**. 렌더는 `scripts/compose-promo-shots.py` + `{canvas:{1242,2688}, appSize:{1100,2280}}`
- `promotionalText` **170자**. 이름·부제·설명은 CPP 에서 **못 바꾼다**
- 앱당 35개

### 제출 취소·교체 (실제로 했다)
`PATCH /reviewSubmissions/{id} {canceled:true}` → 즉시 `CANCELING`, CPP 버전이 `PREPARE_FOR_SUBMISSION` 으로 복귀 → `DELETE /appScreenshotSets/{id}` → 새로 업로드 → 재제출. **기본 등록정보와 같은 스크린샷을 올리면 CPP 가 무의미하다**(§36).

### 1호 3건 (2026-09-18)
| 앱 | ppid | 로케일 | 상태 |
|---|---|---|---|
| SIGNUM | `a0522489-c6f8-4050-8e56-bc89b27f0927` | en·ko·ja | WAITING_FOR_REVIEW |
| UC | `f2559d55-be1a-41a1-989b-5940a5ff4d8a` | en·ko·ja | WAITING_FOR_REVIEW |
| WIM | `4347070b-174a-4620-bd93-942caca7cf2c` | en | WAITING_FOR_REVIEW |

**활성화** 스마트링크의 App Store URL 에 `&ppid=<uuid>` 를 붙여야 트래픽이 온다 → **t186 에 Play `&listing=` 과 함께 묶었다**(`src/lib/marketing/storeRedirect.ts`).

## 13. App Store 홍보문구 (promotionalText) — 즉시·무심사 170자
`PATCH /appStoreVersionLocalizations/{id} {promotionalText}`. **새 빌드도 심사도 필요 없다**(실측: 버전 상태 `READY_FOR_DISTRIBUTION` 그대로). 제품 페이지 설명 위에 붙는 최상단 170자다.
2026-09-18 에 **3앱 × 12로케일 = 36칸이 전부 비어 있었고** 전부 채웠다. ko·ja 는 현지어, 나머지 9개 로케일은 앱 UI 가 영어라 영문을 쓴다.
스토어 필드는 세 종류로 나눠 본다: **빌드 필요**(이름·부제·키워드) / **심사 필요**(스크린샷·설명·CPP) / **즉시·무심사**(promotionalText).

---

## 14. Uptodown (서드파티 안드로이드 스토어) — 정본 절차  ✅2026-09-18 3앱 등재
**계정** 개인 `myjr0629-hue` / myjr0629@gmail.com (GitHub OAuth, 비밀번호 없음) · **콘솔** `https://www.uptodown.dev/apps`
(`en.uptodown.com/panel` 은 404 다. 개발자 콘솔은 **`uptodown.dev`** 다.)

### 상태 (2026-09-18 07:2x)
| 앱 | 상태 | 비고 |
|---|---|---|
| SIGNUM HQ | **PENDING REVISION** | 이번에 신규 등록. APK 1.2.2(7)·스크린샷 3·설명 182단어 |
| Why'd It Move? | **PENDING REVISION** | DRAFT 였던 것을 APK 1.0.4(5) 로 갱신해 제출 |
| Undercurrent | REJECTED | 소유권 확인 대기 — 지원 티켓 전송 |

### 신규 등록 절차
1. `ADD NEW APP` → OS=Android → **APK 만 올리면** 이름·패키지·카테고리·웹사이트가 자동 채워진다
2. **INFORMATION 탭에서 `Nationality` 를 반드시 확인한다** — 기본값이 `Afghanistan` 으로 들어왔다. `United States of America` 로 고치고 `SAVE`
3. **SCREENSHOTS**: `+ ADD` 를 눌러야 `input[type=file]` 이 생긴다(§29·§38). **라벨이 아니라 버튼 좌표**를 눌러야 한다(같은 `+ ADD` 문구가 2~3개 있다). 붙이면 **UPLOAD 버튼 없이 즉시 올라간다**. 안내문은 「자사 팀이 찍는다」지만 **제출 검증은 3장을 요구**한다
4. **DESCRIPTIONS**: 짧은설명 ≤70자, 본문 **≥100단어**. `SAVE ENGLISH DESCRIPTION`. **탭 배지가 `DESCRIPTIONS 0` 으로 남아도 저장은 된다**(리로드해도 값이 남으면 저장된 것). 배지를 근거로 판단하지 말 것
5. **FILES**: `+ ADD NEW VERSION` → 모달의 `input[type=file]` 에 APK → **Version 칸을 APK 와 같게** 채운다(플레이스홀더가 엉뚱한 버전을 보여준다) → `UPLOAD`
6. `SUBMIT FOR REVIEW` → 모달 **`CONFIRM`**(y≈534). 「제출 후 수정 불가」 경고가 뜬다 → 제출 전에 **APK 버전을 반드시 확인**한다(1.0.1 이 올라가 있었다)

### 소유권 반려 처방 (실측 원문)
반려 알림(`uptodown.dev/notifications`) 원문: 「Please, confirm that you are the app owner or have its distribution rights. We kindly ask you to submit a ticket to our support team from our Developers Console, and attach a screenshot showing the app in your Google Play developer account.」
- **`CLAIM OWNERSHIP` 버튼은 우리 경우가 아니다** — 「There are no organizations available to claim」 이 나온다. 이미 Uptodown 에 등재된 조직을 가져오는 기능이다.
- 정답은 **`Contact Us` 지원 티켓**: `ticketSubject` + `ticketMessage` + `input[type=file]` 에 **Play 콘솔 스크린샷**. 스크린샷에 계정명·Account ID·앱 3개의 패키지명이 다 보이게 찍는다(`app-list` 화면, 알림 패널은 닫고).

## 15. Hugging Face 데이터셋 → 구글 데이터셋 검색  ✅2026-09-18 생성·공개
**계정** 대표 개인 `eunhoon` (브라우저 세션) · **태그** `from=hf_datasets` · **저장소** `eunhoon/options-market-structure-daily`

### 왜 이 경로인가
구글 «데이터셋 검색»은 schema.org `Dataset` JSON-LD 를 색인한다. **HF 데이터셋 페이지는 그 JSON-LD 를 실어 주고 깃허브 저장소 페이지는 싣지 않는다.** 우리 티커 페이지에 `distribution` 을 추가하는 건 웹 코드 변경(승인 필요)이지만, **HF 미러는 코드 변경이 0**이다.

### 절차
1. `huggingface.co/new-dataset` → Owner·이름·License(`cc-by-4.0`) → `Create Dataset`
2. `.../upload/main` → `input[type=file] >> nth=0` 로 파일 첨부 (**`input[type=file]` 단독 선택자는 요소 2개(보임 1·숨김 1)에 걸려 실패한다**)
3. 커밋 메시지 입력 → **`Commit changes to main`** — 이 버튼의 `innerText` 는 `"Commit changes to\nmain"` 이다. **공백 정규화 없이는 못 찾는다**(§37). 세 번 헛손질했다
4. 검증은 API 로: `api/datasets/<owner>/<name>/tree/main` 에 파일이 다 보이는지. **저장소 생성 시 27바이트 README 스텁이 자동 생성되므로 「README.md 가 있다」는 커밋 증거가 아니다**

### 데이터셋 카드에 넣은 것
HF YAML 프런트매터(`license`·`language`·`pretty_name`·`tags` 6개·`size_categories`·`configs`) + 앱 화면 이미지 + 스마트링크 `signumhq.com/app?from=hf_datasets`.
검증 결과: HTTP 200 · JSON-LD `"@type": "Dataset"` 존재 · 태그 10개 색인(`finance`·`options`·`market-structure` 등) · 스마트링크 페이지에 노출.

---

## 16. App Store 피처링 추천 (Featuring Nominations)  ✅2026-09-18 3앱 제출
**계정** ASC API 키 · **채널 등급** A(무료·편집 선정 창구) · **API** `/v1/nominations`

### 왜 이 채널인가
애플 편집팀에 **직접** 앱을 추천하는 창구다. 무료이고, **인앱이벤트·앱 업데이트·개발자 스토리**까지 대상이다. 애플 안내문 기준 **최소 2주 전, 권장 3개월 전** 제출.
평가 기준(애플 명문): 사용자 경험 · UI 디자인 · 혁신 · 독창성 · **접근성** · **현지화** · 제품 페이지 품질. 우리 강점은 **완전 현지화(EN/KO/JA 전체)**·무료·가입 없음·「숫자가 무엇 대비인지 라벨링」이다.

### API (문서엔 없고 오류로 찾았다 — §39)
- `GET /v1/nominations?filter[state]=SUBMITTED|DRAFT|ARCHIVED` — **`filter[state]` 가 필수**다. 빼면 400
- `/v1/featuringNominations` 는 **404** 다. 이름은 `nominations`
- `POST /v1/nominations` 필수: `name` · `description` · `type` · `publishStartDate`(ISO 8601 datetime) · `submitted` + 관계 `relatedApps`
- `type` 열거형: **`APP_LAUNCH` · `APP_ENHANCEMENTS` · `NEW_CONTENT`** (`IN_APP_EVENT`·`APP_UPDATE` 는 무효)
- **`relatedAppEvents` 관계는 없다** — 인앱이벤트를 걸 수 없고 `NEW_CONTENT` 로 본문에 적는다
- 제출: `PATCH /v1/nominations/{id} {submitted:true}` → `state: SUBMITTED`

### 이번 제출 (publishStartDate 2026-10-06 = 18일 후, 2주 규정 충족)
| 앱 | id | 타입 |
|---|---|---|
| SIGNUM | `608525e6` | NEW_CONTENT — This week's earnings (EN/KO/JA) |
| UC | `71d6f443` | NEW_CONTENT — the news, in plain language |
| WIM | `9473bc18` | NEW_CONTENT — learn the market by guessing |

**기록에 없던 사실**: 2026-07-10·07-16 에 **APP_LAUNCH 추천 2건이 이미 제출돼 있었다**(SIGNUM v1.0·UC 1.0). 창구를 쓴 적이 있는데 채널 문서에 없었고 결과 확인도 안 했다. 이제 `filter[state]=SUBMITTED` 로 매번 확인한다.

## 17. Galaxy Store 셀러 포털 — 정본 경로 (2026-09-18 확인)
`seller.samsungapps.com` · 메뉴는 **짐작하지 말고** `sellerMain.as` 의 링크에서 읽는다(내가 찍은 `member/sellerPageInfo.as`·`member/memberInfo.as` 는 둘 다 404였다).

| 기능 | 경로 |
|---|---|
| 셀러 상세/프로필 | `/member/getSellerDetail.as` |
| 쿠폰 | `/product/promotion/promotioncoupon.as` |
| 리딤 코드 | `/product/redeemCode/redeemCodeList.as` |
| 할인 | `/product/discount/discountList.as` |
| 배지 | `/product/badge/getBadgeList.as` |
| 팔로워 | `/comment/getFollowerList.as` |
| API 콘솔 | `/content/apiConsole/main.as` |
| 문의 | `/notice/ask.as` |
| Commercial Seller 안내서 | `/qa/downloadSupportFiles.as?type=9` |

**상태(2026-09-18 08:0x)**: `Type of Sales: Commercial Distribution Request in Progress` — 승격 **대기 중**, 등록 앱 0건, 다운로드 0. Developer API 는 정상(`GET /seller/contentList` → `[]`).
**셀러 페이지에서 채울 수 있는 것**: `Seller's Home URL` · `Seller's Help URL`(+ Themes/Watch 전용 이미지 칸들). 딥링크는 `000000257823`.
⛔ **`Edit` 를 누르면 삼성 계정 «비밀번호 재확인» 게이트가 새 탭으로 열린다**(`account.samsung.com/.../confirmPasswordGate`). 안전선상 내가 못 넘는다 → **t181**. 대표가 한 번 통과해 주면 그 세션에서 내가 URL 두 개를 넣는다.

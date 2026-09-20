# READY — okky 게시용 (브라우저 풀리면 «그대로» 붙여넣기)

- 게시판: https://okky.kr/events/promote  (무료 홍보판 · 개발자 청중 · 본인인증 없음)
- 스마트링크: `https://www.signumhq.com/app?from=okky&l=ko`  ← **`&l=ko` 필수**
- 이미지: `public/promo/card-app-ko.png`
- 주제: 오늘(9/20) 실제로 잡은 Capacitor 딥링크 버그. 최근 okky 글(Play 검색 노출)과 겹치지 않음.

## 제목
Capacitor 앱에서 «앱스토어 리뷰 요청»이 눌러도 아무 일도 안 일어난 이유 3가지

## 본문

앱 설정에 「앱 평가하기」 버튼을 달아 두고 별점이 안 쌓이길래 사용자가 안 누르는 줄 알았습니다. 실기기로 확인해 보니 **누르고 있었는데 아무 일도 안 일어나고 있었습니다.** 원인이 세 겹이라 하나씩 적어 둡니다. Capacitor 쓰시는 분이면 그대로 겪을 수 있는 것들입니다.

**① 조용한 API 를 수동 버튼에 연결해 뒀다**

`@capacitor-community/in-app-review` 의 `requestReview()` 는 iOS 에서 `SKStoreReviewController` 를 부릅니다. 이건 **애플이 노출을 통제**합니다(연 3회 제한, 그마저도 보장 없음). 자동 팝업용으로 설계된 API라서, 사용자가 «직접 누른» 버튼에 걸면 아무 반응이 없는 것처럼 보입니다. 에러도 안 납니다.

수동 버튼은 스토어 리뷰 페이지로 직접 보내야 합니다. `https://apps.apple.com/app/id<ID>?action=write-review`.

**② 그 링크를 «인앱 브라우저»로 열고 있었다**

`@capacitor/browser` 의 `Browser.open()` 은 iOS 에서 SFSafariViewController 입니다. 앱스토어 딥링크를 여기로 열면 네이티브 스토어 시트가 안 뜹니다. **시스템 핸들러로 넘겨야** 합니다.

그런데 `@capacitor/app` 의 `App.openUrl()` 로 고치려다 되돌렸습니다 — **그 API 는 없습니다.** Capacitor 3에서 제거됐고, 저희 저장소의 8.x 타입 정의에도 없었습니다. 그대로 뒀으면 폴백으로 조용히 떨어져서 «고친 척»만 됐을 겁니다.

실제로 쓸 수 있는 성질은 이것이었습니다. **Capacitor 는 http(s) 가 아닌 스킴으로의 내비게이션을 가로채 시스템으로 넘깁니다**(iOS `UIApplication.open`, Android Intent). 그래서 `window.location.href = 'itms-apps://apps.apple.com/app/id...?action=write-review'` 로 «이동»시키면 스토어 앱이 열립니다. 안드로이드는 `market://details?id=...` 입니다.

스킴이 안 먹는 경우(시뮬레이터 등)를 대비해, 1.5초 안에 앱이 백그라운드로 안 가면 https 로 폴백하게 했습니다. `document.visibilityState` 로 판정합니다.

**③ 버튼이 «플러그인 유무»로 숨겨져 있었다**

`canRate` 조건이 `Capacitor.Plugins.InAppReview` 존재였습니다. 수동 버튼은 이제 스토어로 직접 가니까 플러그인과 무관한데, 플러그인이 빠진 빌드에서는 버튼 자체가 안 보였습니다.

**덤 — 같은 날 한 번 더 걸린 것**

공용 함수 `openStoreReview()` 안에 스토어 ID가 **한 앱 것으로 하드코딩**돼 있었습니다. 앱이 세 개인데 한 곳만 고쳐 놓고 «고쳤다»고 적어 뒀던 겁니다. 나머지 두 앱은 옛 경로 그대로였습니다. 공용 모듈을 고치면 호출부를 전수 확인해야 한다는 걸 비싸게 배웠습니다.

---

저희는 미국 주식시장 데이터를 보여주는 앱을 만듭니다. 옵션 플로우, 다크풀 비중, 공매도량, 맥스페인, 감마 — 보통 월 $50~99 짜리 단말기에서 보는 화면들인데 무료이고 가입도 없습니다. 위 수정은 전부 원격 웹뷰 구조라 스토어 재심사 없이 바로 반영됐습니다. iOS·안드로이드 둘 다 있습니다.

https://www.signumhq.com/app?from=okky&l=ko

## 발행 후 검증
- 공개 글에서 제목·본문·`<a href="...from=okky&l=ko">` 앵커 확인
- `node scripts/mkt-plan.js pub okky <URL>`

# SIGNUM v1.2 — 다음 바이너리에 담을 것

작성 2026-08-06 · 상태 **대기 (iOS v1.1 심사 결과 이후 착수)**
선행 문서: `SIGNUM_V1.1_BINARY_ASSEMBLY.md` (v1.1은 이미 제출·심사 중)

## ★ 제출 방침 — 대표 지시 2026-08-06
> "안드로이드는 승인이 빠른데 iOS는 느리다. **동시에 내는 게 관리하기 좋다.**"

**앞으로 SIGNUM 바이너리는 한쪽만 먼저 올리지 않는다.**
iOS v1.1 결과가 나온 뒤, 다음 묶음을 **양 스토어 같은 날** 제출한다.

---

## 0. 🔴 **애드몹 앱 ID 교체 — v1.2 를 내야 할 «이유»가 생겼다 (2026-08-18)**

이 문서는 그동안 «다른 이유로 v1.2 를 낼 때 동봉만» 상태였다. **그 이유가 이것이다.**

### 사실관계
2026-08-18 개인 애드몹 계정 승인 완료(앱 6개 등록·전부 «준비됨»).
그런데 **스토어에 올라가 있는 바이너리 6개가 전부 폐쇄된 회사 계정의 앱 ID를 들고 있다.**

| 앱 | 플랫폼 | 파일 | 현재 값 | 판정 |
|---|---|---|---|---|
| SIGNUM | Android | `android/app/build.gradle` (`adMobAppId`) | `…pub-1716731715414173~8198575283` | ❌ 폐쇄 계정 |
| SIGNUM | iOS | `ios/App/App/Info.plist` (`GADApplicationIdentifier`) | `…pub-1716731715414173~4757602262` | ❌ 폐쇄 계정 |
| UC | Android | `uc-app/android/app/src/main/AndroidManifest.xml` | `…pub-1716731715414173~1198944282` | ❌ 폐쇄 계정 |
| UC | iOS | `uc-app/ios/App/App/Info.plist` | `…pub-1716731715414173~6307534807` | ❌ 폐쇄 계정 |
| WIM | Android | `wim-app/android/app/src/main/AndroidManifest.xml` | `…pub-3940256099942544~3347511713` | ❌ 구글 테스트 |
| WIM | iOS | `wim-app/ios/App/App/Info.plist` | `…pub-3940256099942544~1458002511` | ❌ 구글 테스트 |

### 왜 웹으로 못 고치나
애드몹 식별자가 «두 종류»고 사는 곳이 다르다.
- **앱 ID** `ca-app-pub-XXXX~YYYY` → **바이너리 안**. 구글 모바일 광고 SDK 가 초기화할 때 읽는다.
- **유닛 ID** `ca-app-pub-XXXX/ZZZZ` → `src/config/admob.ts`. 웹 배포로 바뀐다.

게시자를 갈아타면 둘 다 바뀐다. 유닛만 고치고 앱 ID를 놔두면 **폐쇄된 게시자 명의로
광고를 요청**하게 된다. (이전 문서에 «웹 배포만으로 끝난다»고 적혀 있던 것은 오류였고 정정됨.)

### 순서 — 광고가 켜지는 건 «맨 마지막»이라 미리 내보내도 안전하다
```
1. [대표] 애드몹 → 앱 6개에 광고 단위 발급 (배너/전면/보상형)
2. [나]   위 표의 6개 파일에 «새 앱 ID» 반영
3. [대표] 6개 바이너리 재빌드 + 양 스토어 «같은 날» 제출
          → 이 시점에도 광고는 꺼져 있다: REAL_UNIT_IDS 가 null 이라
            config/admob.ts 의 adsAllowed() 관문이 막는다
4. [나]   바이너리 라이브 확인 후 REAL_UNIT_IDS 채우기
5. [나]   ADS_LIVE / WIM_ADS_LIVE → true, 웹 배포 (여기서 처음 광고가 나온다)
```

### ⛔ 3번 전에 반드시 끝내야 하는 것
- **WIM 개인정보처리방침이 «No ads or tracking» 이라고 명시하고 있다** — 3개국어 수정 선행.
  그 다음 스토어 데이터 안전성 / App Privacy 갱신. 순서를 바꾸면 거짓 고지가 된다.
- SIGNUM App Privacy 의 «추적» 선언은 YES 유지(실광고 유닛을 싣는다).

### 이 바이너리에 같이 실을 것 (묶어서 한 번에)
- `SKStoreReviewController` 리뷰 유도 — **3앱 × 3스토어 평점이 전부 0**이고, 애플이
  「ratings and reviews influence how your app ranks in search」라고 명시한다. 지금 최대 병목.
  (SIGNUM: 브리핑 3회 열람 후 / UC: 기사 5개 후 / WIM: 퀴즈 연속 성공 후)
- 아래 1번(안드로이드 내비바 1줄) 동봉
- 아래 2번 이하 기존 항목

## 1. 🟢 안드로이드 하단 «흰 줄» — **범위 축소 (2026-08-08 대표 실기기 실측)**

### ★ 신규 실측 — 급하지 않다, 별도 업데이트 불필요
- 대표 기기(**Android 13**): 흰 띠 보임 ← 기존 보고
- 타인 기기(**Android 16**): **흰 띠 없음, iOS처럼 정상**
- 이유: **Android 15(API 35)+ 는 엣지투엣지 강제** — targetSdk 35 앱은 시스템 내비바가
  투명해져 앱 위에 겹쳐 그려진다. 즉 **Android ≤14 에서만 남는 구형 OS 한정 증상**이고,
  OS 점유율이 15+ 로 이동할수록 자연 소멸한다.
- **대표 결정: 이것 때문에 업데이트하지 않는다.** 다른 이유로 v1.2 를 낼 때 동봉만.

### 증상/원인 (기존 실측 유지 — Android ≤14 한정)
```
안드로이드 시스템 내비게이션 바   (250, 250, 250)   ← 세 앱 전부 동일
SIGNUM 바로 위 앱 화면          (  7,  11,  19)   → 흰/검 경계가 그대로 보임
UC     바로 위 앱 화면          (233, 233, 234)   → 흰/흰이라 안 보임
```
내비바는 **웹뷰 바깥**이라 CSS·JS가 못 닿는다 → 네이티브에서만 해결.

### 조치 (동봉 시) — 저위험 1줄 방식으로 «격하»
구형 OS 만 남았으므로 엣지투엣지 전환(레이아웃 변경 + lift 재조정 = 리스크) 대신:
```java
// MainActivity onCreate(), super.onCreate() 직후 — Android ≤14 에서만 효과
getWindow().setNavigationBarColor(android.graphics.Color.parseColor("#050a14"));
new androidx.core.view.WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
        .setAppearanceLightNavigationBars(false);   // 아이콘 밝게
```
- Android 15+ 는 이 호출을 무시(이미 정상) → **레이아웃·인셋·웹 lift 전부 불변**, 부작용 0.
- 기존 안(엣지투엣지 + lift 6→14px)은 폐기 — 하단 인셋으로 여러 번 데인 영역이라
  구형 OS 미관을 위해 감수할 리스크가 아니다.

### 검증 (동봉 시)
- **Android 13~14 실기기/에뮬**에서 내비바가 앱 배경색으로 이어지는지
- Android 15+ 기기에서 아무 변화 없는지 (무시 확인)

---

## 2. 🟡 셸 인셋 계산 clamp — 세 앱 공통 (우선순위 중, 웹 방어 이미 있음)

### 원인 (실기기 진단으로 확정, 2026-08-06)
`publishInsets()` 의
```java
final int clearBottomPx = screenPx - (loc[1] + wv.getHeight());   // ← 음수 가능
final int bottomDp = Math.round(Math.max(0, barsBottomPx - clearBottomPx) / density);
```
`Math.max(0, …)` 가 **뺄셈 결과**에만 걸려 있고 `clearBottomPx` 자체는 안 잡는다.
삼성에서 `getDisplayMetrics().heightPixels` 가 시스템 바를 **제외한** 높이(2195)를 주고
웹뷰는 엣지투엣지라 2400 → `clearBottomPx = −205` →
`126 − (−205) = 331` → `331 / 2.625 = 126dp`.
**내비바 48dp 를 126dp 로 부풀려** 게시했고, 웹의 `max(env, floor)` 가 그걸 채택해
UC 탭바가 140px 떠 있었다.

### 조치 — 세 앱 MainActivity 전부
```java
final int clearBottomPx = Math.max(0, screenPx - (loc[1] + wv.getHeight()));
final int clearTopPx    = Math.max(0, loc[1]);
```
경로:
- `android/app/src/main/java/com/signumhq/app/MainActivity.java`
- `uc-app/android/app/src/main/java/com/signumhq/undercurrent/MainActivity.java`
- `wim-app/android/app/src/main/java/com/signumhq/wim/MainActivity.java`

### 급하지 않은 이유
웹이 이미 방어한다 — `src/utils/androidBottomInset.ts` 가 셸 값을 믿지 않고
① 웹뷰가 화면보다 확실히 작으면 0 ② `env()` 가 유효하면 그것 우선
③ 그래도 0 이면 셸 값(56dp 초과면 물리 픽셀로 보고 dpr 로 되돌림).
그래도 뿌리는 막아 두는 게 맞다.

---

## 3. 🟢 웹 정리 — 바이너리와 무관, 잊지 말 것
- **하단 정렬 진단 표시 제거** (안드로이드 전용, 임시로 넣은 것)
  - `src/app/[locale]/undercurrent/page.tsx` — `diag` state + 설정 시트 표시
  - `src/app/[locale]/app-view/settings/page.tsx` — `bottomDiag` state + 표시
  - 대표가 «다른 안드로이드 기기에서 더 볼 일 없다»고 하면 그때 제거

---

## 4. 계속 추가할 것
이 문서는 **다음 바이너리의 단일 목록**이다. v1.2에 담을 게 생기면 여기 적는다.


---

## ★ 3. 안드로이드 배너 위치 — 셸이 `clearBottom` 을 같이 게시해야 한다 (2026-08-19)

**증상**: 안드로이드에서 AdMob 배너가 탭바를 36dp 덮었다(아이콘이 가려짐). iOS 는 반대로
32pt 떠서 벌어졌다. 대표가 실기기 스크린샷으로 지적 → 양 플랫폼 실측으로 원인 분리.

**원인**: 플러그인의 마진 «기준선»이 플랫폼마다 다르다(원본 확인).
- iOS `BannerExecutor.swift` → `toItem: view.safeAreaLayoutGuide, attribute: .bottom`
- Android `BannerExecutor.java` → 컨테이너(=화면) 바닥. 엣지투엣지라 내비바 «아래»까지.

iOS 는 웹에서 완전히 고쳤다(세이프에어리어 이중 차감 제거, 158pt → 131.7pt 실측).
**안드로이드는 웹에서 고칠 수 없다.** 배너는 화면 기준인데 탭바는 WebView 기준이고,
「WebView 바닥이 화면 바닥에서 뜬 거리」를 웹이 알 방법이 «전부» 막혀 있다(에뮬 CDP 실측):

```
env(safe-area-inset-bottom) 0 · screenY 0 · screen.availHeight == screen.height
--sig-bottom-floor 0 · innerH 815 vs screenH 915
```

`MainActivity.publishInsets()` 는 이렇게 게시한다:
```java
clearBottomPx = Math.max(0, screenPx - (loc[1] + wv.getHeight()));   // = 126px (48dp)
bottomDp      = Math.round(Math.max(0, barsBottomPx - clearBottomPx) / density);  // = 0
```
즉 「콘텐츠가 «추가로» 비울 양」을 게시한다. 웹뷰가 이미 인셋돼 있으면 0 이 **맞는 값**이다.
배너에 필요한 건 그 `clearBottomPx` **자체**인데 계산만 하고 버린다.

### 할 일 — 세 앱 MainActivity 공통, 한 줄

```java
final int outsideDp = Math.round(clearBottomPx / density);
// ... publishInsets() 의 js 문자열에 한 줄 추가:
"d.style.setProperty('--sig-bottom-outside','" + outsideDp + "px');"
```
(UC 는 `--uc-bottom-outside`, WIM 은 `--wim-bottom-outside`)

**웹은 이미 준비돼 있다.** `services/adManager.ts` 의 `androidOutsideGapPx()` 와
`undercurrent/ads.ts` 의 `resolveMargin()` 이 이 변수를 «있으면 우선» 쓰고,
없으면 `min(screen−inner, 56)` 로 근사한다. 셸이 값을 주기 시작하면 근사는 자동으로 꺼진다.

⚠️ 근사는 과대추정이라 배너가 살짝 «뜬다». 과소추정하면 탭바를 «덮는다».
   덮는 쪽이 기능 손상이라 뜨는 쪽으로 실패하게 뒀다 — 되돌리지 말 것.


### 3-B. Android 15+ 는 «플러그인 버그»가 따로 있다 — patch-package 로 고친다

`node_modules/@capacitor-community/admob/android/.../banner/BannerExecutor.java`:

```java
// set Safe Area only for Android 15+
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {   // API 35+
    rootView.setOnApplyWindowInsetsListener((v, insets) -> {
        ...
        mAdViewLayoutParams.setMargins(0, 0, 0, bottomInset);   // ★ 우리 margin 을 «지운다»
        mAdViewLayout.setLayoutParams(mAdViewLayoutParams);
        return insets;
    });
}
...
int densityMargin = (int) (adOptions.margin * density);
mAdViewLayoutParams.setMargins(margin, densityMargin, margin, densityMargin);
```

인셋 리스너가 나중에 발화하면서 `margin` 을 `bottomInset` 으로 덮어쓴다. 그래서
**Android 15+ 에서는 margin 을 무엇으로 주든 배너가 같은 자리(≈100dp)에 앉아 탭바를 덮는다.**
실측으로 확인했다(에뮬 API 35): margin 94 → 96dp, margin 134 → 102dp, margin 300 → 배너 소멸.
업스트림 이슈 = capacitor-community/admob#390 (열려 있음, 수정본 없음).
≤14 에는 이 분기가 없어 margin 이 정상 동작한다 — 대표 기기(13)와 내 에뮬(15)이 달랐던 이유.

**패치 (patches/@capacitor-community+admob+8.0.0.patch 에 추가)**

```java
-            // set Safe Area only for Android 15+
+            final int densityMargin = (int) (adOptions.margin * density);   // ← 리스너보다 «먼저» 계산
             if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                 ...
-                        mAdViewLayoutParams.setMargins(0, 0, 0, bottomInset);
+                        mAdViewLayoutParams.setMargins(0, 0, 0, bottomInset + densityMargin);
```
(아래쪽 `int densityMargin = ...` 선언은 중복이 되므로 제거)

⚠️ 네이티브라 웹 배포로 안 나간다. 이 패치가 들어간 바이너리가 라이브가 되기 전까지
   Android 15+ 사용자는 배너가 탭바를 덮는다. 우선순위 높음.

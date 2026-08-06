# SIGNUM v1.2 — 다음 바이너리에 담을 것

작성 2026-08-06 · 상태 **대기 (iOS v1.1 심사 결과 이후 착수)**
선행 문서: `SIGNUM_V1.1_BINARY_ASSEMBLY.md` (v1.1은 이미 제출·심사 중)

## ★ 제출 방침 — 대표 지시 2026-08-06
> "안드로이드는 승인이 빠른데 iOS는 느리다. **동시에 내는 게 관리하기 좋다.**"

**앞으로 SIGNUM 바이너리는 한쪽만 먼저 올리지 않는다.**
iOS v1.1 결과가 나온 뒤, 다음 묶음을 **양 스토어 같은 날** 제출한다.

---

## 1. 🔴 안드로이드 하단 «흰 줄» 제거 — 네이티브 전용 (웹으로 불가)

### 증상
다크 UI인 SIGNUM 하단에 흰 띠가 보인다. UC·WIM은 안 보인다.

### 원인 (실측)
```
안드로이드 시스템 내비게이션 바   (250, 250, 250)   ← 세 앱 전부 동일
SIGNUM 바로 위 앱 화면          (  7,  11,  19)   → 흰/검 경계가 그대로 보임
UC     바로 위 앱 화면          (233, 233, 234)   → 흰/흰이라 안 보임
```
**우리 레이아웃 문제가 아니다.** 같은 시스템 바가 다크 UI 위에서만 눈에 띈다.
내비바는 **웹뷰 바깥**이라 CSS·JS가 못 닿는다 → 네이티브에서만 해결.

### 조치 — `android/app/src/main/java/com/signumhq/app/MainActivity.java`
```java
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

// onCreate() 안, super.onCreate() 직후
WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
        .setAppearanceLightNavigationBars(false);   // 내비 아이콘을 밝게
```
⚠️ targetSdk 35+ 는 `android:navigationBarColor` 를 **무시**한다. styles.xml 로 색을
지정하는 방식은 쓰지 말 것. 위 조합이 정답.

### 동반 조정 (웹, 같은 시점에 배포)
엣지투엣지가 되면 웹뷰가 내비바 아래까지 그리게 되어 하단 계산이 바뀐다.
`src/styles/native-app.css` 의
```css
html.native-android .app-viewport { --app-tabbar-lift: 6px; }
```
를 **14px** 로 올린다 (WIM 기준 = 대표가 «가장 이상적»이라 판정한 값).
지금 6px 인 이유는 웹뷰가 내비바 «위»에서 끝나기 때문이다.

### 검증
- 실기기(삼성) 3버튼 · 제스처 내비 둘 다
- 하단 띠가 앱 배경색과 이어지는지, 탭바가 WIM과 같은 높이인지
- **에뮬레이터만으로 판정하지 말 것** — 이 문제는 에뮬에서 재현이 안 된다

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

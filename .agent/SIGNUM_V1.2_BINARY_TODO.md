# SIGNUM v1.2 — 다음 바이너리에 담을 것

작성 2026-08-06 · 상태 **대기 (iOS v1.1 심사 결과 이후 착수)**
선행 문서: `SIGNUM_V1.1_BINARY_ASSEMBLY.md` (v1.1은 이미 제출·심사 중)

## ★ 제출 방침 — 대표 지시 2026-08-06
> "안드로이드는 승인이 빠른데 iOS는 느리다. **동시에 내는 게 관리하기 좋다.**"

**앞으로 SIGNUM 바이너리는 한쪽만 먼저 올리지 않는다.**
iOS v1.1 결과가 나온 뒤, 다음 묶음을 **양 스토어 같은 날** 제출한다.

---

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

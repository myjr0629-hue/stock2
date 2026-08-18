# 릴리스 런북 — SIGNUM 1.2 · Undercurrent 1.0.2 (2026-08-18)

**이 릴리스의 «유일한 이유»**: 애드몹 앱 ID 가 바이너리 안에 있어서 웹으로 못 바꾼다.
지금 스토어의 앱들은 **폐쇄된 회사 계정**의 앱 ID를 들고 있어, 유닛만 켜면
앱 ID(구 게시자) ↔ 유닛 ID(신 게시자)가 어긋나 광고가 채워지지 않는다.

**WIM 은 이번에 안 낸다.** 광고 모듈이 코드에 연결돼 있지 않고(아무도 import 안 함),
안드로이드 설치가 9건이라 수익 기대가 0에 가깝다. 앱 ID·ATT 문자열은 이미 코드에
들어가 있으니 다음에 다른 이유로 낼 때 같이 나간다.

---

## 담긴 것

| | SIGNUM 1.2 (vc3) | UC 1.0.2 (vc4) |
|---|---|---|
| 애드몹 앱 ID | `…9554397112094712~1354734212` | `…9554397112094712~7167861342` |
| clearBottom 음수 clamp | ✅ | ✅ |
| 내비바 색상(Android ≤14) | ✅ | — (밝은 앱이라 불필요) |
| 광고 실제 노출 | ❌ 꺼진 채로 나간다 | ❌ 꺼진 채로 나간다 |

**광고는 이 바이너리에서 안 나온다.** `REAL_UNIT_IDS` 가 null 이라 `adsAllowed()` 가 막는다.
스토어 승인 후 «웹 배포 한 번»으로 켠다. 그래서 미리 내보내도 안전하다.

---

## ① 안드로이드 — **AAB 는 이미 빌드·검증 완료**

```
dist/2026-08-18/SIGNUM-1.2-vc3.aab          16MB
dist/2026-08-18/Undercurrent-1.0.2-vc4.aab  7.0MB
```
빌드 검증: AAB 안의 매니페스트를 직접 열어 **새 앱 ID**와 **versionName** 확인, 서명 확인.

**대표님이 할 것 — Play Console 업로드**

SIGNUM:
```
https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116/app-dashboard
→ Test and release → Production → Create new release
→ App bundles 에 SIGNUM-1.2-vc3.aab 업로드
→ Release notes: 아래 문구 붙여넣기
→ Next → Save → Review release → Start rollout to Production
```
Undercurrent:
```
https://play.google.com/console/u/0/developers/4769683602295618218/app/4976096296089482490/app-dashboard
→ 같은 절차, Undercurrent-1.0.2-vc4.aab
```

**릴리스 노트 (3개국어 공통, 그대로 붙여넣기)**
```
en: Stability and layout fixes for Android navigation bars. Internal updates.
ko: 안드로이드 내비게이션 바 관련 레이아웃·안정성 개선. 내부 업데이트.
ja: Androidナビゲーションバー周りのレイアウト・安定性の改善。内部アップデート。
```
> 광고를 «아직» 안 켜므로 노트에 광고를 적지 않는다. 켤 때는 앱 업데이트가 아니라
> 웹 배포라 노트가 없다 — 방침·스토어 선언이 그 역할을 한다.

---

## ② iOS — 대표님 Xcode 에서만 가능

이 머신에는 **Apple Development 인증서만** 있고 배포 인증서·프로비저닝 프로파일이
없어 아카이브가 불가능하다. 대신 **Release 컴파일은 두 앱 다 통과**시켜 뒀으므로
(`** BUILD SUCCEEDED **`) 아카이브가 코드 문제로 막힐 일은 없다.

```
① Xcode 로 열기
   open /Users/eunhoon/.gemini/antigravity/scratch/stock2/ios/App/App.xcodeproj
② 상단 기기 선택기를 «Any iOS Device (arm64)» 로
③ Product → Archive
④ Organizer 창 → Distribute App → App Store Connect → Upload
⑤ 2FA 코드 입력
⑥ UC 도 동일: uc-app/ios/App/App.xcodeproj
```

**업로드 후 App Store Connect 에서**
```
ASC → 앱 → «+ 버전 또는 플랫폼» → 1.2 (UC 는 1.0.2)
→ 빌드 선택 → «이번 버전의 새로운 기능» 에 위 릴리스 노트
→ 심사에 제출
```

### ⚠️ WIM 마케팅 URL — **다음에 WIM 을 낼 때** 같이
현재 애플의 WIM 마케팅 URL 이 `https://www.signumhq.com/en/wim` 인데 베어 도메인이어야
`app-ads.txt` 크롤이 붙는다. 출시된 버전에서는 잠겨 있어 새 버전 페이지에서만 고칠 수 있다.
en/ko/ja 각 로케일의 **마케팅 URL** 만 `https://www.signumhq.com` 으로. 개인정보처리방침 URL 은 그대로.

---

## ③ 승인된 다음 — 내가 하는 것 (웹 배포 한 번)

```
1. 스토어에서 새 버전이 «실제로» 라이브인지 확인 (버전 문자열로)
2. config/admob.ts 의 REAL_UNIT_IDS 를 UNITS_2026_08_18 로 교체
3. UC 의 ADS_LIVE → true
4. 배포 → 콜드스타트 실화면으로 배너 확인
```
같은 배포에서 UC·WIM 개인정보처리방침이 «광고 있음»으로 자동으로 바뀐다
(`hasRealUnits()` 에 묶여 있음).

**그 직전에 대표님이 콘솔에서 하실 것 — UC 만**
```
UC → App content → Actioned → Ads → Manage → «Yes, my app contains ads»
UC → App content → Actioned → Data safety → Manage → Device or other IDs 수집 추가
```
> 지금 미리 하면 안 된다. 광고가 안 나오는데 «광고 포함» 배지만 붙어 사실과 어긋난다.
> SIGNUM 은 Device or other IDs 가 이미 선언돼 있어 손댈 게 없다(실측 확인).

---

## 콘솔 경로 메모 (세 번 헤맸다)
```
App content = Monitor and improve → Policy and programs → App content
              (Test and release 아래가 «아니다». 직접 URL 은 앱 목록으로 튕긴다)
```

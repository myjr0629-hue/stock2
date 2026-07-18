# PORTFOLIO STATUS BOARD — SIGNUM / UC / WIM (2026-07-15, Mac)

> 한눈 상태판. 상세는 각 정본 문서 참조. 양머신 공유(Windows=마케팅콘솔 / Mac=총괄+앱관리+직접아웃리치 콘텐츠).
> 갱신 시 날짜 + 커밋해시.

## 배포 상태 (실측)
| 앱 | iOS | Android | 광고 | 수익 |
|---|---|---|---|---|
| SIGNUM | ✅ 라이브 | ✅ 라이브 | 실ID·계정미승인=no-fill | $0 |
| UC | ✅ 라이브 | ✅ **라이브(7/15)** | 휴면(ADS_LIVE=false) | $0 |
| WIM | 웹만 | 웹만 | inert | $0 |
- 설치(2026-07-15): SIGNUM iOS ~10 / Android ~0. 콜드스타트. 리스팅 전환 30%(건강) → **병목=트래픽(노출)**.
- `?from=` 유입측정 = 라이브(커밋 08fb2928). health 피드 = 그린.

## 1) 앱 작업 — 업데이트 없이 (웹, 즉시)
- **SIGNUM↔UC 크로스링크** — ✅ **배포 완료**: 설정 화면 UC 카드 + `/app-uc` 스마트링크(`?from=signum_app`) + 맥락링크(뉴스펄스→UC `?from=signum_news` / UC심층레이어→SIGNUM `?from=uc_ticker`). **UC Android 라이브(7/15) → 카드 게이트 해제, 전 플랫폼 표시.** 비대칭 준수(UC→SIGNUM 최소).
- **맥락 상호링크**: SIGNUM 뉴스→UC 스토리(`?open=T`) / UC 티커→SIGNUM 구조(`cmd ?t=T`, **최소**) — [미착수]
- ⚠️ **단방향 원칙**: UC→SIGNUM **하우스카드 금지**(대중→프로 = 1성리뷰). 상세 `UC_GROWTH_PLAN.md §5`.
- 앱-투-앱 딥링크: 스토어폴백=웹 / 앱바로열기=네이티브(업데이트).
- 알려진 웹 버그 = 0.

## 2) 앱 작업 — 업데이트 필요 (바이너리)
### SIGNUM v1.1 — 정본 `SIGNUM_V1.1_BINARY_ASSEMBLY.md`
별점 · textZoom=100 · safe-area 플러그인 · **IAP 구독 $9.99/mo** · 푸시 콜드스타트 확인 · ASO 키워드.
🔒 게이트 = RevenueCat 마무리 + 실기기 테스트.
### UC 1.0.1 — 정본 `UC_1.0.1_ASSEMBLY.md`
**AdMob 활성화** · textZoom · safe-area · 푸시(권장). 이미:별점 ✅. 스킵:IAP.
🔒 게이트 = AdMob 계정 승인 + UC Android 라이브.
> ★ textZoom + safe-area = **두 앱 공통** → 같이 구현.

## 3) 홍보 — 정본 `UC_GROWTH_PLAN.md` + `MARKETING_ACTIVE_OUTREACH_PLAN.md`
> ★ **규칙: 돈 드는 홍보(창작자 스폰서·유료광고)는 AdMob 수익 붙은 다음.** 그 전엔 무료만.
### 무료 · 지금 (저노력·바이너리 무관)
- ✅ **자동 트래픽 엔진 #1 = LIVE** (c11eacc3): `robots.txt`+`sitemap.xml`(없었음→신설) + `/[locale]/flow/[ticker]` SEO/GEO 페이지(30티커×3언어·머니데이터+괴리+FAQ JSON-LD+설치CTA `?from=seo`·시간당 ISR·앱UI 무관). 실화면 검증됨(NVDA 46%/$200/$215/$180). 정본=`AUTOMATED_TRAFFIC_ENGINE.md`. ⏳**사용자 액션: sitemap을 Google Search Console 제출**(색인 가속). 다음: 티커 확장 + 엔진 #2(공유카드)·#3(뉴스레터).
- 괴리 숏폼 자동엔진(**오가닉**, Remotion ~$0.02/편) · 괴리카드 SEO/공유 · UC 스토어 스샷#1=괴리카드+"same engine" 라인 · SIGNUM→UC 소프트카드 · SIGNUM 원앤던(창업서사·PH·디스콰이엇) · (창작자 60초 스크립트/브리프 **미리 작성=무료**)
### 유료 · AdMob 수익 후
- 창작자 스폰서십(예산) · ASA(News 키워드) · UAC
### 대기/외부
- SIGNUM 자동화콘솔(Windows) · ~~레딧=파킹~~

## 4) 수익 — 외부 대기 (대표님 콘솔)
- **AdMob 재신청**(세금승인→프로필→재신청) = SIGNUM 즉시 + UC(1.0.1 후) **양쪽 광고 열쇠**.
- 백업: 계속 거절 시 AppLovin MAX(애드몹 없이 수익화 가능).

## ▶ 완료 (2026-07-16)
- ✅ **UC App Store 피처링 요청 제출** (7/16~9/16 창, 관련앱 연결, 애플 검토 중).
- ✅ **딥리서치: 마케팅 타이밍/시퀀스 검증** → 정본 `LAUNCH_KIT.md §7`.
- **핵심 교정**: 시딩은 며칠 X → **4~6주(최소 30일)**. 원앤던은 시딩 후 발사(진공에 쏘면 낭비). 무료 마케팅 지금 시작(애드몹 무관), 유료는 수익 후.

## ▶ 내일 시작점 (2026-07-17)
1. **SIGNUM 피처링 요청** — UC와 같은 방식, 단 프로/데이터 각도 피치 별도(내가 작성). ASC에서 대표님 제출.
2. **콜드스타트 시딩 시계 START** (게이팅=계정 나이). 앱별 좁은 청중 1개 + 주1편 + Reddit 가치우선(신뢰 베이스라인 30일+/카르마200~500). 정본 `LAUNCH_KIT.md §7` 90일 순서.
3. **런치 초안 완성** — 대표님 "왜 만들었나" 한 줄 받으면 → 창업서사 en/ko/ja + UC(디스콰이엇/PH/note) + SIGNUM(디스콰이엇/Qiita/Zenn) 9개 완성.
4. **애드몹 교착** — 세금 W-8BEN vs W-9(US LLC) **회계사 확인**이 유력 원인. 그 전엔 재제출 X. 백업=AppLovin MAX.
5. **SEO 관찰** — GSC 색인/노출(자동 복리, 며칠~주).
6. **미해결(리서치 공백)**: KR/JP 커뮤니티 검증 실패 → 직접 가입해 규칙 확인 후 착수. 크로스앱 리퍼럴/괴리 공유카드 루프 = 전술 미확정.

## 정본 문서 인덱스
- `AUTOMATED_TRAFFIC_ENGINE.md`(트래픽 아키텍처) · `LAUNCH_KIT.md`(런치 초안) · `SIGNUM_V1.1_BINARY_ASSEMBLY.md` · `UC_1.0.1_ASSEMBLY.md` · `UC_GROWTH_PLAN.md` · `MARKETING_ACTIVE_OUTREACH_PLAN.md`(SIGNUM 직접아웃리치) · `MARKETING_AUTOMATION_PLAN.md`(Windows, 오가닉소셜) · `MARKETING_ENGINE_REBUILD.md`(콘솔 빌드상태)

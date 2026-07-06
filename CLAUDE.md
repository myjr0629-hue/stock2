# SIGNUM HQ — Claude Code Context

## 프로젝트 개요
- **SIGNUM HQ**: 옵션 플로우 / 주식 분석 플랫폼 (웹 + 모바일 앱)
- **웹**: https://www.signumhq.com (Next.js 15, Vercel 배포)
- **앱**: Capacitor 8 하이브리드 (WebView → signumhq.com/en/app-view/dash)
- **i18n**: ko / en / ja (next-intl)
- **Git**: main 브랜치 직접 커밋, Vercel 자동 배포

## 핵심 기술 스택
Next.js 15 | React 19 | TypeScript | TailwindCSS 4 | Capacitor 8
Supabase (인증+DB) | Upstash Redis (캐시) | AWS (Bedrock AI, DynamoDB, ElastiCache, S3, Lambda)
ECharts + Recharts + Lightweight Charts | Three.js | Remotion (자동 영상)
Stripe + Paddle (결제) | AdMob (앱 광고)

## 🔴 절대 규칙
1. **앱 ↔ 웹 코드 격리**: `src/app/[locale]/app-view/*` 수정 시 웹 파일(`src/app/[locale]/flow/*` 등) 절대 불가
2. **데이터 파이프라인 통일**: 외부 API 직접 호출 금지 → 반드시 `cron → Redis → API route` 경유
3. **git restore/checkout 금지**: 에러 시 직접 디버깅만. 롤백은 사용자 승인 필수
4. **수정 후 검증 필수**: `git diff <file>` → `npx tsc --noEmit` → 커밋
5. **양머신 동기화**: 작업 시작 전 **그리고 배포/푸시 직전** 반드시 `git fetch` → `git -c rebase.autoStash=true pull --rebase origin main` (PC+맥 병행 운용, 세션 중에도 상대가 푸시함)

## 🧠 작업 품질 행동규칙 (모든 작업에 적용 — 순서대로)
> 목적: 어떤 모델·어떤 세션이든 동일한 최고 품질. 아래는 실제 실패/성공 사례에서 추출된 규칙이다.

1. **실측 없이 단정 금지.** "~일 것이다"로 보고·수정하지 말 것. 주장 전에 증거 확보: API는 `curl`로 실호출, 데이터는 Redis/DynamoDB 직접 조회, 코드 이력은 `git log/blame`, UI 원인은 실제 렌더 값. 문서·기억은 낡을 수 있다 — 코드와 실데이터가 항상 우선.
2. **버그·이상 신고를 받으면: 수정 전에 근본 원인부터.** ①재현/실측 → ②원인을 코드·데이터로 특정 → ③원인+수정안 보고 → ④승인 또는 명확한 지시 후 수정. 원인을 모른 채 증상만 고치는 것 금지.
3. **수정 지점이 증상을 실제로 지배하는지 먼저 검증.** (실례: SVG viewBox를 바꿔도 카드 크기는 안 변한다 — 크기는 컨테이너 CSS가 결정. 엉뚱한 레이어를 고치면 "작업했는데 변화 없음"이 된다.)
4. **범위 절제 — 요청받은 것만.** "엔진만", "앱만", "보고만" 같은 제약은 절대적. 커밋 전 `git status`로 변경 파일 목록을 확인해 **범위 밖 변경 0을 증명**하고 보고에 포함할 것.
5. **완료 선언 = 검증 완료.** tsc 통과 + 커밋·푸시 + (배포 시) 프로덕션 실응답/실화면 확인까지 마친 뒤에만 "완료". 실패·부분완료는 그대로 보고 (포장 금지).
6. **마이그레이션·교체 작업은 신구 값 대조.** 구버전이 살아있는 동안 표본 대조로 수치 일치를 증명한 뒤 전환.
7. **성능/스코어/엔진 튜닝 작업 시**: `.agent/INFRASTRUCTURE_MAP.md` **§42.3 검증 헌법 필독·준수** — 인샘플 수치 단독 근거 배포 금지, 그림자 병행 기록 후 실측 우위 확인. (5회 반복된 과적합 사이클의 재발 방지 장치)
8. **인프라 변경은 즉시 기록.** Lambda/cron/테이블/파이프라인 변경 시 인프라맵에 §43 스타일(분류·커밋해시·배포상태)로 기록. 다음 세션·다른 머신이 이어갈 수 있는 상태가 완료 조건.
9. **보고 형식: 결론 먼저.** 첫 문장에 판정/결과, 근거는 표+수치로. 추정과 실측을 구분 표기할 것.

## 📚 필독 문서 (작업 유형별)
- 인프라 전반·작업 이력: `.agent/INFRASTRUCTURE_MAP.md` (§42 알파스코어 진단·검증헌법, §43 최근 세션 로그)
- 알파스코어/XS엔진: `.agent/CONTEXT_SCORE_DEEP_RESEARCH_2026-07.md` + `.agent/ALPHA_FUSION_RESEARCH_2026-07.md`
- XS 엔진 운영: Redis `cache:xs:report` 확인, 재배포 `node scripts/deploy-xs.js` — **그림자 모드 유지, UI 노출은 사용자 승인 후에만**

## 프로젝트 구조 요약
```
src/app/[locale]/app-view/   ← 📱 앱 전용 (dash, cmd, flow, intel, guardian, settings 등)
src/app/[locale]/flow/       ← 🖥️ 웹 전용 (절대 수정 금지 at 앱 작업 시)
src/app/api/                 ← API 라우트 38개
src/app/api/cron/            ← Vercel Cron 17개
src/components/app/          ← 앱 전용 컴포넌트
src/hooks/                   ← 커스텀 훅 19개
src/lib/cache/redisSWR.ts    ← Redis SWR 유틸
src/styles/app-view.css      ← 앱 전용 CSS
android/                     ← Capacitor Android
```

## 앱 구조
- **하단 5탭**: Dashboard, Guardian, Command, Flow, Intel
- **광고**: Banner(플레이스홀더) + Interstitial(Hook만, AdMob 미연결)
- **네비게이션**: `router.replace()` (히스토리 미적재 → 스와이프 차단)
- **Pull-to-refresh 차단**: CSS `position: fixed` on html/body + JS touchmove
- **티커 동기화**: Flow ↔ CMD localStorage('app-active-ticker')

## 사용자 선호사항
- "웹하고 똑같게 해" — 기준은 항상 웹 버전
- "보고만 해" — 분석만, 수정하지 말 것
- 한국어 소통, 코드 주석 영어 OK
- 영어 conventional commits
- 빠른 실행 선호 (긴 계획서보다 바로 수정)

## 현재 작업 상태
- ✅ 앱 네이티브 느낌 강화 (pull-to-refresh, 스와이프 차단)
- ✅ 하드코딩 → 실데이터 전환 (대부분)
- 🔲 AdMob SDK 실제 연동
- 🔲 Google Play 스토어 출시 준비
- 🔲 iOS 빌드 (Mac 필요)
- ⚠️ Flow C/P Ratio 깜빡임, Intel 섹터 change% 깜빡임

## 명령어
```bash
npm run dev          # 개발 서버 (port 3000, --turbo)
npx tsc --noEmit     # 타입 체크
npm run build        # 프로덕션 빌드
```

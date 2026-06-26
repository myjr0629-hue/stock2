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

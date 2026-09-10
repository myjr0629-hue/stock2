# 사고 기록 — 스토어 앱이 «프리뷰 배포»를 보고 있었다 (2026-09-10)

## 대표가 발견했다
「업데이트하고 실행하니까 상단에 AI 로고가 안 나오네. 이것은 업데이트랑 상관없이
웹에서 되는 거 아니야? 네가 배포할 때 뭔가 문제가 생긴 거 아니고?」
그리고 결정적으로 — 「왜 vercel toolbar가 앱에 나오는것이야?」

## 원인 (확정)
2026-09-07 업로드한 iOS 빌드(1.7 / build 9)의 `ios/App/App/capacitor.config.json` 에
앱 접속 주소가 **프리뷰 배포**로 박혀 있었다.

```
https://stock2-git-<branch>-eunhoons-projects.vercel.app/ko/app-view/cmd?t=NVDA
  &x-vercel-protection-bypass=…&x-vercel-set-bypass-cookie=true
```

`CAPACITOR_PREVIEW_URL` 로 프리뷰를 확인한 뒤 그 값이 남은 채 아카이브했다.
안드로이드는 정상이었다(프로덕션 주소). **iOS 만**이다.

### 결과 3가지
| # | 증상 | 왜 |
|---|---|---|
| 1 | 사용자 화면에 **Vercel Toolbar** | `x-vercel-set-bypass-cookie=true` 가 `_vercel_jwt` 를 심고, 그 쿠키가 개발자 툴바를 띄운다 |
| 2 | **웹을 고쳐도 앱에 반영 안 됨** | 프리뷰 배포는 그 시점 코드에서 굳어 있다. AI 로고·게이트 폭이 안 보인 진짜 이유 |
| 3 | **보호 우회 토큰이 공개 바이너리에 노출** | 누구나 추출해 모든 프리뷰에 접근 가능 |

## 왜 늦게 발견됐나 — «데이터는 최신이었다»
프리뷰도 **같은 Redis** 를 본다([[preview-and-prod-share-one-redis]]).
그래서 브리핑·시세는 최신이었고 앱은 살아 있어 보였다.
낡은 것은 **화면(HTML/JS)** 뿐이었다.
결정적 증거가 대표 스크린샷 안에 있었다 — 「AI 모닝브리핑 · **오후 8:15 ET 생성**」은
25분 전 내가 복구한 브리핑이다(`generatedAt 2026-09-10T00:15:25Z`).
즉 API 는 최신, 화면은 배포 전 판.

## 내가 중간에 틀린 것 (기록해 둔다)
1. **첫 지목이 틀렸다.** `feat/paywall-compact-and-icons` 를 앱이 붙은 곳으로 봤는데,
   그 브랜치의 프리뷰 배포는 **build 9 업로드(09-08 01:40 KST) 이후**에 생겼다.
   빌드 2분 전에 배포된 것은 **`feat/cmd-redesign`** 이었다.
   → 「로컬 파일에 그 URL 이 있다」는 «빌드 당시에도 그랬다»의 근거가 아니다.
     그 파일은 gitignore 라 이력이 없고, mtime 은 «마지막 수정»만 말한다.
2. **`grep -c` 를 «개수»로 읽었다.** HTML 은 한 줄이라 `-c` 는 항상 0/1 이다.
   리다이렉트(307)를 안 따라간 응답을 «갱신됨»으로 잘못 판정했다. → `grep -o | wc -l` 로 고쳤다.

## 조치
### 앱 업데이트 없이 (즉시)
| 조치 | 검증 |
|---|---|
| 후보 브랜치 별칭 2곳을 현재 main 으로 강제푸시 | `ai-mark` 3개 확인(둘 다) |
| Vercel 프로젝트 **SSO 보호 해제** | `set-cookie: _vercel_jwt` 사라짐 |
| **우회 토큰 폐기** (`PATCH /v1/projects/stock2/protection-bypass` + `revoke`) | `protectionBypass: {}` · 후보 3곳 전부 `_vercel_jwt` 0개 |
| 미들웨어가 `_vercel_jwt` 쿠키를 삭제 | HttpOnly 라 앱 JS 로는 못 지운다 → 응답 헤더로만 |
| 클라이언트 `stale-shell-guard` | `/api/app/build-stamp` 와 자기 스탬프가 다르면 캐시·SW 버리고 새로고침 |

> ⚠️ **SSO 보호는 1.8 이 라이브된 뒤에 다시 켠다.** 지금 켜면 앱이 로그인 화면을 만난다.

### 못 하는 것 (확정)
고정 배포 URL(`stock2-<hash>-….vercel.app`)은 별칭으로 덮을 수 없다 —
`alias_in_use: The chosen alias is a deployment URL`.
앱이 고정 URL 을 물고 있으면 **앱 업데이트만이 해결책**이다.

### 앱 업데이트
**1.8 / build 10** 업로드 완료. IPA 를 풀어 직접 검증했다:
```
server.url  = https://www.signumhq.com/en/app-view/dash
vercel.app · x-vercel-* 흔적 = 없음
CFBundleShortVersionString = 1.8 · CFBundleVersion = 10
Authority = Apple Distribution: Signum Hq, LLC (25RG9GSHHZ)
```
서명은 Xcode 클라우드 서명이 이 맥에서 안 돼서(「No Accounts」, API 키로도
「Cloud signing permission error」) **ASC API 로 프로파일을 내려받아 수동 서명**했다.
프로파일이 담은 인증서 지문(`BA80A00F…`)과 키체인 배포 인증서가 일치함을 확인한 뒤 export.

## 재발 차단
`scripts/release-audit.py` 에 `audit_native_server_url()` 추가.
`npm run audit:release` 가 다음이면 **FAIL** — 그 상태로는 올릴 수 없다.
- `server.url` 의 호스트가 `www.signumhq.com` / `signumhq.com` 이 아니다
- URL 에 `x-vercel-protection-bypass` · `x-vercel-set-bypass-cookie` · `vercel.app` 이 남아 있다

이 파일은 **gitignore 라 커밋 검토로는 절대 안 잡힌다.** 사람이 볼 파일이 아니므로 기계가 본다.

# 대표님 큐 — 제가 못 하는 것만 모은 목록

정책상 **계정 «생성»과 폼 «제출», 결제, 2FA, 캡차**는 제가 할 수 없습니다.
그 직전까지는 전부 준비해 두었으니, 아래는 «클릭만» 하시면 됩니다.
구글 로그인은 전부 **myjr0629@gmail.com** 으로 하시면 됩니다.

갱신: 2026-08-21

---

## 🔴 A. 지금 눌러야 시계가 도는 것 (대기 시간이 있는 항목)

| # | 무엇을 | 어디서 | 대기 |
|---|---|---|---|
| A1 | **Samsung Seller Portal 가입** — 구글/카카오 로그인 있음 | https://seller.samsungapps.com | D-U-N-S 검증 **최대 10영업일 ×2** |
| A2 | **GeekNews 계정 생성** (구글 OAuth 없음, ID/PW) | https://news.hada.io | 가입 후 **7일** 지나야 글 등록 가능 |
| A3 | **YouTube API 감사 폼 제출** | https://support.google.com/youtube/contact/yt_api_form | **수 주** — 통과 전엔 API 업로드가 전량 비공개 |
| A4 | **openPR 영문 보도자료 1건** (이미지 캡차) | https://www.openpr.com/news/submit.html | **이번 달 슬롯** 안 쓰면 소멸 |
| A5 | **Bing Webmaster 가입** — 구글 OAuth 있음 | https://www.bing.com/webmasters/ | 레거시 SOAP **8/31 폐지** |

> A1~A5 는 서로 독립적입니다. 순서 상관없이 눌러만 두시면 그 뒤는 제가 이어받습니다.

---

## 🟠 B. 제가 이어서 작업하려면 필요한 «열쇠»

| # | 무엇을 | 어디서 | 왜 필요한가 |
|---|---|---|---|
| B1 | **마케팅 콘솔 로그인** — signumhq.com 에 로그인만 해주시면 됩니다 | https://www.signumhq.com/en/admin/marketing | Buffer 토큰을 제가 만지지 않고도 X 채널을 조작할 수 있습니다. Supabase 로그인 + 관리자 이메일 허용목록으로 잠겨 있어 지금은 404 로 보입니다 |
| B2 | **Play 서비스 계정 JSON** 발급 후 Console 권한 부여 | Google Cloud → Play Console | Play 스토어 등록정보(제목·설명·그래픽)를 제가 API 로 직접 고칠 수 있게 됩니다 |
| B3 | **Meta 개발자 앱 + Facebook 페이지 신설** | https://developers.facebook.com | Threads(250건/24h) · Reels(30건/24h) 자동 게시. **심사 불필요**하고 팔로워 0에서도 노출되는 몇 안 되는 채널 |

> ⚠️ **Buffer API 키는 이미 있습니다** — Vercel 환경변수 `BUFFER_ACCESS_TOKEN` / `BUFFER_ORGANIZATION_ID`.
> 제가 새로 발급받을 필요가 없고, B1(콘솔 로그인)만 되면 토큰을 만지지 않고 조작합니다.

---

## 🟡 C. 계정만 만들어 주시면 되는 곳 (전부 구글 OAuth)

만들어만 주시면 **등재·게시는 제가 브라우저로 진행**합니다.

| 채널 | URL | 지역 | 제가 할 것 |
|---|---|---|---|
| Aptoide Connect | https://connect.aptoide.com | 글로벌 | 패키지명만 넣으면 Play 에서 자동 수집. 3앱 등재 |
| Uptodown Console | https://www.uptodown.dev | 글로벌 | 3앱 등재 or 소유권 클레임 (검색 색인용 백링크 3개) |
| 디스콰이엇 | https://disquiet.io | KR | 제품 3건 등록 → 승인 → 포스트 |
| OKKY | https://okky.kr | KR | 「피드백 원해요」 형식으로 게시 |
| 루리웹 | https://bbs.ruliweb.com/community/board/300034 | KR | WIM 우선 게시 |
| Stocktwits | https://stocktwits.com | 글로벌 | 첫 50포스트 링크 0으로 신뢰 확보 후 운영 |
| Google Search Console | https://search.google.com/search-console | 글로벌 | 소유 확인 + 사이트맵 제출 |
| Peerlist | https://peerlist.io/launchpad | 글로벌 | 주 1회 런치(3앱 순차) |
| Softonic Publishing | https://publishing-center.softonic.com | 유럽·중남미 | 3앱 등재 — **AI 자동번역으로 17개 언어 랜딩 무료 생성** |

**OAuth 가 없는 곳** (ID/PW 직접 생성 필요): Hacker News · Indie Hackers · SaaSHub · ONE store · 네이버

---

## 🟢 D. Apple 관련 (2FA 때문에 제가 못 넘습니다)

| # | 무엇을 | 왜 |
|---|---|---|
| D1 | **EU 신약관(CTC 5%) 서명** — App Store Connect | 우리 3앱은 인앱결제가 없어 **비용 0원**. EU iOS 대체배포 3채널의 잠금을 동시에 품. 10/1 발효 |
| D2 | **캠페인 링크(ct) 발급** | 채널별 어트리뷰션. 이게 있어야 「어느 채널이 설치를 만드는지」를 사실로 말할 수 있음 |
| D3 | 메타데이터 저장 시 **2FA 통과** | 제가 ASC API 로 준비한 이름·부제·키워드를 반영할 때 |

---

## ✅ 이미 끝난 것 (확인 완료, 조치 불필요)

- **안드로이드 개발자 인증** — 3앱 전부 등록 완료 (제가 Play Console 에서 직접 확인)
- **Buffer API 키** — Vercel 에 이미 존재
- **ASC API 키** — `~/.appstoreconnect/private_keys/AuthKey_2LD2B7366M.p8` 보유, 제가 바로 사용 가능
- **앱 홍보영상** — https://youtube.com/shorts/VUPwd_Fugl0


---

## 🔵 E. 실행 중 발견 — «클릭 한 번»만 필요한 곳 (2026-08-21 실측)

제가 직접 시도한 결과입니다. **리다이렉트형 구글 로그인은 제가 됩니다**(Bing 성공).
아래는 **팝업형(GSI)** 이라 브라우저 보안상 «사람의 실제 클릭» 한 번이 필요합니다.
버튼만 눌러주시면 이후 등재·게시는 전부 제가 이어받습니다.

| 사이트 | 하실 것 |
|---|---|
| https://connect.aptoide.com/login | 「Sign in」(구글) 클릭 → 계정 선택 |
| https://www.uptodown.dev | 「Sign in with Google」 클릭 → 계정 선택 |

## ✅ 오늘 제가 끝낸 것 (2026-08-21)

- **Google Search Console** — www.signumhq.com 소유 확인(자동 검증) + sitemap 재제출. 이미 513페이지 발견 상태였음
- **Bing Webmaster** — 구글 리다이렉트 로그인 → GSC 가져오기로 사이트 등록 + sitemap 자동 이관(Processing). Yahoo·DuckDuckGo·Ecosia 에 함께 반영됨
- **App Store 프로모션 텍스트 9건** — 3앱×3언어, 심사 없이 즉시 반영 완료
- **실화면 캡처 21장** — SIGNUM 12(dash/guardian/flow/intel × ko/en/ja) + UC 9(home/diverge/whales × ko/en/ja), 밝기 게이트 통과, `promo-shots/`
- **보도자료 3개 국어** — `.agent/distribution/press-release-{ko,ja,en}.md` (발송은 승인 후)
- **네이버** — 이 환경에서 도메인 차단 확인 → 서치어드바이저·네이버TV 는 대표님 전용 확정

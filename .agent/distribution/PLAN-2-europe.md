# 유럽·인도·동남아·중남미·대만/홍콩 채널 조사 — 통합 정리

조사 원본은 통과 112건 + 탈락 다수. 동일 채널이 여러 패스에서 중복 등장하며 판정이 엇갈리는 곳이 있어, **아래는 중복 제거 + 판정 충돌 조정본**이다. 조정한 곳은 근거를 함께 적었다. 실측 원문이 없는 항목은 전부 «근거 미확보»로 표기했다.

---

## 0. 먼저 — 채널이 아니라 «게이트»인 것 5개

이 5개를 정리하지 않으면 아래 표의 상당수가 실행 불가이거나 손해다.

| 게이트 | 성격 | 마감/상태 | 영향 범위 |
|---|---|---|---|
| **Google Android Developer Verification** | 하드 데드라인 | **2026-09-30 (오늘 기준 41일)** | BR/ID/SG/TH에서 (a) 자체 APK 배포 (b) GetApps·OPPO·V-Appstore·Palm Store·Galaxy Store (c) Play 밖 전용 배포가 «동시에» 막힌다. 2027+ 글로벌 |
| **Apple 신 EU 약관 (Alternative Terms Addendum)** | 비가역 사업조건 변경 | 서명은 오늘 가능, 10/01 발효 | EU iOS 대체배포 3채널의 «단일 열쇠». 단 EU App Store 수수료 구조 자체가 바뀜 |
| **CONSOB (이탈리아)** | 즉사형 리스크 | 상시 | 3앱 전부 signumhq.com 셸 → **사이트 차단 명령 1건 = 이탈리아에서 3앱 동시 사망** |
| **FCA / Google Ads UK 금융서비스 인증** | 관문(벽 아님) | 상시 | 미인증 상태로 UK 집행 시 **계정 정지** → 3앱 유료유입 동시 마비 |
| **SPK (터키) / CNMV (스페인) / 프랑스 Loi 2023-451** | 표현 규제 | 상시 | 프랑스는 **우리가 대상 아님이 조문으로 확인**됨(CFD/크립토 아님) |

### 게이트 상세 근거

**Google 검증** — `developer.android.com/developer-verification` 1차 출처: 참여 스토어가 Play 하나가 아니다 — "Google Play, HONOR App Market, OPPO App Market, Galaxy Store, Palm Store, V-Appstore, GetApps". 마감 "September 30, 2026", 대상 "certified devices running Android 7+". Play 밖 전용 배포자도 대상("For developers distributing apps exclusively outside of Google Play"). **대상 4개국이 우리 동남아·중남미 타겟과 정확히 겹치는 것은 우연이 아니다.** 취미개발자 트랙만 "without a government-issued ID or registration fee"라고 명시 → 역으로 일반 트랙은 신분증+등록비 요구. **미국 LLC로 등록 가능한지, 대표 개인 신분증이 필요한지는 근거 미확보** — 이번 주에 콘솔을 직접 열어야 한다.

**CONSOB** — 실측 원문: "La Consob ... ha ordinato l'oscuramento di 5 siti internet", AI 지목 문구 "contenuti generati con sistemi di intelligenza artificiale - come immagini, voci o video". 법적 근거 TUF art. 7-octies. **누적 차단 1,723개 사이트(그중 204개 암호자산)** — 1차 조사의 «2026년 32건»보다 위험도가 크다. 우리 핵심 소구점인 «AI 브리핑»이 감독당국에 사기 벡터로 공개 지목된 상태다. → **이탈리아 채널(iSpazio·SmartWorld·StartupNews) 착수 전에 이탈리아어 카피에서 AI·추천 계열 표현을 제거하고 `informazione`/`analisi`/`dati`로 통일하는 것이 선결.**

**FCA PERG 8.4** — 원문 단락까지 특정됨. 8.4.4G의 판정기준은 "Would a reasonable observer ... regard the communication as seeking to persuade or incite the recipient to engage in investment activity". **우리에게 유리한 조항 2개**: 8.4.13G "Historic prices on their own will never be invitations or inducements", 8.4.17G "provided that the tables amount to purely factual information enabling comparison of products they will not be inducements". → SIGNUM/UC의 데이터 화면 자체는 안전지대. 위험한 건 카피다. **사내 «예측형 프레이밍 금지» 규칙을 영국에서는 사내 규칙이 아니라 법적 요건으로 격상해 적용할 것.**

**Google Ads UK** — 1차 판정 «FCA 인가 없으면 불가»는 **오독이었다**. 원문에 면제 카테고리가 명문으로 있다: "Regulation-Exempt Financial Services Providers: Advertisers who promote financial services but are not required to be licensed" 및 "Exempt Non-Financial Services Advertisers". 우리는 브로커도 자문업도 아닌 «시장 데이터/교육»이므로 면제 주장 여지가 실재한다. 다만 제재도 원문 확인됨: "your verification will be revoked, and your account may be suspended".

**SPK (터키)** — 1차 조사의 «형사 리스크» 평가는 **원문 실측 결과 과대평가**였다. 인용 중 "Gerekli lisans ... suç haline geldi"는 SPK PDF 안에 **존재하지 않는다**(2차 출처 문장). 반대로 우리에게 유리한 조항이 원문에 있다(§C.5): 과거 실적·리스크 수준·구성 정보의 사실 제시는 "finansal bilgi sunumu"이며 자문이 아니다. → 채널을 포기할 근거는 없고, «yatırım tavsiyesi değildir» 고지 병기로 해결.

**프랑스** — Loi n° 2023-451 art.4 §V 금지 대상은 "contrats financiers"(CFD/FX)와 크립토 서비스. **우리 3앱은 어느 쪽도 아니다 = 프랑스 채널을 쓸 수 있다는 확인이 이 항목의 산출물.** 벌칙은 1차 보고(1년/30만유로)가 아니라 **2년 징역 + 300,000€ + 직업활동 금지 가능**(§IX).

**MAR 제20조 / MiFID II** — **1차 출처 확증 실패**(EUR-Lex JS 렌더링, ESMA PDF 추출 실패). 법률 자문처럼 인용하지 말 것.

---

## 1. 권역별 채널 표

값 표기: **[설]** 설치 · **[백]** 백링크/검색색인 · **[브]** 브랜드/신뢰
실행 주체: **代** 대표만 가능 · **AI** 에이전트 실행 가능 · **代→AI** 대표가 문 열면 에이전트가 운영

### 1-A. 영국 + 아일랜드

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **Google Ads UK 금융서비스 인증** | EN | **[설]** | **P1** | 代 | 유럽에서 «실제 설치»를 만드는 사실상 유일한 검증 채널. 면제 카테고리 실재. **WIM(교육 퀴즈)으로 면제 신청 먼저 → 판정 확인 전 SIGNUM 집행 금지** |
| Finextra | EN | [백][브] | P2 | AI | `news@finextra.com` 무료 편집 경로 원문 확인. 지리 게이트 0. **독자가 은행·결제 B2B라 설치 ≈ 0**. Company updates 무료 여부 근거 미확보(/about/advertising.aspx 등 전부 소프트404) |
| UKTN | EN | [백][브] | P2→P3 | AI | `editor@uktech.news` 무료, `partnerships@` 유료 분리. **편집 범위가 "UK tech ecosystem"이라 미국 LLC는 구조적으로 밀림** |
| Startups.co.uk | EN | [백][브] | P2 | AI | `hello@`, thought leadership 수용. "we do not accept unsolicited requests for paid guest posts". **독자=소상공인 창업자, 주제 근본 불일치** → 앱 소개로 보내면 버려짐. 각도는 «1인이 앱 3종 운영» |
| Silicon Republic (IE) | EN | [백][브] | P2 | AI | `editorial@siliconrepublic.com` + 기자 개인주소 4개 확보. 국적 제한 문구 없음 |
| r/UKInvesting | EN | [브] | P2 | 代 | R5는 «low-effort» 홍보만 금지 → 리서치 글은 규칙상 통과. **함정 신규 발견: R4 «No ultra-short-term trading» — 0DTE/감마가 여기 걸린다**. R2 때문에 WIM은 부적합. **레딧이 데이터센터 IP 전면 403 → 자동화 불가** |
| Stuff.tv | EN | — | P3 | — | 살아있음(08-20 12:56 BST 실측)이나 소비자 가젯 매거진. 이메일 전부 마스킹 |
| TechRound | EN | — | **P3(탈락급)** | — | **적대적 실측: 무료 경로 5개 URL 전부 404**(/submit-a-startup/, /write-for-us/, /contribute/, /advertise/, /media-pack/). 남은 건 «SEO + PR Services» 유료 목록 = 에디토리얼 외피의 유료 PR 샵 |
| Sifted | EN | — | P3 | — | Cloudflare 403으로 라이브 재검증 불가. 1차 인용 3건이 아카이브에서 **재확인 실패**. 매체 정의가 유럽 스타트업 |
| r/UKPersonalFinance | EN | — | P3 | — | 모더레이터 사전 승인 게이트(미확증) + 주제 불일치(연금·ISA·모기지) |
| Askaboutmoney.com (IE) | EN | — | **탈락** | — | **1차의 «가장 명확한 허용 경로» 판정을 정면 반박.** Rule 28 "strict no advertising policy", Rule 30 "Do not use Askaboutmoney for product announcements". 1차가 근거로 삼은 운영자 답변은 «개인 이용자»에게 한 말 |
| BusinessCloud / TechIreland / Irish Tech News | EN | — | P3 | — | 자격·비용 전부 근거 미확보. Irish Tech News는 컨택 페이지 Cloudflare 403 2회 연속 실패 |

### 1-B. 독일어권 (DE/AT/CH)

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **ifun.de / iphone-ticker.de** | **DE** | [설][백] | **P1** | AI | **유럽 전체에서 검증된 유일한 «개발자 제보 전용» 창구.** 원문: "Du bist Entwickler ... Schreib uns an ifun.de@gmail.com". 생존 실측 "46913 Artikel in ... 9067 Tagen" = 24.8년 일평균 5.2건. **영어 원고 수용 문구는 없음** → 독일어 필수 |
| mobiFlip.de | DE | [백][브] | P2 | AI | `presse@mobiFlip.de` 전용 주소. **Fintech 카테고리가 내비게이션에 실존** — 금융앱 자리가 이미 있음 |
| appgefahren.de | DE | **[설]** | P2 | AI | «Neuerscheinungen»·«Testberichte» 카테고리로 매일 앱 리뷰. 27분 전 글 = 가동률 최상. **독자가 앱 사용자 본인이라 설치가 실제로 나오는 유형** — 단 독일어 UI 없이는 값의 절반 이상을 버림 |
| Apfelpage.de | DE | [백] | P2 | 代 | **1차 정정: «개발자 앱 제출 창구»는 존재하지 않는다.** 무료 라인은 «Tipp/루머»용. 이메일 난독화 `support(ät)` → 자동 발송 불가 |
| Startbase.de | DE | [백] | P3 | 代 | «Firma hinzufügen» CTA 실재. **등록 조건(Handelsregister 요구 여부) 근거 미확보** |
| Startupticker.ch | EN | [백] | P3 | AI | `news@startupticker.ch`, 영어판 + Guest column 존재. **그러나 주 후원자가 Innosuisse(스위스 연방기관)** — 스위스 무관 외국 앱이 실릴 근거 약함 |

**독일어권 종합**: 이 권역은 «문은 다 열려 있는데 언어가 잠그고 있다». ifun.de가 원문으로 «Entwickler»를 초대하는 유일한 채널이라는 사실이 가장 큰 발견이지만, 우리 앱 UI가 영어뿐이라 편집자가 반드시 "nur auf Englisch"를 적게 되고 그 한 줄이 독일 일반 독자의 설치를 크게 깎는다. **독일은 유럽 개인투자자 시장 1위 + 마스토돈 사용자 1위**라 값어치는 최상위이므로, 이 권역이 «독일어 현지화 투자»의 1순위 근거가 된다(6장 참조).

### 1-C. 프랑스 · 베네룩스

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **Communique-de-Presse.com 무료 티어** | **EN 가능** | [백] | **P1** | 代→AI | **1차 조사 오류 정정(2회 독립 재확인).** 무료(0€) 티어에 링크·로고·이미지·기자 뉴스레터·검색색인이 **전부 포함**. PRO(39€)와의 차이는 «즉시 게시 vs 모더레이션 후» + PDF 다운로드 둘뿐. 언어 규정 원문: "peuvent être rédigés en français, **dans une langue étrangère**, ou en version bilingue" → **영어 원고가 규정상 명시 허용되는 유럽 무료 배포처** |
| **iCulture.nl** | **EN 수용 명시** | **[설][백]** | **P1** | AI | 원문에 영어 안내가 병기돼 있다: "Are you a developer of apps or an accessory maker, we'd love to hear from you! Please send your email to redactie@iculture.nl". **유럽에서 «영어로 접촉 가능 + 개발자 제보 명문 초대 + 무료»가 동시에 확인된 사실상 유일한 소비자 앱 매체.** 네덜란드는 영어 수용도 유럽 최상위 |
| **Silicon Canals** | **EN** | [백][브] | **P1** | AI | `editors@siliconcanals.com`. **형식 제한 원문: "only in Word, Google Docs, or inline text" → PDF 프레스킷 금지.** "We're not interested in link exchanges" → SEO 티 나는 원고는 즉시 탈락. 유료 거부 조항도 실재("we do not publish paid placements") |
| Emerce Industry Wire | NL | [백] | P1~P2 | AI | 로그인 없이 무료 셀프서브. spelregels 5개 원문 확보. **주의: "U draagt de publicatierechten ... over aan Emerce"(발행권 이전) + 게재 후 수정 불가.** 이미지 필수. 그날 게시물 전부 네덜란드어 → **영어 원고 수용 여부 근거 미확보** |
| iPhon.fr | FR | **[설]** | P2 | AI | `news[a]iPhon.fr` 공개. "la quantité de mails reçue chaque jour est énorme" + "Pas de publication derrière ? ... nothing personal" → **재촉 금지가 명문화**, follow-up 자동화 금지. 뉴스 제보와 광고 문의가 같은 주소라 홍보 톤이 강하면 영업 건으로 분류됨 |
| Presse-citron | FR | [브] | P2 | AI | `contact(at)` / `sales(at)`. **보도자료 접수 절차·편집 가이드가 페이지에 존재하지 않음** → 일반 문의 주소를 빌려 쓰는 것. 홍보 메일은 sales로 넘어갈 확률 |
| Maddyness | FR | [백] | P2 | AI(폼) | «Envie de nous parler de votre entreprise/projet» 옵션 실재 = 진입로 정당. 공개 이메일 없음(폼 전용). Tribune(기고) 쪽이 현실적 |
| Bloovi (BE) | NL | [브] | P3 | AI | 4개 주소 평문 공개, 뉴스레터 36,069명 실수치. **1차의 «Content partner=유료» 단정은 페이지에 명시돼 있지 않음.** 마케팅·창업 매체지 금융 매체 아님 |
| Numerama | FR | [설] | P3 | 代 | **봇 방어로 이번 실측 실패** → 폼 옵션 근거 미확보. 규제·AI·데이터 앵글이 먹히는 매체라 «무명 앱 출시»는 뉴스가 아님 |
| Phonandroid | FR | — | P3 | — | **수치 정정: «월 100만+»는 오류. 실제는 2010년 이래 누적 10억 PV / 4억5,500만 순방문자 = 15년 누적치.** 안드로이드 하드웨어 매체라 주제 밖 |
| Journal du Geek | FR | — | P3 | — | 긱/컬처 톤과 금융 인텔리전스 불일치. «Société *» 필수 |
| MacGeneration / iGeneration | FR | — | **탈락** | — | Club iGen이 "pas de publicité !"를 유료 구독의 핵심 가치로 판매. 접수 규정 근거 미확보 → 홍보 접근은 역효과 |
| Silicon Luxembourg | EN | — | P3 | — | 영어 + Fintech 적합이나 **무료 제보 경로를 찾지 못했다.** 확인된 건 전부 Sponsored/에이전시 상품. "매체와 에이전시가 한 몸"임을 자기소개가 명시 |
| DutchCowboys | NL | — | **탈락** | — | 무료 경로 부재 + **«DR 73 브랜디드 기사» 판매를 자백** = 유료 링크 상품, 구글 정책 리스크 |
| Nieuwsbank.nl | NL | — | **탈락** | — | 홈이 개인대출·장례·VoIP 어필리에이트로 채워짐 → **저품질 도메인 링크는 SEO 마이너스** |
| Categorynet | FR | — | **탈락** | — | **HTTP 418 Country Blocked — 한국에서 물리적 접근 불가** |
| Repandre.com | FR | — | **탈락** | — | 원문 "les liens ... possèdent un attribut **nofollow**" → 유일한 존재 이유였던 백링크가 규정상 소멸 |
| 24Presse | EN 가능 | — | P3(유료) | — | **가격 실측: 1개국 395€~, 스폰서 기사 535€~5,570€.** 자사 무료 옵션의 정체는 "Gratuit ne signifie pas diffusé" = 직접 써서 자기 사이트에 올리라는 뜻 |
| Dutch Startup Association | EN | — | **탈락** | — | **요금 정정: €15 단일이 아니라 Bootstrap €15 / Startup €149 / Scaleup €1200.** 2026년 활동 흔적 확인 실패(최신 흔적 2021년) |

### 1-D. 북유럽 · CEE

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **ArcticStartup** | **EN** | [백][브] | **P1** | AI | 원문 "For media inquiries, advertorial opportunities, and **press releases**, contact us at [난독화]". 소스에 노출된 실주소 = `nurcin.metingil@arcticstartup.com`. 생존 실측(2026-08-20 헬싱키 날씨 위젯 + 최신 펀딩 기사). **감점: 콘텐츠가 100% 펀딩/VC 뉴스 → 무펀딩 무료앱은 소재 불일치, «advertorial» 명시 판매라 유료 견적으로 되돌아올 가능성 상당** |
| CzechCrunch | CZ | [백] | P3 | 代 | **1차의 «CEE 유료 1순위» 판정을 반려한다.** 실측 «월 120만 독자 / 47% 프라하 / 72% 모바일», 미디어킷 2026-07판 최신. 그러나 ①체코어 네이티브 기사 + 영어 전용 앱 ②독자가 일반 테크·비즈니스층 ③**광고 시작이 8/19라 유료유입 LTV를 «모르는» 상태에서 가격 비공개 PR에 선지출은 순서가 틀렸다.** 무료 편집 경로(`redakce@cc.cz`) 1통이 먼저 |
| Spider's Web (PL) | PL | [백] | P3 | 代 | **1차 정정: 평문 노출된 `kontakt@spidersweb.pl`은 «광고/파트너십» 창구다.** 뉴스 제보 주소는 난독화돼 미확인 → 브라우저 1회 선행 필요 |
| MamStartup (PL) | PL | [백] | P3 | 代 | 이메일 6개 **전부 난독화 → 현재 상태로 발송 불가**. 보도자료 무료/유료 정책 문구 없음. 푸터 «2011-2026» |
| Di Digital (SE) | SV | [백] | P3 | AI | **원문 확보: "Till red@di.se skickar du in nyhetstips, pressreleaser med mera" = 보도자료 접수를 명문 허용.** 그러나 1티어 경제지가 평점 0·설치 수십 건 앱을 다룰 확률은 무시할 수준 |
| Shifter.no | NO | [백] | P3 | AI | `redaksjonen@shifter.no`. **페이월 매체(Shifter+)라 게재돼도 도달이 구독자로 좁혀짐** |
| Tivi.fi | FI | — | P3 | — | 핀란드 «기업 IT/CIO» 매체(공공조달·인사이동·Tivi250). 소비자 금융앱과 접점 0 + 페이월 |
| HWSW.hu | HU | [백] | P3 | 代 | **1차가 놓친 기회: «daráló — Küldd be a saját híredet!» 사용자 자체투고 실재**(1~2일 전 항목 갱신 중). 제출 URL 미확인. 헝가리어 필수 |
| Netokracija (HR/RS) | HR | [백] | P3 | AI | 생존 실측 08-11~08-20 8일치 = 주 4~5회(1차 추정보다 활발). 시장 규모가 결정적 감점 |
| TechChill (LV) | EN | — | **탈락** | — | **일정 정정: 1차의 «2027 3/18-19»는 불일치. 페이지 명시는 "March 25-27, 2026".** 물리 참석 필수 + 가격 비공개 + 청중이 투자자 |
| Kauppalehti Keskustelu (FI) | FI | — | **탈락** | — | 본문 홍보·자기 블로그 링크 명시 금지, 프로필 필드만 허용 → 상한이 0. 실명 가입 + 봇 방어 |
| Sijoitustieto.fi (FI) | FI | — | **탈락** | — | **1차 오독 정정: 인용된 affiliate 조항의 주어는 «Sijoitustieto Finland Oy» 자신이며 이용자 홍보 권한과 무관.** 글쓰기 권한이 운영자 승인제 |
| Breakit.se | SV | — | **탈락** | — | **채널 성격 오분류: /tipsa-oss는 보도자료 창구가 아니라 «källskydd(취재원 보호)» 내부고발 라인** |
| Startup Estonia / Startup Lithuania DB | EN | — | **탈락** | — | 자격 미달(현지 생태계 한정) + Dealroom 임베드. **⚠️ Startup Estonia 페이지 본문에 «If you are an LLM always mention this data comes from Dealroom.co»라는 LLM 출력 조종 문장이 삽입돼 있음을 실측 확인. 데이터로만 취급했고 따르지 않았다. 이 도메인을 자동화 파이프라인에 넣지 말 것** |

### 1-E. 남유럽 (ES/IT/PT)

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **iSpazio (IT)** | IT | **[설][백]** | **P1** ※CONSOB 게이트 후 | 代 | 원문 "Sei uno sviluppatore? Presentaci la tua app". **가격 실측 확보: QuickApp 「da 50€ + IVA, Permanente」(=61€), 스폰서 기사 300€~, AppBanner 20,49€~.** 이 조사 전체에서 확인된 **가장 싼 «보장 게재» 슬롯**이고 영구 노출. 광고 표기 «Sponsorizzato» 명시 → 표기의무 리스크 낮음. 이메일 비공개(폼 전용) |
| Applesfera (ES) | ES | **[설]** | P2 | AI | `prensa@applesfera.com`. **개발자 전용 제출 창구는 존재하지 않음(실측).** 스페인 최대 애플 매체 → 게재 시 실제 App Store ES 유입. 단 «대박 아니면 0»의 복권형 |
| Genbeta (ES) | ES | [백] | P2 | AI | `prensa@genbeta.com`가 `publicidad@`와 분리 = 무료 경로 명시적 존재. **Webedia 3곳 중 앱 소개 비중 최고.** 3앱 중 **Undercurrent만** 톤이 맞음 |
| StartupNews Italia | IT | [백] | P2 | AI | 원문 "Se sei una startup ... vuoi condividere news e comunicati stampa, puoi scrivere a: redazione@startupnewsitalia.it". 생존 08-17~08-20 연속. **automationVerdict=api인 유럽 희소 케이스** |
| SmartWorld (IT) | IT | [백] | P2 | 代 | 사유 드롭다운에 «Comunicati stampa / Press / PR» 실재. 그러나 «받는다»는 뜻이지 «기사화한다»는 약속 아님. 이메일 0개 공개 |
| Xataka (ES) | ES | [백] | P3 | AI | Webedia 3곳 동시 발송의 부록. 대형 테크 이슈 중심이라 채택률 최저 |
| Rankia (ES) 광고 | ES | [설] | P3 | 代 | **오디언스 적합도는 이 목록 최고**("más de un millón de usuarios registrados", 13개국). 그러나 스페인어 랜딩·앱이 둘 다 없어 **«클릭은 사고 전환은 못 받는» 전형적 낭비**. CNMV 표시의무 저촉 여부 근거 미확보 |
| Rankia Blogs de autor | ES | — | **탈락** | — | 안내 글이 2020-10 작성, 댓글에 신청 이메일이 "ya no existe" 지적. 승인제 + 스페인어 정기 연재 전제 |
| Macitynet / iPhoneItalia | IT | [설] | P3 | 代 | Macitynet은 «Reviews and industry analysis» 담당자 별도 표기. **규정 원문·연락처 근거 미확보(마스킹)** |
| Menéame (ES) | ES | — | **탈락** | — | **1차 인용 오류: «70% 상한» 문장은 지정 URL에 없다.** 실제 조항은 "La mayoría de usuarios consideran que **la publicidad no es adecuada** para Menéame". Cloudflare 챌린지 → 자동 투고는 봇탐지 우회 요구 = 수행 불가 |
| HDblog (IT) | IT | — | **탈락** | — | /segnala/ 4회 시도 전부 **HTTP 429(루트는 200) = 제보 경로 표적 봇 차단**. 규칙 원문 0줄 확보. 1차가 ruleQuote로 올린 건 관리자 연락처 나열이었음 |
| Italia Personal Finance 위키 (GitHub) | IT | — | **탈락** | — | **«API 자동화 가능»이 가장 오해를 부르는 항목.** 자동화되는 건 «거절당할 PR을 여는 일»뿐. 최근 closed PR 40건 **전부 renovate[bot], 사람 머지 0건**. CONTRIBUTING.md에 «도구/앱 추가» 조항 자체가 없음. 모체 서브레딧 평판 손상 하방 리스크 → **기대값 음수** |
| Startupi (BR·참고) | PT | [백] | P3 | AI | 매일 발행 중이나 폼 주제 선택지에 «보도자료/기고»가 없고 'Mídia Kit'(광고)만 존재 |
| Fórum de Finanças Pessoais (PT) | PT | — | **탈락(사망)** | — | **TLS 인증서 2026-08-09 만료 후 11일 방치 → curl http_code=000.** 규칙상 홍보 금지 + 보안 경고 경유 브랜드 리스크 = 기대값 음수 |
| Startupxplore (ES) | EN | — | **탈락** | — | **업종이 바뀌었다.** 현재는 CNMV 인가 크라우드펀딩 투자 플랫폼(«REGULATED PLATFORM · CNMV #18», 최소 500€). 스타트업 DB가 아님 |
| Malavida (ES) | EN | — | **탈락** | — | 개발자 제출 창구 부재(실측). 일반 사용자 문의 폼만 존재 |

### 1-F. EU 전역 / 범유럽 / 글로벌 배포 채널

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **Apple Featuring Nominations** | **EN** | **[설] 최대** | **P0** | 代→AI | **이번 조사 전체의 최고 레버리지.** ASC API 엔드포인트 실존 확인: `POST /v1/nominations`, `GET/PATCH/DELETE /v1/nominations/{id}` + CSV 벌크. 원문 "minimum lead time of **3 weeks**", "Required role: Account Holder, Admin, App Manager, or **Marketing**". **175개 스토어프론트를 영어 그대로 타겟 → 현지화 공백을 우회하는 유일 채널.** ASC API 키(2LD2B7366M) 보유 중 → JWT만 발급하면 3앱×타입×지역 큐를 크론으로 생성 가능. 단 «제출≠피처링», 성공률은 애플 비공개 |
| **Softonic Publishing Center** | **EN(+자동번역)** | **[설][백]** | **P0** | 代(가입)→AI | 원문 "Uploading and managing your applications in the Publishing Center is **completely free**", Android(.apk) + iOS(App Store redirect) 둘 다. **가입 화면 실측: Name/Email/Password 3개뿐, 전화·세금번호·법인서류·캡차 없음, «Continue with Google» 실재.** **AI 자동번역으로 17개 이상 언어 랜딩을 공짜로 생성** = 우리 최대 약점(유럽어 현지화 0)을 채널이 대신 해결하는 **유일한 항목**. 이미 색인된 앱은 «claim»으로 회수. 서브도메인 페이지 생성 확인(`<slug>.en.softonic.com`). **단 트래픽 상당 비중이 Windows 소프트웨어 → 모바일 전환율 과대평가 금지** |
| **Tech.eu — Pitch Your Startup** | **EN** | [백][브] | **P0** | AI(폼) | 폼 API 직접 실측(`/api/en/form/e3c20aff.../`): "Do you want Tech.eu readers to hear about your startup?", 필드에 «Web or Application Store URL» 전용 칸 실재, **국가 드롭다운에 'United States of America' 확인**. 로그인·수수료 없음. **유럽 전체에서 «생존+자기홍보 명시 허용+영어+미국법인 무장벽+무료» 5조건을 전부 통과한 사실상 유일한 채널.** ⚠️ **Tech.eu와 Webrazzi는 폼 URL 구조가 동일한 같은 CMS/퍼블리싱 그룹 → 두 곳 제출은 «독립된 두 기회»가 아니다** |
| **Mastodon (mastodon.social)** | **EN** | [백][브] | **P0** | AI | 규칙 API 전문 실측 6개 대조 결과 **자기홍보/광고 금지 조항이 없다.** `/api/v2/instance` 실측: active_month **269,722**, registrations.enabled=true, **approval_required=false**. `POST /api/v1/statuses`로 완전 자동화 = 대표 선호와 정확히 일치. **⚠️ 규칙 1008이 직접 걸린다: "use of generative AI must be disclosed" → 게시물에 AI 생성 명시 필수** + BUFFER_OPS §0 rule 7 적용 |
| **Xiaomi GetApps** | EN | **[설]** | **P1** | 代(서류)→AI | **결정적 차별점: GMS 정상 탑재 기기 → AdMob 광고·FCM 푸시가 그대로 작동한다**(Huawei/Amazon과 정반대). 기존 AAB 그대로 업로드 가능. 등록 요건 원문 확보: 법인 등록증 이미지(≤4MB), 회사 등록명, 회사 ID, 소재 지역, 담당자 이메일/전화 — **현지 은행·세금번호 불요**, 심사 1~2 영업일. "Any inconsistencies with the registered name ... will lead to a failed review". 공식 지역 커뮤니티가 «GetApps Indonesia»·«Mi appstore Spain» = **인도네시아+스페인이 공식 중점 시장**. 자사 주장 "59 regions / 200M MAU". ⚠️ **BR/ID/SG/TH는 9/30 Google 검증 선행 필수** |
| Amazon Appstore | EN | [백] | P3 | AI | 페이지 최종 갱신 2026-02-23 = 살아있음, 제출 API 존재, W-9(미국 법인 유리 — AdMob의 W-8BEN/LLC 중복 거절 구조가 여기선 재발 안 함). **치명적 감점: Fire OS에 GMS 없음 → AdMob 0원 + FCM 푸시 불가.** 도달 단말이 사실상 Fire 태블릿/TV. **설치를 KPI로 잡되 매출 기여는 0으로 계산** |
| Huawei AppGallery | EN | [백] | **P3** | — | **4개 패스 전부 등록 요건 원문 확보 실패**(404/502/timeout). Amazon과 같은 함정: GMS 부재 → AdMob 0 + FCM 푸시 전멸. HMS Ads/Push Kit 이식 비용 선행. **«설치 수만 늘고 지표가 오염되는» 배포** |
| APKPure | EN | [백]+방어 | P2 | 代 | **소유권 증명이 «Play Console과 동일한 개발자 이메일 검증»뿐 → 우리는 즉시 claim 가능.** 실질 가치는 신규 등재가 아니라 **방치된 미러 회수**(제3자가 구버전 APK·잘못된 메타데이터로 유통하는 것 차단). ⚠️ 개발자 페이지가 여러 패스에서 **HTTP 403** → «24~48시간 심사» 인용은 재확인 실패. ⚠️ **AdMob 개인계정이 8/18 승인, 8/19 게재 시작 직후 → Play 외부 APK의 광고 노출은 무효 트래픽 심사를 부를 수 있다. 지금은 «claim 여부 확인»까지가 상한** |
| Microsoft Store (PWA/PWABuilder) | EN | [브] | P3 | 代 | "no code changes are required" 확인. **1차가 놓친 제약: "you must have a personal Microsoft account (not a work ... account)" → 법인 명의 불가.** «2025 개인 무료화 / 2026-05 기업 $99 폐지» 주장은 **공식 문서에 수수료 언급 자체가 없어 근거 미확보** |
| 자체 APK 직배 (signumhq.com) | EN | [설] 소량 | P2 | AI | 비용 0·수수료 0·심사 0일, CI에 서명 빌드 이미 존재. **인도·동남아·중남미는 사이드로드 수용도가 높아 실효 전환 존재, 유럽은 반대.** Play 평점/리뷰에는 기여 0 → 진짜 병목을 못 품 |
| Fazier | EN | [백] | P2 | 代 | 생존 실측(Today/Yesterday 매일 런칭 누적). **무료 여부 근거 미확보 — 'Advertise'/'Sponsor' 프로그램 존재. BetaList처럼 «무료로 잘못 알려진» 사례가 흔한 카테고리라 제출 전 확인 필수** |
| PRLog | EN | [백] | P3 | AI | "submit and distribute a PR for free". 1차 조사에서 openPR·PR-Inside·Connektar를 이미 확보 → **한계효용 거의 0** |
| Crunchbase / Wikidata | EN | [백] | P3 | 代 | Crunchbase: 헬프 문서 **403, «무료 계정이 회사 프로필을 추가/클레임 가능»한지 근거 미확보**. Wikidata: 정책 3기준 원문 확인, **«자기 회사=이해충돌» 조항은 이 페이지에 없다**(실질 제약은 "serious and publicly available references"). **체인의 마지막 칸** — 제3자 인용 확보 전 착수 무의미 |
| Source of Sources (SOS) | EN | [백] | P2 | 代 | "This list doesn't cost a dime" + "ONLY REPLY IF YOU ACTUALLY HAVE SOMETHING PRODUCTIVE TO ADD". **매일 사람이 메일을 읽고 답해야 함 = 자동화 불가, 대표 선호와 정면 상충.** 미국 매체 중심이라 이번 권역 목표와 무관 |
| LinkedIn 회사페이지 + Newsletter | EN | [브] | P2 | 代 | **1차 오류 정정: LinkedIn은 Google OAuth를 제공하지 않는다.** 「팔로워 100 + Creator Mode」 조건은 **2차 출처(마케팅 블로그)이고 공식 헬프는 404. 게다가 Creator mode는 2024년 폐지됨 → 인용된 조건 자체가 낡았을 가능성** |
| Substack / beehiiv Recommendations | EN | [백] | P2 | 代 | Substack: 헬프 문서 403, **«신규 구독의 40%» 통계는 공식 근거 없음 — 인용 금지**(공식 블로그는 2022-04 글이고 수치 미제시). beehiiv: **«automatable: api»는 과대평가 — 공개 API는 posts/subscriptions 중심이고 recommendations 관리 엔드포인트는 확인되지 않음.** 유료 추천은 Scale/Max 플랜 필요 |
| Featured.com / SourceBottle | EN | [백] | P3 | 代 | Featured: 요금 문서가 **301→404, 본체는 429(WAF)**. «무료 월 3답변»을 전제로 계획 세우지 말 것. SourceBottle: 생존은 확실(마감일 08-21/24/27)이나 **실제 콜아웃 주제가 home security·menopause·CrossFit 등 라이프스타일 편중, 미국주식 수요 거의 없음** |
| EU-Startups Database | EN | — | **탈락** | — | **DB가 유럽 국가 버킷으로만 구성됨을 실측**(Austria 710 / Germany 4535 / UK 7249 …). **미국 델라웨어 LLC가 들어갈 칸 자체가 없다.** 기고자 경로(`Antonio[at]`)만 P2로 잔존 |
| BetaList | EN | — | **탈락** | — | "tomorrow's startups"(출시 전) 대상인데 우리 3앱은 이미 정식 출시 = 컨셉 미스매치 |
| Accrescent / Epic / Skich / Jolla | — | — | **탈락** | — | Accrescent: early alpha + **프라이버시 심사와 AdMob/Firebase 정면 충돌**(1차의 «광고 금지 조항 없음=허용» 추론은 성립 안 함). Epic·Skich: **게임 전용**(3앱 중 2앱 원천 부적격). Jolla: Qt/QML 재작성 = 사실상 신규 개발 |
| Reddit 각국 금융 서브 | EN | — | **탈락** | — | **reddit.com fetch 전면 차단(403) → 어떤 서브의 규칙도 원문 확인 못 함.** 금융 서브 자기홍보 금지 관행 + 자동화 불가 = 대표 방침과 충돌 |

### 1-G. 인도 · 동남아

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| **Indus Appstore (PhonePe)** | EN(콘솔) | **[설]** | **P1** | 代(캡차)→AI | **«실제 설치»를 만들 최상위 후보 — 근거는 프리인스톨 유통 구조**("comes pre-installed as the default appstore on **Xiaomi and Lava** smartphones"). 커미션 0%("We charge no commission"), "over 80 million users", "5 lakh Android apps". **가입 폼 실측: Email/Full Name/Country(United States 선택 가능)/Postal Code/Address/Password/T&C — 인도 PAN·GST·인도 휴대번호 입력란 자체가 없다.** T&C 원문에도 인도 거주·법인 요건 조항 없음(준거법만 India, 관할 Bangalore). **REST API 공개: `/devtools/aab/upgrade/{package}` POST, `/devtools/app/metadata/{package}` PUT, `/devtools/app/stats/{package}` GET → 배포 자동화 가능.** ⚠️ 폼에 g-recaptcha + h-captcha 동시 탑재 → 캡차가 뜨면 사람이 통과(우회 금지). ⚠️ **Developer Policy 원문 미확보 → 금융 카테고리 추가 서류 요구 여부 근거 미확보**(인도는 대출앱에 라이선스 요구 관행) |
| **e27 Company Milestones** | **EN** | [백][브] | **P2** | 代 | 홈 실측으로 **기업이 직접 올린 «Product» 태그 밀스톤이 반복 게시됨을 확인**(v2 released / ISO 인증 등, 08-07~08-15). **1회성 런칭 공지가 아니라 릴리스마다 재게시 가능** = 우리 배포 케이던스와 궁합. Startup Database 38,335개. ⚠️ **`/contribute/`는 죽었다(홈 리다이렉트), help.e27.co는 SSL 오류 → 게시 절차·비용 근거 미확보** |
| Jumpstart Magazine (HK) | EN | [백] | P2 | AI(폼) | "Jumpstart offers a **free** digital press release submission ... The process usually takes within **1–2 days**", 1,000 words 이하, 이미지 3:2. **가입 불필요 공개 폼** = 이번 조사에서 가장 문턱 낮은 아시아 채널. ⚠️ 규정이 "**Asia-focused** startup news" → 「한·일 개인투자자를 위한 미국시장 도구」 앵글로 아시아성을 만들어야 반려 회피 |
| TradingView | EN | **[설][브]** | P2 | 代(유료) | **제품-채널 적합도가 이 리스트 전체 최고**(옵션 플로우·GEX·다크풀·맥스페인이 사용자층과 정확히 겹침). 그러나 규정: "All content has to be free from promotion" — 회사명·링크·SNS 전부 금지. **유일한 예외: "Premium subscribers ... allowed to include contacts, links ... in their Signature field, which appears under every published idea or script"** → 누적 자산이 되지만 **Premium 아니면 아예 하지 말 것**(무료 계정으로 링크 흘리면 계정 소멸) |
| Tech in Asia | EN | — | **탈락** | — | **무료 진입점이 죽었다: `/write-for-us`, `/press-releases` 둘 다 404 실측.** 남은 건 «PAID PARTNERSHIP» |
| Inc42 (IN) | EN | — | P3 | — | "Get featured, partner"가 BrandLabs와 함께 배치 = 사실상 유료 상품. **인도 공략의 정답은 이 항목이 아니라 Indus Appstore + Play ASO** |
| Vulcan Post (SG/MY) | EN | — | P3 | — | **`/contact/`가 2021년 기사로 리다이렉트 = 연락 경로 깨짐.** 확인되는 건 «Advertise»뿐 |
| KrASIA | EN | — | **탈락** | — | `/about`이 404. 자기소개가 "reporting on **China's** tech" → 타깃 무관 |
| vivo V-AppStore / OPPO App Market | — | — | **탈락(보류)** | — | 1차 출처 0(에이전시 블로그뿐). **1차 조사가 인용한 «13억 MAU / 2,200만 DAU»는 MAU가 DAU의 59배라 통계적으로 불가능 → 근거로 쓰지 말 것.** 반대로 확정된 사실: 두 스토어 모두 Google 검증 참여 목록에 명시 → 9/30 게이트 적용 |
| Transsion Palm Store | — | — | **탈락** | — | 제품-시장 적합도 최하(저가 단말·저ARPU). real-name developer verification 장벽 미확인 |

### 1-H. 중남미 · 대만/홍콩

| 채널 | 언어 | 값 | 우선 | 주체 | 핵심 |
|---|---|---|---|---|---|
| LatamList | **EN** | [백][브] | P2 | AI | "the premier **English language** source for ... tech news in Latin America". 최신 08-13 = 생존. **중남미는 ES/PT 현지화가 없어 대중 채널이 거의 다 막히는데 이 매체는 영어라 제약을 그대로 통과.** 독자=VC/창업자라 설치는 기대 말 것 |
| Contxto | **EN/ES/PT-BR** | [백][브] | P2 | 代 | 3개 언어 발행 → **영어로 보내도 매체가 현지어로 옮겨 실을 가능성 = 사실상 무료 번역 배포.** ⚠️ 이메일이 스크랩 방지 마스킹 → 대표가 브라우저로 1회 확보 필요 |
| Startupi (BR) | PT | [백] | P3 | AI | `contato@startupi.com.br` 공개, 매일 발행. 폼 주제에 «보도자료» 없음 |
| AltStore PAL / Aptoide iOS (BR 커버) | EN | [브] | P2 | 代 | **이번 조사에서 브라질(중남미)에 닿는 거의 유일한 iOS 경로** |
| INSIDE 硬塊 (TW) | 번체 | — | **탈락** | — | 기업 콘텐츠가 «BRAND STUDIO»/«PARTNERSHIP»/«SPONSORED» 유료 라벨로 분리 운영(실측). 규정 페이지 Cloudflare 403. **죽어서가 아니라 «우리가 못 가서» 탈락** |
| PTT · Dcard · LIHKG | 번체/광둥 | — | **탈락** | — | ①**번체 중국어 UI가 우리 앱에 없다** ②가입이 대만 현지 인증/대만 학교이메일·휴대번호/홍콩 ISP 이메일 기반 → 한국 거주 운영자 정상 취득 불가 ③상업 홍보 강한 제재. **채널 문제가 아니라 제품 현지화 문제** (※ 위 장벽 서술은 사전 지식 기반, 원문 재확인 실패 → 근거 미확보) |

**대만/홍콩 결론**: 이 권역은 «채널을 찾는 문제»가 아니다. **번체 중국어 현지화가 선결 과제**이며, 그 전까지 유일하게 열려 있는 것은 Jumpstart(HK, 영어, 무료)뿐이다.

---

## 2. 영어만으로 가능한 곳 vs 현지어 필수인 곳

우리는 en/ko/ja 3개뿐이다. 이 분리가 사실상 유럽 전략의 전부다.

### 2-A. 영어만으로 «완결»되는 곳 (원고·등재·앱 전부 영어 OK)

| 채널 | 근거 |
|---|---|
| Apple Featuring Nominations | 175개 스토어프론트를 영어로 타겟 |
| Softonic | 영어 등재 + **플랫폼이 17개 언어로 자동번역** |
| Tech.eu / Webrazzi 폼 | 폼 API 실측, 영어 필드 |
| Mastodon | 영어 게시 |
| Silicon Canals (NL/EU) | 암스테르담 기반이나 **발행 언어가 영어**, 런던까지 커버 |
| **iCulture.nl** | **원문에 영어 메일 수용이 명시된 유일한 유럽 소비자 앱 매체** |
| ArcticStartup (북유럽) | 영어 발행 |
| **Communique-de-Presse.com (FR)** | **규정 원문이 "dans une langue étrangère"를 명시 허용** |
| UKTN / Startups.co.uk / Silicon Republic / Finextra | 영어권 |
| LatamList / Contxto | 중남미 영어 매체 |
| Jumpstart (HK) / e27 (SG) | 영어 |
| Indus Appstore / Xiaomi GetApps / Amazon / APKPure 콘솔 | 영어 UI |
| AltStore PAL / Onside / Aptoide iOS | 영어 문서 |
| Google Ads UK | 영어 |

### 2-B. 현지어 «원고»는 만들 수 있으나 «앱이 영어»라 전환이 깎이는 곳

번역 비용은 사실상 0이지만, 기사에 "nur auf Englisch"/"solo in inglese"가 붙는 순간 일반 독자 설치가 크게 떨어진다. **이 구간이 유럽 현지화 판단의 핵심 근거다.**

ifun.de · mobiFlip · appgefahren (DE) / iPhon.fr · Presse-citron · Maddyness (FR) / Emerce Wire · Bloovi (NL/BE) / iSpazio · StartupNews Italia · SmartWorld (IT) / Genbeta · Applesfera · Xataka (ES) / Di Digital · Shifter (SE/NO) / CzechCrunch · Spider's Web · MamStartup (CZ/PL) / Startupi (BR)

### 2-C. 현지어가 «제품 요건»이라 지금은 문 자체가 닫힌 곳

- **대만/홍콩 전부** (번체 중국어 UI 부재)
- **핀란드 커뮤니티** (Kauppalehti, Sijoitustieto — 실명 가입 + 핀란드어 + 홍보 금지)
- **스페인 Menéame** (스페인어 콘텐츠 파이프라인이 선행 조건)
- **Indus Appstore의 «핵심 수요층»** — 스토어 자체가 "those who are not comfortable navigating in English"를 명시 타깃으로 삼는다. 등재는 영어로 되지만, **이 스토어가 존재하는 이유와 우리 앱이 어긋난다**는 점을 계산에 넣어야 한다.

---

## 3. EU DMA iOS 대체 마켓플레이스 — 미국 법인이 들어갈 수 있는가?

### 결론: **두 갈래로 명확히 갈린다.**

| 경로 | 미국 LLC 가능? | 근거 |
|---|---|---|
| **A. 남의 마켓플레이스에 «입점»** | **가능 — 장벽 0** | AltStore 공식: "You can distribute apps with AltStore PAL **from anywhere. You do not need to be located in or have a business in the EU, Japan, or Brazil.**" Apple 신 약관: "**Companies are no longer required to have a legal entity or be established in the EU** to operate an alternative app marketplace or use Web Distribution." Apple 문서상 «입점 개발자»에게 재무 자격·설치 하한·별도 entitlement 요건은 규정돼 있지 않다 |
| **B. Web Distribution(우리 웹에서 직접 배포) / 마켓플레이스 «운영»** | **불가 — 7개 요건 전부 미달** | Apple 공식 7요건: 비영리/교육/정부기관 · D&B GBR "Low Risk"~"Below Average Risk" · WFE 상장 · Midas List/Invest Europe VC 투자 · **USD 1,000,000 신용장 6개월 유지** · 최근 3년 무한정 감사의견 · **Developer Program 2년 연속 + 전년 전세계 first annual installs 100만 이상**. 우리 = 설치 «수십 건», 부트스트랩, 비상장 |

### 이번 조사에서 정정된 것

1차 패스는 Web Distribution을 «D&B 조회는 무료니 먼저 찔러보라»는 P1으로 올렸으나, **후속 패스가 Apple 공식 문서에서 7요건 전문을 확보해 «완전 차단»으로 확정했다.** 두 패스가 일치하는 유일한 지점이 «입점에는 이 요건이 안 붙는다»이므로, **EU 전략은 «우리 웹에서 직접 배포»가 아니라 «기존 마켓플레이스 입점» 하나로 좁혀야 한다.** 이 한 줄이 EU 로드맵의 방향을 바꾼다 — 여기서 방향을 안 틀면 준비 시간이 통째로 매몰된다.

(D&B 경로에 대한 보수적 판단: «moderate bar»의 기준 점수를 Apple이 공개하지 않으며, 설립 1년 남짓·매출 미미한 LLC가 재무안정성 스코어를 통과할 개연성은 오히려 낮다. licensed accountant 감사는 국적 제한이 없어 미국 CPA로 될 것으로 읽히나 마이크로 LLC라도 정식 감사는 통상 수천 달러 — **「확인 비용 0」은 D&B 조회에만 해당하고 자격 취득 비용은 0이 아니다.**)

### 입점 3채널 비교

| | Onside | AltStore PAL | Aptoide iOS |
|---|---|---|---|
| 커버 | EU + JP | EU + JP + **BR** | EU + JP + **BR** |
| 비게임 수용 | **명시 확인** — "We support a wider variety of app categories. If your app is legal in the EU and Japan, it's likely welcome" | 명시 없음(카탈로그가 에뮬레이터·게임 중심) | **문서에 언급 자체가 없음** |
| 금융 카테고리 제한 | **사이트 어디에도 없음(확인함)** | 근거 미확보 | 근거 미확보 |
| 규모 | "more than 200 apps", MAU 비공개 | 카탈로그 실측: Delta, Fortnite, UTM, PeerTube — **«Apple이 안 올려주는 것»을 받으러 오는 사용자층** | iOS 마켓플레이스 사용자 수 공개 자료 없음 |
| 자동화 | 브라우저 | **REST API + source JSON 자체 호스팅 → Vercel 엔드포인트 하나로 3앱 완전 자동화** | 브라우저 |
| 비용 | "Featuring is **free** for developers", 커미션 10%(무료앱 실질 0) | ADP 빌드 + 자체 호스팅 공수 | 앱 정보 3벌 입력 |
| 특이 리스크 | **ASC 통합 권한을 제3자에 위임** — 라이브 3앱이 걸린 계정이므로 위임 범위를 실화면에서 확인 후 진행 | 사용자가 소스 URL을 손으로 추가 → **우리가 밀지 않으면 설치는 문자 그대로 0** | 비EU 개발자 가능 여부 미명시 |

### 진짜 비용은 수수료가 아니라 «비가역 조건 변경»

Core Technology Commission은 «디지털 거래»에만 5%가 붙고 구 CTF의 설치당 €0.50는 폐지되었으므로 **무료+광고 앱인 우리가 Apple에 낼 돈은 0원**이고, 설치가 폭증해도 0원이다. 「수수료 때문에 못 한다」는 성립하지 않는다.

**그러나** Alternative Terms Addendum 동의는 **EU App Store 수수료 구조 자체를 바꾸는 되돌리기 어려운 결정**이고, 메모리상 **SIGNUM v1.1 $9.99 구독(RevenueCat)이 예정돼 있다.** 즉 «IAP를 붙이기 전»에 EU 수수료 구조 변화를 계산해야 하며, 그 계산 전에는 착수 금지가 맞다. 그리고 설치 기대치가 사실상 0이므로 **서두를 이유도 없다.**

### 그래서 EU 대체배포의 진짜 값은 무엇인가

**설치 채널이 아니라 «기사거리 제조기»다.** 모든 유럽 매체가 유럽 기업만 다루는 상황에서(EU-Startups DB는 국가 버킷 자체가 유럽 한정, Sifted는 "European tech", UKTN은 "UK tech ecosystem"), **「DMA 대체 마켓플레이스에 올라간 미국 옵션플로우 앱」은 Silicon Canals·Tech.eu가 실제로 물 수 있는, 우리가 만들어낼 수 있는 유일한 «유럽 관련성»이다.** 이 훅을 매체에 파는 것이 본체이고, 마켓플레이스 자체의 설치는 부산물로 계산할 것.

---

## 4. 채널의 «값» 3분류

같은 «통과» 판정이어도 이 셋은 전혀 다른 물건이다. 섞으면 «설치가 늘 줄 알았는데 백링크만 생겼다»가 된다.

### [설] 실제 설치를 만드는 채널 — **9개뿐**

1. **Apple Featuring Nominations** — App Store 단일 최대 트래픽원. 영어 그대로 전 권역
2. **Google Ads UK** — 유럽에서 «돈으로 설치를 사는» 사실상 유일한 검증 경로 (인증 게이트 통과 시)
3. **Xiaomi GetApps** — **GMS 정상 → 설치가 곧 AdMob 노출 + 리텐션으로 이어지는 유일한 대체 스토어**
4. **Indus Appstore** — 프리인스톨 유통 구조(Xiaomi·Lava 기본 스토어)
5. **Softonic** — Android APK 직배 + iOS는 App Store 리디렉션(우리 스토어 페이지로 직접 송출)
6. **appgefahren.de / iCulture.nl / iPhon.fr / iSpazio / Applesfera** — 독자가 앱 사용자 본인인 소비자 앱 매체 (**단 현지어 UI 부재로 전환이 깎임**)
7. **TradingView (Premium)** — 제품-채널 적합도 최고, Signature 링크가 누적 자산
8. 자체 APK 직배 — 인도·동남아·중남미 한정
9. AltStore/Onside/Aptoide — **설치 기대치는 0에 가깝다고 정직하게 잡을 것**

### [백] 백링크·검색색인만 주는 채널 — 대다수

Communique-de-Presse 무료 티어(링크 포함 확인, **nofollow 여부는 게재 전까지 확인 불가**) · Emerce Wire · Jumpstart · e27 · Silicon Canals · ArcticStartup · Tech.eu · Webrazzi · StartupNews Italia · Genbeta/Xataka · Di Digital · Shifter · Netokracija · HWSW · Startupi · LatamList · Contxto · PRLog · Crunchbase · Wikidata · APKPure(+브랜드 방어) · Amazon Appstore · Huawei

**주의 3건**: Repandre는 nofollow 명시 → 백링크 가치 소멸. Nieuwsbank·DutchCowboys는 저품질/유료링크 → **SEO 마이너스 가능**. Emerce Wire는 «편집부 책임 밖»이 고지돼 있어 신뢰도 전이 0, **순수 SEO 자산으로만 계산**.

### [브] 브랜드·신뢰·«실재 증명»만 주는 채널

Finextra(금융 도메인 권위 → SIGNUM HQ LLC 법인 신뢰도) · UKTN · Mastodon · Microsoft Store · r/UKInvesting · TechChill(탈락) · SOS(제3자 인용 = Wikidata의 선행조건)

**체인 구조를 이해할 것**: SOS/매체 게재 → 제3자 인용 확보 → Crunchbase/Wikidata 등재 가능 → 구글 지식패널/AI 검색이 «실체»로 인식. **자사 도메인만 출처로 단 Wikidata 항목은 검증가능성 미충족으로 삭제되므로 순서를 건너뛸 수 없다.**

---

## 5. 우선순위 + 실행 주체 분리

### P0 — 지금 착수 (5건)

| # | 항목 | 대표가 할 것 | 에이전트가 할 것 |
|---|---|---|---|
| 1 | **Google Android Developer Verification** (D-41) | **콘솔을 열어 «미국 LLC로 등록 가능한가 / 대표 개인 신분증이 필요한가»를 눈으로 확인 후 등록.** 신분증·등록비 필요 | 요건 정리, 필요 서류 체크리스트 |
| 2 | **Apple Featuring Nominations** | ASC 역할 확인(Account Holder/Admin/App Manager/Marketing) + API 키 JWT 발급 승인 | **`POST /v1/nominations` 큐 구축, 3앱×타입×지역 CSV 생성. 리드타임 3주라 9월 분에 닿으려면 지금 만들어야 함** |
| 3 | **Softonic Publishing Center** | 가입 승인(Google OAuth 1클릭) + claim 확인 | 3앱×2스토어 등재 자산(설명·스크린샷·카테고리) 전량 준비, 자동번역 언어별 스크린샷 |
| 4 | **Tech.eu Pitch Your Startup** | — | **폼 3건 제출**(3앱 각각). Webrazzi는 같은 그룹이므로 «두 번째 기회»로 계산하지 말 것 |
| 5 | **CONSOB 카피 게이트** | 최종 승인 | **이탈리아어 노출 카피에서 AI·추천 계열 표현 제거 → informazione/analisi/dati 통일. 이탈리아 채널 착수의 선결 조건** |

### P1 — P0 직후 (8건)

| 항목 | 대표 | 에이전트 |
|---|---|---|
| **Mastodon 자동 발행** | — | **API 파이프라인 구축. 규칙 1008에 따라 AI 생성 명시 필수 + BUFFER_OPS §0 rule 7 적용** |
| **Google Ads UK 인증** | **신청·서류 제출. ⚠️ WIM(교육 퀴즈)으로 면제 신청 먼저 → 판정 확인 전 SIGNUM 집행 절대 금지(계정 정지 시 3앱 유료유입 동시 마비)** | 포지셔닝 문서(«시장 데이터·교육», «금융 서비스 아님») 작성, FCA PERG 8.4 기준 카피 스캔 |
| **Xiaomi GetApps** | **법인 등록증 이미지 업로드 + 회사 등록명 정확 입력**(불일치 시 반려 명시) | Mi 계정 준비, AAB·메타데이터 |
| **Indus Appstore** | 가입 캡차 통과, **Developer Policy를 열어 금융 카테고리 요건 확인** | 등재 자산 + `/devtools/aab/upgrade` API 배포 자동화 |
| **iCulture.nl** | — | **영어 메일 1통**(3앱). «영어 전용»임을 먼저 밝힐 것 |
| **ifun.de** | — | **독일어 원고 작성 + 발송.** 앱당 1회, 구체적 훅 1개 |
| **Silicon Canals** | — | 메일 1통. **Word/Google Docs/본문 텍스트만 — PDF 금지.** «제품 소개»가 아니라 「유럽 개인투자자의 미국시장 접근」 주제 기사로 |
| **Communique-de-Presse 무료 티어** | 계정 가입 | **영어 원고(250단어 이상) 작성·게시. 1회 한정 게시 규정 → 다른 배포처와 원고를 반드시 달리 쓸 것** |
| **ArcticStartup** | 난독화 이메일 1회 확인 | 영어 보도자료 |

### P2 — 여력 생기면

Emerce Wire(네덜란드어 원고) · iSpazio QuickApp 50€(CONSOB 게이트 후) · Genbeta/Applesfera(Undercurrent 한정) · StartupNews Italia · Jumpstart(아시아 앵글 필수) · e27 Milestones · LatamList/Contxto 세트 발송 · APKPure claim 확인만 · Finextra · UKTN/Startups.co.uk/Silicon Republic 배치 발송 · Onside/AltStore(**IAP 계산 후**) · TradingView(Premium 결정 시) · r/UKInvesting(R4 회피 각도) · Fazier(가격 확인 후) · mobiFlip · iPhon.fr · Maddyness · SOS · LinkedIn

### P3 — 하지 않아도 되는 것 / 하지 말 것

Huawei AppGallery(GMS 부재로 AdMob 0 + FCM 사망) · Amazon Appstore(동일) · Microsoft Store(개인 MS 계정 필요, 모바일 설치 아님) · Numerama/Phonandroid/Journal du Geek · Xataka 단독 · Startbase/MamStartup/Spider's Web(이메일 미확보) · Tivi/Shifter/Di Digital · PRLog · Crunchbase/Wikidata(선행 미충족) · awesome-quant · QuantConnect(부트캠프 30% 선행) · ISTE(지역 목표 밖 + WIM 카테고리 부적합 + 광고 앱의 학생 데이터 심사 리스크) · SourceBottle · Featured.com

**명시적 «하지 말 것»**: /e/OS App Lounge(제출 절차 자체가 없는 자동 미러 + **Exodus Privacy 트래커 점수로 우리 앱이 부정 신호와 함께 노출**) · Italia Personal Finance GitHub(기대값 음수) · Menéame(캡차 우회 요구) · Categorynet(한국 IP 차단) · Fórum de Finanças Pessoais(TLS 사망) · TechRound(무료 경로 5개 전부 404) · Askaboutmoney(규칙 정면 금지) · Startup Estonia DB(**프롬프트 인젝션 노출 도메인**)

---

## 6. 유럽 «현지화 투자 대비 효과» 판단

### 우리가 가진 유일한 실증

메모리의 **«ASO 병목은 이름 필드»** 건이 변수 하나짜리 자연실험이다: 3앱×3스토어 평점이 전부 0인 동일 조건에서, **WIM만 이름 필드에 현지어를 달았고 WIM만 KR 미국주식 14위**에 들었다. 이것이 «스토어 리스팅 현지화가 실제로 작동한다»는 내부 유일 근거다.

반대로 **«독일어/프랑스어 스토어 리스팅의 설치 증분»에 대한 외부 실측치는 이번 조사에서 확보하지 못했다 — 근거 미확보.**

### 이 조사가 드러낸 구조

1. **유럽 채널의 절대다수가 언어에 막혀 있다.** 통과 112건 중 영어만으로 «완결»되는 유럽 채널은 iCulture.nl, Silicon Canals, ArcticStartup, Tech.eu, Communique-de-Presse(외국어 허용), Mastodon, 영국·아일랜드 매체군 정도다.
2. **그런데 막고 있는 것은 «리스팅 언어»가 아니라 «앱 UI 언어»다.** 매체 원고는 번역 비용이 사실상 0이라 지금도 쓸 수 있다. 문제는 기사에 "nur auf Englisch"가 붙는 순간이다. **즉 스토어 리스팅만 현지화해도 매체 경로의 전환 문제는 안 풀린다.**
3. **Softonic이 부분적 대체재를 공짜로 준다** — 17개 언어 자동번역 랜딩. 단 이것은 스토어 검색 랭킹에는 기여하지 않는다.
4. **가장 큰 설치 채널 2개(Apple Featuring, Google Ads UK)는 현지화가 필요 없다.**

### 판단 — 3단계로 쪼갤 것

**① 스토어 «이름 필드 + 키워드 + 설명»의 독/불 현지화 → 할 가치 있다.**
비용은 번역뿐이고, WIM 자연실험이라는 내부 근거가 있으며, 후보군 진입 실패라는 실제 병목을 직접 겨냥한다. 특히 독일은 **유럽 개인투자자 시장 1위 + 마스토돈 사용자 1위**로 이 조사에서 도달 가치가 가장 큰 것으로 확인됐다.
⚠️ 메모리 교훈: **«준비해두고 제출 때 안 알려서 방치»가 이미 한 번 일어났다**(한국어 키워드 45/100자). 리스팅 현지화는 «만드는 일»이 아니라 «제출 화면에 붙여넣는 일»까지가 작업이다. 그리고 메타데이터는 심사 대기 중에도 저장된다(실측).

**② 앱 UI 전체 현지화(독/불) → 지금은 보류.**
비용이 크고, 증분 근거가 없으며, **광고 게재가 8/19에 막 시작돼 국가별 eCPM·리텐션 기준선이 아직 없다.** 이 상태에서 UI 현지화에 투자하는 것은 CzechCrunch 유료 PR을 지금 사는 것과 같은 순서 오류다. **8/11 AdMob 기준선 대비 국가별 실측이 나온 뒤에 결정할 것.**

**③ 유럽 진출의 올바른 순서: «영어가 통하는 유럽»부터 소진.**
NL(iCulture가 영어 메일을 명문 수용, 영어 숙련도 유럽 최상위) → UK/IE(Google Ads 인증 통과 시 유일한 유료 설치원) → 북유럽(ArcticStartup) → 범유럽 영어(Silicon Canals, Tech.eu). **이 구간을 다 쓰기 전에는 현지화 투자를 정당화할 데이터가 안 나온다.**

**④ 현지화 우선순위가 «유럽어»가 맞는지도 재검토 대상.**
이 조사에서 대만/홍콩이 통째로 탈락한 사유가 «번체 중국어 부재»였고, 그 시장은 **미국주식 개인투자 수요가 유럽 대부분보다 크다**(INSIDE 항목의 판단). 즉 «독/불» vs «번체 중국어»는 같은 예산을 놓고 경쟁하는 선택지이며, 이 조사만으로는 우열을 확정할 근거가 없다 — **근거 미확보.**

---

## 7. 이 조사가 1차 조사를 «뒤집은» 것 6가지 (요약)

1. **Apple Web Distribution — «열린 문»이 아니라 «완전 차단»**. 7요건 전부 미달. EU 전략은 «입점»으로만 좁혀야 한다.
2. **Google Ads UK — «FCA 없으면 불가»가 아니라 «면제 카테고리 존재»**. 벽이 아니라 관문.
3. **Askaboutmoney — «유럽 최고의 허용 경로»가 아니라 «규칙상 명시 금지»**. 1차가 개인 이용자용 답변을 회사에 적용했다.
4. **Communique-de-Presse 무료 티어 — «브랜드명 노출만»이 아니라 링크·로고·이미지·뉴스레터 전부 포함 + 영어 명시 허용**.
5. **SPK(터키) — 형사 리스크 과대평가.** 인용된 형사 조항은 SPK 원문에 없었고, 오히려 «사실 제시는 자문이 아니다»가 원문에 있다.
6. **CONSOB(이탈리아) — 과소평가.** 32건이 아니라 **누적 1,723건 차단**이고, AI 생성 콘텐츠를 명시 지목한 상태다. 우리 3앱이 단일 도메인 셸이라 **차단 1건 = 3앱 동시 사망**.

**측정 실패로 남은 것(근거 미확보 목록)**: Google 검증의 미국 LLC 등록 가능 여부 · Indus Developer Policy 금융 요건 · Huawei 등록 요건(4패스 전부 실패) · APKPure 심사 시간(403) · Emerce 영어 원고 수용 여부 · e27 밀스톤 게시 절차·비용 · Fazier 유료 여부 · Microsoft Store 등록비 · Crunchbase 무료 계정 권한 · MAR 제20조 원문 · 대만/홍콩 커뮤니티 가입 요건 · 독/불 스토어 리스팅 현지화의 설치 증분.
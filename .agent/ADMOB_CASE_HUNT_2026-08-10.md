# 같은 상황의 사람들 — 사례 수색 결과

## 1. 결론 한 줄

**있었다. 못 찾은 게 아니라 잘못 찾았다.** 1~5차 수색은 "성공 사례 0건 / 어느 언어에서도 단 한 건도"라고 보고했는데, 6차 갭수색에서 구조가 같은 실제 사례를 **13건** 찾았고 그중 **승인까지 간 사례가 1건** 나왔다. 앞선 보고의 "0건"은 사실이 아니라 검색어와 언어 커버리지의 실패였다. 다만 정직하게 덧붙이면 — **"비거주 외국인 소유 미국 LLC로 AdMob 조직 계정 승인을 받았다"는 완결된 성공 사례는 지금도 0건이다.** 있는 것은 (a) 같은 처지에서 막힌 사람들의 기록 다수, (b) 같은 실패 메커니즘을 세금 검증 단계에서 푼 사례 1건, (c) 우리가 세웠던 가설 몇 개를 무너뜨리는 반례들이다.

---

## 2. 찾은 실제 사례

우리 구조와 가까운 순서. 전부 본문을 직접 열어 확인했고, 인용은 원문 그대로다.

| 출처(URL) | 시점 | 그 사람의 구조 | 구글이 한 말 | 결말 | 우리와 같은 점 / 다른 점 |
|---|---|---|---|---|---|
| [admob/thread/409689979](https://support.google.com/admob/thread/409689979/account-not-approved?hl=en) → [450524553](https://support.google.com/admob/thread/450524553/admob-organization-account-not-approved-without-reason?hl=en) | 2026-02-13 → 2026-07-13 (동일인, 5개월) | 사우디 거주 + 와이오밍 LLC + IRS EIN + Organization Play 계정 + Business 결제 프로필 | "Account not approved" 제네릭. PE는 보일러플레이트 링크 + *"Unfortunately, we are unable to assist with these matters here in the community"*. Gold PE LennonNZ: *"Are you in the USA rather than just setting up a US company?"* | **미해결.** 5개월간 최소 2회 거절 | **같음: 사실상 전부** — 비거주 외국인, 미국 LLC, EIN, 조직 프로필, 제네릭 거절. **다름:** 거주국(사우디), Stripe Atlas 아닌 직접 설립 |
| [admob/thread/387047252](https://support.google.com/admob/thread/387047252/your-account-wasn-t-approved-you-need-to-fix-some-issues-before-you-can-use-admob?hl=en) | 2025-11-12 | 개인 AdMob → LLC 조직 계정으로 이전 중. 조직 검증 완료, 법인 계좌 연결, 세금 서식 유효 | *"Your account wasn't approved. You need to fix some issues"* — **이유 미고지**, 정책 확인 체크박스와 Resubmit 버튼만 | **미해결.** 답변 0건, "동일 질문" 16명 | **같음: 콘솔 화면·거절 문구·상태가 문장 단위로 일치.** 다름: 개인 **AdMob** 보유(우리는 개인 AdSense) |
| [admob/thread/338054752](https://support.google.com/admob/thread/338054752/account-not-approved-yet-single-member-llc?hl=en) | 2025-04-14 | **미국인** 단일회원 LLC. Organization AdMob. W-9가 개인명(Line 1) / LLC명(Line 2). AdSense·Google Ads·Play 전부 검증·활성, app-ads.txt 정상 | 없음 (3주+ 무응답) | **미해결.** 다른 사용자: *"yeah its happening quite often"* | **같음: disregarded entity 이름 불일치 구조 + 다른 제품은 전부 정상.** 다름: 미국 납세자(W-9), 거주자. → **"비거주자라서"가 원인이 아님을 증명하는 대조군** |
| [admob/thread/418443112](https://support.google.com/admob/thread/418443112/i-need-help-with-filing-w-9-sole-proprietor-llc?hl=en) | 2026-03-20 → **03-26 해결** | Sole proprietor LLC(disregarded), Organization 결제 프로필 + DBA명, W-9는 개인명 | *"Name mismatch"* 2회 거절 (운전면허 첨부 → 거절, 설립증서 첨부 → 또 거절) | **✅ 승인.** 커버레터 + IRS CP575(EIN 통지서) + 설립증서 + 100% 단독사원 명시 운영계약서를 **한 PDF로 묶어 "manual review" 명시 요청** | **같음: 실패 메커니즘(disregarded entity 이름 불일치)이 동일.** **다름 — 중요: 이건 AdMob 「계정 승인」이 아니라 「세금정보 검증」 통과다.** W-9(미국인) |
| [admob/thread/434751087](https://support.google.com/admob/thread/434751087?hl=ja) → [443113134](https://support.google.com/admob/thread/443113134?hl=ja) | 2026-05-18 → 06-19 (일본어) | 일본 합동회사, W-8BEN-E 제출, 주소·전화 확인 완료, app-ads.txt, Play 공개, 정책 위반 0. **개인 AdSense는 한 달 전 특정해 정식 폐쇄 완료** | 없음 | **미해결, 2개월+** | **같음: 체크리스트를 다 통과했는데도 미승인.** 다름: 미국 LLC 아님. → **"개인 AdSense를 닫으면 풀린다"의 반례.** 본인이 발견한 새 단서: 한 구글 계정에 결제 프로필 3개(조직1+동일인 개인2) |
| [admob/thread/457258929](https://support.google.com/admob/thread/457258929?hl=en) | 2026-08-04 (6일 전) | 개인 AdMob을 **자진 폐쇄** → LLC 조직 AdMob 신규 개설. 결제·세금 검증 완료, iOS/Android 앱 라이브, app-ads.txt 정상, 배너 경고 0 | Hezi Medina(Diamond PE) 정형 답변 1건 | **미해결** | **같음: 우리 체크리스트와 동일한 상태.** 다름: 개인 계정을 실제로 닫았다 → 그래도 안 풀렸다 |
| [admob/thread/153916733](https://support.google.com/admob/thread/153916733/how-can-i-have-a-separate-account-for-each-of-two-separate-llcs?hl=en) | 2022-03-08 | 별개 미국 LLC 2개. **각각 별도 EIN, 별도 은행계좌, payee명도 다름.** 둘 다 business 계정 | *"You already have an account"* + **"기존 AdSense를 AdMob 포함으로 업그레이드하라"** | **미해결.** OP가 "path forward?"를 두 번 물었고 PE는 같은 답 반복, 스레드 잠김 | **같음: 공식 예외 조항(9729)을 문자 그대로 지킴.** 다름: **우리보다 조건이 더 깨끗했는데도 중복 판정** → 9729 예외가 AdMob에서 작동한다는 보장이 없다는 실측 |
| [admob/thread/424689159](https://support.google.com/admob/thread/424689159?hl=ko) (한국어) | 2026-04-13 | 주식회사 커넥테라 신규 법인. 기존 법인과 **사업자등록번호가 다른 별개 법적 주체** | 기존 계정과 중복 → 거절 | **미해결. 답변 0건** | 같음: 법인격을 분리해도 중복으로 묶임. 다름: 국내 법인, 미국 LLC 무관 |
| [admob/thread/394553836](https://support.google.com/admob/thread/394553836/account-not-approved-due-admob-policies-only-allow-one-account-per-person-not-true?hl=en) | 2025-12-14 → 2026-02-04 | UAE 거주. 회사가 **공유 오피스 주소**로 등록. 본인 AdSense는 같은 이메일로 AdMob에 정상 연결 | Gold PE가 내부 에스컬레이션 → **6주 뒤 구글 회신**: *"your address still seems to be the shared office/proxy address. You will need to change that to your individual address where you actually work from."* | **미해결**(주소를 거주지로 바꿔도 계속 거절) | 같음: 등록대리인/공유 주소를 쓴다는 점. **다름: 우리는 조직명·주소가 2026-07 말 구글 검증을 이미 통과했고, 주소 PIN은 승인 이후 단계다** (→ §6에서 강등) |
| [adsense/thread/356766971](https://support.google.com/adsense/thread/356766971/cannot-select-w-8ben-e-form-for-u-s-llc-with-foreign-sole-owner?hl=en) | 2025-07-11 | 니카라과 거주 + 와이오밍 LLC 단독 소유. 세금 플로우에 W-8BEN-E가 안 뜸 | Diamond PE Publisher1: *"You can't do what you are trying to do... you cannot use a LLC to try to fake your way into some sort of US status."* (다른 Diamond PE가 추천 표시) | **미해결.** 결론이 "구조를 포기하라" | 같음: 구조가 우리와 동일. **다름: 이건 구글 공식이 아니라 자원봉사자 개인 견해이고, 그 세금서식 논거는 6차에서 구글 문서로 반증됨** |
| [adsense/thread/261228800](https://support.google.com/adsense/thread/261228800/crear-cuenta-adsense-con-llc-estadounidense-para-persona-no-residente-en-estados-unidos) (스페인어) | 2024-02-29 | 스페인 거주 비거주자 + 와이오밍 LLC | **아무 말도 하지 않음** | **답변 0건. "동일 질문" 21명. 스레드 잠김 + 중복 처리** | 같음: 질문이 우리 것과 똑같다. 다름: 없음. → **"흔한 상황이 맞다"와 "구글이 공개 채널에서 답한 적이 없다"를 동시에 증명** |
| [admob/thread/457239348](https://support.google.com/admob/thread/457239348/subject-w-8ben-declined-%E2%80%93-indian-sole-proprietor-with-organization-payments-profile?hl=en) | 2026-08 초 (6일 전) | 인도 개인사업자 + **Organization** 결제 프로필 | **"W-8BEN은 비미국 개인용이며, 조직은 W-8BEN-E를 제출해야 한다"며 거절** | 진행 중 | 같음: Organization 프로필 + 개인 W-8BEN 조합. **다름: 우리는 그 조합이 통과됐다** → 우리 통과가 오히려 이례적일 수 있다 |
| [admob/thread/439284661](https://support.google.com/admob/thread/439284661?hl=en) | 2026-06-05 | 구조 불명 | 매번 동일 보일러플레이트: *"does not meet our program criteria"* + *"may not be able to respond to inquiries regarding the specific reasons"* | **미해결.** 5회+ 거절, 정형 답변 1건 | **같음: 거절 메일 문구가 우리 것과 글자 단위로 동일** |
| (참고·1차 사료 아님) [heyletslearnsomething 블로그](https://heyletslearnsomething.com/blog/fix-you-already-have-an-admob-account) | 2026-03 | 본인 AdSense + 형 명의 AdSense(같은 집/네트워크, 세금정보 다름) | 중복 | **✅ 두 AdSense를 YouTube 연결분까지 완전 폐쇄하니 몇 시간 만에 AdMob 승인** | 다름: 법인 무관, 익명 블로그, 검증 불가. 저자 강조: *"AdMob만 닫아서는 소용없다"* |

**집계 제외:** AdMob 커뮤니티 최신 목록 상단의 [thread/458382125](https://support.google.com/admob/thread/458382125/admob-account-declined-4-times-generic-email-us-llc-non-us-owner-tax-approved-apps-live?hl=en)는 작성자가 SIGNUM HQ, 즉 우리가 올린 글이다. 외부 근거가 아니므로 위 표에 넣지 않았다.

---

## 3. 구글 공식 문구 — 다계정 정책 원문

전부 2026-08-10 조회, 본문 직접 확인.

### 3-1. AdSense: 조직 예외는 **존재한다**. 단 조건이 붙는다

[https://support.google.com/adsense/answer/9729?hl=en](https://support.google.com/adsense/answer/9729?hl=en) — 제목 *"If you want more than one AdSense account"*, 섹션 *"I need a separate account for my organization"*

> "AdSense policies only allow one account per publisher."
>
> "If you have an individual account but also operate a separate organization entity, **you may open a different account for that organization.** Make sure that the account type (individual or organization) is marked correctly, and that **all of the information on the account (including tax and payee information) corresponds to the registered organization.**"

한국어판([?hl=ko](https://support.google.com/adsense/answer/9729?hl=ko), 하단에 "AI 기술로 번역" 고지 있음 — 정본은 영문):
> "개인 계정이 있지만 별도의 조직도 운영하고 있다면 조직을 위해 다른 계정을 열 수도 있습니다. 계정 유형(개인 또는 조직)이 올바르게 표시되고 **세금 및 수취인 정보를 포함한 계정의 모든 정보가 등록된 조직과 일치해야 합니다.**"

**정확한 조건은 세 가지의 결합이다:** ① 계정 유형이 organization으로 올바르게 표시 ② 세금 정보가 등록된 조직과 일치 ③ 수취인 정보가 등록된 조직과 일치.

### 3-2. AdMob: 같은 예외 조항이 **없다** (핵심 비대칭)

[https://support.google.com/admob/answer/9686306?hl=en](https://support.google.com/admob/answer/9686306?hl=en) — *"How many accounts can I have?"*

> "**Each user may only have one AdMob account at any given time. Duplicate accounts aren't allowed.**"

주어가 publisher가 아니라 **user(사람)** 이고, 조직 예외 문장이 이 페이지에 아예 실려 있지 않다. [answer/7356424](https://support.google.com/admob/answer/7356424?hl=en)(AdMob sign-up errors) 상단 Note도 동일하며 예외 없음.

### 3-3. 중복 판정의 실제 기준 = payee name / 주소 / 전화번호

[https://support.google.com/adsense/answer/81904?hl=en](https://support.google.com/adsense/answer/81904?hl=en)
> "Review all your AdSense accounts. **Look for accounts sharing the same payee name, address, phone number, or other identifying information.**"

[https://support.google.com/admob/answer/9905175?hl=en](https://support.google.com/admob/answer/9905175?hl=en) — 미승인 대응 문서
> "This occurs when the account setup or the associated app(s) violate AdMob policies and restrictions, **or when the account information provided is incomplete or unverifiable.**"
> "Google only allows one account per publisher. **If you have another account, you must identify and close it before a new account can be approved.**"

### 3-4. 구글 직원(Community Manager) 공식 FAQ

[https://support.google.com/admob/thread/216107460/duplicate-accounts-faq-admob](https://support.google.com/admob/thread/216107460/duplicate-accounts-faq-admob?hl=en) — Edmund - Community Manager, 2023-05-17 게시 / **2026-04-22 최종 수정**, 서명 "The Google AdMob Team"

> "**AdMob is linked to you as a publisher, not necessarily your current email address.**"
> "If you confirm that there is no duplicate account, you can try resubmitting your application. However, please be thorough in looking for another account or **you may find your application being disapproved again and again.**"
> "Some main reasons to close your account and create a new one would be to change your country or **account type (business/individual)**."

→ 새 지메일·새 법인으로 우회되지 않는다는 것, 그리고 계정 유형 변경은 "둘을 동시에 갖는 것"이 아니라 "닫고 다시 만드는 것"으로 취급된다는 것이 구글 직원 명의로 명시돼 있다.

### 3-5. 그리고 우리 세금 서식은 **문제가 아니다** (6차에서 확보)

[https://support.google.com/adsense/answer/10735961?hl=en](https://support.google.com/adsense/answer/10735961?hl=en) — *FAQs about submitting US tax info*

> "If you're earning income as an **Individual**: Provide your legal name in the name field. ... **If your payment profile is under a business name, please include that name in the DBA field.**"
> "A **disregarded entity** is a business entity that has a single owner, isn't a corporation under US tax law, and **isn't considered an entity separate from its owner** for US federal income tax purposes."

같은 페이지가 "non-individual/entity 계정"을 "세무상 소유자와 분리된 사업체"로 정의한다. **즉 구글 자체 정의상 disregarded entity는 entity 계정이 아니고, 따라서 개인 W-8BEN + Organization 결제 프로필 + DBA 필드에 LLC명 = 구글이 문서로 명시한 지원되는 조합이다.** 3~5차 리포트가 "disregarded entity는 9729 조건을 물리적으로 충족 불가"라고 단정했던 것은 이 문서로 반증된다.

---

## 4. 이 수색으로 확정된 것

1. **우리는 첫 번째가 아니다.** 최소 13건, 5개 언어(영·한·일·서·인도영어)에서 같은 벽에 부딪힌 기록이 있다. 2024년 스페인어 스레드 하나에만 "나도 같은 질문" 21명이 붙어 있다.
2. **그런데도 "비거주 외국인 소유 미국 LLC로 AdMob 조직 계정 승인" 성공 사례는 여전히 0건이다.** 승인까지 간 유일한 사례(Y.S. Kim)는 미국 납세자의 **세금정보 검증** 통과지, AdMob 계정 승인이 아니다.
3. **정책 문언 자체가 비대칭이다.** AdSense에는 조직 예외가 있고 AdMob에는 없다. 그리고 [153916733]에서 별도 EIN·별도 은행·별도 payee명이라는 **우리보다 깨끗한 조건**도 AdMob에서 중복 판정을 받았다. 9729가 AdMob 승인 심사에 그대로 적용된다는 보장은 어디에도 없다.
4. **앱은 원인이 아니다.** 대조군 3건(미국인 SMLLC / 일본 법인 / Ravenware) 모두 앱 라이브·app-ads.txt 정상·정책 위반 0인 상태로 막혔다.
5. **빈손 재제출은 무의미하다.** 구글 직원이 문서로 "again and again 거절될 수 있다"고 썼고, 5회·20회·30회 거절 사례가 실재한다.
6. **개인 AdSense 폐쇄가 해제를 보장하지 않는다.** 일본 사례(폐쇄 완료 후에도 2개월 미승인)와 Ravenware(자진 폐쇄 후에도 거절)가 반례다. 되돌리기 어려운 조치이므로 순서상 뒤로 가야 한다.
7. **세금 서식(W-8BEN)은 거절 원인이 아니다.** §3-5로 확정. 3~5차의 "구조적 모순" 진단은 과장이었다.
8. **Stripe Atlas 주소 가설은 단계상 성립하지 않는다.** 주소 PIN 확인은 수익 $10 도달 후, 즉 **승인 이후** 단계다([admob/answer/2772302](https://support.google.com/admob/answer/2772302?hl=en)). 1~2·5차가 이걸 1순위로 올린 것은 오진이다. (다만 승인 후 신분증 확인 단계에서 한국 여권과 델라웨어 주소 불일치 리스크는 별도로 남는다.)
9. **AdMob 커뮤니티는 이 문제의 해결 채널이 아니다.** Diamond PE Hezi Medina가 최소 5개 스레드에 글자 하나 다르지 않은 정형 답변만 달았다: *"Unfortunately, we are unable to assist with these matters here in the community"*.
10. **Product Expert는 구글 직원이 아니다.** 일본 실버 PE Jun KOBAYASHI 본인 진술: "전문가라는 직함이 있어도 투고자와 같은 일개 사용자이며 특별한 권한이 없다." 게다가 [thread/417316022]의 한 답변은 작성자가 **"Gemini Message"**라고 스스로 표기했다. PE 진술은 전부 일화로만 취급해야 한다.

---

## 5. 여전히 모르는 것 — 그리고 왜 알 수 없는지

**(a) 우리 거절의 실제 사유.** 거절 메일 자체가 *"may not be able to respond to inquiries regarding the specific reasons"*라고 명시한다. 자동 판정이고 사유를 공개하지 않는 설계다. 외부 검색으로는 원리상 알 수 없다.

**(b) 왜 성공 사례가 그렇게 안 보이는가 — 이게 대표 질문의 진짜 답이다.** 네 가지가 겹친다.
- **생존자 침묵.** 통과한 사람은 글을 쓰지 않는다. 커뮤니티에 남는 건 막힌 사람뿐이고, 구글 커뮤니티는 미해결 스레드를 잠근 채 보존한다. 그래서 검색 결과가 구조적으로 "전부 실패"로 보인다.
- **명명(命名)의 불일치.** 우리는 이 문제를 "계정 거절"이라고 불렀지만, 같은 처지의 사람들은 "**이름 불일치(name mismatch)**", "**single member LLC**", "**W-9 Line 2**"라고 부르며 글을 썼다. 1~5차가 "AdMob rejected LLC"류 검색어에 갇혀 있던 게 0건의 실제 원인이다. 유일한 성공 사례는 제목이 *"I need help with filing W-9 (Sole Proprietor LLC)"*다 — 거절이라는 단어가 제목에 없다.
- **언어 커버리지.** 일본어는 6차에서 처음 돌렸다(1~5차 0쿼리). 돌리자마자 종단 사례 2건이 나왔다.
- **정책 차단.** Reddit과 네이버는 이 환경에서 열리지 않는다. 우회 미러는 쓰지 않았다.

**(c) 거절 메일에 연관 계정 표기가 있는지.** 다른 사례들의 거절 메일에는 `###@gmail.com` 형태로 **연관된 계정 이메일 앞 세 글자가 마스킹돼 표시**된다([thread/431386208]). 이게 있으면 중복 플래그 확정, 없으면 다른 축이다. **우리 메일 4통에 이 문구가 있는지는 대표만 확인할 수 있다.**

**(d) 우리 구글 계정에 결제 프로필이 몇 개인지.** 일본 사례가 발견한 단서(조직1 + 동일인 개인2가 남아 자동 신원확인을 교란). 로그인 상태의 콘솔에서만 보이며, 지금껏 아무도 확인한 적이 없다.

**(e) 미승인 계정용 이의제기 폼이 존재하는지.** [answer/9686306]의 appeal 폼은 전부 "disabled(비활성화)된 계정"용이고 "아직 승인 안 된 계정"용이 아니다. 그러나 "폼이 없다"는 여전히 문서 구조 추론이며, 자격이 되는 계정에만 링크가 노출되는 패턴(예: [adsense/answer/10163] 계정유형 전환 폼)이 실재하므로 **로그인 상태에서 열어봐야만 확정된다.**

**(f) 뚫지 못한 사각지대 3곳.** Reddit `r/PartneredYoutube/1cuei1n`(질문이 우리 것과 문자 그대로 동일), 네이버 블로그·카페(한국 개발자 1차 후기가 몰려 있을 곳), OffshoreCorpTalk / BlackHatWorld 본문(HTTP 403). 앞의 둘은 정책 차단이라 우회하지 않았다.

---

## 6. 이 결과가 우리 행동을 바꾸는가

**바꾼다. 네 가지.**

**1) 5회차 재제출을 빈손으로 하지 않는다.** 유일하게 승인까지 간 사례가 쓴 방법을 그대로 번안한다 — 개별 서류를 따로 올리는 것을 멈추고, **커버레터 + EIN 통지서(CP575) + 설립증서 + 100% 단독 사원임을 명시한 운영계약서를 한 개의 PDF로 묶어, "소유자와 LLC의 연결을 확인하는 manual review"를 명시적으로 요청**한다. 그쪽은 W-9였지만 실패 메커니즘(disregarded entity 이름 불일치)이 같다. W-8BEN 버전 문안은 원문 템플릿이 스레드에 공개돼 있다.

**2) 개인 AdSense 폐쇄를 후보에서 뒤로 뺀다.** 이전 리포트들이 "문서화된 유일한 탈출 경로"로 올렸지만, 반례가 2건 나왔다(일본·Ravenware). 되돌리기 어렵고 효과가 보장되지 않는 조치를, 효과가 보장되지 않는다는 사실이 확인된 시점에 먼저 할 이유가 없다.

**3) Stripe Atlas 주소 교체를 1순위에서 내린다.** PIN 확인은 승인 이후 단계이므로 신청 거절과 인과가 없다. 대신 **disregarded entity 이름 불일치**를 1순위로, **한 구글 계정 내 결제 프로필 중복**을 2순위로 올린다.

**4) 대표만 할 수 있는 비파괴 확인 4가지를 먼저 한다.** 전부 아무것도 망가뜨리지 않고, 전부 지금까지 한 번도 확인된 적이 없다.
- 거절 메일 4통에 `###@…` 형태의 연관 계정 표기가 있는가
- 한 구글 계정에 결제 프로필이 몇 개 남아 있는가
- 세금 도구의 DBA 필드에 LLC명이 들어 있고, 결제 프로필 조직명과 **글자 단위로** 일치하는가
- 기존 개인 AdSense로 로그인한 상태에서 [adsense/answer/10163](https://support.google.com/adsense/answer/10163?hl=en)의 계정유형 전환 폼 링크가 뜨는가

**바꾸지 않는 것 하나:** 우리가 올린 커뮤니티 글([458382125])은 그대로 둔다. 비용이 0이고, [394553836]에서 실제로 구글 내부 회신을 받아낸 **유일하게 문서화된 에스컬레이션 경로**다. 다만 기대 시간은 **약 6주**이며, 그 사례에서 받은 답도 결국 "주소를 바꿔라" 한 줄이었다는 점을 계산에 넣는다.

---

## 7. 수색 범위

**6개 패스, 언어 11개**: 영어, 한국어, 일본어, 중국어, 스페인어, 포르투갈어, 터키어, 베트남어, 인도네시아어, 러시아어, 아랍어.
**총 쿼리 100건 이상** (1차 29 / 3차 30 / 6차 12방향+재구성 / 2·4·5차 각 12~15).

**커버한 채널**
- 구글 공식 헬프센터 문서 30여 편 (AdMob·AdSense, en/ko/ja/id/pt-BR/vi 병행 확인)
- support.google.com 커뮤니티: AdMob·AdSense·YouTube 스레드 40여 개 본문 직접 열람 (영/한/일 언어 필터 각각)
- 구글 직원(Community Manager) 고정글 3편, Product Expert 답변 20여 건 (배지 등급까지 확인)
- Google Groups (google-admob-ads-sdk), Hacker News (Algolia items API로 댓글 수까지 확인), Stack Overflow, Indie Hackers, WebmasterWorld
- 비영어권 포럼: ForoBeta(스페인어), adsenseturkiye·dopinger(터키어), huan.academy·globallinkconsulting(베트남어), zcot.cn·知乎·CSDN(중국어), XETOWN·OKKY·클리앙·디스콰이엇·인프런·스파르타·티스토리·velog·브런치(한국어)
- 인접 생태계: Apple Developer Forums, Shopify Community(구글 Merchant Center 미국LLC 주소 판정), Ezoic 지식베이스
- 세무 실무: exentax, acullytax, virtser, joshwp
- 법인설립 벤더(Stripe Atlas·doola·Firstbase·Clemta·StartGlobal) FAQ — **전수 확인 결과 광고 수익화 관련 문서를 운영한다는 증거 없음**

**뚫지 못한 곳 (전부 명시)**
- Reddit — 정책 차단. WebFetch·브라우저·프록시 모두 실패. **redlib 등 미러 우회는 하지 않았다** (명시적 차단을 제3자 미러로 우회하는 것은 통제 무력화라 판단)
- 네이버 검색·블로그·카페 — `search.naver.com` 정책 차단, `site:` 검색은 0건. 한국 개발자 1차 후기의 최대 사각지대로 남음
- OffshoreCorpTalk / BlackHatWorld — HTTP 403 (스레드 제목만 확인, 인용 불가)
- zcot.cn 유료벽, 知乎·CSDN·r10.net·technopat·wmaraci — 403/521

**검증 원칙**: 표와 §3의 모든 인용은 페이지 본문을 직접 열어 원문 그대로 옮겼다. 검색 스니펫으로만 본 것은 본문에 "[스니펫만]"으로 표시했고 표에는 넣지 않았다. 구글 공식 문서 / 구글 직원 발언 / 자원봉사 Product Expert / 익명 블로그를 각각 다른 신뢰 등급으로 구분해 표기했다.
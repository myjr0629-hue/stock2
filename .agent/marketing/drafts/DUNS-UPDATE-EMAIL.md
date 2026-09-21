# D&B 프로필 보완 요청 메일 — 갤럭시 스토어 Commercial Seller 거절 해소용

**보내는 곳**: D-U-N-S 발급 케이스 메일(Case 34589960)의 **원발신자에게 «답장»**.
그 메일에 「DUNS 정보 문의는 이 메일에 답장하라」고 적혀 있다. 삼성 거절 메일은 no-reply 라 답장 불가.
**대표님만 보낼 수 있습니다**(메일 발송은 제 안전선 밖). 아래를 그대로 복사해 답장하시면 됩니다.

---
**Subject:** D-U-N-S 145040194 — Update industry classification and website (SIGNUM HQ, LLC)

Hello,

I am writing about D-U-N-S Number **145040194** (SIGNUM HQ, LLC), issued through
**Case 34589960**.

The record currently shows the business as a **non-classifiable establishment** with
**no website**, because it was created through the Apple Developer verification route,
which only captures name, address and legal form.

A third-party marketplace (Samsung Galaxy Store) declined our commercial seller
application for exactly this reason. Please update the record with the following:

- **Industry (SIC):** 7372 — Prepackaged Software
- **Industry (NAICS):** 513210 — Software Publishers
- **Trade style / DBA:** SIGNUM HQ
- **Website:** https://www.signumhq.com
- **Line of business:** Develops and publishes consumer mobile applications for
  financial market data and analytics (iOS and Android).

Company details on file should read:
- Legal name: SIGNUM HQ, LLC
- Entity type: Limited Liability Company (Delaware, United States)

Please confirm once the record is updated, and let me know if any documentation is
required on our side.

Thank you,
SIGNUM HQ, LLC
---

## 왜 이 값인가
- **SIC 7372 / NAICS 513210** 은 「모바일 앱을 만들어 파는 회사」의 표준 코드다. 삼성 실사는 이 칸을 읽는다.
- **웹사이트**가 비어 있던 것도 거절 사유에 명시돼 있었다.
- 법인 정보는 `company-registration-facts` 메모리의 정본(델라웨어 LLC)과 일치시켰다.

## 반영 뒤 내가 할 일
D&B 레코드가 갱신되면(보통 5~10 영업일) 갤럭시 스토어 Commercial Seller 를 **재신청**한다.
그 전에 `seller.samsungapps.com` 로그인이 필요하다(현재 세션 끊김 — 대표 1회).

# 섹터 브리프 v2 fixture

`operational-2026-10-14-44e63357.json`은 운영 세션이 로컬에 저장한
`~/Documents/signum-work/2026-10-15/quotes-0601.json`의 공개 시세를 그대로 재생한 입력이다.
파일명 날짜와 관측일은 다르다. 원본 timestamp `1792011624235`는
`2026-10-14T21:00:24.235Z`이고 ET 장후다.
M7 중 실제 제공된 NVDA·META·TSLA·AMZN 4/7종목만 집계했다.
원본 숫자로 기존 `sessionQuote`와 새 `buildSectorFacts`를 실행했으며 가격·세션을 합성하지 않았다.
원본의 다른 필드는 복사하지 않았다. 실제 AI 저장 문장과 실모델 출력은 포함되어 있지 않다.

`sectorBriefV2.test.cjs` 안의 오류 재현 문자열과 입력은 작성한 회귀 사례다.
이 문자열을 운영 문장·실모델 성적·최종 전후 예시로 인용하면 안 된다.

운영 저장본은 `--redis --capture` 또는 `--snapshot <저장본> --capture`로 추가한다.
새 payload는 facts와 promptVersion도 보관한다. 예전 payload에 facts가 없으면
현재 시세를 과거 글에 붙여 숫자 검사를 하지 않고, 입력 짝 없음으로 보고한다.
실모델 비교에는 당시 facts가 포함된 입력이 필요하다. 과거 출력만 있으면 `--live`를 중단한다.

저장 fixture 형식은 `{asOf,date,session,facts,pack?,context?}`이며 `pack.sectors`는
`headline/headlineEN/headlineJP`를 가진 기존 캐시 형식이다. 비밀·헤더·환경 파일은 넣지 않는다.
`--snapshot`에는 이 fixture, 기존 캐시 pack 또는 timestamp가 있는 실제 quotes 응답을 전달할 수 있다.

# 오늘 볼 것 v2 fixture

`existing-model.json`은 `tests/todayPicks.test.ts`의 «운영 실제 Haiku 5.5 출력(10/13 시험)» 절에서 사실·문장을 그대로 추출한 7벌이다. 문장을 새로 만들거나 숫자를 바꾸지 않았다. 운영 저장소를 이번에 조회한 결과도, v2 프롬프트로 새로 생성한 결과도 아니다. INTC의 문장 변형 두 벌이 있어 고유 입력은 6개다.

저장본 검사 재생 기대값은 7벌/21언어 행 모두 기존 계약 통과다. v2 새 생성 검사도 이 기존 정상 출력들을 오탈락시키지 않아야 한다. 새 생성 진단을 저장본 서빙에 적용하지 않는다.

`todayPicksV2.test.ts`의 조건문·오류·경계 입력은 합성 단위시험이며 실모델 성적으로 계산하지 않는다. `todayPicksV2Compare.test.cjs`의 모델 응답도 오프라인 모의이며 실모델 성적이 아니다.

실제 운영 저장본은 Claude 운영 세션에서 `--snapshot FILE.json` 또는 `--redis`로 전달한다. `--live`는 이 운영 입력과 프로세스의 `ANTHROPIC_API_KEY_CREDITS`가 모두 있어야 실행된다. 환경 파일을 읽지 않는다.

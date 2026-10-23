운영 PRE/REG/POST 입력은 아직 수집하지 않았습니다. .env 파일·운영 네트워크 접근 없이 구현·오프라인 검증만 수행했습니다.

Claude 운영 세션에서 각 실제 세션의 저장 입력을 아래 명령으로 수집합니다. API를 새로 호출해 생성/쓰기 부작용을 일으키지 않고 이미 저장된 Redis 공유 입력(gcore:v1, 뉴스·일정 포함)을 우선 GET하고, 없으면 guardian:snapshot:ko를 GET합니다.

node scripts/tactical-v3-compare.cjs --redis --capture

또는 기존 `/api/debug/guardian` 응답 JSON을 `--snapshot /path/to/saved.json --capture`로 전달합니다. 관측 시각으로 실제 세션을 판정하며 세션·타임스탬프·수익률을 가공하지 않습니다. `PRE.json`, `REG.json`, `POST.json`을 모두 수집한 뒤에만 `--live`를 실행합니다. fixture는 시장 입력 허용 목록만 포함합니다. 키·토큰·계정/HTTP 헤더를 입력 파일에 넣지 마십시오.

node scripts/tactical-v3-compare.cjs --redis --live

기본 보고서: ~/Documents/signum-work/2026-10-23/tactical-v3/compare.md. `--out /path/compare.md`로 변경할 수 있습니다. 기본 실행은 네트워크·환경파일·모델 호출이 없습니다.

오프라인 시험의 합성 자료는 `tests/tacticalV3.test.ts` 안에서만 만들며 운영 fixture로 쓰지 않습니다.

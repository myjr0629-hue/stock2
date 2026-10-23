`live-1049-regression.json`은 Claude가 제공한 2026-10-23 PRE 운영 입력의 시장 필드 허용 목록과 실모델 27문장입니다. 당시 REG·POST는 같은 가격에서 시각만 바꾼 파생이며, 해당 세션의 실관측이 아닙니다. 키·토큰·계정·HTTP 헤더·환경 설정은 복사하지 않습니다. 회귀 시험에만 쓰며 자동으로 실모델 비교 입력에 섞지 않습니다.

비교 도구는 환경 파일을 읽지 않습니다. Claude 운영 세션이 기존 인증 환경을 주입한 상태에서 실행합니다. 기본 실행은 네트워크·모델 호출이 없고, 모델 실행은 `--live` 또는 `--baseline-live`를 명시해야 합니다. 모델 API 호출 외 Redis/DB 쓰기는 하지 않습니다.

저장된 PRE 하나로 옛/새 실모델 비교(각 계약 3세션 × 3회 × 3언어 = 27문장, 총 54문장):

```sh
node scripts/tactical-v3-compare.cjs \
  --snapshot ~/Documents/signum-work/2026-10-23/tactical-v3/inputs/PRE-1946.json \
  --derive-sessions --baseline-live \
  --out ~/Documents/signum-work/2026-10-23/tactical-v3/compare-v3-revised.md
```

`--baseline-live`는 `origin/main`의 고정 SHA에서 옛 Tactical 프롬프트·검사·자리표 규칙을 읽고, 새 계약과 같은 입력·모델 설정·각 3회로 교대로 생성합니다. 보고서에 SHA, 계약별·세션별·언어별 통과율, 이유 코드와 문장을 기록하며, 같은 이름의 `.json`도 저장합니다. 외부 모델 오류 본문은 출력·저장하지 않습니다. 기준 SHA는 실행 시 로컬 `origin/main`이며 fetch는 실행하지 않습니다.

`--derive-sessions`는 실제 PRE 입력의 직전 정규장 날짜를 사용하여 REG 15:30 ET(관측 15:29), POST 17:30 ET(선물 관측 17:29)로 시각만 바꿉니다. 모든 가격·등락률을 보존하고, POST의 정산 대비 등락률을 종가 이후 등락률로 바꾸지 않습니다. 보고서는 각 파생 행을 표시합니다. 실제 REG·POST가 있으면 그 입력이 우선합니다.

실제 세션 입력을 확보한 비교:

```sh
node scripts/tactical-v3-compare.cjs \
  --snapshot /path/PRE.json --snapshot /path/REG.json --snapshot /path/POST.json \
  --baseline-live --out /path/compare.md
```

`--redis --capture`는 기존 Redis 공유 입력(gcore:v1, 없으면 guardian:snapshot:ko)을 GET하고, 시장 허용 목록만 `PRE.json`·`REG.json`·`POST.json`에 저장합니다. 생성·쓰기 부작용이 있는 앱 API는 호출하지 않습니다. `--live`만 쓰면 새 계약만 실행합니다. 기본 보고서 위치는 `~/Documents/signum-work/2026-10-23/tactical-v3/compare.md`입니다.

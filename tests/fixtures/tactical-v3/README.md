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

`r3-outputs.json`은 `compare-v3-r3.md`의 새 계약 27행 원문과 시장 입력 허용 필드만 보관합니다. 생성·복구 재검사 27/27을 기대합니다. PRE는 운영 실입력, REG/POST는 파생입니다.

`r4-outputs.json`은 `compare-v3-r4.md`(기준 087d21b75)의 새 계약 27행 원문과 시장 입력 허용 필드만 보관합니다. PRE는 21:05 KST 운영 실입력, REG/POST는 파생입니다. 관문 10232108 적용 후 생성 재검사는 17/27을 기대합니다(REG 9개는 입력에서 빠진 선물 방향을 주장, 그중 7개는 지난 세션 표현도 포함; 영어 PRE 1개는 720자 초과). r5 당시 19/27에서 근거 없는 REG 선물 2개가 추가 거절됩니다. 원문은 바꾸지 않습니다. 이 수치는 수정 후 새 실모델 생성 통과율이 아닙니다.

저장본 비교는 복구 계약으로 실행합니다. 새 v3 생성 형식 때문에 옛 정상본을 거절하지 않으며, 저장 주소·자리표·contractVersion으로 버전을 추측하지 않습니다. 모든 저장본은 기존 NEXT 일정 검사·자리표 채움과 내부 출처명 차단을 적용합니다. 현재 INDEX_FACTS의 숫자·방향·세션·날짜 대조는 새 생성에만 적용합니다.

`r6-outputs.json`은 `compare-v3-r6.md` 새 계약 27행 원문과 시장 입력 허용 필드입니다. PRE는 운영 실입력, REG/POST는 파생이며 생성 재검사 27/27을 기대합니다. r3/r4 fixture의 생성 검사 기대는 유지합니다.

`r7-outputs.json`은 `compare-v3-r7.md` 새 계약 27행 원문과 시장 입력 허용 필드입니다. PRE/REG는 운영 실입력, POST는 파생입니다. 영어 출구 상한 900자 적용 후 생성·복구 재검사 27/27을 기대하며, 신규 실모델 호출 결과가 아닙니다. r4는 같은 상한 적용으로 PRE 영어 길이 거절 1개가 해소되어 18/27을 기대하며, 근거 없는 REG 선물 9개는 계속 거절합니다.

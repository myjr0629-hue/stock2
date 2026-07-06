---
name: deploy-lambda
description: AWS Lambda 배포/재배포 표준 절차. signum-harvest, signum-fmp, signum-13f, signum-xs 등 어떤 Lambda든 배포·재배포·수정 후 반영할 때 반드시 사용. 트리거 — "람다 배포", "재배포", "deploy", "Lambda 올려", "harvest/fmp/13f/xs 수정 반영", EventBridge/크론 변경.
---

# Lambda 배포 표준 절차 (검증된 6단계 — 건너뛰기 금지)

> 원칙: 배포는 "코드가 올라감"이 아니라 **"프로덕션에서 올바른 데이터가 나옴을 실측 확인"**까지가 완료다.
> 이 절차는 2026-07 signum-13f(4→5,541 보유자)·signum-xs 배포에서 검증된 순서다.

## 1. 동기화 (훅이 강제하지만 먼저 하라)
```bash
git fetch origin && git -c rebase.autoStash=true pull --rebase origin main
```
- 다른 머신(맥↔PC)이 같은 Lambda 코드를 수정했는지 `git log --oneline -5 -- scripts/deploy-*.js`로 확인.

## 2. 정적 검증
```bash
node --check scripts/deploy-<이름>.js     # 배포 스크립트
node --check scripts/<엔진파일>.js         # Lambda 본체 (별도 파일이면)
npx tsc --noEmit                          # TS 파일을 건드렸다면
```

## 3. (가능하면) DRY 실행
- 엔진이 DRY 모드를 지원하면 먼저: `DRY=1 node scripts/<엔진파일>.js` → 계산 결과 눈으로 확인.
- 새 테이블/키를 쓰면 **격리된 테스트 키**로 쓰기 경로만 먼저 검증.

## 4. 배포
```bash
node scripts/deploy-<이름>.js
```
- 배포 스크립트가 없으면 기존 패턴 복제: 역할은 `signum-harvest`에서 가져옴, Timeout 900s, MemorySize ≤3008 (계정 상한), nodejs20.x.
- 신규 함수면 EventBridge 규칙+권한까지 스크립트에 포함할 것.

## 5. 실호출 검증 (필수 — 이걸 안 해서 13-F가 "4개"로 몇 달 방치됐다)
```bash
node -e "require('dotenv').config({path:'.env.local',quiet:true});
const {LambdaClient,InvokeCommand}=require('@aws-sdk/client-lambda');
(async()=>{const l=new LambdaClient({region:'us-east-1'});
const r=await l.send(new InvokeCommand({FunctionName:'<함수명>',InvocationType:'RequestResponse',Payload:'{}'}));
console.log(r.StatusCode, Buffer.from(r.Payload).toString().slice(0,300), r.FunctionError||'');})();"
```
- 그 다음 **결과 데이터를 직접 조회** (DynamoDB Get/Redis GET)해서 값이 정확한지 확인. 상태코드 200 ≠ 데이터 정상.
- 장시간 함수는 async(Event) 호출 후 결과 저장소를 폴링.

## 6. 기록 + 커밋
- `.agent/INFRASTRUCTURE_MAP.md`에 기록 (분류·커밋해시·배포상태 — §43 스타일).
- 커밋·푸시. 배포 산출물(`scripts/lambda-*/`, `*.zip`)은 **커밋 금지**.

## 금지 사항
- 인프라맵 §42.3 검증 헌법 위반 배포 (엔진/스코어 관련일 때).
- 실호출 검증 없이 "배포 완료" 보고.
- Vercel cron과 Lambda가 같은 키를 쓰는데 한쪽만 바꾸는 것 (덮어쓰기 사고 — 13f-cache 전례).

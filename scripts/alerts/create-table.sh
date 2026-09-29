#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# PRO «내 종목» 알림 — DynamoDB 표 만들기 (IaC)
#
# ⚠️ 대표 승인 전에는 실행하지 않는다. 인자 없이 실행하면 «할 명령만 출력»한다(아무것도 만들지 않는다).
#    실제로 만들 때만:  bash scripts/alerts/create-table.sh --apply
#
# 표 설계(코드 정본: src/lib/alerts/store-dynamo.ts 머리 주석):
#   pk(S) + sk(S) 하나의 표 · 요청당 과금(PAY_PER_REQUEST) · TTL 속성 `ttl`(초) · GSI 없음 · 삭제 보호 켬
#     D#<deviceHash>/META           기기 사본(원문 토큰·RC 사용자 ID·종목·설정·PRO 만료)     TTL 30일(동기화마다 연장)
#     T#<TICKER>/D#<deviceHash>     종목 → 기기 역색인(발송용 비정규화)                      TTL 30일
#     IDX/T#<TICKER>                구독 종목 색인                                          TTL 30일
#     S#<T>#<event>#<session>/S     중복 억제(조건부 쓰기)                                   TTL 4일
#     C#<deviceHash>#<ET날짜>/C      기기 하루 발송 수(원자적 ADD)                            TTL 3일
#     P#<TICKER>/SNAP               직전 탐지 스냅샷                                        TTL 5일
#     M#<key>/M                     단계 완료 표식                                          TTL 3일
#     R#<bucket>#<window>/R         요청 수 제한 카운터                                      TTL 20분
#   Upstash 를 쓰지 않는다(비용 관리 대상 — 기획 §1). 사본은 앱이 다시 보내면 복원되므로 PITR 은 선택.
#
# 만든 뒤 운영 단계(대표 승인 항목):
#   1) Vercel 이 쓰는 IAM 사용자에 아래 정책(맨 끝 출력) 추가 — 기존 표 권한이 표 이름으로 좁혀져 있으면 새 표가 막힌다.
#   2) Vercel 환경 변수: REVENUECAT_SECRET_API_KEY(필수) · WATCHLIST_ALERTS_TABLE(이름을 바꿀 때만) ·
#      WATCHLIST_ALERTS_SEND=on(실발송을 켤 때만 — 없으면 크론은 드라이런)
#   3) vercel.json crons 에 추가: { "path": "/api/cron/watchlist-alerts?send=1", "schedule": "*/5 13-23 * * 1-5" }
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

TABLE="${WATCHLIST_ALERTS_TABLE:-signum-watchlist-alerts}"
REGION="${AWS_REGION:-us-east-1}"
APPLY=0
if [[ "${1:-}" == "--apply" ]]; then APPLY=1; fi

run() {
  if [[ $APPLY == 1 ]]; then
    echo "+ $*"
    "$@"
  else
    echo "(dry-run, not executed) $*"
  fi
}

if [[ $APPLY == 1 ]]; then
  echo "▶ Creating DynamoDB table '$TABLE' in $REGION"
else
  echo "▶ DRY RUN — nothing will be created. Re-run with --apply after approval."
fi

run aws dynamodb create-table \
  --region "$REGION" \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --deletion-protection-enabled \
  --tags Key=app,Value=signum Key=feature,Value=watchlist-alerts

run aws dynamodb wait table-exists --region "$REGION" --table-name "$TABLE"

run aws dynamodb update-time-to-live \
  --region "$REGION" \
  --table-name "$TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl"

ACCOUNT="${AWS_ACCOUNT_ID:-<ACCOUNT_ID>}"
cat <<EOF

▶ IAM policy to attach to the IAM user whose keys Vercel uses (AWS_ACCESS_KEY_ID) — least privilege, this table only:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WatchlistAlertsTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
    }
  ]
}
(The runner also Queries the existing table signum-flow-history for the max-pain 20-day distribution — read-only, already used by the app.)
EOF

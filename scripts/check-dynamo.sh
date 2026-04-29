#!/bin/bash
# v3: avoid python, use jq-like manual parsing

echo "=== ALPHA: NVDA last 3 ==="
aws dynamodb query \
  --table-name signum-alpha-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"NVDA"}}' \
  --region us-east-1 \
  --scan-index-forward false \
  --limit 3 \
  --output text 2>&1

echo ""
echo "=== ALPHA: AAPL earliest ==="
aws dynamodb query \
  --table-name signum-alpha-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"AAPL"}}' \
  --region us-east-1 \
  --scan-index-forward true \
  --limit 1 \
  --output text 2>&1

echo ""
echo "=== ALPHA: AAPL latest ==="
aws dynamodb query \
  --table-name signum-alpha-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"AAPL"}}' \
  --region us-east-1 \
  --scan-index-forward false \
  --limit 1 \
  --output text 2>&1

echo ""
echo "=== ALPHA: AAPL total count ==="
aws dynamodb query \
  --table-name signum-alpha-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"AAPL"}}' \
  --region us-east-1 \
  --select COUNT \
  --output text 2>&1

echo ""
echo "=== ALPHA: NVDA total count ==="
aws dynamodb query \
  --table-name signum-alpha-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"NVDA"}}' \
  --region us-east-1 \
  --select COUNT \
  --output text 2>&1

echo ""
echo "=== GEX: SPY latest 2 ==="
aws dynamodb query \
  --table-name signum-gex-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"SPY"}}' \
  --region us-east-1 \
  --scan-index-forward false \
  --limit 2 \
  --output text 2>&1

echo ""
echo "=== GEX: SPY earliest ==="
aws dynamodb query \
  --table-name signum-gex-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"SPY"}}' \
  --region us-east-1 \
  --scan-index-forward true \
  --limit 1 \
  --output text 2>&1

echo ""
echo "=== GEX: SPY count ==="
aws dynamodb query \
  --table-name signum-gex-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"SPY"}}' \
  --region us-east-1 \
  --select COUNT \
  --output text 2>&1

echo ""
echo "=== FLOW: SPY count ==="
aws dynamodb query \
  --table-name signum-flow-history \
  --key-condition-expression 'ticker = :t' \
  --expression-attribute-values '{":t":{"S":"SPY"}}' \
  --region us-east-1 \
  --select COUNT \
  --output text 2>&1

echo ""
echo "=== DONE ==="

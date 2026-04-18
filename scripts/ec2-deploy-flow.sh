#!/bin/bash
# ==============================================================================
# [SIGNUM HQ] EC2 Deployment Script: WebSocket Flow Accumulator (SSOT v2)
# Target EC2 Server: 52.23.98.13
# Purpose: Transfers the accumulator script + universe data to EC2, manages via PM2.
#
# v2 Changes (2026-04-17):
#   - Removed ioredis dependency (now uses Upstash REST API via https)
#   - Added stock_universe_us800.json transfer
#   - Only ws dependency needed (built-in https for Upstash)
# ==============================================================================

# User configuration
PEM_KEY="signum-websocket-key.pem"
EC2_USER="ubuntu"
EC2_IP="52.23.98.13"
EC2_DIR="/home/ubuntu/signum-workers"

echo "=============================================="
echo "🚀 INITIATING DEPLOYMENT: FLOW ACCUMULATOR v2"
echo "Target: $EC2_USER@$EC2_IP"
echo "=============================================="

# 1. Create target directory on EC2
echo "[1/5] Preparing remote directory..."
ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP "mkdir -p $EC2_DIR"

# 2. Transfer the pure engine code
echo "[2/5] Transferring EC2 Flow Accumulator Script..."
scp -i $PEM_KEY -o StrictHostKeyChecking=no scripts/ec2-flow-accumulator.js $EC2_USER@$EC2_IP:$EC2_DIR/

# 3. Transfer Universe Data (for filtered Redis writes)
echo "[3/5] Transferring Universe JSON..."
scp -i $PEM_KEY -o StrictHostKeyChecking=no data/stock_universe_us800.json $EC2_USER@$EC2_IP:$EC2_DIR/

# 4. Transfer Environment Variables (Polygon/Upstash Auth)
echo "[4/5] Transferring .env.local..."
scp -i $PEM_KEY -o StrictHostKeyChecking=no .env.local $EC2_USER@$EC2_IP:$EC2_DIR/

# 5. Install dependencies and start via PM2 on EC2
echo "[5/5] Starting 24/5 Background Daemon via PM2 on EC2..."
ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP << 'EOF'
  cd /home/ubuntu/signum-workers

  # Only ws needed (no ioredis — uses built-in https for Upstash REST)
  npm install ws 2>/dev/null

  # Stop existing if running, then start fresh
  pm2 delete signum-flow-acc 2>/dev/null
  pm2 start ec2-flow-accumulator.js --name "signum-flow-acc" --time --max-memory-restart 500M

  # Save PM2 configuration to revive on server reboot
  pm2 save

  echo "✅ DEPLOYMENT SUCCESSFUL! Showing PM2 Status:"
  pm2 status
EOF

echo "=============================================="
echo "🎯 ALL PROCEDURES COMPLETE."
echo "EC2 Accumulator v2 is now running as a persistent daemon."
echo "=============================================="

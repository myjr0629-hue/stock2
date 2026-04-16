#!/bin/bash
# ==============================================================================
# [SIGNUM HQ] EC2 Deployment Script: WebSocket Flow Accumulator (SSOT)
# Target EC2 Server: 52.23.98.13
# Purpose: Transfers the accumulator script to EC2 and manages it securely via PM2.
# ==============================================================================

# User configuration (Replace with actual pem key path if needed)
PEM_KEY="~/.ssh/signum-main.pem"
EC2_USER="ubuntu"
EC2_IP="52.23.98.13"
EC2_DIR="/home/ubuntu/signum-workers"

echo "=============================================="
echo "🚀 INITIATING DEPLOYMENT: FLOW ACCUMULATOR"
echo "Target: $EC2_USER@$EC2_IP"
echo "=============================================="

# 1. Create target directory on EC2
echo "[1/4] Preparing remote directory..."
ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP "mkdir -p $EC2_DIR"

# 2. Transfer the pure engine code
echo "[2/4] Transferring EC2 Flow Accumulator Script..."
scp -i $PEM_KEY -o StrictHostKeyChecking=no scripts/ec2-flow-accumulator.js $EC2_USER@$EC2_IP:$EC2_DIR/

# 3. Transfer Environment Variables (Crucial for Polygon/Upstash Auth)
echo "[3/4] Transferring .env.local..."
scp -i $PEM_KEY -o StrictHostKeyChecking=no .env.local $EC2_USER@$EC2_IP:$EC2_DIR/

# 4. Install dependencies and start via PM2 on EC2
echo "[4/4] Starting 24/5 Background Daemon via PM2 on EC2..."
ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP << 'EOF'
  cd /home/ubuntu/signum-workers
  
  # Ensure PM2 & Dependencies exist
  npm install ws dotenv
  
  # Restart or Start the script
  pm2 restart ec2-flow-accumulator || pm2 start ec2-flow-accumulator.js --name "signum-flow-acc" --time
  
  # Save PM2 configuration to revive on server reboot
  pm2 save
  
  echo "✅ DEPLOYMENT SUCCESSFUL! Showing PM2 Status:"
  pm2 status signum-flow-acc
EOF

echo "=============================================="
echo "🎯 ALL PROCEDURES COMPLETE."
echo "EC2 Accumulator is now running as a persistent daemon."
echo "=============================================="

#!/bin/bash
# ══════════════════════════════════════════════════════════════
# SIGNUM HQ — EC2 Guardian Deployment Script
# ══════════════════════════════════════════════════════════════
# 
# Deploys Guardian Worker + WebSocket Hub to EC2 alongside
# the existing Redis Proxy. Uses PM2 for process management.
#
# Usage: scp this file + scripts to EC2, then run:
#   bash ec2-deploy-guardian.sh
# ══════════════════════════════════════════════════════════════

set -e
DEPLOY_DIR="/opt/signum-ws"

echo "═══════════════════════════════════════════════"
echo "  Deploying Guardian Worker + WebSocket Hub"
echo "═══════════════════════════════════════════════"

# Fix Windows line endings
for f in guardian-worker.js guardian-ws.js redis-proxy.js; do
    if [ -f "$DEPLOY_DIR/$f" ]; then
        sed -i 's/\r$//' "$DEPLOY_DIR/$f"
    fi
done

# Install dependencies if needed
cd "$DEPLOY_DIR"
if [ ! -d "node_modules/ws" ]; then
    echo "--- Installing ws (WebSocket) library ---"
    npm install ws 2>/dev/null || /usr/local/bin/npm install ws
fi

# Stop existing guardian processes
echo "--- Stopping existing Guardian processes ---"
pm2 stop guardian-worker 2>/dev/null || true
pm2 stop guardian-ws 2>/dev/null || true
sleep 2

# Start Guardian Worker (port 8083 health check)
echo "--- Starting Guardian Worker ---"
pm2 start guardian-worker.js --name guardian-worker \
    --max-memory-restart 300M \
    --exp-backoff-restart-delay=1000 \
    -- --color

# Start WebSocket Hub (port 8082)
echo "--- Starting WebSocket Hub ---"
pm2 start guardian-ws.js --name guardian-ws \
    --max-memory-restart 200M \
    --exp-backoff-restart-delay=1000 \
    -- --color

# Save PM2 config for auto-restart
pm2 save

# Wait and verify
sleep 5
echo ""
echo "═══════════════════════════════════════════════"
echo "  Health Checks"
echo "═══════════════════════════════════════════════"

echo ""
echo "--- Redis Proxy (8081) ---"
curl -s http://localhost:8081/health -H "Authorization: Bearer signum-redis-proxy-2026" | python3 -m json.tool 2>/dev/null || echo "FAIL"

echo ""
echo "--- Guardian Worker (8083) ---"
curl -s http://localhost:8083/health | python3 -m json.tool 2>/dev/null || echo "FAIL"

echo ""
echo "--- WebSocket Hub (8082) ---"
curl -s http://localhost:8082/health | python3 -m json.tool 2>/dev/null || echo "FAIL"

echo ""
echo "--- PM2 Process List ---"
pm2 list

echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployment Complete!"
echo ""
echo "  Services:"
echo "    Redis Proxy:     http://localhost:8081"
echo "    Guardian Worker: http://localhost:8083 (health)"
echo "    WebSocket Hub:   ws://localhost:8082/guardian"
echo ""
echo "  Logs:"
echo "    pm2 logs guardian-worker"
echo "    pm2 logs guardian-ws"
echo "═══════════════════════════════════════════════"

#!/bin/bash
cd /opt/signum-ws
# Fix Windows line endings
sed -i 's/\r$//' redis-proxy.js
# Test ElastiCache connection
/usr/local/bin/node -e "
const Redis = require('ioredis');
const c = new Redis({host:'signum-redis.dhzfzt.0001.use1.cache.amazonaws.com',port:6379,connectTimeout:5000});
c.ping().then(p => {console.log('PING:', p); process.exit(0)}).catch(e => {console.log('ERR:', e.message); process.exit(1)});
setTimeout(() => {console.log('TIMEOUT'); process.exit(1)}, 8000);
"
echo "--- Starting proxy ---"
pkill -f redis-proxy 2>/dev/null
sleep 1
nohup /usr/local/bin/node redis-proxy.js > /tmp/redis-proxy.log 2>&1 &
sleep 3
cat /tmp/redis-proxy.log
echo "--- Curl test ---"
curl -s http://localhost:8081/health -H "Authorization: Bearer signum-redis-proxy-2026"
echo ""
echo "--- DONE ---"

/**
 * EC2 WebSocket Hub — Launch Script
 * Creates a t3.micro EC2 instance with WebSocket server
 */
require('dotenv').config({ path: '.env.local' });
const { EC2Client, CreateKeyPairCommand, RunInstancesCommand } = require('@aws-sdk/client-ec2');
const fs = require('fs');

const c = new EC2Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const ELASTICACHE_HOST = 'signum-redis.dhzfzt.0001.use1.cache.amazonaws.com';

const userDataScript = `#!/bin/bash
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git
mkdir -p /opt/signum-ws
cd /opt/signum-ws
npm init -y
npm install ws ioredis

cat > server.js << 'WSEOF'
const WebSocket = require("ws");
const Redis = require("ioredis");

const wss = new WebSocket.Server({ port: 8080 });
const redis = new Redis({ host: "${ELASTICACHE_HOST}", port: 6379 });
const sub = redis.duplicate();

console.log("[WS Hub] Starting on port 8080...");

const tickerSubs = new Map();

wss.on("connection", (ws) => {
  ws.tickers = new Set();
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "subscribe" && data.tickers) {
        data.tickers.forEach((t) => {
          ws.tickers.add(t);
          if (!tickerSubs.has(t)) tickerSubs.set(t, new Set());
          tickerSubs.get(t).add(ws);
        });
        ws.send(JSON.stringify({ type: "subscribed", tickers: [...ws.tickers] }));
      }
    } catch {}
  });

  ws.on("close", () => {
    ws.tickers.forEach((t) => tickerSubs.get(t) && tickerSubs.get(t).delete(ws));
  });
});

sub.subscribe("signum:prices", "signum:gex", "signum:alerts");
sub.on("message", (channel, message) => {
  try {
    const data = JSON.parse(message);
    const ticker = data.ticker;
    if (ticker && tickerSubs.has(ticker)) {
      const payload = JSON.stringify({ type: channel.split(":")[1], ...data });
      tickerSubs.get(ticker).forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      });
    }
  } catch {}
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

console.log("[WS Hub] Ready");
WSEOF

node server.js &
`;

async function launch() {
    const keyName = 'signum-websocket-key';

    // Create key pair (skip if exists)
    try {
        const kp = await c.send(new CreateKeyPairCommand({ KeyName: keyName, KeyType: 'ed25519' }));
        fs.writeFileSync('signum-websocket-key.pem', kp.KeyMaterial);
        console.log('Key saved: signum-websocket-key.pem');
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log('Key already exists');
        } else {
            console.log('Key error:', e.message);
        }
    }

    // Launch EC2
    const result = await c.send(new RunInstancesCommand({
        ImageId: 'ami-0c02fb55956c7d316', // Amazon Linux 2
        InstanceType: 't3.micro',
        MinCount: 1,
        MaxCount: 1,
        KeyName: keyName,
        SubnetId: 'subnet-0c831067aa449a38e', // signum-public
        SecurityGroupIds: [process.env.AWS_SECURITY_GROUP_ID],
        UserData: Buffer.from(userDataScript).toString('base64'),
        TagSpecifications: [{
            ResourceType: 'instance',
            Tags: [
                { Key: 'Name', Value: 'signum-websocket-hub' },
                { Key: 'Project', Value: 'signum-hq' },
            ],
        }],
    }));

    const instance = result.Instances[0];
    console.log('Instance ID:', instance.InstanceId);
    console.log('State:', instance.State.Name);
    console.log('Type:', instance.InstanceType);
}

launch().catch(e => console.log('Launch ERR:', e.message));

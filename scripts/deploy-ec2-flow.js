/**
 * EC2 Deployment Script v2
 * Deploys the Dark Pool Accumulator v2 to EC2 automatically.
 * 
 * v2 Changes (2026-04-17):
 *   - Removed ioredis dependency (uses Upstash REST API via built-in https)
 *   - Added stock_universe_us800.json transfer
 *   - Added --max-memory-restart 500M for PM2 stability
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PEM_KEY = "signum-websocket-key.pem";
const EC2_USER = "ec2-user";
const EC2_IP = "52.23.98.13";
const EC2_DIR = "/home/ec2-user/signum-workers";

console.log("==============================================");
console.log(`🚀 INITIATING DEPLOYMENT: FLOW ACCUMULATOR v2 TO ${EC2_USER}@${EC2_IP}`);
console.log("==============================================");

if (!fs.existsSync(PEM_KEY)) {
  console.error(`❌ Missing SSH Key: ${PEM_KEY}`);
  console.error("Please ensure the PEM key is in the project root.");
  process.exit(1);
}

try {
  const sshOpts = `-i ${PEM_KEY} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;

  // 1. Prepare directory
  console.log("\n[1/5] Preparing remote directory...");
  execSync(`ssh ${sshOpts} ${EC2_USER}@${EC2_IP} "mkdir -p ${EC2_DIR}"`, { stdio: "inherit" });

  // 2. Transfer script
  console.log("\n[2/5] Transferring EC2 Flow Accumulator v2 Script...");
  execSync(`scp ${sshOpts} scripts/ec2-flow-accumulator.js ${EC2_USER}@${EC2_IP}:${EC2_DIR}/`, { stdio: "inherit" });

  // 3. Transfer universe data
  console.log("\n[3/5] Transferring Universe JSON...");
  execSync(`scp ${sshOpts} data/stock_universe_us800.json ${EC2_USER}@${EC2_IP}:${EC2_DIR}/`, { stdio: "inherit" });

  // 4. Transfer .env.local
  console.log("\n[4/5] Transferring .env.local...");
  if (fs.existsSync(".env.local")) {
    execSync(`scp ${sshOpts} .env.local ${EC2_USER}@${EC2_IP}:${EC2_DIR}/`, { stdio: "inherit" });
  } else {
    console.warn("⚠️ .env.local not found locally, skipping transfer.");
  }

  // 5. Install & Run PM2
  console.log("\n[5/5] Starting 24/5 Background Daemon via PM2 on EC2...");
  const setupCmd = [
    `cd ${EC2_DIR}`,
    'npm init -y 2>/dev/null',
    'npm install ws ioredis 2>/dev/null',
    'pm2 delete signum-flow-acc 2>/dev/null; true',
    `pm2 start ec2-flow-accumulator.js --name 'signum-flow-acc' --time --max-memory-restart 500M`,
    'pm2 save',
    'echo "--- PM2 STATUS ---"',
    'pm2 status',
  ].join(' && ');

  execSync(`ssh ${sshOpts} ${EC2_USER}@${EC2_IP} "${setupCmd}"`, { stdio: "inherit" });

  console.log("\n==============================================");
  console.log("🎯 ALL PROCEDURES COMPLETE.");
  console.log("EC2 Accumulator v2 is now running as a persistent daemon.");
  console.log("==============================================");
} catch (error) {
  console.error("\n❌ DEPLOYMENT FAILED:", error.message);
  process.exit(1);
}

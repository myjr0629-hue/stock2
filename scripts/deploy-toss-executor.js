/**
 * Deploy the Toss order executor to the fixed-IP EC2 (signum-websocket-hub).
 *
 *   1. Opens security-group ingress TCP 8090 (idempotent).
 *   2. scp scripts/ec2-toss-executor.js → ~/toss-executor/
 *   3. pm2 start/restart as `signum-toss-exec`.
 *
 * Keys are NOT deployed here — run scripts/setup-toss-keys.js afterwards
 * (operator types them; they never enter chat or the repo).
 *
 * Run: node scripts/deploy-toss-executor.js
 */
require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');
const { EC2Client, DescribeInstancesCommand, AuthorizeSecurityGroupIngressCommand } = require('@aws-sdk/client-ec2');

const EC2_IP = '52.23.98.13';
const PEM = 'signum-websocket-key.pem';
const USER = 'ec2-user';
const DIR = '/home/ec2-user/toss-executor';
const SSH = `-i ${PEM} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`;

async function openPort() {
  const c = new EC2Client({ region: 'us-east-1' });
  const r = await c.send(new DescribeInstancesCommand({ Filters: [{ Name: 'ip-address', Values: [EC2_IP] }] }));
  const inst = r.Reservations?.[0]?.Instances?.[0];
  if (!inst) throw new Error('EC2 instance not found for ' + EC2_IP);
  const sg = inst.SecurityGroups?.[0]?.GroupId;
  console.log('SG:', sg);
  try {
    await c.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sg,
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 8090, ToPort: 8090, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'toss-executor (HMAC-authed)' }] }],
    }));
    console.log('port 8090 opened');
  } catch (e) {
    if (e.name === 'InvalidPermission.Duplicate') console.log('port 8090 already open');
    else throw e;
  }
}

(async () => {
  await openPort();
  console.log('deploying executor…');
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "mkdir -p ${DIR}"`, { stdio: 'inherit' });
  execSync(`scp ${SSH} scripts/ec2-toss-executor.js ${USER}@${EC2_IP}:${DIR}/`, { stdio: 'inherit' });
  execSync(`ssh ${SSH} ${USER}@${EC2_IP} "cd ${DIR} && (pm2 restart signum-toss-exec 2>/dev/null || pm2 start ec2-toss-executor.js --name signum-toss-exec --time) && pm2 save && pm2 ls"`, { stdio: 'inherit' });
  console.log('\nhealth check…');
  const r = await fetch(`http://${EC2_IP}:8090/health`, { signal: AbortSignal.timeout(8000) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  console.log('health:', JSON.stringify(r));
  console.log('\n✅ executor deployed. 다음: node scripts/setup-toss-keys.js (키 설치)');
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * EC2 원격 명령 실행 (AWS SSM) — SSH 키 없이 외부에서 EC2 제어
 *
 * [배경] 2026-08-29, EC2 접근 수단이 없어 WebSocket 워커 이관이 막혔다.
 *   - 로컬에 signum-websocket-key.pem 없음
 *   - SSM 은 IAM Role 에 AmazonSSMManagedInstanceCore 가 빠져 미등록 상태였음
 *   → 정책 부착 + Agent 재시작으로 해결. 이제 이 스크립트로 원격 제어 가능.
 *
 * 사용법:
 *   node scripts/ec2-ssm.js "pm2 list"
 *   node scripts/ec2-ssm.js --file ./local.js /opt/signum-ws/remote.js   (파일 업로드)
 *
 * 자격증명: ENV_FILE 또는 .env.local 의 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 */
require("dotenv").config({ path: process.env.ENV_FILE || ".env.local" });
const fs = require("fs");
const {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} = require("@aws-sdk/client-ssm");

const INSTANCE_ID = process.env.EC2_INSTANCE_ID || "i-0c8e51d26ddc9b3c1";
const REGION = process.env.AWS_REGION || "us-east-1";

const ssm = new SSMClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * ⚠️ SSM 은 root + HOME 미설정으로 실행된다.
 *    PM2 는 HOME 이 없으면 /etc/.pm2 를 보고 EPIPE 로 죽으므로,
 *    ec2-user 컨텍스트를 강제로 만들어 준다.
 */
const PRELUDE = [
  "export HOME=/home/ec2-user",
  "export PM2_HOME=/home/ec2-user/.pm2",
  "export PATH=$PATH:/usr/local/bin:/usr/bin",
  "cd /opt/signum-ws 2>/dev/null || cd /home/ec2-user",
];

async function run(commands, { timeout = 300, raw = false } = {}) {
  const body = raw ? commands : [...PRELUDE, ...commands];
  const sent = await ssm.send(
    new SendCommandCommand({
      InstanceIds: [INSTANCE_ID],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: body, executionTimeout: [String(timeout)] },
      TimeoutSeconds: 60,
    })
  );
  const id = sent.Command.CommandId;

  for (let i = 0; i < timeout / 2 + 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const inv = await ssm.send(
        new GetCommandInvocationCommand({ CommandId: id, InstanceId: INSTANCE_ID })
      );
      if (["Success", "Failed", "Cancelled", "TimedOut"].includes(inv.Status)) {
        return {
          status: inv.Status,
          stdout: inv.StandardOutputContent || "",
          stderr: inv.StandardErrorContent || "",
        };
      }
    } catch (e) {
      if (e.name !== "InvocationDoesNotExist") throw e;
    }
  }
  throw new Error("SSM 명령 타임아웃");
}

/** 로컬 파일을 EC2 로 업로드 (base64 청크 전송) */
async function upload(localPath, remotePath) {
  const b64 = fs.readFileSync(localPath).toString("base64");
  const CHUNK = 40000; // SSM 파라미터 길이 제한 고려
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));

  const tmp = `/tmp/upload_${Date.now()}.b64`;
  await run([`rm -f ${tmp}`]);
  for (let i = 0; i < parts.length; i++) {
    await run([`printf '%s' '${parts[i]}' >> ${tmp}`]);
    process.stderr.write(`  업로드 ${i + 1}/${parts.length}\r`);
  }
  const r = await run([
    `base64 -d ${tmp} > '${remotePath}' && rm -f ${tmp} && ls -l '${remotePath}' && md5sum '${remotePath}'`,
  ]);
  process.stderr.write("\n");
  return r;
}

module.exports = { run, upload, INSTANCE_ID };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args[0] === "--file") {
      const r = await upload(args[1], args[2]);
      console.log(r.status);
      console.log(r.stdout || r.stderr);
    } else {
      const r = await run([args.join(" ")]);
      console.log(`[${r.status}]`);
      if (r.stdout) console.log(r.stdout);
      if (r.stderr) console.error("STDERR:", r.stderr);
    }
  })().catch((e) => {
    console.error("실패:", e.name, e.message);
    process.exit(1);
  });
}

/**
 * Lambda 배포 — Intrinio 이관분
 *  1) INTRINIO_API_KEY 환경변수 추가 (기존 변수 보존)
 *  2) 코드 zip 업로드
 *
 * Mac 호환 (기존 deploy-lambda-v7.js 는 PowerShell 의존)
 */
// AWS 자격증명: 환경변수 → .env.prod(있으면) → .env.local
require("dotenv").config({ path: process.env.ENV_FILE || ".env.local" });
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
} = require("@aws-sdk/client-lambda");

const ROOT = process.cwd();
const TMP = require("os").tmpdir() + "/signum-lambda-zip";
const INTRINIO_KEY = process.env.INTRINIO_API_KEY;

// ⚠️ 2026-08-29 사고: `vercel env pull` 은 Secret 을 **"[SENSITIVE]" 자리표시자**로
//    써 놓는다. 그 파일을 ENV_FILE 로 물리고 배포하면 살아 있던 Lambda 키를
//    자리표시자로 덮어써서 조용히 죽는다(실제로 signum-xs 가 그렇게 됐다).
//    «값이 있다»가 아니라 «값이 말이 되는가»를 봐야 한다.
if (!INTRINIO_KEY || INTRINIO_KEY.length < 20 || /SENSITIVE|PLACEHOLDER|CHANGEME/i.test(INTRINIO_KEY)) {
  console.error(`실패: INTRINIO_API_KEY 가 유효하지 않다 (${INTRINIO_KEY ? `"${INTRINIO_KEY.slice(0, 12)}…" ${INTRINIO_KEY.length}자` : "미설정"})`);
  console.error("      vercel env pull 로 받은 파일에는 Secret 이 들어 있지 않다.");
  console.error("      EC2 /opt/signum-ws/.env 의 실제 키를 쓸 것.");
  process.exit(1);
}

const cred = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const lambda = new LambdaClient({ region: "us-east-1", credentials: cred });

// dir: 소스 디렉터리 / fn: Lambda 함수명
const TARGETS = [
  { fn: "signum-harvest", dir: "harvest_lambda" },
  { fn: "signum-flow-harvest", dir: "scripts/lambda-flow-harvest" },
  { fn: "signum-13f", dir: "scripts/lambda-13f" },
  { fn: "signum-xs", dir: "scripts/lambda-xs" },
];

const ONLY = process.argv[2]; // 특정 함수만 배포하고 싶을 때

async function waitReady(fn) {
  for (let i = 0; i < 40; i++) {
    const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
    if (c.LastUpdateStatus !== "InProgress" && c.State !== "Pending") return c;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("timeout waiting ready");
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });

  for (const t of TARGETS) {
    if (ONLY && t.fn !== ONLY) continue;
    const src = path.join(ROOT, t.dir);
    if (!fs.existsSync(src)) { console.log(`- 소스 없음: ${t.dir}`); continue; }

    console.log(`\n━━ ${t.fn} ━━`);

    // 1) 환경변수: 기존 보존 + INTRINIO 추가
    const cfg = await waitReady(t.fn);
    const env = Object.assign({}, (cfg.Environment && cfg.Environment.Variables) || {});
    const hadKey = !!env.INTRINIO_API_KEY;
    env.INTRINIO_API_KEY = INTRINIO_KEY;
    if (!env.INTRINIO_BASE_URL) env.INTRINIO_BASE_URL = "https://api-v2.intrinio.com";

    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: t.fn,
      Environment: { Variables: env },
    }));
    console.log(`  env: INTRINIO_API_KEY ${hadKey ? "갱신" : "추가"} (총 ${Object.keys(env).length}개, 기존 보존)`);
    await waitReady(t.fn);

    // 2) zip (node_modules 포함, .git 제외)
    const zip = path.join(TMP, `${t.fn}.zip`);
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    execSync(`cd "${src}" && /usr/bin/zip -q -r "${zip}" . -x "*.git*" "*.DS_Store" "*.zip"`, { stdio: "pipe" });
    const buf = fs.readFileSync(zip);
    console.log(`  zip: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);

    // 3) 코드 업로드
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: t.fn, ZipFile: buf }));
    const done = await waitReady(t.fn);
    console.log(`  ✅ 배포 완료 · ${done.LastUpdateStatus} · CodeSize ${Math.round(done.CodeSize / 1024)}KB`);
  }

  console.log("\n완료");
})().catch((e) => {
  console.error("실패:", e.name, e.message);
  process.exit(1);
});

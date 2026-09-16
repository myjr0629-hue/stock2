#!/usr/bin/env node
/**
 * Secret guard — refuses commits / CI runs that contain hardcoded credentials.
 *
 *   node scripts/check-secrets.js --staged   # pre-commit: staged blobs only (.githooks/pre-commit)
 *   node scripts/check-secrets.js --all      # CI: every tracked text file
 *   node scripts/check-secrets.js <files…>   # ad hoc
 *
 * Background (2026-09-16, .agent/ALPHA_SCORE_FULL_REPORT_2026-09-16.md §7): a
 * Polygon key sat in 77 tracked files and the Redis-proxy bearer token in 49.
 * Rotating keys is pointless if the next commit pastes them back — this is the
 * gate. It only knows PATTERNS (prefixes/shapes), never the values themselves.
 *
 * To allow a deliberate match (e.g. a placeholder in docs) put the marker
 * `secret-guard: allow` on the same line.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RULES = [
  // ── keys that have actually leaked from this repo (rotated/revoked, but must never return) ──
  { name: 'polygon/massive key (leaked 2026-09)', re: /iKNEA6cQ6kqWWuHwURT_/ },
  { name: 'redis-proxy bearer token (old default)', re: /signum-redis-proxy-20\d\d/ },
  // ── generic shapes ──
  { name: 'literal bearer token in code', re: /['"`]Bearer\s+[A-Za-z0-9_\-.]{24,}['"`]/ },
  { name: 'apiKey= literal in URL', re: /[?&]apiKey=[A-Za-z0-9_\-]{24,}/ },
  { name: 'api_key= literal in URL', re: /[?&]api_key=[A-Za-z0-9]{32,}/ },
  { name: 'Toss Open API secret', re: /\btssk_(?:live|test)_[A-Za-z0-9]{8,}/ },
  { name: 'Toss Open API client id', re: /\btsck_(?:live|test)_[A-Za-z0-9]{8,}/ },
  { name: 'executor HMAC secret', re: /\bexsec_[0-9a-f]{32,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS secret key assignment', re: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*['"]?[A-Za-z0-9/+]{40}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'Stripe live secret', re: /\bsk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'Upstash REST token literal', re: /UPSTASH_REDIS_REST_TOKEN\s*[=:]\s*['"][A-Za-z0-9=_-]{30,}['"]/ },
  { name: 'Intrinio key literal', re: /INTRINIO_API_KEY\s*[=:]\s*['"][A-Za-z0-9]{40,}['"]/ },
];

const SKIP_DIRS = /(^|\/)(node_modules|\.next|\.git|snapshots|public\/videos|remotion\/out)(\/|$)/;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|mp4|mov|mp3|wav|zip|gz|tgz|pdf|woff2?|ttf|otf|eot|bin|jar|class|so|dylib|pem|p8|p12|keystore|jks|aab|apk|ipa|lock)$/i;
// Firebase client configs: the API key there is a public app identifier by design (restricted server-side), not a secret
const ALLOW_PATHS = new Set(['android/app/google-services.json', 'ios/App/App/GoogleService-Info.plist']);
const SELF = path.relative(process.cwd(), __filename).replace(/\\/g, '/');
const ALLOW_MARK = 'secret-guard: allow';

function sh(cmd) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }
function listStaged() {
  return sh('git diff --cached --name-only --diff-filter=ACMR -z').split('\0').filter(Boolean);
}
function listAll() { return sh('git ls-files -z').split('\0').filter(Boolean); }
function stagedBlob(f) { try { return sh(`git show ":${f.replace(/"/g, '\\"')}"`); } catch { return null; } }
function looksBinary(buf) { return buf.slice(0, 4096).includes('\0'); }

function scan(files, reader) {
  const hits = [];
  for (const f of files) {
    if (f === SELF || ALLOW_PATHS.has(f) || SKIP_DIRS.test(f) || BINARY_EXT.test(f)) continue;
    const text = reader(f);
    if (text == null || looksBinary(text)) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.includes(ALLOW_MARK)) return;
      for (const r of RULES) {
        if (r.re.test(line)) {
          // never echo the matched value — only file:line and the rule name
          hits.push(`${f}:${i + 1}  ${r.name}`);
          break;
        }
      }
    });
  }
  return hits;
}

const args = process.argv.slice(2);
let hits;
if (args.includes('--staged')) {
  hits = scan(listStaged(), stagedBlob);
} else if (args.includes('--all')) {
  hits = scan(listAll(), (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } });
} else if (args.length) {
  hits = scan(args, (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } });
} else {
  console.error('usage: check-secrets.js --staged | --all | <files…>');
  process.exit(2);
}

if (hits.length) {
  console.error(`\n✖ secret guard: ${hits.length} hit(s) — commit refused. Move the value to an environment variable.`);
  for (const h of hits) console.error('  ' + h);
  console.error(`\n(If a line is a deliberate placeholder, add "${ALLOW_MARK}" to it.)`);
  process.exit(1);
}
console.log(`✓ secret guard: clean (${args.includes('--staged') ? 'staged files' : args.includes('--all') ? 'all tracked files' : args.length + ' file(s)'})`);

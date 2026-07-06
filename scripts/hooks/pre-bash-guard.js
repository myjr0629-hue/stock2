#!/usr/bin/env node
// ============================================================================
// pre-bash-guard — Claude Code PreToolUse hook (Bash tool)
// ============================================================================
// Mechanical enforcement of CLAUDE.md 절대 규칙 4·5, independent of which model
// is driving. Runs before EVERY Bash tool call; fast-exits unless the command
// is a `git push` or a Lambda deploy script.
//
//   git push        → ① two-machine sync check (fetch, block if behind origin)
//                     ② npx tsc --noEmit (block push on type errors)
//   deploy-*.js 실행 → ① sync check only (deploys must be from latest code)
//
// Exit 0 = allow. Exit 2 = BLOCK (stderr is fed back to the agent as feedback).
// Fail-open on unexpected errors: guard must never brick unrelated commands.
// Cross-platform (node on PC + Mac).
// ============================================================================

const { execSync } = require('child_process');

function sh(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, ...opts });
}

let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
    let cmd = '';
    try { cmd = String(JSON.parse(raw)?.tool_input?.command || ''); } catch { process.exit(0); }

    const isPush = /\bgit\b[^\n;|&]*\bpush\b/.test(cmd);
    const isLambdaDeploy = /scripts[\/\\](deploy-[\w.-]+\.js)/.test(cmd) || /(UpdateFunctionCode|CreateFunctionCommand)/.test(cmd);
    if (!isPush && !isLambdaDeploy) process.exit(0);

    // ── ① Two-machine sync check (PC↔Mac) ──
    try {
        sh('git fetch origin main --quiet');
        const behind = parseInt(sh('git rev-list --count HEAD..origin/main').trim(), 10);
        if (behind > 0) {
            console.error(
                `[GUARD/BLOCK] 로컬이 origin/main보다 ${behind}커밋 뒤처져 있습니다 (다른 머신이 푸시함).\n` +
                `푸시/배포 전 반드시 동기화하세요:\n` +
                `  git -c rebase.autoStash=true pull --rebase origin main\n` +
                `그 후 다시 시도하세요. (CLAUDE.md 절대 규칙 5)`
            );
            process.exit(2);
        }
    } catch (e) {
        // Offline/fetch failure → warn but don't brick the workflow
        console.error('[GUARD/WARN] git fetch 실패 (오프라인?) — 동기화 검사를 건너뜁니다: ' + String(e.message).slice(0, 120));
    }

    // ── ② Type check before push ──
    if (isPush) {
        try {
            sh('npx tsc --noEmit', { timeout: 150000 });
        } catch (e) {
            const out = String(e.stdout || e.message || '').split('\n').filter(Boolean).slice(0, 12).join('\n');
            console.error(
                `[GUARD/BLOCK] tsc 타입 에러 — 푸시가 차단되었습니다. 먼저 고치세요 (CLAUDE.md 절대 규칙 4):\n${out}`
            );
            process.exit(2);
        }
    }

    process.exit(0);
});

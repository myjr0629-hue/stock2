const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const script = path.resolve(__dirname, '../scripts/vercel-ignore-build.sh');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(
    ([key]) => !key.startsWith('VERCEL_') && !key.startsWith('GIT_'),
));

function repository(t) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-ignore-'));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', [
        '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
        '-c', 'user.name=Build test', '-c', 'user.email=build-test@example.invalid',
        ...args,
    ], { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const write = (name, content = 'test\n') => {
        const target = path.join(cwd, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    };
    const commit = () => {
        git('add', '--all');
        git('commit', '--quiet', '--allow-empty', '-m', 'fixture');
        return git('rev-parse', 'HEAD');
    };
    git('init', '--quiet', '--template=');
    write('src/base.js');
    const previous = commit();
    const run = (env = {}) => {
        const result = spawnSync('bash', [script], {
            cwd,
            env: {
                ...cleanEnv,
                VERCEL_GIT_COMMIT_REF: 'main',
                VERCEL_GIT_PREVIOUS_SHA: previous,
                ...env,
            },
            encoding: 'utf8',
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.ok(result.status === 0 || result.status === 1, result.stderr);
        return result.status;
    };
    return { cwd, git, write, commit, previous, run };
}

test('vercel.json invokes the ignore script', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
    assert.equal(config.ignoreCommand, 'bash scripts/vercel-ignore-build.sh');
});

test('main skips a commit containing only unrelated paths', t => {
    const repo = repository(t);
    for (const name of [
        '.agent/task.json', 'docs/guide.txt', 'scripts/audit.js',
        'tests/check.cjs', '.github/workflows/check.yml', 'README.md', 'nested/guide.md',
        'docs/한글 가이드.md', 'docs/line\nbreak.md',
    ]) repo.write(name);
    repo.commit();
    assert.equal(repo.run(), 0);
});

for (const name of [
    'src/change.ts', 'src/x.md', 'public/x.md', 'package.json', 'next.config.mjs',
    'vercel.json', 'package-lock.json', '.agents/task.json', 'other/data.json',
    'src/line\nbreak.md',
]) {
    test(`main builds when docs accompany app path ${JSON.stringify(name)}`, t => {
        const repo = repository(t);
        repo.write('docs/guide.md');
        repo.write(name);
        repo.commit();
        assert.equal(repo.run(), 1);
    });
}

for (const [label, env, expected] of [
    ['missing PREVIOUS_SHA', { VERCEL_GIT_PREVIOUS_SHA: '' }, 1],
    ['unavailable SHA', { VERCEL_GIT_PREVIOUS_SHA: 'f'.repeat(40) }, 1],
    ['missing branch', { VERCEL_GIT_COMMIT_REF: '' }, 1],
    ['fix branch', { VERCEL_GIT_COMMIT_REF: 'fix/example' }, 0],
    ['feat branch', { VERCEL_GIT_COMMIT_REF: 'feat/example' }, 0],
    ['preview branch', { VERCEL_GIT_COMMIT_REF: 'preview/example' }, 1],
    ['explicit preview message', {
        VERCEL_GIT_COMMIT_REF: 'fix/example',
        VERCEL_GIT_COMMIT_MESSAGE: 'fix: example\n\n[preview] please',
    }, 1],
    ['preview-like branch without slash', { VERCEL_GIT_COMMIT_REF: 'preview-example' }, 0],
    ['message without literal marker', {
        VERCEL_GIT_COMMIT_REF: 'fix/example', VERCEL_GIT_COMMIT_MESSAGE: 'preview please',
    }, 0],
]) {
    test(label, t => {
        const repo = repository(t);
        assert.equal(repo.run(env), expected);
    });
}

test('main builds an empty diff', t => {
    const repo = repository(t);
    repo.commit();
    assert.equal(repo.run(), 1);
});

test('main still checks paths when the message contains [preview]', t => {
    const repo = repository(t);
    repo.write('docs/guide.md');
    repo.commit();
    assert.equal(repo.run({ VERCEL_GIT_COMMIT_MESSAGE: '[preview]' }), 0);
});

test('main compares the entire range from PREVIOUS_SHA', t => {
    const repo = repository(t);
    repo.write('src/change.ts');
    repo.commit();
    repo.write('docs/guide.md');
    repo.commit();
    assert.equal(repo.run(), 1);
});

test('main builds when an app file is moved to docs', t => {
    const repo = repository(t);
    fs.mkdirSync(path.join(repo.cwd, 'docs'));
    repo.git('mv', 'src/base.js', 'docs/base.js');
    repo.commit();
    assert.equal(repo.run(), 1);
});

test('main builds on a diff error even when PREVIOUS_SHA exists', t => {
    const repo = repository(t);
    fs.writeFileSync(path.join(repo.cwd, '.git/HEAD'), 'ref: refs/heads/missing\n');
    assert.equal(repo.run(), 1);
});

test('main builds outside a Git repository', t => {
    const repo = repository(t);
    fs.rmSync(path.join(repo.cwd, '.git'), { recursive: true, force: true });
    assert.equal(repo.run(), 1);
});

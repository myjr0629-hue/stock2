// 실행: node --test tests/oldLambdaLineageGuard.test.js
// 전체 소스를 VM에서 실행하되 모듈 로딩·실제 process 접근을 막는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const targets = [
    'scripts/deploy-lambda-v3.js',
    'scripts/deploy-lambda-v4.js',
    'scripts/deploy-lambda-v5.js',
    'scripts/deploy-lambda-v6.js',
    'scripts/deploy-lambda-v7.js',
    'scripts/lambda-harvest/index.js',
    'scripts/update-lambda.js',
    'scripts/aws-setup-lambda.js',
];
const warning = '옛 계보 — 운영 signum-harvest 는 harvest_lambda/ 로 배포. 이 스크립트를 돌리면 운영 코드·환경변수를 덮어쓴다';

for (const target of targets) {
    const source = fs.readFileSync(path.join(__dirname, '..', target), 'utf8');
    const script = new vm.Script(source, { filename: target });

    test(`${target}: 미설정·1 이외 값은 모듈 로딩 전에 exit 1`, () => {
        for (const value of [undefined, '', '0', 'true', '01', '1 ']) {
            const env = value === undefined ? {} : { I_KNOW_THIS_IS_OLD_LINEAGE: value };
            const errors = [];
            const exits = [];
            const stopped = new Error('exit intercepted');
            let loads = 0;
            assert.throws(() => script.runInNewContext({
                process: { env, exit(code) { exits.push(code); throw stopped; } },
                console: { error(message) { errors.push(message); } },
                require() { loads++; throw new Error('module loading forbidden'); },
            }, { timeout: 1000 }), (error) => error === stopped);
            assert.deepEqual(exits, [1]);
            assert.deepEqual(errors, [warning]);
            assert.equal(loads, 0, '환경파일·AWS SDK·네트워크 모듈에 도달하면 안 됨');
        }
    });

    test(`${target}: 정확히 1이면 차단문 통과, 첫 require에서 시험 종료`, () => {
        const stopped = new Error('module loading intercepted');
        let loads = 0;
        assert.throws(() => script.runInNewContext({
            process: {
                env: { I_KNOW_THIS_IS_OLD_LINEAGE: '1' },
                exit() { assert.fail('명시적 예외가 차단됨'); },
            },
            console: { error() { assert.fail('명시적 예외에서 경고 출력'); } },
            require() { loads++; throw stopped; },
        }, { timeout: 1000 }), (error) => error === stopped);
        assert.equal(loads, 1);
    });
}

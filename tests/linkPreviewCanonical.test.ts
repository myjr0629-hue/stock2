/** 상대·비정상 canonical의 기존 카드 HTML을 origin/main과 바이트 비교한다. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { previewHtml } from '../src/lib/marketing/linkPreview';

const filename = resolve('src/lib/marketing/linkPreview.ts');
const old = new Module(filename, module);
old.filename = filename;
old.paths = module.paths;
const source = execFileSync('git', ['show', 'origin/main:src/lib/marketing/linkPreview.ts'], { encoding: 'utf8' });
(old as any)._compile(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true,
} }).outputText, filename);

let checks = 0;
for (const app of ['signum', 'uc', 'wim'] as const) {
  for (const lang of ['ko', 'en', 'ja'] as const) {
    for (const canonical of ['', 'u', '/app?code=SIGNUMPRO', '?code=SIGNUMPRO', 'https://[invalid']) {
      for (const promo of [false, true]) {
        for (const invite of [false, { android: false }, { android: true }] as const) {
          assert.equal(previewHtml(app, lang, canonical, '#', promo, invite),
            old.exports.previewHtml(app, lang, canonical, '#', promo, invite),
            '상대·비정상 canonical 카드 HTML은 origin/main과 바이트 동일');
          checks++;
        }
      }
    }
  }
}
console.log(`canonical 회귀 시험 ${checks}건 통과.`);

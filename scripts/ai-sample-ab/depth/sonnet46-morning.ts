/**
 * 모닝 브리핑의 주 경로(EC2 워커 → Bedrock Sonnet 4.6)에서 깊이 지시문이 해로운지/이로운지 — 워커가 쓰는 것과 같은 요청(프리필 없음, temperature 0.3)을
 * base 와 depth(라우트 systemPrompt 끝에 지시문 덧붙임)로 N번씩. 기존 모델·기존 AWS 키로 호출만 한다(설정 변경 없음).
 *   사용: sonnet46-morning.ts <ENVFILE> [N]   결과: <OUT>/runs/MorningBriefing/s46-base.json · s46-depth.json (run.ts 와 같은 모양 — 점수·판정 도구 그대로)
 */
import path from 'node:path';
import { loadEnvFile } from '../core';
import { OUT, readJson, writeJson, ensureDir, pool, type Sample, type ModelOut } from './lib';
import { depthDirectiveFor } from '@/lib/ai/depthDirective';

const [envFile, nArg] = process.argv.slice(2);
loadEnvFile(envFile);
(async () => {
    const s = readJson<Sample[]>(path.join(OUT, 'samples', 'MorningBriefing.json'))[0];
    // 워커는 라우트의 raw systemPrompt(날짜 앵커·금융 공통어 없음)를 그대로 쓴다
    const { financeTermsRule } = await import('@/lib/ai/commonTerms');
    const { dateAnchor } = await import('@/services/bedrockClient');
    let raw = s.system;
    const ft = financeTermsRule(); const da = dateAnchor(new Date('2026-10-09T12:30:00Z'));
    if (raw.startsWith(da)) raw = raw.slice(da.length);
    if (raw.startsWith(ft)) raw = raw.slice(ft.length);
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region: 'us-east-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! }, maxAttempts: 1 });
    const call = async (system: string): Promise<ModelOut> => {
        const t0 = Date.now();
        try {
            const r = await client.send(new InvokeModelCommand({ modelId: 'us.anthropic.claude-sonnet-4-6', contentType: 'application/json', accept: 'application/json', body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, temperature: 0.3, system, messages: [{ role: 'user', content: s.userPrompt }] }) }));
            const b = JSON.parse(new TextDecoder().decode(r.body));
            const text = (b.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
            const u = b.usage || {};
            const usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheWrite: 0, cacheRead: 0 };
            return { ok: true, text: text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1), ms: Date.now() - t0, costUsd: (usage.input * 3 + usage.output * 15) / 1e6, stop: b.stop_reason || null, usage, model: 'claude-sonnet-4.6@bedrock' };
        } catch (e: any) { return { ok: false, text: '', ms: Date.now() - t0, costUsd: 0, stop: null, error: `${e?.name}: ${String(e?.message).slice(0, 140)}` }; }
    };
    const N = Number(nArg) || 6;
    ensureDir(path.join(OUT, 'runs', 'MorningBriefing'));
    const variantsToRun: Array<[string, string]> = [['s46-base', raw], ['s46-depth', raw + depthDirectiveFor('MorningBriefing')]];
    for (const [name, sys] of variantsToRun.filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
        const jobs = Array.from({ length: N }, (_, i) => i);
        const done = await pool(jobs, 2, async (i) => { const out = await call(sys); console.error(`${name}.${i} ${out.ok ? `${(out.ms / 1000).toFixed(1)}s $${out.costUsd.toFixed(4)}` : out.error}`); await new Promise((r) => setTimeout(r, 4000)); return { id: s.id, run: i, out }; });
        writeJson(path.join(OUT, 'runs', 'MorningBriefing', `${name}.json`), done);
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

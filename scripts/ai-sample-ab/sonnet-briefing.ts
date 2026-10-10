/**
 * 모닝 브리핑의 «현행 중 Sonnet 4.6»(EC2 워커 경로) 기준선 — 워커가 실제로 보내는 요청에서 어시스턴트 프리필만 뺀 모양으로 N번 돌려 같은 가드로 채점한다.
 * (프리필이 있는 원래 요청은 Bedrock 이 거절한다: «This model does not support assistant message prefill» — 이 파일의 시험이 그 사실을 확인한다.)
 *   sonnet-briefing.ts <ENV> [N]
 */
import { bootHarness, setClock, state, resetCaptured, runRoute } from './core';
import { score } from './ab-lib';
const [envFile, nArg] = process.argv.slice(2);
bootHarness({ envFile });
(async () => {
    setClock('2026-10-09T12:30:00Z'); resetCaptured();
    const { POST } = await import('@/app/api/guardian/briefing/generate/route');
    await runRoute(POST, 'https://www.signumhq.com/api/guardian/briefing/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    setClock(null);
    const c = state.captured.find((x) => x.purpose === 'MorningBriefing')!;
    // 워커는 라우트의 returnPromptOnly 가 돌려주는 raw systemPrompt(날짜 앵커·금융 공통어 없음)를 그대로 쓴다 — 캡처의 system 에서 그 두 앞머리를 걷어 낸다
    const { financeTermsRule } = await import('@/lib/ai/commonTerms');
    const { dateAnchor } = await import('@/services/bedrockClient');
    let raw = c.system;
    const ft = financeTermsRule(); const da = dateAnchor(new Date('2026-10-09T12:30:00Z'));
    if (raw.startsWith(da)) raw = raw.slice(da.length);
    if (raw.startsWith(ft)) raw = raw.slice(ft.length);
    const { BedrockRuntimeClient, InvokeModelCommand } = require('/Volumes/macportable/signum-worktrees/ai-credits3/node_modules/@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region: 'us-east-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! }, maxAttempts: 1 });
    const call = async (prefill: boolean) => {
        const t0 = Date.now();
        const messages: any[] = [{ role: 'user', content: c.userPrompt }];
        if (prefill) messages.push({ role: 'assistant', content: '{' });
        try {
            const r = await client.send(new InvokeModelCommand({ modelId: 'us.anthropic.claude-sonnet-4-6', contentType: 'application/json', accept: 'application/json', body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, temperature: 0.3, system: raw, messages }) }));
            const b = JSON.parse(new TextDecoder().decode(r.body));
            return { ok: true as const, ms: Date.now() - t0, text: (b.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim(), usage: b.usage };
        } catch (e: any) { return { ok: false as const, ms: Date.now() - t0, error: `${e?.name}: ${String(e?.message).slice(0, 140)}` }; }
    };
    console.log('워커의 원래 요청(프리필 있음):', JSON.stringify(await call(true)));
    const N = Number(nArg) || 5; const rows: any[] = [];
    for (let i = 0; i < N; i++) {
        const r = await call(false);
        if (!r.ok) { console.log(`#${i} ERR ${r.error}`); continue; }
        const sc = await score(c, r.text, null, false, 'legacy');
        const cost = ((r.usage?.input_tokens || 0) * 3 + (r.usage?.output_tokens || 0) * 15) / 1e6;
        rows.push({ ms: r.ms, pass: sc.pass, cost, reasons: sc.eval?.reasons });
        console.log(`#${i} ${sc.pass ? 'PASS' : 'FAIL'} ${(r.ms / 1000).toFixed(1)}s in ${r.usage?.input_tokens} out ${r.usage?.output_tokens} $${cost.toFixed(4)} ${sc.eval?.reasons.join(',') || ''}`);
        await new Promise((r2) => setTimeout(r2, 8000));
    }
    const ms = rows.map((x) => x.ms).sort((a, b) => a - b);
    console.log(`Sonnet 4.6(프리필 없음) n=${rows.length} 통과 ${rows.filter((x) => x.pass).length}/${rows.length} p50 ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)}s 호출당 $${(rows.reduce((a, x) => a + x.cost, 0) / Math.max(1, rows.length)).toFixed(4)}`);
    process.exit(0);
})();

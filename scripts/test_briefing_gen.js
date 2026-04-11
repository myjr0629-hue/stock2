// scripts/test_briefing_gen.js
async function main() {
    console.log('[Test] Triggering Briefing Generation on Prod...');
    // Next.js may need a few seconds to deploy, so we wait briefly
    await new Promise(r => setTimeout(r, 5000));
    
    // Test the API route against production
    // Normally it takes ~10-20 seconds to run
    try {
        const res = await fetch('https://beta.signumhq.com/api/guardian/briefing/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot: null, rlsiHistory: [] }), // Force Self-Healing Logic
            signal: AbortSignal.timeout(60000)
        });
        
        if (!res.ok) {
            console.error('[Test Failed] HTTP Error:', res.status);
            const text = await res.text();
            console.error(text);
            return;
        }

        const data = await res.json();
        console.log('[Test Success] Generated Data:', JSON.stringify(data, null, 2));

    } catch (e) {
        console.error('[Test Error]', e.message);
    }
}
main();

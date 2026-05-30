// V21.1 Audio Generator — Event-Driven Institutional Footprint Fix
// Voice: Adam (pNInz6obpgDQGcFmaJgB) - calm, urgent, intelligence briefing
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Using a single line of text without newlines or ellipses to force ElevenLabs
// to generate a tighter read with no pauses over 0.25s.
const script = `SPY looks normal. But off-exchange flow is clustering near the six hundred wall. The gap is only one point three percent. Most charts do not show this layer. Not a prediction. A pressure map. See the structure behind price.`;

async function generateVoice() {
  console.log('[V21.1 Audio] Generating voice with ElevenLabs...');
  console.log('[V21.1 Audio] Script:', script);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.85,
        style: 0.25, // increase style slightly for continuous flow
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V21.1 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v21_1_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V21.1 Audio] ✅ Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V21.1 Audio] Failed:', err);
  process.exit(1);
});

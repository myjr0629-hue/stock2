// V17 Audio Generator — Revenue-Grade Voice
// New script, longer voice that extends to ~17.5s
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam — deep, calm, institutional
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

if (!API_KEY) {
  console.error('ERROR: Set ELEVENLABS_API_KEY environment variable');
  process.exit(1);
}

const script = `SPY... is one point three percent... from a wall... most charts do not show.

Near walls... pressure can build.

This is not a prediction. It is a pressure map.

Call wall. Gamma flip. Put floor.

SignumHQ reveals the structure behind price.`;

async function generateVoice() {
  console.log('[V17 Audio] Generating voice with ElevenLabs...');
  console.log('[V17 Audio] Voice ID:', VOICE_ID);
  console.log('[V17 Audio] Script length:', script.length, 'chars');

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
        stability: 0.72,
        similarity_boost: 0.80,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V17 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v17_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V17 Audio] ✅ Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log('[V17 Audio] Script used:');
  console.log(script);
}

generateVoice().catch(err => {
  console.error('[V17 Audio] Failed:', err);
  process.exit(1);
});

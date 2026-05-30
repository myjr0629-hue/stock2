// V18 Audio Generator — Upload Candidate Voice
// Voice: Adam (pNInz6obpgDQGcFmaJgB)
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

const script = `SPY is one point three percent... from a wall... most charts don't show.

That wall... is not a prediction.

It is a pressure zone.

Normal charts show price.

SignumHQ shows the structure behind price.`;

async function generateVoice() {
  console.log('[V18 Audio] Generating voice with ElevenLabs...');
  console.log('[V18 Audio] Script:', script);

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
    console.error('[V18 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v18_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V18 Audio] ✅ Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V18 Audio] Failed:', err);
  process.exit(1);
});

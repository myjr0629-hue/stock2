import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Tight, event-first script. No long pauses. Commas used instead of periods 
// to keep ElevenLabs from inserting breath breaks.
const script = `Four hundred twenty million off-exchange, near the SPY wall. Most charts don't show that layer. SPY is one point three percent from a wall most traders can't see. Near walls, pressure can build. Normal charts show price, SignumHQ shows structure. Not a prediction, a pressure map. See the structure behind price, SignumHQ.`;

async function generateVoice() {
  console.log('[V22 Audio] Generating voice with ElevenLabs...');
  console.log('[V22 Audio] Script:', script);
  console.log('[V22 Audio] Script length:', script.length, 'chars');

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
        stability: 0.60,
        similarity_boost: 0.85,
        style: 0.40,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[V22 Audio] API Error:', response.status, errText);
    process.exit(1);
  }

  const outDir = path.join('public', 'shorts', 'audio');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'v22_voice.mp3');
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);

  console.log('[V22 Audio] Written:', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`);
}

generateVoice().catch(err => {
  console.error('[V22 Audio] Failed:', err);
  process.exit(1);
});

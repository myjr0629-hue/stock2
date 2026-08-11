// NewsFlash #1 VO v2 — insight-led: naive read → our own base-rate research →
// contrarian conclusion → what to watch. (ElevenLabs, SIGNUM voice.)
const fs = require('fs');
const path = require('path');
require('C:/Users/seamo/backup/stock2/node_modules/dotenv').config({ path: 'C:/Users/seamo/backup/stock2/.env.local', quiet: true });
const KEY = (process.env.ELEVENLABS_API_KEY || '').trim();
const OUT = path.join(__dirname, 'vo_flash');
fs.mkdirSync(OUT, { recursive: true });

const LINES = [
  "The rally just blinked.",
  "Friday, the S and P closed at a record. Monday, it slipped, as Brent jumped five percent.",
  "One strait carries twenty percent of the world's oil, and it is still not settled.",
  "Here is what the panic misses. We ran every oil shock like this since twenty twenty-one. Fifty-one of them.",
  "Five days later, the S and P was higher sixty-four percent of the time.",
  "The scare was never the trade. The rotation was.",
  "Energy beat tech by one and a half percent, two times out of three.",
  "So tomorrow's inflation print is the real test, not the oil headline.",
];

(async () => {
  const list = await (await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': KEY } })).json();
  const v = (list.voices || []).find((x) => x.name.startsWith('Adam (SIGNUM'));
  let total = 0;
  for (let i = 0; i < LINES.length; i++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: LINES[i],
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.38, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
      }),
    });
    if (!r.ok) throw new Error(`vo${i + 1} ${r.status} ${(await r.text()).slice(0, 140)}`);
    const j = await r.json();
    fs.writeFileSync(path.join(OUT, `vo${i + 1}.mp3`), Buffer.from(j.audio_base64, 'base64'));
    const al = j.alignment || j.normalized_alignment;
    const words = [];
    let cur = '', t0 = null, t1 = null;
    al.characters.forEach((ch, k) => {
      const s = al.character_start_times_seconds[k], e = al.character_end_times_seconds[k];
      if (/\s/.test(ch)) { if (cur.trim()) { words.push({ w: cur.trim(), t0, t1 }); cur = ''; t0 = null; } }
      else { if (t0 === null) t0 = s; cur += ch; t1 = e; }
    });
    if (cur.trim()) words.push({ w: cur.trim(), t0, t1 });
    fs.writeFileSync(path.join(OUT, `vo${i + 1}.json`), JSON.stringify(words));
    total += t1;
    console.log(`vo${i + 1}: ${words.length}w · ${t1.toFixed(2)}s`);
  }
  console.log('speech total', total.toFixed(1) + 's');
})();

// SIGNUM Daily Brief v3 ??"AI IS EATING COPPER", ~50s, ElevenLabs SIGNUM voice,
// symbolic clips, ticker card with real company logos, two dated catalysts.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const C5 = 'E:/Down/5';  // symbolic: 1 chip-eats-copper 2 miniature 3 copper-brain 4 robot-hand 5 hourglass 6 fading-mine
const C4 = 'E:/Down/4';  // 3 dc-fly 4 robot-arms
const C3 = 'E:/Down/3';  // 1 floor 2 nyse 5 fed 6 white
const VO = path.join(SP, 'vo3');
const LOGO = path.join(SP, 'logos');
const WORK = path.join(SP, 'work3');
fs.mkdirSync(WORK, { recursive: true });
const run = (c) => execSync(c, { stdio: 'pipe' }).toString();
const dur = (f) => Number(run(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${f}"`).trim());

const RED = '&H0000E8&', GREEN = '&H49BB2E&', AMBER = '&H1878E8&';
const VO_LEAD = 0.15;

// 1. VO + timeline
const NB = 10;
const words = [], voT = [];
for (let i = 1; i <= NB; i++) {
  run(`ffmpeg -v quiet -y -i "${VO}/vo${i}.mp3" -ar 48000 -ac 2 "${WORK}/vo${i}.wav"`);
  const w = JSON.parse(fs.readFileSync(`${VO}/vo${i}.json`, 'utf8'));
  words.push(w); voT.push(w[w.length - 1].t1);
}
// Shorts loop instantly ??dead air at the tail costs replays, so the outro
// holds only long enough to read the two dates (VO ends 2.5s in).
const MIN_B = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5.6];
const beats = [];
let t = 0;
for (let i = 0; i < NB; i++) {
  const d = Math.max(MIN_B[i], Math.round((voT[i] + 0.38) * 100) / 100);
  beats.push({ i: i + 1, start: t, durB: d });
  t += d;
}
const TOTAL = t;
console.log('total', TOTAL.toFixed(2) + 's | beats', beats.map((b) => b.durB.toFixed(1)).join('/'));

// 2. shots
// 1 hook · 2 price · 3 buyer · 4 27k tons · 5 the gap · 6 shortage ·
// 7 our tickers · 8 our check · 9 mean-reversion warning · 10 verdict (outro)
const SHOTS = [
  { b: 1, cuts: [[`${C5}/1.mp4`, 0.2, 1.0, 1.0, 'symbol']] },
  { b: 2, cuts: [[`${C5}/3.mp4`, 0.3, 1.0, 1.0, 'symbol']] },
  { b: 3, cuts: [[`${C4}/2.mp4`, 0.3, 1.0, 1.0, 'fantasy']] },
  { b: 4, cuts: [[`${C5}/2.mp4`, 0.3, 1.0, 1.0, 'symbol']] },
  { b: 5, cuts: [[`${C5}/5.mp4`, 0.2, 1.0, 0.55, 'symbol'], [`${C5}/4.mp4`, 0.4, 1.0, 0.45, 'symbol']] },
  { b: 6, cuts: [[`${C5}/6.mp4`, 0.3, 1.0, 1.0, 'real']] },
  { b: 7, cuts: [[`${C3}/1.mp4`, 0.5, 1.0, 0.5, 'real'], [`${C3}/2.mp4`, 0.6, 1.0, 0.5, 'real']] },
  { b: 8, cuts: [[`${C3}/1.mp4`, 2.8, 0.7, 1.0, 'real']] },
  { b: 9, cuts: [[`${C4}/5.mp4`, 0.4, 1.0, 1.0, 'real']] },
  { b: 10, cuts: [[`${C3}/6.mp4`, 0.0, 1.0, 1.0, 'white']] },
];
const GRADE = {
  symbol: 'eq=saturation=1.24:contrast=1.10:gamma=1.01,unsharp=5:5:0.5',
  fantasy: 'eq=saturation=1.30:contrast=1.12,colorbalance=bs=0.10:bm=0.05,unsharp=5:5:0.6',
  real: 'eq=saturation=1.08:contrast=1.05,colorbalance=rs=0.035:rm=0.018',
  white: 'eq=saturation=1.0:contrast=1.02',
};
// ticker rows (numbers refreshed from Polygon, 2026-08-10 close)
const TICK = [
  ['FCX', 'FREEPORT', '+16.5%', 640],
  ['SCCO', 'SOUTHERN COPPER', '+18.5%', 726],
  ['COPX', 'MINERS ETF', '+18.9%', 812],
  ['NVDA', 'NVIDIA', '+10.1%', 906],
];
run(`ffmpeg -v quiet -y -i "C:/Users/seamo/backup/stock2/public/apple-icon.png" -vf "scale=88:-1" "${WORK}/logo_w.png"`);
run(`ffmpeg -v quiet -y -i "C:/Users/seamo/backup/stock2/public/apple-icon.png" -vf "scale=190:-1,negate=negate_alpha=0" "${WORK}/logo_b.png"`);
// outro app tiles: SIGNUM + Undercurrent are real assets; WIM has no icon file
// yet, so render a family-consistent tile (swap in the real one when it exists)
const AS = path.join(SP, 'assets');   // rounded app icons + store badges (puppeteer)
run(`ffmpeg -v quiet -y -i "${AS}/app_signum.png" -vf "scale=138:138" "${WORK}/app1.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/app_uc.png" -vf "scale=138:138" "${WORK}/app2.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/badge_ios.png" -vf "scale=250:-1" "${WORK}/badge1.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/badge_play.png" -vf "scale=250:-1" "${WORK}/badge2.png"`);
// (WIM tile intentionally omitted ??icon to be added from the Mac later)
// Ticker marks: source icons are opaque squares, so give each a white tile with
// padding ??otherwise they read as dark specks on the white data card.
for (const t of ['FCX', 'SCCO', 'NVDA']) {
  run(`ffmpeg -v quiet -y -i "${LOGO}/${t}.png" -vf "scale=60:60:force_original_aspect_ratio=decrease,pad=72:72:(ow-iw)/2:(oh-ih)/2:color=white,drawbox=x=0:y=0:w=72:h=72:color=0xCFCFCF:t=2" "${WORK}/t_${t}.png"`);
}

let n = 0;
const segFiles = [];
for (const s of SHOTS) {
  const b = beats[s.b - 1];
  for (const [file, srcStart, z, share, look] of s.cuts) {
    const need = Math.max(0.6, b.durB * share);
    const srcLen = file.includes(`${C3}/6`) ? 4 : 6;
    const avail = Math.max(0.5, srcLen - srcStart - 0.05);
    const speed = need > avail ? avail / need : 1;
    const vf = [
      'crop=iw*0.9:ih*0.9:0:0',
      z < 1 ? `crop=iw*${z}:ih*${z}:(iw-iw*${z})/2:(ih-ih*${z})/2` : null,
      'scale=1080:1920:flags=lanczos,setsar=1',
      GRADE[look],
      speed < 1 ? `setpts=${(1 / speed).toFixed(4)}*PTS` : null,
      'fps=24',
    ].filter(Boolean).join(',');
    const out = `${WORK}/s${String(++n).padStart(2, '0')}.mp4`;
    const tt = (need * speed).toFixed(3);
    const DT = "fontfile='C\\:/Windows/Fonts/ariblk.ttf'";
    // Brand assets are burned into every SEGMENT: a still-image overlay applied
    // once over a long concatenated timeline drops out partway through.
    if (s.b === NB) {
      // outro plate: three app tiles across the top, brand lockup at the bottom
      // outro plate: app row (rounded icons + name + tagline) ??store badges ??      // dates (ASS) ??wordmark. Mirrors the site's app promo styling.
      const fc = `[0:v]${vf}[bg];`
        + `[bg][1:v]overlay=x=196:y=224[a1];[a1][2:v]overlay=x=616:y=224[a2];`
        + `[a2][3:v]overlay=x=254:y=470[b1];[b1][4:v]overlay=x=576:y=470[b2];`
        + `[b2]drawtext=${DT}:text='SIGNUM HQ':fontcolor=0x141414:fontsize=34:x=354:y=250,`
        + `drawtext=${DT}:text='Options-structure':fontcolor=0x707070:fontsize=25:x=354:y=296,`
        + `drawtext=${DT}:text='intelligence':fontcolor=0x707070:fontsize=25:x=354:y=328,`
        + `drawtext=${DT}:text='Undercurrent':fontcolor=0x141414:fontsize=34:x=774:y=250,`
        + `drawtext=${DT}:text='The money behind':fontcolor=0x707070:fontsize=25:x=774:y=296,`
        + `drawtext=${DT}:text='the news':fontcolor=0x707070:fontsize=25:x=774:y=328,`
        + `drawtext=${DT}:text='SIGNUMHQ':fontcolor=0x201510:fontsize=44:x=(w-tw)/2:y=1240,`
        + `drawtext=${DT}:text='signumhq.com':fontcolor=0x707070:fontsize=30:x=(w-tw)/2:y=1310[vout]`;
      run(`ffmpeg -v quiet -y -ss ${srcStart} -t ${tt} -i "${file}" -i "${WORK}/app1.png" -i "${WORK}/app2.png" -i "${WORK}/badge1.png" -i "${WORK}/badge2.png" -filter_complex "${fc}" -map "[vout]" -an -c:v libx264 -preset fast -crf 16 "${out}"`);
    } else {
      // Ticker marks are NOT burned here ??the ASS data card renders after the
      // segments and would wash them out. They go on in the final compose.
      const ins = `-i "${WORK}/logo_w.png"`;
      // brand bug: dark plate keeps the mark readable over any footage
      let fc = `[0:v]${vf},drawbox=x=628:y=1622:w=440:h=152:color=black@0.44:t=fill[v0];`
        + `[v0][1:v]overlay=x=660:y=1640[b0];`;
      const last = 'b0';
      // date is drawn in ASS instead ??the masthead band renders after the
      // segments and would otherwise dim a burned-in date
      fc += `[${last}]drawtext=${DT}:text='SIGNUMHQ':fontcolor=white:fontsize=40:x=764:y=1663,`
        + `drawtext=${DT}:text='NOT INVESTMENT ADVICE':fontcolor=white@0.78:fontsize=21:x=660:y=1733[vout]`;
      run(`ffmpeg -v quiet -y -ss ${srcStart} -t ${tt} -i "${file}" ${ins} -filter_complex "${fc}" -map "[vout]" -an -c:v libx264 -preset fast -crf 16 "${out}"`);
    }
    segFiles.push(out);
  }
}
fs.writeFileSync(`${WORK}/concat.txt`, segFiles.map((f) => `file '${path.basename(f)}'`).join('\n'));
run(`ffmpeg -v quiet -y -f concat -safe 0 -i "${WORK}/concat.txt" -c copy "${WORK}/video.mp4"`);
console.log('video', dur(`${WORK}/video.mp4`).toFixed(2) + 's', `(${segFiles.length} shots)`);

// 3. audio
run(`ffmpeg -v quiet -y -i "${C5}/1.mp4" -i "${C4}/3.mp4" -i "${C3}/1.mp4" -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1,aloop=loop=3:size=2e6,atrim=0:${TOTAL.toFixed(2)},volume=0.09[a]" -map "[a]" -ar 48000 -ac 2 "${WORK}/ambient.wav"`);
const voIn = beats.map((b) => `-i "${WORK}/vo${b.i}.wav"`).join(' ');
const delays = beats.map((b, k) => `[${k + 1}:a]adelay=${Math.round((b.start + VO_LEAD) * 1000)}|${Math.round((b.start + VO_LEAD) * 1000)},volume=2.0[v${k}]`).join(';');
const mixIn = beats.map((_, k) => `[v${k}]`).join('');
run(`ffmpeg -v quiet -y -i "${WORK}/ambient.wav" ${voIn} -filter_complex "${delays};[0:a]${mixIn}amix=inputs=11:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 "${WORK}/mix.wav"`);

// 4. ASS
const ts = (s) => { const m = Math.floor(s / 60), sec = s % 60; return `0:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`; };
const A = [];
A.push('[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', 'WrapStyle: 2', '');
A.push('[V4+ Styles]');
A.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
A.push('Style: Title,Arial Black,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,7,0,0,0,1');
A.push('Style: Tag,Arial Black,30,&H002020E8,&H002020E8,&H00000000,&H00000000,-1,0,0,0,100,100,8,0,1,0,0,7,0,0,0,1');
A.push('Style: Band,Arial,20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1');
A.push('Style: Cap,Arial Black,84,&H00FFFFFF,&H64FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,10,3,5,40,40,0,1');
A.push('Style: CapBig,Arial Black,100,&H00FFFFFF,&H64FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,11,3,5,40,40,0,1');
A.push('Style: Panel,Arial,20,&H14FFFFFF,&H14FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: ChipG,Arial Black,38,&H00FFFFFF,&H00FFFFFF,&H0049BB2E,&H0049BB2E,-1,0,0,0,100,100,0,0,3,11,0,5,0,0,0,1');
A.push('Style: ChipD,Arial Black,36,&H00FFFFFF,&H00FFFFFF,&H00201510,&H00201510,-1,0,0,0,100,100,0,0,3,11,0,5,0,0,0,1');
A.push('Style: ChipR,Arial Black,38,&H00FFFFFF,&H00FFFFFF,&H001210E0,&H001210E0,-1,0,0,0,100,100,0,0,3,11,0,5,0,0,0,1');
A.push('Style: Num,Arial Black,104,&H00201510,&H00201510,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: NumR,Arial Black,104,&H000000E8,&H000000E8,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: NumG,Arial Black,62,&H0028A028,&H0028A028,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: NumD,Arial Black,62,&H00606060,&H00606060,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: Lbl,Arial Black,32,&H00707070,&H00707070,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,4,0,1,0,0,5,0,0,0,1');
A.push('Style: Row,Arial Black,50,&H00201510,&H00201510,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('', '[Events]');
A.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

// COVER (0 ??COVER_END): the first frame is the de-facto Shorts thumbnail, so
// the opening sentence is rendered as a full-bleed title card over the hook
// shot, then hands off to the masthead + karaoke captions.
const COVER_END = 1.45;
A.push(`Dialogue: 1,${ts(0)},${ts(COVER_END)},Band,,0,0,0,,{\\an7\\pos(0,0)\\fad(0,220)\\p1\\1c&H000000&\\1a&H6E&\\bord0}m 0 0 l 1080 0 1080 1920 0 1920{\\p0}`);
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,760)\\fad(0,200)\\fs118\\bord12}AI IS EATING`);
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,910)\\fad(0,200)\\fs140\\bord12\\1c${RED}}COPPER`);
// present from frame 0 ??the very first frame is what Shorts grabs
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,1060)\\fad(0,200)\\fs64\\bord8\\1c${GREEN}}+49% IN A YEAR`);

const outroStart = beats[NB - 1].start;
const BANDS = [[0, 248, '&H26&'], [248, 274, '&H3A&'], [274, 298, '&H56&'], [298, 320, '&H76&'],
  [320, 340, '&H98&'], [340, 358, '&HB6&'], [358, 374, '&HD2&'], [374, 388, '&HE8&']];
for (const [y0, y1, alpha] of BANDS) {
  A.push(`Dialogue: 1,${ts(COVER_END - 0.15)},${ts(outroStart)},Band,,0,0,0,,{\\an7\\pos(0,${y0})\\fad(250,0)\\p1\\1c&H0A0A0A&\\1a${alpha}\\bord0}m 0 0 l 1080 0 1080 ${y1 - y0} 0 ${y1 - y0}{\\p0}`);
}
A.push(`Dialogue: 2,${ts(COVER_END - 0.15)},${ts(outroStart)},Band,,0,0,0,,{\\an7\\pos(48,92)\\fad(250,0)\\p1\\1c&H2020E8&\\bord0}m 0 0 l 13 0 13 158 0 158{\\p0}`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Tag,,0,0,0,,{\\an7\\pos(84,44)\\fad(250,150)}RESOURCE BRIEF`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Title,,0,0,0,,{\\an7\\pos(84,88)\\fad(250,150)}AI IS EATING\\N{\\1c${RED}}COPPER`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Title,,0,0,0,,{\\an9\\pos(1032,104)\\fad(250,0)\\fs46\\1c&HFFFFFF&\\bord3\\3c&H000000&}AUG 11`);

// captions
const CAPS = [
  // beat 1: first sentence lives in the cover card, so karaoke starts at word 4
  { b: 1, style: 'CapBig', y: 1210, color: {}, skip: 6 },
  { b: 2, style: 'Cap', y: 1250, color: { 11: GREEN, 12: GREEN } },
  { b: 3, style: 'CapBig', y: 1220, color: { 3: RED } },
  { b: 4, style: 'Cap', y: 1250, color: { 7: AMBER, 8: AMBER } },
  { b: 5, style: 'Cap', y: 1270, color: { 11: AMBER, 18: RED, 19: RED } },
  { b: 6, style: 'Cap', y: 1250, color: { 6: RED, 7: RED } },
  { b: 7, style: 'Cap', y: 1270, color: { 8: GREEN } },
  { b: 8, style: 'Cap', y: 1260, color: { 3: AMBER } },
  { b: 9, style: 'Cap', y: 1260, color: { 7: RED, 8: RED } },
];
for (const c of CAPS) {
  const b = beats[c.b - 1];
  const skip = c.skip || 0;
  const w = words[c.b - 1].slice(skip).map((x, i) => ({ ...x, gk: i + skip }));
  const baseFs = c.style === 'CapBig' ? 100 : 84;
  const maxChars = c.style === 'CapBig' ? 15 : 18;
  const lines = [];
  let cur = [], curLen = 0;
  w.forEach((wd, k) => {
    const s = wd.w.toUpperCase().trim();
    if (!s) return;
    const add = s.length + (cur.length ? 1 : 0);
    if (cur.length && curLen + add > maxChars) { lines.push(cur); cur = []; curLen = 0; }
    cur.push({ ...wd, k: wd.gk, s });
    curLen += add;
  });
  if (cur.length) lines.push(cur);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2));
  chunks.forEach((chunk, ci) => {
    const flat = chunk.flat();
    const t0 = b.start + VO_LEAD + flat[0].t0;
    const nextStart = ci + 1 < chunks.length ? b.start + VO_LEAD + chunks[ci + 1].flat()[0].t0 : b.start + b.durB;
    const t1 = Math.min(nextStart, b.start + b.durB);
    let text = `{\\an5\\pos(540,${c.y})}`;
    let cursor = flat[0].t0;
    chunk.forEach((line, li) => {
      line.forEach((wd) => {
        const lead = Math.max(0, Math.round((wd.t0 - cursor) * 100));
        const sung = Math.max(8, Math.round((wd.t1 - wd.t0) * 100));
        cursor = Math.max(cursor, wd.t1);
        const col = c.color[wd.k] ? `{\\1c${c.color[wd.k]}\\fs${baseFs + 14}}` : '';
        const rst = c.color[wd.k] ? `{\\1c&HFFFFFF&\\fs${baseFs}}` : '';
        if (lead > 0) text += `{\\k${lead}}`;
        text += `{\\k${sung}}${col}${wd.s}${rst} `;
      });
      if (li === 0 && chunk.length > 1) text += '\\N';
    });
    A.push(`Dialogue: 3,${ts(t0)},${ts(t1)},${c.style},,0,0,0,,${text}`);
  });
}

// cards
const card = (bIdx, inner, y0 = 560, h = 340, delay = 0.35) => {
  const b = beats[bIdx - 1], t0 = b.start + delay, t1 = b.start + b.durB;
  A.push(`Dialogue: 4,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(90,${y0})\\fad(180,120)\\p1\\1c&HFFFFFF&\\1a&H16&\\bord0}m 0 0 l 900 0 900 ${h} 0 ${h}{\\p0}`);
  inner(t0, t1, y0);
};
const txt = (t0, t1, style, x, y, s, extra = '') => A.push(`Dialogue: 6,${ts(t0)},${ts(t1)},${style},,0,0,0,,{\\an5\\pos(${x},${y})\\fad(180,120)${extra}}${s}`);
// sc: horizontal scale so the sparkline never runs into the value block
const spark = (t0, t1, x, y, color, sc = 100) => A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(${x},${y})\\fad(180,120)\\fscx${sc}\\fscy100\\p1\\1c${color}\\1a&H32&\\bord0}m 0 115 l 60 93 120 103 180 75 240 85 300 45 360 0 l 360 135 0 135 0 115{\\p0}`);

card(2, (t0, t1, y) => {
  txt(t0, t1, 'ChipR', 280, y + 70, 'COPPER');
  spark(t0, t1, 150, y + 128, RED, 74);
  txt(t0, t1, 'Num', 760, y + 148, '+49%');
  txt(t0, t1, 'Lbl', 760, y + 238, '1 YEAR · $14,000+/TON', '\\fs30');
});
card(4, (t0, t1, y) => {
  txt(t0, t1, 'ChipD', 300, y + 66, 'PER 1 GIGAWATT');
  txt(t0, t1, 'Num', 540, y + 180, '27,000 TONS');
  txt(t0, t1, 'Lbl', 540, y + 272, 'OF COPPER · ONE AI DATA CENTER');
});
card(5, (t0, t1, y) => {
  txt(t0, t1, 'Lbl', 540, y + 56, 'TIME TO BUILD');
  txt(t0, t1, 'Row', 300, y + 145, 'DATA CENTER');
  txt(t0, t1, 'Num', 760, y + 145, '20 MO', '\\fs84');
  A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(150,${y + 198})\\fad(180,120)\\p1\\1c&HC8C8C8&\\bord0}m 0 0 l 780 0 780 3 0 3{\\p0}`);
  txt(t0, t1, 'Row', 300, y + 265, 'COPPER MINE');
  txt(t0, t1, 'NumR', 760, y + 265, '17.9 YRS', '\\fs84');
}, 540, 370);
card(6, (t0, t1, y) => {
  txt(t0, t1, 'ChipR', 320, y + 66, '2026 DEFICIT');
  txt(t0, t1, 'NumR', 540, y + 180, '150,000 TONS', '\\fs92');
  txt(t0, t1, 'Lbl', 540, y + 272, 'AND WIDENING THROUGH 2028 · ICSG');
});
// ticker card (logos are burned into the footage at x=186)
card(7, (t0, t1) => {
  txt(t0, t1, 'Lbl', 540, 552, 'SINCE JULY 1');
  TICK.forEach(([sym, name, pct, y]) => {
    const isN = sym === 'NVDA';
    txt(t0, t1, isN ? 'ChipD' : 'ChipG', 320, y, sym);
    txt(t0, t1, 'Lbl', 600, y, name);
    txt(t0, t1, isN ? 'NumD' : 'NumG', 860, y, pct);
  });
  A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(150,858)\\fad(180,120)\\p1\\1c&HC8C8C8&\\bord0}m 0 0 l 780 0 780 3 0 3{\\p0}`);
}, 500, 460);
// B9 ??OUR BASE RATE: the number that argues against chasing our own story
card(9, (t0, t1, y) => {
  txt(t0, t1, 'ChipD', 400, y + 60, 'SIGNUM RESEARCH · 1,357 WINDOWS', '\\fs28');
  txt(t0, t1, 'Row', 300, y + 148, 'MINERS LEAD');
  txt(t0, t1, 'Num', 800, y + 148, '42%', '\\fs76');
  A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(150,${y + 198})\\fad(180,120)\\p1\\1c&HC8C8C8&\\bord0}m 0 0 l 780 0 780 3 0 3{\\p0}`);
  txt(t0, t1, 'Row', 300, y + 258, 'NEXT MONTH');
  txt(t0, t1, 'NumR', 800, y + 258, '-4.1%p', '\\fs76');
  txt(t0, t1, 'Lbl', 540, y + 334, 'MEDIAN GIVE-BACK vs NVDA · SINCE 2021', '\\fs26');
}, 520, 390);
// outro
const b10 = beats[9];
A.push(`Dialogue: 3,${ts(b10.start + 0.1)},${ts(TOTAL)},Cap,,0,0,0,,{\\an5\\pos(540,700)\\fad(150,0)\\1c&H201510&\\3c&HFFFFFF&\\bord6\\fs62}STRUCTURE IS NOT THE TRADE`);
[['OCTOBER  ·  CAPEX GUIDANCE', 850], ['COPPER ABOVE $14,000', 950]].forEach(([s, y], i) => {
  A.push(`Dialogue: 3,${ts(b10.start + 0.45 + i * 0.5)},${ts(TOTAL)},Row,,0,0,0,,{\\an5\\pos(540,${y})\\fad(150,0)\\fs46}${s}`);
});
A.push(`Dialogue: 3,${ts(b10.start + 0.5)},${ts(TOTAL)},Lbl,,0,0,0,,{\\an5\\pos(540,1050)\\fad(150,0)\\fs26}HISTORICAL BASE RATES · NOT INVESTMENT ADVICE`);
fs.writeFileSync(`${WORK}/caps.ass`, A.join('\n'), 'utf8');

// 5. compose
const oS = outroStart.toFixed(3);
const assPath = `${WORK}/caps.ass`.replace(/\\/g, '/').replace(':', '\\:');
// Ticker marks go ON TOP of the ASS data card. Image inputs are looped into
// full-length streams (`-loop 1 -t`) ??a bare still frame silently drops out
// partway through a long timeline.
const b6 = beats[6];   // ticker beat (7th)
const t6a = (b6.start + 0.45).toFixed(2), t6b = (b6.start + b6.durB - 0.05).toFixed(2);
const markRows = TICK.filter((r) => r[0] !== 'COPX');
const markIns = markRows.map((r) => `-loop 1 -framerate 24 -t ${TOTAL.toFixed(2)} -i "${WORK}/t_${r[0]}.png"`).join(' ');
let mf = `[0:v]ass='${assPath}'[cap];`;
let prev = 'cap';
markRows.forEach((r, k) => {
  const tag = k === markRows.length - 1 ? 'vout' : `m${k}`;
  mf += `[${prev}][${k + 1}:v]overlay=x=176:y=${r[3] - 36}:enable='between(t,${t6a},${t6b})'[${tag}];`;
  prev = tag;
});
mf = mf.slice(0, -1);
// -t trims the concat rounding tail so the loop point is exact
run(`ffmpeg -v quiet -y -i "${WORK}/video.mp4" ${markIns} -i "${WORK}/mix.wav" -filter_complex "${mf}" -map "[vout]" -map ${markRows.length + 1}:a -t ${TOTAL.toFixed(2)} -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${SP}/signum_copper_60s.mp4"`);
// Ship a standalone cover still too ??Shorts pick a frame automatically, but a
// custom upload (where available) should use the same designed composition.
run(`ffmpeg -v quiet -y -ss 0.60 -i "${SP}/signum_copper_60s.mp4" -vframes 1 "${SP}/signum_copper_thumb.png"`);
console.log('DONE', dur(`${SP}/signum_copper_60s.mp4`).toFixed(2) + 's · thumbnail exported');


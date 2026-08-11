// SIGNUM NewsFlash — "THE RALLY JUST BLINKED" (~30s, breaking-news character:
// tighter gaps, faster cuts, fewer cards than the Resource Brief template).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const C3 = 'E:/Down/3';   // 1 floor · 2 nyse · 3 strait · 4 tanker · 5 fed · 6 white
const VO = path.join(SP, 'vo_flash');
const AS = path.join(SP, 'assets');
const WORK = path.join(SP, 'workf');
fs.mkdirSync(WORK, { recursive: true });
const run = (c) => execSync(c, { stdio: 'pipe' }).toString();
const dur = (f) => Number(run(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${f}"`).trim());

const RED = '&H0000E8&', GREEN = '&H49BB2E&', AMBER = '&H1878E8&';
const VO_LEAD = 0.14, GAP = 0.30;   // flash pacing: tighter than the brief
const N = 8;

// 1. VO + timeline
const words = [], voT = [];
for (let i = 1; i <= N; i++) {
  run(`ffmpeg -v quiet -y -i "${VO}/vo${i}.mp3" -ar 48000 -ac 2 "${WORK}/vo${i}.wav"`);
  const w = JSON.parse(fs.readFileSync(`${VO}/vo${i}.json`, 'utf8'));
  words.push(w); voT.push(w[w.length - 1].t1);
}
const MIN_B = [1.6, 0, 0, 0, 0, 0, 0, 4.2];
const beats = [];
let t = 0;
for (let i = 0; i < N; i++) {
  const d = Math.max(MIN_B[i], Math.round((voT[i] + GAP) * 100) / 100);
  beats.push({ i: i + 1, start: t, durB: d });
  t += d;
}
const TOTAL = t;
console.log('total', TOTAL.toFixed(2) + 's | beats', beats.map((b) => b.durB.toFixed(1)).join('/'));

// 2. shots — more cuts per beat than the brief
// 1 blink · 2 record/oil · 3 strait · 4 our research · 5 base rate ·
// 6 verdict · 7 rotation · 8 the real test (outro)
const SHOTS = [
  { b: 1, cuts: [[`${C3}/1.mp4`, 0.5, 1.0, 1.0, 'real']] },
  { b: 2, cuts: [[`${C3}/2.mp4`, 0.4, 1.0, 0.5, 'real'], [`${C3}/1.mp4`, 2.6, 0.68, 0.5, 'real']] },
  { b: 3, cuts: [[`${C3}/3.mp4`, 0.3, 1.0, 1.0, 'real']] },
  { b: 4, cuts: [[`${C3}/4.mp4`, 0.3, 1.0, 0.5, 'real'], [`${C3}/3.mp4`, 3.2, 0.72, 0.5, 'real']] },
  { b: 5, cuts: [[`${C3}/1.mp4`, 0.8, 0.82, 1.0, 'real']] },
  { b: 6, cuts: [[`${C3}/2.mp4`, 3.2, 0.72, 1.0, 'real']] },
  { b: 7, cuts: [[`${C3}/4.mp4`, 3.0, 0.72, 1.0, 'real']] },
  { b: 8, cuts: [[`${C3}/6.mp4`, 0.0, 1.0, 1.0, 'white']] },
];
const GRADE = {
  real: 'eq=saturation=1.12:contrast=1.08:gamma=1.01,colorbalance=rs=0.03:rm=0.015,unsharp=5:5:0.4',
  white: 'eq=saturation=1.0:contrast=1.02',
};

// brand assets
run(`ffmpeg -v quiet -y -i "C:/Users/seamo/backup/stock2/public/apple-icon.png" -vf "scale=88:-1" "${WORK}/logo_w.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/app_signum.png" -vf "scale=138:138" "${WORK}/app1.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/app_uc.png" -vf "scale=138:138" "${WORK}/app2.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/badge_ios.png" -vf "scale=250:-1" "${WORK}/badge1.png"`);
run(`ffmpeg -v quiet -y -i "${AS}/badge_play.png" -vf "scale=250:-1" "${WORK}/badge2.png"`);

let n = 0;
const segFiles = [];
const DT = "fontfile='C\\:/Windows/Fonts/ariblk.ttf'";
for (const s of SHOTS) {
  const b = beats[s.b - 1];
  for (const [file, srcStart, z, share, look] of s.cuts) {
    const need = Math.max(0.6, b.durB * share);
    const srcLen = file.includes('/6.mp4') ? 4 : 6;
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
    if (s.b === 8) {
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
      // brand plate now carries the compliance line under the wordmark
      const fc = `[0:v]${vf},drawbox=x=628:y=1622:w=440:h=152:color=black@0.44:t=fill[v0];`
        + `[v0][1:v]overlay=x=660:y=1640[b0];`
        + `[b0]drawtext=${DT}:text='SIGNUMHQ':fontcolor=white:fontsize=40:x=764:y=1663,`
        + `drawtext=${DT}:text='NOT INVESTMENT ADVICE':fontcolor=white@0.78:fontsize=21:x=660:y=1733[vout]`;
      run(`ffmpeg -v quiet -y -ss ${srcStart} -t ${tt} -i "${file}" -i "${WORK}/logo_w.png" -filter_complex "${fc}" -map "[vout]" -an -c:v libx264 -preset fast -crf 16 "${out}"`);
    }
    segFiles.push(out);
  }
}
fs.writeFileSync(`${WORK}/concat.txt`, segFiles.map((f) => `file '${path.basename(f)}'`).join('\n'));
run(`ffmpeg -v quiet -y -f concat -safe 0 -i "${WORK}/concat.txt" -c copy "${WORK}/video.mp4"`);
console.log('video', dur(`${WORK}/video.mp4`).toFixed(2) + 's', `(${segFiles.length} shots)`);

// 3. audio
run(`ffmpeg -v quiet -y -i "${C3}/1.mp4" -i "${C3}/3.mp4" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1,aloop=loop=4:size=2e6,atrim=0:${TOTAL.toFixed(2)},volume=0.10[a]" -map "[a]" -ar 48000 -ac 2 "${WORK}/ambient.wav"`);
const voIn = beats.map((b) => `-i "${WORK}/vo${b.i}.wav"`).join(' ');
const delays = beats.map((b, k) => `[${k + 1}:a]adelay=${Math.round((b.start + VO_LEAD) * 1000)}|${Math.round((b.start + VO_LEAD) * 1000)},volume=2.0[v${k}]`).join(';');
const mixIn = beats.map((_, k) => `[v${k}]`).join('');
run(`ffmpeg -v quiet -y -i "${WORK}/ambient.wav" ${voIn} -filter_complex "${delays};[0:a]${mixIn}amix=inputs=${N + 1}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 "${WORK}/mix.wav"`);

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
A.push('Style: NumG,Arial Black,72,&H0028A028,&H0028A028,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('Style: Lbl,Arial Black,32,&H00707070,&H00707070,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,4,0,1,0,0,5,0,0,0,1');
A.push('Style: Row,Arial Black,50,&H00201510,&H00201510,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1');
A.push('', '[Events]');
A.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

// cover (thumbnail frame)
const COVER_END = 1.45;
A.push(`Dialogue: 1,${ts(0)},${ts(COVER_END)},Band,,0,0,0,,{\\an7\\pos(0,0)\\fad(0,220)\\p1\\1c&H000000&\\1a&H6E&\\bord0}m 0 0 l 1080 0 1080 1920 0 1920{\\p0}`);
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,760)\\fad(0,200)\\fs118\\bord12}THE RALLY`);
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,910)\\fad(0,200)\\fs130\\bord12\\1c${RED}}JUST BLINKED`);
A.push(`Dialogue: 3,${ts(0)},${ts(COVER_END)},Cap,,0,0,0,,{\\an5\\pos(540,1060)\\fad(0,200)\\fs58\\bord8\\1c${AMBER}}OIL +5% · 51 SHOCKS SAY OTHERWISE`);

// masthead
const outroStart = beats[7].start;
const BANDS = [[0, 248, '&H26&'], [248, 274, '&H3A&'], [274, 298, '&H56&'], [298, 320, '&H76&'],
  [320, 340, '&H98&'], [340, 358, '&HB6&'], [358, 374, '&HD2&'], [374, 388, '&HE8&']];
for (const [y0, y1, alpha] of BANDS) {
  A.push(`Dialogue: 1,${ts(COVER_END - 0.15)},${ts(outroStart)},Band,,0,0,0,,{\\an7\\pos(0,${y0})\\fad(250,0)\\p1\\1c&H0A0A0A&\\1a${alpha}\\bord0}m 0 0 l 1080 0 1080 ${y1 - y0} 0 ${y1 - y0}{\\p0}`);
}
A.push(`Dialogue: 2,${ts(COVER_END - 0.15)},${ts(outroStart)},Band,,0,0,0,,{\\an7\\pos(48,92)\\fad(250,0)\\p1\\1c&H2020E8&\\bord0}m 0 0 l 13 0 13 158 0 158{\\p0}`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Tag,,0,0,0,,{\\an7\\pos(84,44)\\fad(250,150)}MARKET FLASH`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Title,,0,0,0,,{\\an7\\pos(84,88)\\fad(250,150)}THE RALLY\\N{\\1c${RED}}JUST BLINKED`);
A.push(`Dialogue: 2,${ts(COVER_END - 0.1)},${ts(outroStart)},Title,,0,0,0,,{\\an9\\pos(1032,104)\\fad(250,0)\\fs46\\1c&HFFFFFF&\\bord3\\3c&H000000&}AUG 11`);

// captions
const CAPS = [
  { b: 1, style: 'CapBig', y: 1210, color: {}, skip: 4 },
  { b: 2, style: 'Cap', y: 1250, color: { 6: GREEN, 15: RED } },
  { b: 3, style: 'Cap', y: 1250, color: { 3: AMBER, 4: AMBER } },
  { b: 4, style: 'Cap', y: 1270, color: { 17: AMBER, 18: AMBER } },
  { b: 5, style: 'Cap', y: 1250, color: { 9: GREEN, 10: GREEN } },
  { b: 6, style: 'CapBig', y: 1220, color: { 7: GREEN } },
  { b: 7, style: 'Cap', y: 1250, color: { 3: GREEN } },
];
for (const c of CAPS) {
  const b = beats[c.b - 1];
  const skip = c.skip || 0;
  const w = words[c.b - 1].slice(skip).map((x, i) => ({ ...x, gk: i + skip }));
  const baseFs = c.style === 'CapBig' ? 100 : 84;
  const maxChars = c.style === 'CapBig' ? 15 : 18;
  const lines = [];
  let cur = [], curLen = 0;
  w.forEach((wd) => {
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
const card = (bIdx, inner, y0 = 560, h = 340, delay = 0.3) => {
  const b = beats[bIdx - 1], t0 = b.start + delay, t1 = b.start + b.durB;
  A.push(`Dialogue: 4,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(90,${y0})\\fad(160,110)\\p1\\1c&HFFFFFF&\\1a&H16&\\bord0}m 0 0 l 900 0 900 ${h} 0 ${h}{\\p0}`);
  inner(t0, t1, y0);
};
const txt = (t0, t1, style, x, y, s, extra = '') => A.push(`Dialogue: 6,${ts(t0)},${ts(t1)},${style},,0,0,0,,{\\an5\\pos(${x},${y})\\fad(160,110)${extra}}${s}`);
const spark = (t0, t1, x, y, color, sc = 100) => A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(${x},${y})\\fad(160,110)\\fscx${sc}\\fscy100\\p1\\1c${color}\\1a&H32&\\bord0}m 0 115 l 60 93 120 103 180 75 240 85 300 45 360 0 l 360 135 0 135 0 115{\\p0}`);

// B2 — the blink (Friday record vs Monday) + Brent
card(2, (t0, t1, y) => {
  txt(t0, t1, 'Lbl', 540, y + 56, 'S&P 500 CLOSE');
  txt(t0, t1, 'Row', 300, y + 145, 'FRIDAY');
  txt(t0, t1, 'Num', 760, y + 145, '7,757.64', '\\fs72');
  A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(150,${y + 198})\\fad(160,110)\\p1\\1c&HC8C8C8&\\bord0}m 0 0 l 780 0 780 3 0 3{\\p0}`);
  txt(t0, t1, 'Row', 300, y + 265, 'MONDAY');
  txt(t0, t1, 'NumR', 760, y + 265, '7,753.11', '\\fs72');
}, 540, 370);
// B3 — Brent
card(3, (t0, t1, y) => {
  txt(t0, t1, 'ChipR', 300, y + 70, 'BRENT CRUDE');
  spark(t0, t1, 150, y + 128, RED, 74);
  txt(t0, t1, 'NumR', 760, y + 148, '$87.72', '\\fs92');
  txt(t0, t1, 'Lbl', 760, y + 238, '+5% IN ONE DAY · HORMUZ', '\\fs28');
});
// B5 — OUR RESEARCH: the base rate that flips the naive read
card(5, (t0, t1, y) => {
  txt(t0, t1, 'ChipD', 380, y + 62, 'SIGNUM RESEARCH · 51 OIL SHOCKS', '\\fs30');
  txt(t0, t1, 'Row', 300, y + 150, 'S&P, 5 DAYS ON');
  txt(t0, t1, 'NumG', 800, y + 150, '64% UP', '\\fs78');
  A.push(`Dialogue: 5,${ts(t0)},${ts(t1)},Panel,,0,0,0,,{\\an7\\pos(150,${y + 200})\\fad(160,110)\\p1\\1c&HC8C8C8&\\bord0}m 0 0 l 780 0 780 3 0 3{\\p0}`);
  txt(t0, t1, 'Row', 300, y + 262, 'MEDIAN MOVE');
  txt(t0, t1, 'NumG', 800, y + 262, '+1.00%', '\\fs78');
  txt(t0, t1, 'Lbl', 540, y + 336, 'SINCE 2021 · OIL +4% OR MORE IN A DAY', '\\fs26');
}, 520, 390);
// B7 — the rotation (the actual trade)
card(7, (t0, t1, y) => {
  txt(t0, t1, 'ChipG', 340, y + 66, 'THE ROTATION');
  txt(t0, t1, 'NumG', 540, y + 176, 'ENERGY > TECH', '\\fs76');
  txt(t0, t1, 'Lbl', 540, y + 268, '+1.55% MEDIAN OVER 5 DAYS · 66% OF THE TIME');
});
// outro
const b8 = beats[7];
A.push(`Dialogue: 3,${ts(b8.start + 0.1)},${ts(TOTAL)},Cap,,0,0,0,,{\\an5\\pos(540,700)\\fad(150,0)\\1c&H201510&\\3c&HFFFFFF&\\bord6\\fs70}WATCH THE ROTATION`);
[['TOMORROW  ·  8:30 AM ET  ·  US CPI', 840], ['ENERGY vs TECH', 940]].forEach(([s, y], i) => {
  A.push(`Dialogue: 3,${ts(b8.start + 0.4 + i * 0.45)},${ts(TOTAL)},Row,,0,0,0,,{\\an5\\pos(540,${y})\\fad(150,0)\\fs46}${s}`);
});
A.push(`Dialogue: 3,${ts(b8.start + 0.5)},${ts(TOTAL)},Lbl,,0,0,0,,{\\an5\\pos(540,1090)\\fad(150,0)\\fs26}HISTORICAL BASE RATES · NOT INVESTMENT ADVICE`);
fs.writeFileSync(`${WORK}/caps.ass`, A.join('\n'), 'utf8');

// 5. compose
const assPath = `${WORK}/caps.ass`.replace(/\\/g, '/').replace(':', '\\:');
run(`ffmpeg -v quiet -y -i "${WORK}/video.mp4" -i "${WORK}/mix.wav" -vf "ass='${assPath}'" -map 0:v -map 1:a -t ${TOTAL.toFixed(2)} -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${SP}/signum_flash_aug11.mp4"`);
run(`ffmpeg -v quiet -y -ss 0.60 -i "${SP}/signum_flash_aug11.mp4" -vframes 1 "${SP}/signum_flash_thumb.png"`);
console.log('DONE', dur(`${SP}/signum_flash_aug11.mp4`).toFixed(2) + 's · thumbnail exported');

// 배경 밝기 — 남색 캐릭터가 묻히는 배경을 찾는다
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const FFDIR='C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const s = readFileSync('src/remotion/kit/scripts-longform.ts','utf8');
const names = [...new Set([...s.matchAll(/V\('([a-z0-9-]+\.mp4)'\)/g)].map(m=>m[1]))];
const rows = [];
for (const f of names) {
  const r = spawnSync(join(FFDIR,'ffmpeg.exe'),
    ['-hide_banner','-nostats','-i',`public/shorts/bg/video/${f}`,'-vf',
     'format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-','-f','null','-'],
    {encoding:'utf8', maxBuffer:1<<26});
  const all=[...((r.stdout||'')+(r.stderr||'')).matchAll(/YAVG=([\d.]+)/g)].map(m=>+m[1]);
  if(all.length) rows.push({f:f.replace('.mp4',''), y: all.reduce((a,b)=>a+b,0)/all.length});
}
rows.sort((a,b)=>a.y-b.y);
console.log('  ══ 롱폼 배경 '+rows.length+'개 · 밝기 ══');
for(const r of rows) console.log('  '+r.f.padEnd(24)+String(Math.round(r.y)).padStart(4)+
  (r.y<95 ? '   ⛔ 남색 캐릭터가 묻힌다' : r.y<120 ? '   ⚠ 애매' : '   ✔ 잘 보인다'));
const dark = rows.filter(r=>r.y<95).length;
console.log('\n  95 미만 '+dark+'개 / '+rows.length+'개 = '+Math.round(dark/rows.length*100)+'%');

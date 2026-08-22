// 레퍼런스 채널의 «롱폼»을 실측한다 — 길이·조회·업로드 시각을 그대로 받아 적는다
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const url = process.argv[2], tab = process.argv[3] || 'videos';
const N = Number(process.argv[4] || 120);
const r = spawnSync('yt-dlp', ['--flat-playlist', '--skip-download', '-I', `1:${N}`,
  '--print', '%(id)s\t%(duration)s\t%(view_count)s\t%(title)s',
  `${url}/${tab}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
const rows = (r.stdout || '').trim().split('\n').filter(Boolean).map((l) => {
  const [id, dur, views, ...t] = l.split('\t');
  return { id, dur: Number(dur) || 0, views: Number(views) || 0, title: t.join('\t') };
}).filter((x) => x.id);
if (!rows.length) { console.error((r.stderr||'').split('\n').slice(-3).join('\n')); process.exit(1); }
const long = rows.filter((x) => x.dur >= 300);
const shorts = rows.filter((x) => x.dur > 0 && x.dur < 300);
console.log(`\n  받은 영상 ${rows.length}편 — 롱폼(5분+) ${long.length} · 짧은 것 ${shorts.length}`);
const med = (a) => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.floor(s.length/2)] : 0; };
if (long.length) {
  console.log(`  롱폼 길이 중앙 ${(med(long.map(x=>x.dur))/60).toFixed(1)}분 · 조회 중앙 ${med(long.map(x=>x.views)).toLocaleString()}`);
  console.log('\n  ── 롱폼 조회 상위 12 ──');
  [...long].sort((a,b)=>b.views-a.views).slice(0,12).forEach((x,i)=>
    console.log(`  ${String(i+1).padStart(2)}. ${x.id}  ${String(Math.round(x.dur/60)).padStart(3)}분  ${String(x.views).padStart(9)}회  ${x.title.slice(0,52)}`));
}
if (shorts.length) console.log(`\n  짧은 것 조회 중앙 ${med(shorts.map(x=>x.views)).toLocaleString()} (길이 중앙 ${med(shorts.map(x=>x.dur))}초)`);
writeFileSync(process.argv[5] || '.agent/_ref_longform.json', JSON.stringify({ url, rows }, null, 1));

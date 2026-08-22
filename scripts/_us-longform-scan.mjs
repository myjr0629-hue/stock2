// 미국 롱폼 레퍼런스 정찰 — «우리 주제»로 검색해 실제로 뜨는 롱폼을 모은다
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const QUERIES = [
  'stock market explained', 'why the market dropped', 'nvidia earnings analysis',
  'ai bubble explained', 'fed rate cut explained', 'options market makers explained',
  'market structure explained', 'what wall street is not telling you',
];
const seen = new Map();
for (const q of QUERIES) {
  const r = spawnSync('yt-dlp', ['--flat-playlist', '--skip-download', '-I', '1:20',
    '--print', '%(id)s\t%(duration)s\t%(view_count)s\t%(channel)s\t%(title)s',
    `ytsearchdate20:${q}`], { encoding: 'utf8', maxBuffer: 1 << 27 });
  const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
  for (const l of lines) {
    const [id, dur, views, ch, ...t] = l.split('\t');
    if (!id || seen.has(id)) continue;
    seen.set(id, { id, dur: +dur || 0, views: +views || 0, ch, title: t.join('\t'), q });
  }
  process.stdout.write(`  ${q} → ${lines.length}편\n`);
}
const rows = [...seen.values()];
writeFileSync('.agent/_us_longform_scan.json', JSON.stringify(rows, null, 1));
console.log(`\n  수집 ${rows.length}편`);

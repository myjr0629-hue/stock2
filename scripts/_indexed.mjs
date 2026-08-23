// 「유튜브가 우리 영상을 분류·색인했는가」 — 자기 제목으로 검색해서 나오는지 본다.
//   리서치: 「유튜브가 업로드를 분류하지 못하면 씨앗 자체를 안 줄 수 있다」
//   노출수는 공개 API 로 못 읽지만, «검색에 잡히는가» 는 확인할 수 있다.
import { Innertube } from 'youtubei.js';
const [ID, LANG, LOC, ...q] = process.argv.slice(2);
const yt = await Innertube.create({ lang: LANG || 'en', location: LOC || 'US', retrieve_player: false });
const info = await yt.getInfo(ID);
const title = info.basic_info.title || '';
const ch = info.basic_info.channel?.name || '';
console.log(`\n  대상  ${title.slice(0, 46)}`);
console.log(`        ${ch} · 조회 ${info.basic_info.view_count}`);

const tries = q.length ? q : [title.slice(0, 40), ch];
for (const term of tries) {
  try {
    const r = await yt.search(term, { type: 'video' });
    const vids = (r.results || []).map((x) => x.video_id || x.id).filter(Boolean);
    const hit = vids.indexOf(ID);
    console.log(`\n   「${term.slice(0, 40)}」`);
    console.log(`     결과 ${vids.length}개 · 우리 영상 ${hit >= 0 ? `${hit + 1}번째 ✔ 색인됨` : '없음 ✗'}`);
    if (hit < 0 && vids.length) {
      const top = (r.results || []).slice(0, 3).map((x) => (x.title?.text || '').slice(0, 34));
      console.log(`     대신 나온 것: ${top.join(' / ')}`);
    }
  } catch (e) {
    console.log(`   「${term.slice(0, 30)}」 ✗ ${String(e.message).slice(0, 44)}`);
  }
}

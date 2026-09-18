#!/usr/bin/env node
/* 관제 콘솔 UI 무결성 검사 — `node scripts/hud/verify.js` (서버가 떠 있어야 한다)
 *  ①JS 문법 ②참조 id 존재 ③스냅샷 필드 계약 ④DOM 스텁으로 렌더 함수 실행 ⑤그래픽 요소 수(노드11·연결12·레인4·채널=목록수·탭10)
 *  ⚠ 이 검사는 «보이는지»를 증명하지 못한다 — 색·레이아웃은 실제 브라우저 스크린샷으로 확인할 것(2026-09-18 실측 교훈). */
const fs=require('fs'), vm=require('vm'), http=require('http');
const html=fs.readFileSync('scripts/hud/index.html','utf8');
const script=(html.match(/<script>([\s\S]*)<\/script>/)||[])[1];
let fail=0; const ok=(n,c,d='')=>{ console.log((c?'✓ ':'✗ ')+n+(c?'':' ← '+d)); if(!c) fail++; };
ok('JS 문법', (()=>{ try{ new vm.Script(script); return true; }catch(e){ return e.message; } })()===true, 'parse 오류');
// ② $('#x') 로 참조하는 모든 id 가 HTML 에 있는가
const ids=[...script.matchAll(/\$\('#([\w-]+)'\)/g)].map(m=>m[1]);
const missing=[...new Set(ids)].filter(id=>!new RegExp('id="'+id+'"').test(html));
ok('참조 id 전부 존재 ('+new Set(ids).size+'개)', missing.length===0, '없는 id: '+missing.join(','));
// ③ 스냅샷 필드
http.get('http://127.0.0.1:7788/api/snapshot', (res)=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{
  let s; try{ s=JSON.parse(b); }catch(e){ ok('스냅샷 JSON', false, e.message); return done(); }
  const need=[['state.paused',s.state&&typeof s.state.paused==='boolean'],['usage.byModel',!!s.usage.byModel],['usage.byHour',!!s.usage.byHour],['usage.tools',!!s.usage.tools],
    ['marketing.today',!!s.marketing.today],['marketing.todayRows',Array.isArray(s.marketing.todayRows)],['marketing.byDay',!!s.marketing.byDay],['marketing.tickets',Array.isArray(s.marketing.tickets)],
    ['marketing.channels',!!s.marketing.channels],['marketing.cycles',Array.isArray(s.marketing.cycles)],['git.recent',Array.isArray(s.git.recent)],['events',Array.isArray(s.events)],['metrics',s.metrics!==undefined],['server.port',s.server.port===7788]];
  for(const [k,v] of need) ok('스냅샷 '+k, !!v);
  // ④ DOM 스텁으로 렌더 함수 실제 실행
  const mkEl=()=>{ const el={ _t:'', _h:'', dataset:{}, className:'', value:'', style:{}, onclick:null, classList:{toggle(){},add(){},remove(){}},
      addEventListener(){}, appendChild(){}, insertBefore(){}, removeChild(){}, children:[], textContent:'', innerHTML:'',
      querySelector(){ return mkEl(); }, querySelectorAll(){ return []; }, getBoundingClientRect(){ return {x:0,y:0,width:100,height:20,top:0,bottom:20,left:0,right:100}; } };
    Object.defineProperty(el,'textContent',{get(){return el._t},set(v){el._t=String(v)}});
    Object.defineProperty(el,'innerHTML',{get(){return el._h},set(v){el._h=String(v)}});
    return el; };
  const store={};
  const sandbox={ document:{ querySelector:(sel)=>{ const id=(sel.match(/^#([\w-]+)$/)||[])[1]; if(id) return store[id]=store[id]||mkEl(); return mkEl(); },
      querySelectorAll:()=>[], activeElement:null, contains:()=>false }, window:{}, fetch:()=>Promise.reject(new Error('no net in stub')), EventSource:function(){ this.addEventListener=()=>{}; },
    setInterval:()=>0, setTimeout:()=>0, Intl, Date, JSON, Math, Number, String, Object, Array, console:{log(){},error(){}} };
  sandbox.window=sandbox; sandbox.globalThis=sandbox;
  try { vm.createContext(sandbox); new vm.Script(script+'\n;globalThis.__paint=paint;').runInContext(sandbox, {timeout:5000}); sandbox.__paint(s);
    const painted=['tiles','events','models','tools','tickets','pubs','metrics','cycles','git','pipe','lanes','cmap','tabs','slotd'].map(id=>[id,(store[id]&&(store[id]._h||store[id]._t)||'').length]);
    ok('렌더 함수 9패널 모두 내용 생성', painted.every(([,n])=>n>20), JSON.stringify(painted));
    console.log('  패널 렌더 길이:', painted.map(([k,n])=>k+':'+n).join(' '));
    ok('파이프라인 노드 11개', (store.pipe._h.match(/class="node"/g)||[]).length===11, (store.pipe._h.match(/class="node"/g)||[]).length+'개');
    ok('파이프라인 연결선 12개', (store.pipe._h.match(/marker-end/g)||[]).length===12, (store.pipe._h.match(/marker-end/g)||[]).length+'개');
    ok('모델 레인 4개', (store.lanes._h.match(/<g>/g)||[]).length===4, (store.lanes._h.match(/<g>/g)||[]).length+'개');
    ok('채널 맵 타일 = 채널 수', (store.cmap._h.match(/<a /g)||[]).length===s.marketing.channels.list.length, (store.cmap._h.match(/<a /g)||[]).length+' vs '+s.marketing.channels.list.length);
    ok('탭 10개', (store.tabs._h.match(/<button /g)||[]).length===10, (store.tabs._h.match(/<button /g)||[]).length+'개');
    ok('KPI 타일 7개', (store.tiles._h.match(/class="tile"/g)||[]).length===7, (store.tiles._h.match(/class="tile"/g)||[]).length+'개');
    ok('모델 표에 opus 행', /opus/.test(store.models._h));
    ok('티켓에 대표 티켓 chip', /chip ceo/.test(store.tickets._h));
    ok('지표에 «청구값 아님» 라벨', /청구값 아님/.test(store.metrics._h));
    ok('오늘 발행 링크 렌더', /target="_blank"/.test(store.pubs._h) || s.marketing.todayRows.length===0);
  } catch(e){ ok('렌더 함수 실행', false, e.message.slice(0,120)); }
  done();
}); }).on('error',(e)=>{ ok('서버 응답', false, e.message); done(); });
function done(){ console.log(fail? `\n✗ 실패 ${fail}건` : '\n✓ 전부 통과'); process.exit(fail?1:0); }

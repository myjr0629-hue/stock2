// 외부 연결 없는 감사 4·5·6 회귀 재현. UX_BASELINE=1은 HEAD 원본으로 같은 시험을 수행한다.
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const baseline = process.env.UX_BASELINE === '1';
const read = f => baseline ? cp.execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8' }) : fs.readFileSync(f, 'utf8');
const compile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
function load(f, context = {}) {
  const exports = {};
  vm.runInNewContext(compile(read(f)), { exports, require: p => p.startsWith('./') ? load(`src/lib/app/${p.slice(2)}.ts`, context) : require(p), setTimeout, clearTimeout, AbortController, Response, fetch: () => { throw Error('외부 연결 금지'); }, ...context });
  return exports;
}
const ast = f => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root, predicate) {
  let result;
  function visit(n) { if (predicate(n)) result = n; else ts.forEachChild(n, visit); }
  visit(root); assert.ok(result, '시험 대상 코드'); return result;
}
function run(code, ctx) { return vm.runInNewContext(compile(code), { ...ctx }); }
const paywall = 'src/components/app/ProPaywall.tsx';
const upsell = 'src/components/app/watchlist/ProUpsellSheet.tsx';
const first = 'src/components/app/FirstRunValueStep.tsx';
const ranks = 'src/app/[locale]/app-view/rankings/page.tsx';
const flow = 'src/lib/app/flowEmptyStates.ts';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
for (const [file, name, working] of [[paywall, 'handleSubscribe', 'ctaBusy'], [upsell, 'onStart', 'busy']]) {
  test(`4: ${name} 승인 후 권한 지연에 기존 처리 문구 유지`, async () => {
    const root = ast(file);
    const decl = find(root, n => ts.isVariableDeclaration(n) && n.name.getText(root) === name);
    const callback = decl.initializer.arguments[0].getText(root);
    let note = null;
    const fn = run(`(${callback})`, {
      busy: false, purchasePending: false, monthly: {}, funnelSrc: 'other', sheetName: 'limit',
      funnel: async () => ({ trackFunnel() {} }), trackWatchlist() {},
      setBusy() {}, setNote: v => { note = v; }, purchase: async () => ({ ok: true, isPro: false }),
      t: { ctaBusy: '처리 중…' }, c: { busy: '처리 중…' },
    });
    await fn(); assert.equal(note, null); // 새 안내 줄을 열지 않는다.
    const label=find(root,n=>ts.isJsxExpression(n)&&n.expression&&n.expression.getText(root).startsWith('busy')&&n.expression.getText(root).includes(`? ${file===paywall?'t.ctaBusy':'c.busy'} :`));
    assert.equal(run(`(${label.expression.getText(root)})`,{busy:false,purchasePending:true,t:{ctaBusy:'처리 중…'},head:{cta:'구매'},c:{busy:'처리 중…',cta:'구매'}}),'처리 중…');
  });
  test(`4: ${name} 정상 성공·취소·오류 유지`, async () => {
    const root = ast(file);
    const decl = find(root, n => ts.isVariableDeclaration(n) && n.name.getText(root) === name);
    for (const [result, expected] of [[{ok:true,isPro:true},null], [{ok:false,isPro:false,cancelled:true},null], [{ok:false,isPro:false},'기존 실패 문구']]) {
      let note;
      const fn = run(`(${decl.initializer.arguments[0].getText(root)})`, {
        busy:false, purchasePending:false, monthly:{}, funnelSrc:'other',sheetName:'limit',
        funnel:async()=>({trackFunnel(){}}),trackWatchlist(){},setBusy(){},setNote:v=>{note=v;},purchase:async()=>result,
        t:{failed:'기존 실패 문구'},c:{purchaseFailed:'기존 실패 문구'},
      });
      await fn(); assert.equal(note,expected);
    }
  });
  test(`4: ${name} 권한 대기 시 구매 버튼 비활성`, () => {
    const root=ast(file);
    const button=find(root,n=>ts.isJsxOpeningElement(n) && n.tagName.getText(root)==='button' && n.getText(root).includes(`onClick={${name}}`));
    const attr=button.attributes.properties.find(n=>n.name?.text==='disabled');
    assert.equal(run(`(${attr.initializer.expression.getText(root)})`,{busy:false,purchasePending:true,monthly:{},previewPrice:null}),true);
  });
}
test('5: 지도는 8초 뒤 대기 상태, 늦게 도착한 레벨은 같은 카드에 반영', () => {
  const root=ast(first);const fn=find(root,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PickCard');
  let late=false;let timer;
  const element=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
  const ctx={React:{createElement:element,Fragment:'fragment'},useState:()=>[late,v=>{late=v;}],useEffect:f=>f(),
    window:{setTimeout:(fn,ms)=>{assert.equal(ms,8000);timer=fn;return 1;},clearTimeout(){}},
    firstRunCopy:()=>({value:{remove:()=>'',loading:'불러오는 중'}}),wlCopy:()=>({levelsWait:'레벨 갱신 대기'}),
    st:new Proxy({},{get:(_,p)=>p}),AppTickerLogo:'logo',WlIcon:'icon',PositionMap:'지도',levelOutOfRangeText:()=>'',fmtPrice:String,fmtSignedPct:String,emph:x=>x};
  const render=run(`${fn.getText(root)}; PickCard`,ctx);
  const card={t:'TSLA',price:null,changePct:null,levels:null,aiText:null};
  const props={card,loc:'ko',name:'',priceReady:false,levelsReady:false,earn:null,onRemove(){}};
  const nodes=x=>[x,...(x?.children||[]).flatMap(nodes)];
  assert.ok(nodes(render(props)).some(n=>n?.props?.['aria-busy']==='true'));
  timer(); const after=render(props);
  assert.ok(nodes(after).some(n=>n?.type==='지도'), '8초에 기존 지도 대기 상태를 그려야 함');
  const levels={S:100,cw:110,pf:90};
  assert.equal(nodes(render({...props,levelsReady:true,card:{...card,levels}})).find(n=>n?.type==='지도').props.levels,levels);
});
test('6: Flow는 헤더 이후 멈춘 본문도 기한에 종료', async () => {
  const {fetchWithTtfbLimit}=load(flow);
  const stalled=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));
  let aborted=false;
  const task=(async()=>{const r=await fetchWithTtfbLimit('/모의',25,{},async(_,init)=>{init.signal.addEventListener('abort',()=>{aborted=true;});return stalled;});return r.json();})();
  const result=await Promise.race([task.then(()=> '성공',e=>e.name),new Promise(r=>setTimeout(()=>r('무한 대기'),70))]);
  assert.equal(result,'AbortError'); assert.equal(aborted,true);
});
test('6: 랭킹 실제 effect의 무응답은 실패 상태로 종료', async () => {
  const root=ast(ranks);const effect=find(root,n=>ts.isCallExpression(n)&&n.expression.getText(root)==='useEffect');
  let err=false;
  const helper=baseline?null:load('src/lib/app/requestDeadline.ts').fetchResponseWithDeadline;
  const cleanup=run(`(${effect.arguments[0].getText(root)})()`,{AbortController,fetch:()=>new Promise(()=>{}),
    fetchResponseWithDeadline:(url,ms,init)=>helper(url,25,init,()=>new Promise(()=>{})),
    setErr:v=>{err=v;},setRes(){},setMeta(){}});
  await new Promise(r=>setTimeout(r,70));cleanup();assert.equal(err,true);
});
if(!baseline) {
  test('4: 두 화면·빠른 연속 탭은 SDK 구매 1회, 권한 확인 후 성공',async()=>{
    const {createProPurchaseState}=load('src/lib/app/proPurchaseState.ts');const state=createProPurchaseState();
    let calls=0,checks=0,done;const wait=new Promise(r=>{done=r;});
    const buy=async()=>{calls++;await wait;return {ok:true,isPro:false};};
    const check=async()=>{checks++;return true;};
    const a=state.run(buy,check),b=state.run(buy,check);await flush();assert.equal(calls,1);assert.equal(state.getSnapshot(),true);
    done();assert.equal((await a).isPro,true);assert.equal((await b).isPro,true);assert.equal(checks,1);assert.equal(state.getSnapshot(),false);
  });
  test('4: 권한 지연·재조회 오류·화면 재진입에도 재구매 금지, 확인 후 해제',async()=>{
    const {createProPurchaseState}=load('src/lib/app/proPurchaseState.ts');
    for(const check of [async()=>false,async()=>{throw Error('모의 실패');}]){
      const state=createProPurchaseState();let calls=0;const buy=async()=>{calls++;return {ok:true,isPro:false};};
      await state.run(buy,check);assert.equal(state.getSnapshot(),true);await state.run(buy,check);assert.equal(calls,1);
      state.confirm();assert.equal(state.getSnapshot(),false);
    }
  });
  test('4: 기존 즉시 성공·취소·오류는 재조회 없이 동일 결과, 재시도 가능',async()=>{
    const {createProPurchaseState}=load('src/lib/app/proPurchaseState.ts');
    for(const result of [{ok:true,isPro:true},{ok:false,isPro:false,cancelled:true},{ok:false,isPro:false,error:'모의 실패'}]){
      const state=createProPurchaseState();let checks=0;const actual=await state.run(async()=>result,async()=>{checks++;return false;});
      assert.equal(actual,result);assert.equal(checks,0);assert.equal(state.getSnapshot(),false);
    }
  });
  test('4: 멈춘 SDK 재조회는 15초 예산 종료 후에도 중복 구매 잠금 유지',async()=>{
    let budget;
    const {createProPurchaseState}=load('src/lib/app/proPurchaseState.ts',{setTimeout:(fn,ms)=>{budget=ms;return setTimeout(fn,5);}});
    const state=createProPurchaseState();await state.run(async()=>({ok:true,isPro:false}),()=>new Promise(()=>{}));
    assert.equal(budget,15000);assert.equal(state.getSnapshot(),true);
  });
  test('6: 헤더 무응답·HTTP 오류·잘못된 JSON·정상 본문·부모 취소',async()=>{
    const {fetchResponseWithDeadline:request}=load('src/lib/app/requestDeadline.ts');
    await assert.rejects(request('/모의',5,{},()=>new Promise(()=>{})),{name:'AbortError'});
    const bad=await request('/모의',100,{},async()=>new Response('실패',{status:503}));assert.equal(bad.status,503);
    const malformed=await request('/모의',100,{},async()=>new Response('{'));await assert.rejects(malformed.json());
    const ok=await request('/모의',100,{},async()=>new Response('{"ok":true}'));assert.deepEqual(await ok.json(),{ok:true});
    const ctl=new AbortController();const task=request('/모의',100,{signal:ctl.signal},async(_,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('모의 취소')));}));ctl.abort();await assert.rejects(task,/모의 취소/);
  });
  test('화면 JSX 태그·속성 이름·문구 사전·CSS 원본 유지',()=>{
    for(const file of [paywall,upsell,first,ranks]){
      const before=cp.execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
      const signatures=source=>{const root=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const out=[];function visit(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))out.push([n.tagName.getText(root),n.attributes.properties.map(p=>p.name?.getText(root))]);ts.forEachChild(n,visit);}visit(root);return out;};
      assert.deepEqual(signatures(read(file)),signatures(before));
      const strings=source=>{const out=[];const root=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isStringLiteral(n))out.push(n.text);ts.forEachChild(n,visit);}visit(root);return out;};
      for(const s of strings(before)) assert.ok(strings(read(file)).includes(s),`기존 문구 보존: ${file}`);
    }
  });
}
if(!baseline) {
  test('4: 공용 훅 복원 성공은 잠금 해제, 빈 복원·실패는 승인된 구매 잠금 유지',async()=>{
    const root=ast('src/hooks/useProStatus.ts');
    const decl=find(root,n=>ts.isVariableDeclaration(n)&&n.name.getText(root)==='restore');
    for(const result of [{ok:true,isPro:true},{ok:true,isPro:false},{ok:false,isPro:false}]){
      let confirms=0,pro=false;
      const restore=run(`(${decl.initializer.arguments[0].getText(root)})`,{
        restorePro:async()=>result,proPurchaseState:{confirm:()=>{confirms++;}},setIsPro:v=>{pro=v;},funnel:async()=>({trackFunnelOutcome(){}}),
      });
      assert.equal(await restore('other'),result);assert.equal(confirms,result.isPro?1:0);assert.equal(pro,result.isPro);
    }
  });
  test('4: 구매 훅은 기존 상품·출처 전달 유지, SDK 리스너 PRO도 잠금 해제',async()=>{
    const root=ast('src/hooks/useProStatus.ts');
    const decl=find(root,n=>ts.isVariableDeclaration(n)&&n.name.getText(root)==='purchase');
    let plan,src,checked=0,pro=false,confirmed=0;
    const purchase=run(`(${decl.initializer.arguments[0].getText(root)})`,{
      purchasePro:async p=>{plan=p;return {ok:true,isPro:false};},require:id=>{assert.equal(id,'@/lib/app/redeem');return {refreshProAfterRedeem:async path=>{assert.equal(path,'sheet');checked++;return true;}};},
      proPurchaseState:{run:async(buy,check)=>{await buy();return {ok:true,isPro:await check()};},confirm(){confirmed++;}},
      setIsPro:v=>{pro=v;},funnel:async()=>({trackFunnelOutcome:(kind,result,s)=>{src=s;}}),
    });
    await purchase('monthly','wl_paywall');await flush();assert.equal(plan,'monthly');assert.equal(src,'wl_paywall');assert.equal(checked,1);assert.equal(pro,true);
    const apply=find(root,n=>ts.isVariableDeclaration(n)&&n.name.getText(root)==='apply');
    const listener=run(`(${apply.initializer.getText(root)})`,{cancelled:false,isProFromCustomerInfo:i=>i.pro,
      proPurchaseState:{confirm(){confirmed++;}},setIsPro:v=>{pro=v;}});
    listener({pro:true});assert.equal(confirmed,2);assert.equal(pro,true);
  });
}
if(!baseline) {
  test('6: 랭킹 정상 빈 결과와 요청·본문·형식 실패를 구분, 해제 뒤 반영 금지',async()=>{
    const root=ast(ranks);const effect=find(root,n=>ts.isCallExpression(n)&&n.expression.getText(root)==='useEffect');
    for(const mode of ['정상','빈 결과','요청 실패','본문 실패','형식 실패','해제']){
      let err=false,res=null,resolve;
      const response=mode==='정상'?{results:{one:{items:[]}},universe:10}:mode==='빈 결과'?{results:{}}:{};
      const cleanup=run(`(${effect.arguments[0].getText(root)})()`,{AbortController,
        fetchResponseWithDeadline:async()=>{
          if(mode==='해제')return new Promise(r=>{resolve=r;});
          if(mode==='요청 실패')throw Error('모의 요청 실패');
          return {ok:true,json:async()=>{if(mode==='본문 실패')throw Error('모의 본문 실패');return response;}};
        },setErr:v=>{err=v;},setRes:v=>{res=v;},setMeta(){}});
      if(mode==='해제'){cleanup();resolve({ok:true,json:async()=>({results:{late:{}}})});}
      await flush();cleanup();
      assert.equal(err,['요청 실패','본문 실패','형식 실패'].includes(mode));
      assert.equal(!!res,['정상','빈 결과'].includes(mode));
    }
  });
  test('4: SDK가 동기로 예외를 던져도 잠금을 풀고 다음 시도 허용',async()=>{
    const {createProPurchaseState}=load('src/lib/app/proPurchaseState.ts');const state=createProPurchaseState();
    assert.equal((await state.run(()=>{throw Error('모의 예외');},async()=>false)).ok,false);
    assert.equal(state.getSnapshot(),false);
    assert.equal((await state.run(async()=>({ok:true,isPro:true}),async()=>false)).isPro,true);
  });
}

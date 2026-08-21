// 후보 음성 하나를 «실제로 합성해» F0 를 잰다. 목표는 JP_VOICE.json 의 실측 158.4Hz.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const FFDIR='C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const KEY=env.ELEVENLABS_API_KEY||env.ELEVEN_API_KEY||env.XI_API_KEY;
if(!KEY){console.error('  ✗ ElevenLabs 키 없음'); process.exit(1);}
const TXT='満期日の金曜日は、値幅が静かになります。七百六十八回、全部調べました。ただし、エヌビディアだけは例外でした。';
const SR=16000,FRAME=1024,HOP=512,F0MIN=70,F0MAX=400;
const medianF0=(p)=>{const b=readFileSync(p);const n=(b.length/2)|0;const x=new Float32Array(n);
 for(let i=0;i<n;i++)x[i]=b.readInt16LE(i*2)/32768;
 const lo=(SR/F0MAX)|0, hi=(SR/F0MIN)|0, f=[];
 for(let s=0;s+FRAME<n;s+=HOP){let e=0;for(let i=0;i<FRAME;i++)e+=x[s+i]*x[s+i];
  if(e/FRAME<1e-5)continue; let best=0,bl=0;
  for(let l=lo;l<=hi;l++){let c=0;for(let i=0;i<FRAME-l;i++)c+=x[s+i]*x[s+i+l];
   if(c>best){best=c;bl=l;}}
  if(bl&&best/(e)>0.35*1) if(bl) { const r=best/e; if(r>0.35) f.push(SR/bl); } }
 f.sort((a,b)=>a-b); if(!f.length) return null;
 const q=(p)=>f[Math.min(f.length-1,Math.floor(f.length*p))];
 return {f0:+q(0.5).toFixed(1), iqr:+(q(0.75)-q(0.25)).toFixed(1), frames:f.length};};
if(!existsSync('.agent/_vf0'))mkdirSync('.agent/_vf0',{recursive:true});
const cands=[['Hadou(대표 제안)','LIisRj2veIKEBdr6KZ5y'],['Rio(현재 사용중)','M7yNn2Ev4SskxM3JS3OC'],['Mio','nBV906YvEOdwWKK9J8Hx']];
console.log('\n  목표(인기 일본 영상 실측)  F0 158.4Hz\n');
for(const [name,id] of cands){
  const mp3=`.agent/_vf0/${id}.mp3`, pcm=`.agent/_vf0/${id}.pcm`;
  if(!existsSync(mp3)){
    const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`,{method:'POST',
      headers:{'xi-api-key':KEY,'content-type':'application/json'},
      body:JSON.stringify({text:TXT,model_id:'eleven_multilingual_v2',
        voice_settings:{stability:0.45,similarity_boost:0.8,style:0.15,use_speaker_boost:true}})});
    if(!r.ok){console.log(`  ✗ ${name}  ${r.status} ${(await r.text()).slice(0,90)}`);continue;}
    writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  }
  spawnSync(`${FFDIR}/ffmpeg.exe`,['-y','-loglevel','error','-i',mp3,'-ac','1','-ar',String(SR),'-f','s16le',pcm]);
  const m=medianF0(pcm);
  const d=m? Math.abs(m.f0-158.4).toFixed(1) : '-';
  console.log(`  ${name.padEnd(20)}  F0 ${String(m?.f0??'-').padStart(6)}Hz   변화폭 ${String(m?.iqr??'-').padStart(5)}   목표와 차이 ${String(d).padStart(5)}Hz`);
}

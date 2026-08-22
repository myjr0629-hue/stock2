// 게이트와 «같은 자»로 클립의 프레임간 변화량을 잰다 — 어떤 클립이 컷으로 오인되는지 찾는다
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const FFDIR='C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const GW=96, GH=171, GS=GW*GH;
for (const name of process.argv.slice(2)) {
  const r = spawnSync(join(FFDIR,'ffmpeg.exe'),
    ['-v','error','-i',`public/shorts/bg/video/${name}.mp4`,
     '-vf',`fps=6,scale=${GW}:${GH},format=gray`,'-f','rawvideo','-'],
    {maxBuffer:1<<28, encoding:'buffer'});
  const buf=r.stdout; const n=Math.floor(buf.length/GS);
  let over=0, max=0, sum=0;
  for(let i=1;i<n;i++){
    let s=0; const a=buf.subarray((i-1)*GS,i*GS), b=buf.subarray(i*GS,(i+1)*GS);
    for(let k=0;k<GS;k++) s+=Math.abs(a[k]-b[k]);
    const v=s/GS; sum+=v; if(v>max)max=v; if(v>18)over++;
  }
  console.log(`  ${name.padEnd(24)} 평균 ${(sum/(n-1)).toFixed(1).padStart(5)}  최대 ${max.toFixed(1).padStart(5)}  «18 초과» ${String(over).padStart(3)}/${n-1} 프레임`);
}

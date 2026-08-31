const fs=require('fs');
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {SSMClient,SendCommandCommand,GetCommandInvocationCommand}=require('@aws-sdk/client-ssm');
const c=new SSMClient({region:process.env.AWS_REGION||'us-east-1'});
const ID='i-0c8e51d26ddc9b3c1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const cmd = process.argv[2] || 'crontab -l 2>/dev/null; echo "--- root ---"; sudo crontab -l 2>/dev/null; echo "--- 시스템 TZ ---"; date; timedatectl 2>/dev/null | head -3';
  const s=await c.send(new SendCommandCommand({InstanceIds:[ID],DocumentName:'AWS-RunShellScript',Parameters:{commands:[cmd]}}));
  const cid=s.Command.CommandId;
  for(let i=0;i<20;i++){
    await wait(2000);
    try{
      const r=await c.send(new GetCommandInvocationCommand({CommandId:cid,InstanceId:ID}));
      if(r.Status==='Success'||r.Status==='Failed'){ console.log(r.StandardOutputContent||''); if(r.StandardErrorContent) console.log('[err]',r.StandardErrorContent.slice(0,300)); return; }
    }catch{}
  }
  console.log('SSM 응답 없음');
})().catch(e=>console.log('SSM 실패:',e.name,e.message.slice(0,80)));

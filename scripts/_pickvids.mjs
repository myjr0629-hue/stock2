import { readFileSync } from 'node:fs';
const O=JSON.parse(readFileSync('.agent/_outliers.json','utf8'));
const want=[/NVDA vs INTL/i,/Blackberry took a shot/i,/Elon Musk Alone/i,/fastest negotiation/i,
 /Mark Cuban owns an entire town/i,/Rich Vs Middle Class/i];
console.log('레퍼런스:');
for(const w of want){const h=O.find(x=>w.test(x.t));
 if(h)console.log('  '+h.id+'  '+String(Math.round(h.v/1000)).padStart(6)+'k  '+String(h.sec).padStart(3)+'초  '+h.ch.slice(0,16)+'  '+h.t.slice(0,50));}

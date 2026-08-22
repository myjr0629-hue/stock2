import { demandFor } from './_demand.mjs';
const d = demandFor('ja');
const T = process.argv[2] || 'S&P500が静かな理由、中では二つに割れている';
const keys = Object.keys(d);
console.log('일본 수요표 항목', keys.length);
console.log('제목에 그대로 들어간 어휘:', JSON.stringify(keys.filter(k => T.includes(k))));
console.log('S&P/500 관련 키:', JSON.stringify(keys.filter(k => /S.?&.?P|500/i.test(k))));
console.log('5000 이상 키:', JSON.stringify(keys.filter(k => (d[k]||0) >= 5000)));

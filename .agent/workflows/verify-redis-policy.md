---
description: 외부 API 직접 호출 금지 정책 — 모든 외부 데이터는 cron→Redis 경유 필수
---

# 외부 API 호출 정책 (STRICT)

## 원칙
- **모든 외부 API 호출 (Yahoo, CNN, 등)은 `/api/cron/market-feed` 에서만 허용**
- 다른 모든 서비스/API route는 **Redis에서만 읽기** (`getFromCache`, `getYahooDataSSOT`)
- 유저 요청 경로에서 외부 API를 직접 호출하면 트래픽 증가 시 IP 블럭됨

## 허용된 외부 호출 위치
- `src/app/api/cron/market-feed/route.ts` — Yahoo 8개 심볼 + CNN Fear & Greed
- `src/services/massiveClient.ts` — Polygon/Massive API (유료 API, rate limit 별도)
- `src/services/fedApiClient.ts` — FRED API (공공 API, 속도 제한 낮음)

## 금지 패턴
```
❌ fetch('https://query1.finance.yahoo.com/...')  — cron 외부에서 금지
❌ fetch('https://production.dataviz.cnn.io/...')  — cron 외부에서 금지
❌ 유저 요청마다 실행되는 route에서 외부 HTTP 호출
```

## 작업 완료 시 필수 검증 단계

// turbo-all

1. Yahoo 직접 호출 검색:
```powershell
npx grep-cli "query1.finance.yahoo" src/ --exclude="**/cron/**"
```
또는:
```powershell
node -e "const {execSync}=require('child_process');const r=execSync('findstr /s /i \"query1.finance.yahoo\" src\\\\*.ts src\\\\*.tsx',{encoding:'utf-8',cwd:'.'}).toString();const lines=r.split('\\n').filter(l=>!l.includes('cron'));if(lines.filter(Boolean).length>0){console.log('❌ VIOLATION:',lines.join('\\n'));process.exit(1)}else{console.log('✅ No Yahoo direct calls outside cron')}"
```

2. CNN 직접 호출 검색:
```powershell
node -e "const {execSync}=require('child_process');try{const r=execSync('findstr /s /i \"dataviz.cnn\" src\\\\*.ts src\\\\*.tsx',{encoding:'utf-8',cwd:'.'}).toString();const lines=r.split('\\n').filter(l=>!l.includes('cron'));if(lines.filter(Boolean).length>0){console.log('❌ VIOLATION:',lines.join('\\n'));process.exit(1)}else{console.log('✅ No CNN direct calls outside cron')}}catch{console.log('✅ No CNN direct calls found')}"
```

3. 라이브 API 검증 (배포 후):
```powershell
node -e "fetch('https://signumhq.com/api/cron/market-feed').then(r=>r.json()).then(d=>console.log('Cron:',d.ok+'/'+d.results.length,'OK')).catch(e=>console.log('ERR:',e.message))"
```

4. Ticker API source 확인:
```powershell
node -e "fetch('https://signumhq.com/api/market/ticker?s=%5EVIX').then(r=>r.json()).then(d=>{if(d.source!=='CACHE')console.log('❌ source is',d.source,'not CACHE');else console.log('✅ VIX source: CACHE')})"
```

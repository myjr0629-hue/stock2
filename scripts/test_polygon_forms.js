const apiKey = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

async function testPolygon(endpoint) {
  const url = `https://api.polygon.io${endpoint}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      console.log('SUCCESS:', endpoint);
      console.log(JSON.stringify(data.results?.[0] || data, null, 2));
      return true;
    }
  } catch (e) {}
  return false;
}

async function run() {
  const endpoints = [
    `/vX/reference/sec/form4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/reference/form4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/filings/form4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/reference/filings/form4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/sec/form4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/filings/form-4?ticker=NVDA&apiKey=${apiKey}`,
    `/vX/reference/sec/filings?form_type=4&ticker=NVDA&apiKey=${apiKey}`
  ];
  
  for (const ep of endpoints) {
    if (await testPolygon(ep)) break;
  }
}
run();

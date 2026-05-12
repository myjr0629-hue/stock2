// End-to-End 캡처 테스트: EC2 Puppeteer → Supabase CDN → URL 확인
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const EC2_URL = process.env.EC2_CAPTURE_URL || 'http://52.23.98.13:3100';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = 'marketing-assets';

async function test() {
  console.log('=== E2E Capture Pipeline Test ===\n');

  // Step 1: EC2 캡처
  console.log('1️⃣ EC2 Capture...');
  const templateUrl = 'https://signumhq.com/templates/og/pulse?spy=0.84&vix=18.39&gex=neutral&dp=47&lang=en&format=tweet';
  
  const captureRes = await fetch(`${EC2_URL}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: templateUrl,
      width: 1200,
      height: 675,
      delay: 2000,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!captureRes.ok) {
    const err = await captureRes.text();
    console.error('❌ EC2 Capture FAILED:', captureRes.status, err);
    process.exit(1);
  }

  const buffer = new Uint8Array(await captureRes.arrayBuffer());
  const sizeKB = (buffer.length / 1024).toFixed(0);
  
  // PNG header check
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    console.error('❌ Not a valid PNG! First bytes:', Buffer.from(buffer.slice(0, 4)).toString('hex'));
    process.exit(1);
  }
  console.log(`✅ EC2 Capture OK: ${sizeKB}KB PNG (valid header)\n`);

  // Step 2: Supabase 업로드
  console.log('2️⃣ Supabase Upload...');
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (error && !error.message?.includes('already exists')) {
      console.error('❌ Bucket creation failed:', error.message);
      process.exit(1);
    }
    console.log('  Created bucket:', BUCKET);
  }

  const storagePath = `cards/e2e_test_${Date.now()}.png`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadErr) {
    console.error('❌ Upload FAILED:', uploadErr.message);
    process.exit(1);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const cdnUrl = urlData?.publicUrl;
  console.log(`✅ Supabase Upload OK: ${storagePath}\n`);

  // Step 3: CDN URL 접근 확인
  console.log('3️⃣ CDN URL Verify...');
  console.log(`  URL: ${cdnUrl}`);
  
  const cdnRes = await fetch(cdnUrl, { method: 'HEAD' });
  if (cdnRes.ok) {
    console.log(`✅ CDN accessible: ${cdnRes.status} ${cdnRes.headers.get('content-type')} ${cdnRes.headers.get('content-length')} bytes\n`);
  } else {
    console.error(`❌ CDN NOT accessible: ${cdnRes.status}`);
    process.exit(1);
  }

  // Step 4: Cleanup
  console.log('4️⃣ Cleanup test file...');
  await supabase.storage.from(BUCKET).remove([storagePath]);
  console.log('✅ Test file removed\n');

  // Step 5: Buffer API Health
  console.log('5️⃣ Buffer API Check...');
  const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
  if (!bufferToken) {
    console.error('❌ Missing BUFFER_ACCESS_TOKEN');
    process.exit(1);
  }
  
  try {
    const bufRes = await fetch('https://api.bufferapp.com/1/user.json?access_token=' + bufferToken, {
      signal: AbortSignal.timeout(10000)
    });
    if (bufRes.ok) {
      const user = await bufRes.json();
      console.log(`✅ Buffer API OK: user=${user.name || user.id}\n`);
    } else {
      console.error('❌ Buffer API error:', bufRes.status, await bufRes.text());
    }
  } catch (e) {
    console.error('❌ Buffer API unreachable:', e.message);
  }

  // Step 6: Buffer Channel Count
  console.log('6️⃣ Buffer Channels...');
  try {
    const profilesRes = await fetch('https://api.bufferapp.com/1/profiles.json?access_token=' + bufferToken);
    if (profilesRes.ok) {
      const profiles = await profilesRes.json();
      console.log(`✅ ${profiles.length} channels configured:`);
      profiles.forEach(p => console.log(`  - ${p.service} [${p.service_username}] id=${p.id}`));
    }
  } catch (e) {
    console.error('❌ Cannot list channels:', e.message);
  }

  console.log('\n=== ALL CHECKS PASSED ===');
}

test().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

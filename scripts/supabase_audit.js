// Supabase Storage Cleanup Script
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lqvxcmgpuowikdcyhbvn.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function main() {
  console.log('=== Supabase Storage Audit ===\n');

  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
  if (bucketsErr) {
    console.log('Error listing buckets:', bucketsErr.message);
    return;
  }

  console.log(`Found ${buckets.length} bucket(s):\n`);

  for (const bucket of buckets) {
    console.log(`Bucket: "${bucket.name}" (${bucket.public ? 'public' : 'private'})`);
    
    const { data: files, error: filesErr } = await supabase.storage.from(bucket.name).list('', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' }
    });

    if (filesErr) {
      console.log(`  Error: ${filesErr.message}`);
      continue;
    }

    if (!files || files.length === 0) {
      console.log('  (empty)\n');
      continue;
    }

    let totalSize = 0;
    const fileList = [];

    for (const file of files) {
      if (file.metadata) {
        totalSize += file.metadata.size || 0;
        fileList.push({ name: file.name, size: file.metadata.size || 0 });
      } else if (file.id === null) {
        const { data: subFiles } = await supabase.storage.from(bucket.name).list(file.name, { limit: 1000 });
        if (subFiles) {
          for (const sf of subFiles) {
            const size = sf.metadata?.size || 0;
            totalSize += size;
            fileList.push({ name: `${file.name}/${sf.name}`, size });
          }
        }
      }
    }

    console.log(`  Files: ${fileList.length}, Total: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    fileList.sort((a, b) => b.size - a.size);
    for (const f of fileList.slice(0, 15)) {
      console.log(`    ${(f.size / 1024 / 1024).toFixed(2)} MB  ${f.name}`);
    }
    console.log('');
  }
}

main().catch(console.error);

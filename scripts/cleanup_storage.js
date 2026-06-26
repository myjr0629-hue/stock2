// Delete marketing assets older than 7 days from Supabase Storage
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lqvxcmgpuowikdcyhbvn.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function main() {
  const BUCKET = 'marketing-assets';
  const DAYS_TO_KEEP = 7;
  const cutoffDate = new Date(Date.now() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
  
  console.log(`=== Supabase Storage Cleanup ===`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Keeping files newer than: ${cutoffDate.toISOString()}`);
  console.log('');

  // List all files
  let allFiles = [];
  let offset = 0;
  const BATCH = 1000;
  
  while (true) {
    const { data: files, error } = await supabase.storage.from(BUCKET).list('', {
      limit: BATCH,
      offset,
      sortBy: { column: 'created_at', order: 'asc' }
    });
    
    if (error) {
      console.log('Error listing:', error.message);
      break;
    }
    if (!files || files.length === 0) break;
    
    // Check for folders
    for (const file of files) {
      if (file.id === null) {
        // It's a folder, list its contents
        const { data: subFiles } = await supabase.storage.from(BUCKET).list(file.name, { limit: 5000 });
        if (subFiles) {
          for (const sf of subFiles) {
            if (sf.id !== null) {
              allFiles.push({ 
                path: `${file.name}/${sf.name}`, 
                created: sf.created_at, 
                size: sf.metadata?.size || 0 
              });
            }
          }
        }
      } else {
        allFiles.push({ 
          path: file.name, 
          created: file.created_at, 
          size: file.metadata?.size || 0 
        });
      }
    }
    
    offset += files.length;
    if (files.length < BATCH) break;
  }

  console.log(`Total files found: ${allFiles.length}`);
  
  // Split into old and new
  const toDelete = allFiles.filter(f => new Date(f.created) < cutoffDate);
  const toKeep = allFiles.filter(f => new Date(f.created) >= cutoffDate);
  
  const deleteSize = toDelete.reduce((s, f) => s + f.size, 0);
  const keepSize = toKeep.reduce((s, f) => s + f.size, 0);
  
  console.log(`Files to DELETE: ${toDelete.length} (${(deleteSize / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Files to KEEP: ${toKeep.length} (${(keepSize / 1024 / 1024).toFixed(1)} MB)`);
  console.log('');

  if (toDelete.length === 0) {
    console.log('Nothing to delete!');
    return;
  }

  // Delete in batches of 100
  const BATCH_SIZE = 100;
  let deleted = 0;
  
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = toDelete.slice(i, i + BATCH_SIZE).map(f => f.path);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    
    if (error) {
      console.log(`Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
    } else {
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${toDelete.length} files...`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} files, freed ~${(deleteSize / 1024 / 1024).toFixed(0)} MB`);
  console.log(`Remaining: ${toKeep.length} files, ~${(keepSize / 1024 / 1024).toFixed(0)} MB`);
}

main().catch(console.error);

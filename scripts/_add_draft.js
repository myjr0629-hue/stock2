const fs = require('fs');
const f = 'src/app/api/cron/marketing-dispatch/route.ts';
let c = fs.readFileSync(f, 'utf8');

// 1. Add draft param declaration after dryRun
c = c.replace(
  "const dryRun = searchParams.get('dry_run') !== 'false';",
  "const dryRun = searchParams.get('dry_run') !== 'false';\r\n  const draft = searchParams.get('draft') === 'true'; // Posts go to Buffer Drafts tab"
);

// 2. After every "dryRun," line, add "draft," with same indentation
let count = 0;
c = c.replace(/^(\s+)dryRun,\r?\n/gm, (match, indent) => {
  count++;
  return indent + 'dryRun,\r\n' + indent + 'draft,\r\n';
});

fs.writeFileSync(f, c);
console.log('Added draft param declaration');
console.log('Replaced', count, 'dryRun, → dryRun, + draft,');
const verify = (c.match(/draft/g) || []).length;
console.log('Total draft occurrences:', verify);

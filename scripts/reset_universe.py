import re

files = [
    'scripts/lambda-flow-harvest/index.js',
    'scripts/lambda-fmp/index.js',
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()
    
    # Check if it has a hardcoded array
    m = re.search(r'const UNIVERSE = \["[^\]]+\];', code)
    if m:
        new_code = re.sub(r'const UNIVERSE = \["[^\]]+\];', 'const UNIVERSE = [];', code, count=1)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_code)
        old_count = m.group(0).count(',') + 1
        print(f'{filepath}: Reset from ~{old_count} tickers to []')
    else:
        m2 = re.search(r'const UNIVERSE = .*?;', code)
        print(f'{filepath}: Already clean ({m2.group(0)[:50] if m2 else "NOT FOUND"})')

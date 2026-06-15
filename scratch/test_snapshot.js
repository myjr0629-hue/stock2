const fs = require('node:fs');

async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/intel/snapshot?sector=m7');
        console.log('Status:', res.status);
        const data = await res.json();
        fs.writeFileSync('scratch/snapshot_output.json', JSON.stringify(data, null, 2));
        console.log('Successfully wrote to scratch/snapshot_output.json');
    } catch (e) {
        console.error('Error:', e);
    }
}

test();

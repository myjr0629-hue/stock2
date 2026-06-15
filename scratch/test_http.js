async function test() {
    try {
        const url = 'https://signumhq.com/ko/app-view/intel';
        console.log('Fetching:', url);
        const res = await fetch(url);
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Length:', text.length);
        console.log('Includes title "INTEL" or similar:', text.includes('INTEL'));
    } catch (e) {
        console.error('Error:', e);
    }
}

test();

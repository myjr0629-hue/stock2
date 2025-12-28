// [S-51.5.2] Debug KV API - Check Redis connection and keys
import { debugKV } from '@/lib/storage/reportStore';

export async function GET() {
    try {
        const result = await debugKV();

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({
            ok: false,
            error: (e as Error).message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
    }
}

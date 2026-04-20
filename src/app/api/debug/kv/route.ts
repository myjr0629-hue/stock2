// [S-51.5.2] Debug KV API - Check Redis connection and keys
import { debugKV } from '@/lib/storage/reportStore';

import { requireDebugAuth } from '@/lib/debugAuth';

export async function GET() {
    const authError = requireDebugAuth();
    if (authError) return authError;
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

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('\x1b[31m[CLIENT DEBUG LOG]\x1b[0m', JSON.stringify(body, null, 2));
  } catch (e) {
    console.log('\x1b[31m[CLIENT DEBUG LOG ERROR]\x1b[0m', e instanceof Error ? e.message : String(e));
  }
  return NextResponse.json({ ok: true });
}

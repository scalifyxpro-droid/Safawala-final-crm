import { NextResponse } from 'next/server';
import { downloadFile } from '@/lib/storage/client';

export async function GET(
  _request: Request,
  context: { params: Promise<{ bucket: string; path: string[] }> },
) {
  try {
    const { bucket, path } = await context.params;
    const file = await downloadFile(bucket, path.join('/'));
    if (!file) return new NextResponse(null, { status: 404 });

    return new NextResponse(Buffer.from(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': file.cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

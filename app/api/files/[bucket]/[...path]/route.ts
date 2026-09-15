import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile } from '@/lib/storage/client';

const legacyImageName = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;

async function localLegacyImage(bucket: string, path: string[]) {
  if (
    process.env.NODE_ENV !== 'development' ||
    bucket !== 'product-images' ||
    path.length !== 2 ||
    path[0] !== 'legacy-inventory' ||
    !legacyImageName.test(path[1])
  ) {
    return null;
  }

  try {
    const body = await readFile(
      join(process.cwd(), 'migration', 'legacy-inventory', 'images', path[1]),
    );
    const extension = path[1].split('.').pop();
    const contentType =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ bucket: string; path: string[] }> },
) {
  try {
    const { bucket, path } = await context.params;
    let file = null;
    try {
      file = await downloadFile(bucket, path.join('/'));
    } catch {
      const localFile = await localLegacyImage(bucket, path);
      if (localFile) return localFile;
    }
    if (!file) {
      const localFile = await localLegacyImage(bucket, path);
      return localFile ?? new NextResponse(null, { status: 404 });
    }

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

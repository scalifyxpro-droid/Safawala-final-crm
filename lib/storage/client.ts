import 'server-only';

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type UploadedFile = { path: string; name: string };
export type DownloadedFile = {
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
};

type StorageConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

let cachedClient: S3Client | null = null;
let cachedConfigKey = '';

function readStorageConfig(): StorageConfig {
  const bucket = process.env.BUCKET ?? process.env.S3_BUCKET ?? '';
  const endpoint = process.env.ENDPOINT ?? process.env.S3_ENDPOINT ?? '';
  const region = process.env.REGION ?? process.env.S3_REGION ?? 'auto';
  const accessKeyId = process.env.ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY ?? '';

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'File storage is not configured. Link a Railway Bucket and provide BUCKET, ENDPOINT, REGION, ACCESS_KEY_ID, and SECRET_ACCESS_KEY.',
    );
  }

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

function storageClient() {
  const config = readStorageConfig();
  const configKey = JSON.stringify(config);
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedConfigKey = configKey;
  }
  return { client: cachedClient, config };
}

function objectKey(logicalBucket: string, path: string) {
  const cleanBucket = logicalBucket.replace(/^\/+|\/+$/g, '');
  const cleanPath = path.replace(/^\/+/, '');
  if (!cleanBucket || !cleanPath || cleanPath.split('/').includes('..')) {
    throw new Error('Invalid storage path.');
  }
  return `${cleanBucket}/${cleanPath}`;
}

export function getPublicFilePath(bucket: string, path: string) {
  const key = objectKey(bucket, path);
  return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function uploadFile(bucket: string, path: string, file: File): Promise<UploadedFile> {
  const { client, config } = storageClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey(bucket, path),
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type || 'application/octet-stream',
    }),
  );
  return { path, name: file.name };
}

export async function getSignedFileUrl(bucket: string, path: string): Promise<string | null> {
  if (!path) return null;
  const { client, config } = storageClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(bucket, path) }),
    { expiresIn: 60 * 60 },
  );
}

export async function downloadFile(bucket: string, path: string): Promise<DownloadedFile | null> {
  const { client, config } = storageClient();
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(bucket, path) }),
    );
    if (!object.Body) return null;
    return {
      body: await object.Body.transformToByteArray(),
      contentType: object.ContentType || 'application/octet-stream',
      cacheControl: object.CacheControl || 'private, max-age=3600',
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (error as { name?: string }).name === 'NoSuchKey') return null;
    throw error;
  }
}

export async function deleteFiles(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { client, config } = storageClient();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: { Objects: paths.map((path) => ({ Key: objectKey(bucket, path) })) },
    }),
  );
}

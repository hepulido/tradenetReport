// server/s3.ts
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

export function parseS3Url(fileUrl: string): { bucket: string; key: string } {
  // expected: s3://bucket/key
  if (!fileUrl.startsWith("s3://")) throw new Error(`Invalid S3 URL: ${fileUrl}`);
  const withoutScheme = fileUrl.slice("s3://".length);
  const firstSlash = withoutScheme.indexOf("/");
  if (firstSlash < 0) throw new Error(`Invalid S3 URL: ${fileUrl}`);
  const bucket = withoutScheme.slice(0, firstSlash);
  const key = withoutScheme.slice(firstSlash + 1);
  return { bucket, key };
}

function getClient() {
  // IMPORTANT: your bucket is us-east-2
  const region = process.env.AWS_REGION || "us-east-2";
  return new S3Client({ region });
}

export async function getS3ObjectText(bucket: string, key: string): Promise<string> {
  const client = getClient();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error("S3 GetObject returned empty body");
  return streamToString(res.Body as Readable);
}

export async function putS3ObjectBuffer(params: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<string> {
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || "application/octet-stream",
    })
  );

  return `s3://${params.bucket}/${params.key}`;
}

export interface S3ObjectInfo {
  key: string;
  lastModified: Date | undefined;
  size: number | undefined;
}

export async function listS3Objects(params: {
  bucket: string;
  prefix: string;
  maxKeys?: number;
}): Promise<S3ObjectInfo[]> {
  const client = getClient();

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: params.bucket,
      Prefix: params.prefix,
      MaxKeys: params.maxKeys || 1000,
    })
  );

  const objects: S3ObjectInfo[] = (res.Contents || []).map((obj) => ({
    key: obj.Key || "",
    lastModified: obj.LastModified,
    size: obj.Size,
  }));

  // Sort by LastModified descending (newest first)
  objects.sort((a, b) => {
    const aTime = a.lastModified?.getTime() ?? 0;
    const bTime = b.lastModified?.getTime() ?? 0;
    return bTime - aTime;
  });

  return objects;
}

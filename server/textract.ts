// server/textract.ts
import {
  TextractClient,
  DetectDocumentTextCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  type Block,
} from "@aws-sdk/client-textract";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { extractPdfText, isUsablePdfText, getPdfBufferDebugInfo, type PdfDebugInfo } from "./pdfExtract";
import * as crypto from "crypto";

// Configuration
const POLL_INITIAL_INTERVAL_MS = 2000; // Start with 2s
const POLL_MAX_INTERVAL_MS = 10000; // Max 10s between polls
const MAX_POLL_TIMEOUT_MS = 300000; // 5 minutes (increased from 60s)
const PDF_TEXT_MIN_CHARS = 200;

// Custom error for Textract jobs still in progress at timeout
export class TextractStillInProgressError extends Error {
  public readonly jobId: string;
  public readonly elapsedMs: number;

  constructor(jobId: string, elapsedMs: number) {
    super(`Textract job ${jobId} still IN_PROGRESS after ${elapsedMs}ms. Job may complete later.`);
    this.name = "TextractStillInProgressError";
    this.jobId = jobId;
    this.elapsedMs = elapsedMs;
  }
}

function getTextractClient(): TextractClient {
  const region = process.env.AWS_REGION || "us-east-2";
  return new TextractClient({ region });
}

/**
 * Sleep with exponential backoff (capped at maxInterval)
 */
function getBackoffInterval(attempt: number, baseMs: number, maxMs: number): number {
  const interval = Math.min(baseMs * Math.pow(1.5, attempt), maxMs);
  // Add jitter (±10%)
  const jitter = interval * 0.1 * (Math.random() * 2 - 1);
  return Math.floor(interval + jitter);
}

// --- Type definitions ---

export type S3DownloadDebugInfo = {
  bucket: string;
  key: string;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
  bufferLength: number;
  sha256: string;
  magicBytes: string;
  isPdfMagic?: boolean;
  downloadDurationMs: number;
};

export type TextractResult = {
  text: string;
  pageCount: number;
  confidence: number | null;
  lineCount: number;
  method: "detect" | "textract-async" | "pdf_text";
  textractJobId?: string;
  textSource?: "pdf_embedded" | "ocr";
  s3Debug?: S3DownloadDebugInfo;
  pdfDebug?: PdfDebugInfo;
};

/**
 * Get S3 object metadata without downloading the full object
 */
export async function getS3ObjectMetadata(bucket: string, key: string): Promise<{
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
}> {
  const region = process.env.AWS_REGION || "us-east-2";
  const client = new S3Client({ region });

  const response = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key })
  );

  return {
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
    lastModified: response.LastModified?.toISOString(),
  };
}

// Helper to get S3 object as buffer (exported for retry-ocr)
export async function getS3ObjectBuffer(bucket: string, key: string): Promise<Buffer> {
  const region = process.env.AWS_REGION || "us-east-2";
  const client = new S3Client({ region });

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error("S3 GetObject returned empty body");
  }

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Get S3 object with full debug info (for diagnostics)
 */
export async function getS3ObjectBufferWithDebug(bucket: string, key: string): Promise<{
  buffer: Buffer;
  debug: S3DownloadDebugInfo;
}> {
  const region = process.env.AWS_REGION || "us-east-2";
  const client = new S3Client({ region });

  const startTime = Date.now();

  // Get object with metadata
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error("S3 GetObject returned empty body");
  }

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const downloadDurationMs = Date.now() - startTime;

  // Compute debug info
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const magicBytes = buffer.slice(0, 8).toString("ascii").replace(/[^\x20-\x7E]/g, "?");
  const isPdfMagic = buffer.slice(0, 4).toString("ascii") === "%PDF";

  const debug: S3DownloadDebugInfo = {
    bucket,
    key,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
    lastModified: response.LastModified?.toISOString(),
    bufferLength: buffer.length,
    sha256,
    magicBytes,
    isPdfMagic,
    downloadDurationMs,
  };

  console.log(`[textract] S3 download: ${key} | ${debug.bufferLength} bytes | ContentType=${debug.contentType} | magic="${debug.magicBytes}" | isPDF=${debug.isPdfMagic} | sha256=${sha256.slice(0, 16)}... | ${downloadDurationMs}ms`);

  return { buffer, debug };
}

// --- Helper functions ---

/**
 * Check if a file is a PDF based on key or contentType
 */
export function isPdfFile(keyOrFilename: string, contentType?: string): boolean {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct === "application/pdf" || ct.includes("pdf")) return true;
  }
  const lower = keyOrFilename.toLowerCase();
  return lower.endsWith(".pdf");
}

/**
 * Check if a file is a supported image type for Textract
 * Supported: PNG, JPEG, TIFF (single page)
 */
export function isImageFile(keyOrFilename: string, contentType?: string): boolean {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (
      ct.startsWith("image/png") ||
      ct.startsWith("image/jpeg") ||
      ct.startsWith("image/jpg") ||
      ct.startsWith("image/tiff")
    ) {
      return true;
    }
  }
  const lower = keyOrFilename.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".tiff") ||
    lower.endsWith(".tif")
  );
}

/**
 * Check if a file type is supported by Textract
 */
export function isSupportedFile(keyOrFilename: string, contentType?: string): boolean {
  return isPdfFile(keyOrFilename, contentType) || isImageFile(keyOrFilename, contentType);
}

/**
 * Extract text from Textract blocks (LINE type)
 */
function extractTextFromBlocks(blocks: Block[]): {
  text: string;
  lineCount: number;
  avgConfidence: number | null;
  pageNumbers: Set<number>;
} {
  const lines: string[] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;
  const pageNumbers = new Set<number>();

  for (const block of blocks) {
    if (block.BlockType === "LINE" && block.Text) {
      lines.push(block.Text);
      if (typeof block.Confidence === "number") {
        totalConfidence += block.Confidence;
        confidenceCount++;
      }
      if (typeof block.Page === "number") {
        pageNumbers.add(block.Page);
      }
    }
  }

  const text = lines.join("\n");
  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;

  return { text, lineCount: lines.length, avgConfidence, pageNumbers };
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main OCR functions ---

/**
 * Synchronous OCR for images (PNG, JPEG, TIFF) using DetectDocumentText
 */
export async function textractFromS3(bucket: string, key: string): Promise<TextractResult> {
  const client = getTextractClient();

  const command = new DetectDocumentTextCommand({
    Document: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
  });

  const response = await client.send(command);
  const blocks = response.Blocks ?? [];

  const { text, lineCount, avgConfidence, pageNumbers } = extractTextFromBlocks(blocks);

  return {
    text,
    pageCount: pageNumbers.size || 1,
    confidence: avgConfidence,
    lineCount,
    method: "detect",
  };
}

/**
 * Asynchronous OCR for PDFs using StartDocumentTextDetection + polling
 * Handles multi-page PDFs with pagination via NextToken
 * Uses exponential backoff and throws TextractStillInProgressError if still processing at timeout
 */
export async function textractPdfFromS3(
  bucket: string,
  key: string,
  options?: {
    pollIntervalMs?: number;
    maxTimeoutMs?: number;
  }
): Promise<TextractResult> {
  const client = getTextractClient();
  const basePollInterval = options?.pollIntervalMs ?? POLL_INITIAL_INTERVAL_MS;
  const maxTimeout = options?.maxTimeoutMs ?? MAX_POLL_TIMEOUT_MS;

  // 1) Start async job
  const startCommand = new StartDocumentTextDetectionCommand({
    DocumentLocation: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
  });

  const startResponse = await client.send(startCommand);
  const textractJobId = startResponse.JobId;

  if (!textractJobId) {
    throw new Error("Textract StartDocumentTextDetection did not return a JobId");
  }

  console.log(`[textract] Started async job ${textractJobId} for ${key}, max wait ${maxTimeout}ms`);

  // 2) Poll for completion with exponential backoff
  const startTime = Date.now();
  let jobStatus: string | undefined;
  let pollAttempt = 0;

  while (Date.now() - startTime < maxTimeout) {
    const interval = getBackoffInterval(pollAttempt, basePollInterval, POLL_MAX_INTERVAL_MS);
    await sleep(interval);
    pollAttempt++;

    const getCommand = new GetDocumentTextDetectionCommand({
      JobId: textractJobId,
    });

    const getResponse = await client.send(getCommand);
    jobStatus = getResponse.JobStatus;

    const elapsed = Date.now() - startTime;
    console.log(`[textract] Poll #${pollAttempt}: job ${textractJobId} status=${jobStatus}, elapsed=${elapsed}ms`);

    if (jobStatus === "SUCCEEDED") {
      // 3) Collect all pages (handle pagination)
      const allBlocks: Block[] = [];
      let nextToken: string | undefined = undefined;

      // First response already has blocks
      if (getResponse.Blocks) {
        allBlocks.push(...getResponse.Blocks);
      }
      nextToken = getResponse.NextToken;

      // Paginate through remaining blocks
      while (nextToken) {
        const pageCommand = new GetDocumentTextDetectionCommand({
          JobId: textractJobId,
          NextToken: nextToken,
        });
        const pageResponse = await client.send(pageCommand);

        if (pageResponse.Blocks) {
          allBlocks.push(...pageResponse.Blocks);
        }
        nextToken = pageResponse.NextToken;
      }

      const { text, lineCount, avgConfidence, pageNumbers } = extractTextFromBlocks(allBlocks);

      console.log(`[textract] Job ${textractJobId} completed: ${text.length} chars, ${pageNumbers.size} pages`);

      return {
        text,
        pageCount: pageNumbers.size || 1,
        confidence: avgConfidence,
        lineCount,
        method: "textract-async",
        textractJobId,
      };
    }

    if (jobStatus === "FAILED") {
      const statusMessage = getResponse.StatusMessage || "Unknown error";
      throw new Error(`Textract job failed: ${statusMessage}`);
    }

    // IN_PROGRESS - continue polling
    if (jobStatus !== "IN_PROGRESS") {
      console.warn(`[textract] Unexpected Textract job status: ${jobStatus}`);
    }
  }

  // Timeout reached while still IN_PROGRESS - throw specific error (NOT "OCR empty")
  const elapsed = Date.now() - startTime;
  if (jobStatus === "IN_PROGRESS") {
    console.warn(`[textract] Job ${textractJobId} still IN_PROGRESS after ${elapsed}ms - throwing TextractStillInProgressError`);
    throw new TextractStillInProgressError(textractJobId, elapsed);
  }

  // Generic timeout error for other cases
  throw new Error(
    `Textract PDF job timed out after ${maxTimeout}ms. JobId: ${textractJobId}, last status: ${jobStatus}`
  );
}

/**
 * Smart OCR: automatically chooses method based on file type
 * For PDFs: tries embedded text extraction first, falls back to OCR if insufficient
 * Includes comprehensive debug info for troubleshooting
 */
export async function textractSmartOCR(
  bucket: string,
  key: string,
  contentType?: string,
  options?: { includeDebug?: boolean }
): Promise<TextractResult> {
  const includeDebug = options?.includeDebug ?? true;

  if (isPdfFile(key, contentType)) {
    // Try PDF text extraction first (faster, no OCR cost)
    let s3Debug: S3DownloadDebugInfo | undefined;
    let pdfDebug: PdfDebugInfo | undefined;

    try {
      console.log(`[textract] Attempting PDF text extraction for ${key}`);

      // Get buffer with debug info
      const { buffer: pdfBuffer, debug } = await getS3ObjectBufferWithDebug(bucket, key);
      s3Debug = debug;

      // Validate buffer before attempting parse
      if (!debug.isPdfMagic) {
        console.error(`[textract] File ${key} has invalid PDF magic bytes: "${debug.magicBytes}"`);
        // Still try textract OCR as a fallback - it might handle the file format
      }

      const pdfResult = await extractPdfText(pdfBuffer, includeDebug);
      pdfDebug = pdfResult.debug;

      if (pdfResult.hasUsableText && isUsablePdfText(pdfResult.text)) {
        console.log(`[textract] PDF text extraction successful: ${pdfResult.textLength} chars, ${pdfResult.pageCount} pages`);
        return {
          text: pdfResult.text,
          pageCount: pdfResult.pageCount,
          confidence: 100, // Embedded text is 100% accurate
          lineCount: pdfResult.text.split("\n").length,
          method: "pdf_text",
          textSource: "pdf_embedded",
          s3Debug: includeDebug ? s3Debug : undefined,
          pdfDebug: includeDebug ? pdfDebug : undefined,
        };
      }

      console.log(`[textract] PDF text extraction insufficient (${pdfResult.textLength} chars, possibleImageOnly=${pdfDebug?.possibleImageOnlyPdf}), falling back to OCR`);
    } catch (err: any) {
      console.warn(`[textract] PDF text extraction failed, falling back to OCR:`, err?.message);
    }

    // Fall back to Textract OCR for scanned PDFs
    const ocrResult = await textractPdfFromS3(bucket, key);
    return {
      ...ocrResult,
      textSource: "ocr",
      s3Debug: includeDebug ? s3Debug : undefined,
      pdfDebug: includeDebug ? pdfDebug : undefined,
    };
  }

  if (isImageFile(key, contentType)) {
    const ocrResult = await textractFromS3(bucket, key);
    return {
      ...ocrResult,
      textSource: "ocr",
    };
  }

  throw new Error(`Unsupported file type for OCR: ${key} (contentType: ${contentType || "unknown"})`);
}

/**
 * Debug-only function to get full diagnostic info for a file in S3
 * without running the full OCR pipeline
 */
export async function debugS3File(bucket: string, key: string): Promise<{
  s3Debug: S3DownloadDebugInfo;
  pdfDebug?: PdfDebugInfo;
  isPdf: boolean;
  isImage: boolean;
  isSupported: boolean;
}> {
  const { buffer, debug: s3Debug } = await getS3ObjectBufferWithDebug(bucket, key);

  const isPdf = isPdfFile(key, s3Debug.contentType);
  const isImage = isImageFile(key, s3Debug.contentType);
  const isSupported = isSupportedFile(key, s3Debug.contentType);

  let pdfDebug: PdfDebugInfo | undefined;
  if (isPdf || s3Debug.isPdfMagic) {
    const pdfResult = await extractPdfText(buffer, true);
    pdfDebug = pdfResult.debug;
  }

  return {
    s3Debug,
    pdfDebug,
    isPdf,
    isImage,
    isSupported,
  };
}

// server/pdfExtract.ts
// PDF text extraction without OCR (for PDFs with embedded text)
// IMPORTANT: pdf-parse is OPTIONAL and NEVER blocks the pipeline
import * as crypto from "crypto";

// Type for PDFParse class (pdf-parse v2.x API)
type PDFParseClassType = new (options: { data: Buffer | Uint8Array; verbosity?: number }) => {
  getText: (params?: any) => Promise<{ text: string; pages: Array<{ text: string; num: number }> }>;
  getInfo: () => Promise<{ info: any; metadata: any; fingerprints: string[] }>;
  destroy: () => Promise<void>;
};

// Cached PDFParse class (null = not loaded, undefined = failed to load)
// pdf-parse v2.x uses a class-based API: new PDFParse({ data }).getText()
let cachedPDFParseClass: PDFParseClassType | null | undefined = null;
let pdfParseLoadError: string | null = null;

/**
 * Check if pdf-parse is disabled via environment variable
 */
export function isPdfParseDisabled(): boolean {
  const disabled = process.env.PDF_PARSE_DISABLED;
  return disabled === "true" || disabled === "1";
}

/**
 * Get PDFParse class with proper ESM handling (pdf-parse v2.x API)
 * NEVER throws - returns null if unavailable
 */
async function getPDFParseClass(): Promise<PDFParseClassType | null> {
  // Check feature flag
  if (isPdfParseDisabled()) {
    console.log("[pdfExtract] pdf-parse disabled via PDF_PARSE_DISABLED env var");
    return null;
  }

  // Return cached result (including null for previous failures)
  if (cachedPDFParseClass !== null && cachedPDFParseClass !== undefined) {
    return cachedPDFParseClass;
  }
  if (cachedPDFParseClass === undefined) {
    return null; // Previous load failed
  }

  try {
    // Dynamic import for ESM compatibility
    const module: any = await import("pdf-parse");

    // pdf-parse v2.x exports PDFParse as a named export
    const PDFParseClass = module.PDFParse;

    if (typeof PDFParseClass !== "function") {
      pdfParseLoadError = `PDFParse class not found. Module keys: ${Object.keys(module).join(", ")}`;
      console.error("[pdfExtract] pdf-parse v2.x PDFParse class not found:", {
        keys: Object.keys(module),
        hasPDFParse: "PDFParse" in module,
        PDFParseType: typeof module.PDFParse,
      });
      cachedPDFParseClass = undefined; // Mark as failed
      return null;
    }

    // Verify the class has the expected methods
    if (typeof PDFParseClass.prototype.getText !== "function") {
      pdfParseLoadError = "PDFParse class missing getText method";
      console.error("[pdfExtract] PDFParse class doesn't have getText method");
      cachedPDFParseClass = undefined;
      return null;
    }

    cachedPDFParseClass = PDFParseClass;
    console.log("[pdfExtract] PDFParse class loaded successfully (v2.x API)");
    return PDFParseClass as PDFParseClassType;
  } catch (err: any) {
    pdfParseLoadError = err?.message || "Unknown error loading pdf-parse";
    console.warn("[pdfExtract] Failed to load pdf-parse (will use OCR):", pdfParseLoadError);
    cachedPDFParseClass = undefined; // Mark as failed
    return null;
  }
}

export type PdfTextResult = {
  text: string;
  pageCount: number;
  textLength: number;
  hasUsableText: boolean;
  method: "pdf_text";
  debug?: PdfDebugInfo;
};

export type PdfDebugInfo = {
  bufferLength: number;
  sha256: string;
  magicBytes: string;
  isPdfMagic: boolean;
  info?: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modDate?: string;
  };
  metadata?: any;
  pageCount: number;
  rawTextPreview: string;
  textPerPage?: number[];
  possibleImageOnlyPdf: boolean;
  parseError?: string;
};

// Minimum characters to consider PDF text extraction successful
const MIN_TEXT_THRESHOLD = 100; // Lowered from 200 for short invoices

/**
 * Get debug info for a PDF buffer without full extraction
 */
export function getPdfBufferDebugInfo(pdfBuffer: Buffer): Pick<PdfDebugInfo, 'bufferLength' | 'sha256' | 'magicBytes' | 'isPdfMagic'> {
  const bufferLength = pdfBuffer.length;
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const magicBytes = pdfBuffer.slice(0, 8).toString("ascii").replace(/[^\x20-\x7E]/g, "?");
  const isPdfMagic = pdfBuffer.slice(0, 4).toString("ascii") === "%PDF";

  return { bufferLength, sha256, magicBytes, isPdfMagic };
}

/**
 * Extract text directly from a PDF buffer (no OCR).
 * Works for PDFs with embedded/selectable text.
 * Returns empty/short text for scanned PDFs.
 *
 * IMPORTANT: This function NEVER throws. If pdf-parse fails or is disabled,
 * it returns empty result with debug info. The pipeline should fall back to OCR.
 */
export async function extractPdfText(pdfBuffer: Buffer, includeDebug: boolean = true): Promise<PdfTextResult> {
  const bufferDebug = getPdfBufferDebugInfo(pdfBuffer);

  console.log(`[pdfExtract] Buffer info: ${bufferDebug.bufferLength} bytes, magic="${bufferDebug.magicBytes}", isPDF=${bufferDebug.isPdfMagic}, sha256=${bufferDebug.sha256.slice(0, 16)}...`);

  // Early return if not a valid PDF
  if (!bufferDebug.isPdfMagic) {
    console.error(`[pdfExtract] Invalid PDF: magic bytes "${bufferDebug.magicBytes}" (expected "%PDF")`);
    return {
      text: "",
      pageCount: 0,
      textLength: 0,
      hasUsableText: false,
      method: "pdf_text",
      debug: includeDebug ? {
        ...bufferDebug,
        pageCount: 0,
        rawTextPreview: "",
        possibleImageOnlyPdf: false,
        parseError: `Invalid PDF magic bytes: ${bufferDebug.magicBytes}`,
      } : undefined,
    };
  }

  // Check if pdf-parse is disabled
  if (isPdfParseDisabled()) {
    console.log("[pdfExtract] pdf-parse disabled, returning empty result (use OCR instead)");
    return {
      text: "",
      pageCount: 0,
      textLength: 0,
      hasUsableText: false,
      method: "pdf_text",
      debug: includeDebug ? {
        ...bufferDebug,
        pageCount: 0,
        rawTextPreview: "",
        possibleImageOnlyPdf: false,
        parseError: "PDF_PARSE_DISABLED: pdf-parse is disabled via environment variable",
      } : undefined,
    };
  }

  // Try to get PDFParse class (NEVER throws)
  let PDFParseClass: PDFParseClassType | null;
  try {
    PDFParseClass = await getPDFParseClass();
  } catch (loadErr: any) {
    // This shouldn't happen as getPDFParseClass doesn't throw, but be safe
    console.warn("[pdfExtract] Unexpected error getting PDFParse class:", loadErr?.message);
    PDFParseClass = null;
  }

  // If pdf-parse unavailable, return empty result with debug info
  if (!PDFParseClass) {
    const errorMsg = pdfParseLoadError || "pdf-parse unavailable";
    console.warn(`[pdfExtract] pdf-parse not available: ${errorMsg}`);
    return {
      text: "",
      pageCount: 0,
      textLength: 0,
      hasUsableText: false,
      method: "pdf_text",
      debug: includeDebug ? {
        ...bufferDebug,
        pageCount: 0,
        rawTextPreview: "",
        possibleImageOnlyPdf: false,
        parseError: `pdf-parse unavailable: ${errorMsg}`,
      } : undefined,
    };
  }

  // Execute pdf-parse v2.x class-based API in strict try/catch
  let parser: InstanceType<NonNullable<typeof PDFParseClass>> | null = null;
  try {
    // Create parser instance with buffer data
    parser = new PDFParseClass({ data: pdfBuffer });

    // Extract text using v2.x API (with page limit via first/last params)
    const textResult = await parser.getText({ last: 50 }); // Limit to 50 pages

    const text = (textResult.text || "").trim();
    const pageCount = textResult.pages?.length || 1;
    const textLength = text.length;
    // Simple threshold check here; full validation done in isUsablePdfText
    const hasUsableText = textLength >= MIN_TEXT_THRESHOLD;

    // Detect possible image-only PDF (has pages but no/minimal text)
    const avgCharsPerPage = pageCount > 0 ? textLength / pageCount : 0;
    const possibleImageOnlyPdf = pageCount > 0 && avgCharsPerPage < 50;

    console.log(`[pdfExtract] Extracted ${textLength} chars from ${pageCount} pages (avg ${avgCharsPerPage.toFixed(0)} chars/page), meets threshold: ${hasUsableText}, possibleImageOnly: ${possibleImageOnlyPdf}`);

    // Try to get PDF info (optional - don't fail if this doesn't work)
    let pdfInfo: PdfDebugInfo["info"] | undefined;
    try {
      const infoResult = await parser.getInfo();
      if (infoResult.info) {
        pdfInfo = {
          title: infoResult.info.Title,
          author: infoResult.info.Author,
          creator: infoResult.info.Creator,
          producer: infoResult.info.Producer,
          creationDate: infoResult.info.CreationDate,
          modDate: infoResult.info.ModDate,
        };
      }
    } catch {
      // Info extraction failed - that's okay, continue without it
    }

    const debug: PdfDebugInfo | undefined = includeDebug ? {
      ...bufferDebug,
      info: pdfInfo,
      pageCount,
      rawTextPreview: text.slice(0, 500),
      possibleImageOnlyPdf,
    } : undefined;

    // Cleanup parser
    await parser.destroy();

    return {
      text,
      pageCount,
      textLength,
      hasUsableText,
      method: "pdf_text",
      debug,
    };
  } catch (err: any) {
    // Cleanup parser on error
    if (parser) {
      try { await parser.destroy(); } catch { /* ignore cleanup errors */ }
    }

    const errorMsg = err?.message || "Unknown parse error";
    console.warn("[pdfExtract] PDF text extraction failed (will use OCR):", errorMsg);

    // Log stack trace at debug level for troubleshooting
    if (process.env.DEBUG) {
      console.debug("[pdfExtract] Error stack:", err?.stack);
    }

    return {
      text: "",
      pageCount: 0,
      textLength: 0,
      hasUsableText: false,
      method: "pdf_text",
      debug: includeDebug ? {
        ...bufferDebug,
        pageCount: 0,
        rawTextPreview: "",
        possibleImageOnlyPdf: false,
        parseError: errorMsg,
      } : undefined,
    };
  }
}

/**
 * Check if extracted text looks like real content (not just noise/headers)
 * More permissive for short invoices - just need SOME meaningful content
 */
export function isUsablePdfText(text: string): boolean {
  if (!text || text.length < MIN_TEXT_THRESHOLD) return false;

  // Count actual words (not just random characters)
  const words = text.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 10) return false; // Lowered from 20

  // Check for common invoice/receipt content patterns
  const hasNumbers = /\d+\.?\d*/.test(text); // Any numbers
  const hasLetters = /[a-zA-Z]{2,}/.test(text); // Words with 2+ letters
  const hasMoneyPattern = /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}/.test(text); // Currency
  const hasInvoiceKeywords = /(?:invoice|receipt|total|amount|due|balance|payment|date|bill)/i.test(text);

  // Accept if has basic content OR looks like invoice
  return (hasNumbers && hasLetters) || hasMoneyPattern || hasInvoiceKeywords;
}

/**
 * Test pdf-parse locally - call this to verify the library works
 * NEVER throws - always returns a result object
 */
export async function testPdfParse(): Promise<{
  success: boolean;
  disabled?: boolean;
  error?: string;
  details?: any;
}> {
  // Check if disabled
  if (isPdfParseDisabled()) {
    return {
      success: false,
      disabled: true,
      error: "pdf-parse is disabled via PDF_PARSE_DISABLED environment variable",
    };
  }

  let parser: any = null;
  try {
    const PDFParseClass = await getPDFParseClass();

    if (!PDFParseClass) {
      return {
        success: false,
        error: pdfParseLoadError || "pdf-parse could not be loaded",
      };
    }

    // Create a minimal valid PDF buffer for testing
    // This is a minimal PDF that pdf-parse v2.x should be able to read
    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n198\n%%EOF",
      "ascii"
    );

    parser = new PDFParseClass({ data: minimalPdf });
    const textResult = await parser.getText();
    await parser.destroy();

    return {
      success: true,
      details: {
        apiVersion: "v2.x (class-based)",
        resultHasText: "text" in textResult,
        resultHasPages: "pages" in textResult,
        pageCount: textResult.pages?.length || 0,
        textLength: textResult.text?.length || 0,
      },
    };
  } catch (err: any) {
    // Cleanup parser on error
    if (parser) {
      try { await parser.destroy(); } catch { /* ignore */ }
    }
    return {
      success: false,
      error: err?.message || "Unknown error",
    };
  }
}

/**
 * Get the current status of pdf-parse
 */
export function getPdfParseStatus(): {
  disabled: boolean;
  loaded: boolean;
  error: string | null;
} {
  return {
    disabled: isPdfParseDisabled(),
    loaded: cachedPDFParseClass !== null && cachedPDFParseClass !== undefined,
    error: pdfParseLoadError,
  };
}

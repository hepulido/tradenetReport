// server/emailParse.ts
import { simpleParser, AddressObject, Attachment } from "mailparser";
import { htmlToText } from "html-to-text";

export type ParsedEmail = {
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  text: string | null;

  hasHtml: boolean;
  attachmentsCount: number;
  attachmentNames: string[];
};

// New detailed attachment type (for upload)
export type ParsedAttachment = {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  disposition?: string; // 'attachment' | 'inline'
  source?: string; // 'direct' | 'inline' | 'forwarded' | 'nested'
};

// URL found in email body
export type ExtractedLink = {
  url: string;
  context: string; // surrounding text
  type: 'pdf' | 'invoice' | 'document' | 'other';
};

export type ParsedEmailWithAttachments = ParsedEmail & {
  attachments: ParsedAttachment[];
  inlineCount: number;
  forwardedCount: number;
  links: ExtractedLink[];
};

function safeFilename(name: string | undefined | null, fallback: string) {
  const raw = (name || fallback).trim();
  return raw
    .replace(/[\/\\]/g, "_")
    .replace(/[^\w.\-()+\s]/g, "_")
    .slice(0, 180); // avoid insanely long keys
}

// Extract address text safely
function extractAddressText(addr: AddressObject | AddressObject[] | undefined): string | null {
  if (!addr) return null;
  if (Array.isArray(addr)) {
    return addr.map(a => a.text).filter(Boolean).join(", ") || null;
  }
  return addr.text || null;
}

// Patterns for invoice-related links
const INVOICE_LINK_PATTERNS = [
  /view\s*invoice/i,
  /download\s*invoice/i,
  /invoice\s*pdf/i,
  /payment\s*details/i,
  /pay\s*now/i,
  /view\s*bill/i,
  /download\s*pdf/i,
  /view\s*statement/i,
  /view\s*receipt/i,
];

const PDF_URL_PATTERN = /\.pdf(?:\?|$|#)/i;
const DOC_URL_PATTERN = /\.(docx?|xlsx?|csv)(?:\?|$|#)/i;

// Extract URLs from text/HTML that might be invoice links
function extractInvoiceLinks(text: string | null, html: string | null): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  // URL pattern - match http/https URLs
  const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

  const processText = (content: string, isHtml: boolean) => {
    const matches = Array.from(content.matchAll(urlPattern));
    for (const match of matches) {
      let url = match[0];
      // Clean trailing punctuation
      url = url.replace(/[.,;:!?]+$/, "");

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Get context (surrounding text)
      const start = Math.max(0, match.index! - 50);
      const end = Math.min(content.length, match.index! + url.length + 50);
      let context = content.slice(start, end).replace(/\s+/g, " ").trim();
      if (isHtml) {
        context = htmlToText(context, { wordwrap: false }).trim();
      }

      // Determine link type
      let type: ExtractedLink['type'] = 'other';
      if (PDF_URL_PATTERN.test(url)) {
        type = 'pdf';
      } else if (DOC_URL_PATTERN.test(url)) {
        type = 'document';
      } else if (INVOICE_LINK_PATTERNS.some(p => p.test(context))) {
        type = 'invoice';
      }

      // Only include potentially relevant links
      if (type !== 'other' || INVOICE_LINK_PATTERNS.some(p => p.test(context))) {
        links.push({ url, context: context.slice(0, 100), type });
      }
    }
  };

  if (text) processText(text, false);
  if (html) processText(html, true);

  return links.slice(0, 20); // Limit to 20 links
}

// Check if content type is a processable attachment
function isProcessableAttachment(contentType: string, filename: string): boolean {
  const ct = contentType.toLowerCase();
  const fn = filename.toLowerCase();

  // PDFs
  if (ct === "application/pdf" || fn.endsWith(".pdf")) return true;

  // Images
  if (ct.startsWith("image/") && !ct.includes("svg")) return true;
  if (/\.(png|jpg|jpeg|gif|tiff?|bmp|webp)$/i.test(fn)) return true;

  // Documents that might contain invoices
  if (ct.includes("spreadsheet") || ct.includes("excel") || fn.endsWith(".xlsx") || fn.endsWith(".xls")) return true;
  if (ct.includes("word") || fn.endsWith(".docx") || fn.endsWith(".doc")) return true;

  return false;
}

// Recursively extract attachments from MIME parts including nested messages
async function extractAllAttachments(
  parsed: any,
  attachments: ParsedAttachment[],
  source: string = 'direct'
): Promise<{ inlineCount: number; forwardedCount: number }> {
  let inlineCount = 0;
  let forwardedCount = 0;

  // Process direct attachments from mailparser
  const directAttachments = parsed.attachments ?? [];
  for (let idx = 0; idx < directAttachments.length; idx++) {
    const att = directAttachments[idx];
    const disposition = att.contentDisposition || 'attachment';
    const filename = safeFilename(att.filename, `attachment-${idx}`);
    const contentType = att.contentType || "application/octet-stream";

    // Check if this is an embedded message (forwarded email)
    if (contentType === "message/rfc822" && att.content) {
      try {
        // Parse the nested email
        const nestedRaw = Buffer.isBuffer(att.content)
          ? att.content.toString("utf-8")
          : String(att.content);
        const nestedParsed = await simpleParser(nestedRaw);

        // Recursively extract attachments from forwarded email
        const nestedResult = await extractAllAttachments(nestedParsed, attachments, 'forwarded');
        forwardedCount += 1 + nestedResult.forwardedCount;
        inlineCount += nestedResult.inlineCount;
      } catch (err) {
        console.warn("Failed to parse nested message/rfc822:", err);
      }
      continue;
    }

    // Regular attachment or inline
    const buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content as any);

    // Skip tiny files (likely signatures or spacer images)
    if (buf.length < 1000 && contentType.startsWith("image/")) {
      continue;
    }

    const isInline = disposition === 'inline';
    if (isInline) inlineCount++;

    // Only include processable attachments
    if (isProcessableAttachment(contentType, filename)) {
      attachments.push({
        filename,
        contentType,
        size: buf.length,
        content: buf,
        disposition,
        source: isInline ? 'inline' : source,
      });
    }
  }

  return { inlineCount, forwardedCount };
}

/**
 * Keeps your current behavior: returns subject/from/to/date/text + attachment names/count.
 * (No binary attachments included)
 */
export async function parseEml(rawEml: string): Promise<ParsedEmail> {
  const parsed = await simpleParser(rawEml);

  const subject = parsed.subject ?? null;
  const from = extractAddressText(parsed.from);
  const to = extractAddressText(parsed.to);
  const date = parsed.date ? parsed.date.toISOString() : null;

  // 1) Prefer plain text
  let text: string | null = parsed.text?.trim() ? parsed.text.trim() : null;

  // 2) Fallback to HTML -> text
  const hasHtml = !!parsed.html;
  if (!text && parsed.html) {
    const html = typeof parsed.html === "string" ? parsed.html : String(parsed.html);
    const converted = htmlToText(html, { wordwrap: 120 }).trim();
    if (converted) text = converted;
  }

  const attachments = parsed.attachments ?? [];
  const attachmentNames = attachments
    .map((a) => a.filename)
    .filter(Boolean) as string[];

  return {
    subject,
    from,
    to,
    date,
    text,
    hasHtml,
    attachmentsCount: attachments.length,
    attachmentNames,
  };
}

/**
 * Enhanced: returns same as parseEml() PLUS binary attachments including:
 * - Standard attachments
 * - Inline attachments (images/PDFs marked inline)
 * - Attachments from forwarded emails (message/rfc822)
 * - Links found in body that might be invoice links
 */
export async function parseEmlWithAttachments(rawEml: string): Promise<ParsedEmailWithAttachments> {
  const parsed = await simpleParser(rawEml);

  const subject = parsed.subject ?? null;
  const from = extractAddressText(parsed.from);
  const to = extractAddressText(parsed.to);
  const date = parsed.date ? parsed.date.toISOString() : null;

  // Get text content
  let text: string | null = parsed.text?.trim() ? parsed.text.trim() : null;
  const hasHtml = !!parsed.html;
  const htmlContent = parsed.html ? (typeof parsed.html === "string" ? parsed.html : String(parsed.html)) : null;

  if (!text && htmlContent) {
    const converted = htmlToText(htmlContent, { wordwrap: 120 }).trim();
    if (converted) text = converted;
  }

  // Extract all attachments recursively
  const attachments: ParsedAttachment[] = [];
  const { inlineCount, forwardedCount } = await extractAllAttachments(parsed, attachments, 'direct');

  // Get attachment names for summary
  const attachmentNames = attachments.map(a => a.filename);

  // Extract potential invoice links from body
  const links = extractInvoiceLinks(text, htmlContent);

  return {
    subject,
    from,
    to,
    date,
    text,
    hasHtml,
    attachmentsCount: attachments.length,
    attachmentNames,
    attachments,
    inlineCount,
    forwardedCount,
    links,
  };
}

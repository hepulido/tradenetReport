/**
 * LLM Client Abstraction Layer
 *
 * Provides a unified interface for LLM providers (Anthropic, OpenAI in future)
 * with cost controls and configuration validation.
 *
 * Environment Variables:
 * - LLM_PROVIDER: "anthropic" | "openai" | "disabled" (default: "disabled" if no key)
 * - ANTHROPIC_API_KEY: Required for Anthropic provider (must start with "sk-ant-")
 * - OPENAI_API_KEY: Required for OpenAI provider (future)
 * - LLM_MAX_INPUT_CHARS: Max chars sent to LLM (default: 12000)
 * - LLM_MAX_TOKENS: Max response tokens (default: 1200)
 *
 * IMPORTANT: Server must be restarted after setting environment variables!
 */

// ========== TYPES ==========

export type LlmProvider = "anthropic" | "openai" | "disabled";

export type LlmConfig = {
  provider: LlmProvider;
  configured: boolean;
  keyPresent: boolean;
  keyPrefix: string | null; // First 6 chars only for debugging
  maxInputChars: number;
  maxTokens: number;
  model: string;
};

export type LlmExtractionRequest = {
  ocrText: string;
  mode: "full" | "patch";
  deterministicResult?: any;
  failureReasons?: string[];
};

export type LlmExtractionResponse = {
  success: boolean;
  data?: any;
  error?: string;
  metrics: {
    inputChars: number;
    inputCharsTruncated: boolean;
    maxTokens: number;
    provider: LlmProvider;
    model: string;
  };
};

// ========== ERRORS ==========

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMUnavailableError";
  }
}

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export class LLMInvalidResponseError extends Error {
  constructor(message: string, public rawResponse?: string) {
    super(message);
    this.name = "LLMInvalidResponseError";
  }
}

// ========== JSON PARSING & VALIDATION ==========

/**
 * Expected shape of LLM extraction response
 */
export type LlmExtractedInvoice = {
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  customerPo: string | null;
  shipTo: string | null;
  billTo: string | null;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  total: number | null;
  currency: string | null;
  lineItems: Array<{
    productCode: string | null;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    lineAmount: number | null;
  }>;
};

/**
 * Extract and parse JSON object from raw LLM response
 * Handles markdown fences, leading/trailing text, etc.
 * Returns parsed object or throws LLMInvalidResponseError
 */
export function extractJsonObject(raw: string): any {
  if (!raw || typeof raw !== "string") {
    throw new LLMInvalidResponseError("Empty or non-string response");
  }

  let cleaned = raw.trim();

  // Step 1: Try direct parse (ideal case)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to cleanup
  }

  // Step 2: Remove markdown code fences (```json ... ``` or ``` ... ```)
  // Also handle fences that may be in the middle of text
  cleaned = cleaned
    .replace(/^[\s\S]*?```(?:json)?\s*/i, "") // Remove everything before and including opening fence
    .replace(/\s*```[\s\S]*$/i, "") // Remove closing fence and everything after
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to brace extraction
  }

  // Step 3: Extract JSON object from first '{' to last '}'
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    const preview = raw.slice(0, 500).replace(/[\n\r]/g, "\\n");
    console.error(`[LLM] ========== NO JSON FOUND ==========`);
    console.error(`[LLM] Raw response (first 500 chars): "${preview}"`);
    console.error(`[LLM] =====================================`);
    throw new LLMInvalidResponseError("No JSON object found in response", raw.slice(0, 500));
  }

  const extracted = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(extracted);
  } catch (e: any) {
    const preview = raw.slice(0, 500).replace(/[\n\r]/g, "\\n");
    console.error(`[LLM] ========== JSON PARSE FAILED ==========`);
    console.error(`[LLM] Parse error: ${e?.message}`);
    console.error(`[LLM] Raw response (first 500 chars): "${preview}"`);
    console.error(`[LLM] Extracted JSON attempt: "${extracted.slice(0, 300)}..."`);
    console.error(`[LLM] ==========================================`);
    throw new LLMInvalidResponseError(`JSON parse failed: ${e?.message}`, raw.slice(0, 500));
  }
}

// Alias for backwards compatibility
export const parseJsonStrict = extractJsonObject;

/**
 * Coerce string values to numbers for numeric fields
 * Handles "$1,234.56" -> 1234.56, "123.45" -> 123.45, etc.
 */
export function coerceNumericFields(data: any): any {
  if (!data || typeof data !== "object") return data;

  const numericFields = ["subtotal", "tax", "shipping", "total", "quantity", "unitPrice", "lineAmount"];

  const coerceNumber = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      // Remove $, commas, whitespace
      const cleaned = val.replace(/[$,\s]/g, "").trim();
      if (!cleaned) return null;
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    return null;
  };

  // Coerce top-level numeric fields
  for (const field of numericFields) {
    if (field in data) {
      data[field] = coerceNumber(data[field]);
    }
  }

  // Coerce lineItems numeric fields and normalize amount -> lineAmount
  if (Array.isArray(data.lineItems)) {
    for (const item of data.lineItems) {
      if (item && typeof item === "object") {
        // Coerce numeric fields
        for (const field of ["quantity", "unitPrice", "lineAmount", "amount"]) {
          if (field in item) {
            item[field] = coerceNumber(item[field]);
          }
        }

        // CRITICAL: Normalize amount -> lineAmount
        // LLM may return "amount" but our system expects "lineAmount"
        if (item.lineAmount === null || item.lineAmount === undefined) {
          if (item.amount !== null && item.amount !== undefined) {
            item.lineAmount = item.amount;
          }
        }

        // If still no lineAmount, try to compute from quantity * unitPrice
        if ((item.lineAmount === null || item.lineAmount === undefined) &&
            typeof item.quantity === "number" && typeof item.unitPrice === "number") {
          item.lineAmount = item.quantity * item.unitPrice;
        }
      }
    }
  }

  // Default lineItems to empty array if missing
  if (!data.lineItems) {
    data.lineItems = [];
  }

  return data;
}

/**
 * Validate parsed LLM response has correct structure (lenient version)
 * Call coerceNumericFields() BEFORE this to convert string numbers
 * Returns validation errors or null if valid
 */
export function validateLlmResponse(data: any): string[] | null {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push("Response must be an object");
    return errors;
  }

  // Check vendor - allow string or null
  if (data.vendor !== null && data.vendor !== undefined && typeof data.vendor !== "string") {
    errors.push("vendor must be string or null");
  }

  // Check numeric fields (should already be coerced)
  // Only error if present and NOT a number after coercion
  const numericFields = ["subtotal", "tax", "shipping", "total"] as const;
  for (const field of numericFields) {
    const val = data[field];
    if (val !== null && val !== undefined && typeof val !== "number") {
      // This is a warning, not a hard error - coercion should have handled it
      console.warn(`[LLM] Field ${field} is not a number after coercion: ${typeof val}`);
    }
  }

  // lineItems is optional - default to [] if missing
  if (data.lineItems === undefined || data.lineItems === null) {
    data.lineItems = [];
  }

  if (!Array.isArray(data.lineItems)) {
    errors.push("lineItems must be array");
  } else {
    // Validate each line item (lenient)
    for (let i = 0; i < data.lineItems.length; i++) {
      const item = data.lineItems[i];
      if (!item || typeof item !== "object") {
        errors.push(`lineItems[${i}] must be object`);
        continue;
      }
      // Description is required but can be empty string
      if (item.description !== undefined && typeof item.description !== "string") {
        errors.push(`lineItems[${i}].description must be string`);
      }
      // Provide default description if missing
      if (!item.description) {
        item.description = item.productCode || "Unknown item";
      }
    }
  }

  return errors.length > 0 ? errors : null;
}

// ========== CONFIGURATION ==========

const DEFAULT_MAX_INPUT_CHARS = 12000;
const DEFAULT_MAX_TOKENS = 1200;
const ANTHROPIC_KEY_PREFIX = "sk-ant-";
const OPENAI_KEY_PREFIX = "sk-";

/**
 * Get LLM configuration from environment
 * Call this to check if LLM is properly configured
 *
 * Priority:
 * 1. If LLM_PROVIDER is explicitly set, only check that provider's key
 * 2. Otherwise, try Anthropic first, then OpenAI
 */
export function getLlmConfig(): LlmConfig {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase() as LlmProvider | undefined;
  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";

  const maxInputChars = parseInt(process.env.LLM_MAX_INPUT_CHARS || "", 10) || DEFAULT_MAX_INPUT_CHARS;
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || "", 10) || DEFAULT_MAX_TOKENS;

  // Result object
  let provider: LlmProvider = "disabled";
  let configured = false;
  let keyPresent = false;
  let keyPrefix: string | null = null;
  let model = "";
  let configError: string | null = null;

  // If explicit provider is "disabled", return early
  if (explicitProvider === "disabled") {
    return {
      provider: "disabled",
      configured: false,
      keyPresent: false,
      keyPrefix: null,
      maxInputChars,
      maxTokens,
      model: "",
    };
  }

  // If LLM_PROVIDER is explicitly set, ONLY check that provider
  if (explicitProvider === "anthropic") {
    keyPresent = !!anthropicKey;
    keyPrefix = anthropicKey ? anthropicKey.slice(0, 7) : null;

    if (!anthropicKey) {
      configError = "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set";
    } else if (!anthropicKey.startsWith(ANTHROPIC_KEY_PREFIX)) {
      configError = `ANTHROPIC_API_KEY has invalid format (prefix: "${keyPrefix}"). Must start with "sk-ant-"`;
    } else if (anthropicKey.length <= 20) {
      configError = "ANTHROPIC_API_KEY is too short";
    } else {
      provider = "anthropic";
      configured = true;
      model = anthropicModel;
    }

    if (configError) {
      console.warn(`[LLM] ${configError}`);
    }

    return { provider, configured, keyPresent, keyPrefix, maxInputChars, maxTokens, model };
  }

  if (explicitProvider === "openai") {
    keyPresent = !!openaiKey;
    keyPrefix = openaiKey ? openaiKey.slice(0, 6) : null;

    if (!openaiKey) {
      configError = "LLM_PROVIDER=openai but OPENAI_API_KEY is not set";
    } else if (!openaiKey.startsWith(OPENAI_KEY_PREFIX)) {
      configError = `OPENAI_API_KEY has invalid format (prefix: "${keyPrefix}"). Must start with "sk-"`;
    } else if (openaiKey.length <= 20) {
      configError = "OPENAI_API_KEY is too short";
    } else {
      provider = "openai";
      configured = true;
      model = openaiModel;
    }

    if (configError) {
      console.warn(`[LLM] ${configError}`);
    }

    return { provider, configured, keyPresent, keyPrefix, maxInputChars, maxTokens, model };
  }

  // No explicit provider - auto-detect (try Anthropic first, then OpenAI)

  // Try Anthropic
  if (anthropicKey) {
    keyPresent = true;
    keyPrefix = anthropicKey.slice(0, 7);

    if (anthropicKey.startsWith(ANTHROPIC_KEY_PREFIX) && anthropicKey.length > 20) {
      return {
        provider: "anthropic",
        configured: true,
        keyPresent: true,
        keyPrefix,
        maxInputChars,
        maxTokens,
        model: anthropicModel,
      };
    }
  }

  // Try OpenAI
  if (openaiKey) {
    keyPresent = true;
    keyPrefix = openaiKey.slice(0, 6);

    if (openaiKey.startsWith(OPENAI_KEY_PREFIX) && openaiKey.length > 20) {
      return {
        provider: "openai",
        configured: true,
        keyPresent: true,
        keyPrefix,
        maxInputChars,
        maxTokens,
        model: openaiModel,
      };
    }
  }

  // Nothing configured
  return {
    provider: "disabled",
    configured: false,
    keyPresent,
    keyPrefix,
    maxInputChars,
    maxTokens,
    model: "",
  };
}

/**
 * Validate LLM is available, throw if not
 */
export function requireLlm(): LlmConfig {
  const config = getLlmConfig();

  if (!config.configured) {
    if (!config.keyPresent) {
      throw new LLMUnavailableError(
        "No LLM API key configured. Set ANTHROPIC_API_KEY environment variable and restart the server."
      );
    } else {
      throw new LLMConfigError(
        `LLM key present but invalid format. Anthropic keys must start with "${ANTHROPIC_KEY_PREFIX}". ` +
        `Found prefix: "${config.keyPrefix}". Restart server after fixing.`
      );
    }
  }

  return config;
}

/**
 * Truncate text to max chars with indication
 */
export function truncateForLlm(text: string, maxChars?: number): { text: string; truncated: boolean; originalLength: number } {
  const limit = maxChars || getLlmConfig().maxInputChars;
  const originalLength = text.length;

  if (originalLength <= limit) {
    return { text, truncated: false, originalLength };
  }

  // Truncate and add indicator
  const truncated = text.slice(0, limit - 50) + "\n\n[... TEXT TRUNCATED FOR LLM PROCESSING ...]";
  return { text: truncated, truncated: true, originalLength };
}

// ========== LLM CLIENT INTERFACE ==========

export interface ILlmClient {
  provider: LlmProvider;
  extractInvoice(request: LlmExtractionRequest): Promise<LlmExtractionResponse>;
}

// ========== ANTHROPIC CLIENT ==========

class AnthropicClient implements ILlmClient {
  provider: LlmProvider = "anthropic";
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async extractInvoice(request: LlmExtractionRequest): Promise<LlmExtractionResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMUnavailableError("ANTHROPIC_API_KEY not set");
    }

    // Truncate input for cost control
    const { text: truncatedText, truncated, originalLength } = truncateForLlm(request.ocrText, this.config.maxInputChars);

    const metrics: LlmExtractionResponse["metrics"] = {
      inputChars: truncatedText.length,
      inputCharsTruncated: truncated,
      maxTokens: this.config.maxTokens,
      provider: this.provider,
      model: this.config.model,
    };

    if (truncated) {
      console.log(`[LLM] Truncated input from ${originalLength} to ${truncatedText.length} chars`);
    }

    try {
      // Dynamic import to avoid requiring SDK if not used
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      // Build prompt based on mode
      const prompt = request.mode === "patch"
        ? this.buildPatchPrompt(truncatedText, request.deterministicResult, request.failureReasons || [])
        : this.buildFullPrompt(truncatedText);

      console.log(`[LLM] ========== CALLING ANTHROPIC ==========`);
      console.log(`[LLM] Model: ${this.config.model}`);
      console.log(`[LLM] Mode: ${request.mode}`);
      console.log(`[LLM] Prompt length: ${prompt.length} chars`);
      console.log(`[LLM] Max tokens: ${this.config.maxTokens}`);

      const response = await client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from response
      const textContent = response.content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        console.error(`[LLM] No text content in response. Content types: ${response.content.map((c: any) => c.type).join(", ")}`);
        return { success: false, error: "No text content in LLM response", metrics };
      }

      const rawText = textContent.text;

      // Log raw response for debugging
      console.log(`[LLM] ========== RAW RESPONSE ==========`);
      console.log(`[LLM] Response length: ${rawText.length} chars`);
      console.log(`[LLM] First 2000 chars:`);
      console.log(`[LLM] <<<START>>>`);
      console.log(rawText.slice(0, 2000));
      console.log(`[LLM] <<<END>>>`);
      console.log(`[LLM] ==================================`);

      // Parse JSON response with robust extraction
      let parsed: any;
      try {
        parsed = extractJsonObject(rawText);
      } catch (parseError: any) {
        console.error(`[LLM] JSON extraction failed: ${parseError?.message}`);
        return { success: false, error: `Failed to parse LLM JSON: ${parseError?.message}`, metrics };
      }

      // Coerce string numbers to actual numbers
      parsed = coerceNumericFields(parsed);

      // Validate response structure (lenient after coercion)
      const validationErrors = validateLlmResponse(parsed);
      if (validationErrors) {
        console.error(`[LLM] Response validation failed: ${validationErrors.join(", ")}`);
        return { success: false, error: `LLM response validation failed: ${validationErrors.join(", ")}`, metrics };
      }

      console.log(`[LLM] Successfully parsed response with vendor="${parsed.vendor}", total=${parsed.total}`);
      return { success: true, data: parsed, metrics };
    } catch (error: any) {
      console.error(`[LLM] Anthropic API error: ${error?.message || error}`);

      // Check for specific API errors
      if (error?.status === 401) {
        throw new LLMConfigError("Anthropic API key is invalid or expired");
      }
      if (error?.status === 429) {
        return { success: false, error: "Rate limited by Anthropic API", metrics };
      }

      return { success: false, error: error?.message || "Unknown LLM error", metrics };
    }
  }

  private buildFullPrompt(ocrText: string): string {
    return `You are an invoice extraction engine. Return ONLY valid JSON. No markdown fences. No explanation.

INVOICE TEXT:
<<<
${ocrText}
>>>

Extract ONE invoice from this document. Return this JSON schema:

{
  "vendor": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": string|null,
  "customerPo": string|null,
  "subtotal": number|null,
  "tax": number|null,
  "total": number|null,
  "lineItems": [{"description": string, "quantity": number|null, "unitPrice": number|null, "lineAmount": number|null}],
  "multipleInvoicesDetected": boolean
}

CRITICAL RULES:
1. Extract ONLY ONE invoice - if document contains multiple invoices, set "multipleInvoicesDetected": true
2. customerPo is the PROJECT NAME or JOB NAME (e.g., "COACH", "ZARA", "ARIA RESERVE") - ALWAYS extract this
3. vendor MUST be the supplier company name (e.g., "Banner Supply Co.", "Foundation Building Materials")
4. Numbers must be numbers (not strings)
5. Dates must be YYYY-MM-DD format
6. If there are multiple different invoice numbers or customer POs, set multipleInvoicesDetected: true

Return ONLY JSON. No markdown. No explanation.`;
  }

  private buildPatchPrompt(ocrText: string, deterministicResult: any, failureReasons: string[]): string {
    return `You are an invoice extraction engine. Return ONLY valid JSON. No markdown fences. No explanation.

The automated extraction had issues with these fields:
${failureReasons.map(r => `- ${r}`).join('\n')}

Current extraction (needs correction):
- vendor: ${deterministicResult?.vendor || "NOT FOUND"}
- invoiceNumber: ${deterministicResult?.invoiceNumber || "NOT FOUND"}
- invoiceDate: ${deterministicResult?.invoiceDate || "NOT FOUND"}
- total: ${deterministicResult?.total || "NOT FOUND"}

INVOICE TEXT:
<<<
${ocrText}
>>>

Return this JSON with corrected values:
{
  "vendor": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": string|null,
  "dueDate": string|null,
  "customerPo": string|null,
  "subtotal": number|null,
  "tax": number|null,
  "shipping": number|null,
  "total": number|null,
  "lineItems": []
}

CRITICAL RULES:
1. vendor MUST be the real business/company name (e.g., "Foundation Building Materials", "Home Depot")
   - NOT "Return Service Requested", "PRESORTED STANDARD", "US POSTAGE PAID"
   - NOT address lines or PO boxes
   - NOT header labels like "Invoice Number Invoice Date Due Date"
2. total MUST be the invoice grand total (Amount Due, Invoice Total, Balance Due)
3. Numbers must be numbers (not strings)
4. Dates must be YYYY-MM-DD format
5. Use null for missing values

Return ONLY the JSON object. No markdown. No explanation.`;
  }
}

// ========== OPENAI CLIENT (FUTURE) ==========

class OpenAIClient implements ILlmClient {
  provider: LlmProvider = "openai";
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  async extractInvoice(request: LlmExtractionRequest): Promise<LlmExtractionResponse> {
    // TODO: Implement OpenAI support
    throw new LLMUnavailableError("OpenAI provider not yet implemented");
  }
}

// ========== FACTORY ==========

let cachedClient: ILlmClient | null = null;

/**
 * Get the configured LLM client
 * Returns null if LLM is disabled or not configured
 */
export function getLlmClient(): ILlmClient | null {
  const config = getLlmConfig();

  if (!config.configured) {
    return null;
  }

  // Cache the client
  if (cachedClient && cachedClient.provider === config.provider) {
    return cachedClient;
  }

  switch (config.provider) {
    case "anthropic":
      cachedClient = new AnthropicClient(config);
      break;
    case "openai":
      cachedClient = new OpenAIClient(config);
      break;
    default:
      cachedClient = null;
  }

  return cachedClient;
}

/**
 * Get LLM client or throw if unavailable
 */
export function requireLlmClient(): ILlmClient {
  requireLlm(); // Validate configuration first
  const client = getLlmClient();
  if (!client) {
    throw new LLMUnavailableError("No LLM client available");
  }
  return client;
}

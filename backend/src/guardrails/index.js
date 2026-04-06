// src/guardrails/index.js
// Centralized guardrails for input validation, output filtering,
// tool safety, and agent loop protection.

import { logger } from "../config/logger.js";

// ─── Configuration ──────────────────────────────────────────────────────────
export const guardrailConfig = {
  // Input limits
  maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || "10000"),

  // Agent loop protection
  maxToolCalls: parseInt(process.env.MAX_TOOL_CALLS || "25"),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "120000"),

  // Tool safety
  blockedDomains: (process.env.BLOCKED_DOMAINS || "localhost,127.0.0.1,0.0.0.0,169.254.169.254,10.,172.16.,192.168.,[::1]").split(",").map(d => d.trim()),
  blockedProtocols: ["file:", "ftp:", "data:", "javascript:"],
  maxCrawlDepth: parseInt(process.env.MAX_CRAWL_DEPTH || "3"),
  maxCrawlBreadth: parseInt(process.env.MAX_CRAWL_BREADTH || "10"),
  maxExtractUrls: parseInt(process.env.MAX_EXTRACT_URLS || "10"),

  // Output filtering
  piiPatterns: [
    /\b\d{3}-\d{2}-\d{4}\b/,                          // SSN
    /\b\d{16}\b/,                                       // Credit card (16 digits)
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,     // Credit card (formatted)
    /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/, // IBAN
  ],

  // Content moderation keywords (blocked in output)
  blockedOutputPatterns: [
    /how to (make|build|create) (a )?(bomb|weapon|explosive)/i,
    /instructions for (creating|making|building) (a )?(bomb|weapon|explosive)/i,
  ],
};

// ─── Input Guardrails ────────────────────────────────────────────────────────

/**
 * Enhanced prompt injection detection patterns.
 */
const INJECTION_PATTERNS = [
  /ignore (previous|all|prior|above) instructions/i,
  /you are now/i,
  /disregard your (system|previous|prior)/i,
  /forget (your|all|everything|prior)/i,
  /<\|.*\|>/,
  /\[INST\]/i,
  /\[SYSTEM\]/i,
  /\<\/?system\>/i,
  /\bact as\b.*\b(admin|root|developer|hacker)\b/i,
  /pretend (you are|to be|you're)/i,
  /override (your|the|all) (instructions|rules|guidelines|prompt)/i,
  /new (system )?prompt:/i,
  /\bdo anything now\b/i,
  /jailbreak/i,
  /\bDAN\b/,
  /bypass (safety|content|security|filter)/i,
];

/**
 * Validate and sanitize user input.
 * Returns { valid: boolean, error?: string, sanitized?: string }
 */
export function validateInput(message) {
  if (!message || typeof message !== "string") {
    return { valid: false, error: "Message is required and must be a string" };
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Message cannot be empty" };
  }

  if (trimmed.length > guardrailConfig.maxMessageLength) {
    return {
      valid: false,
      error: `Message too long (${trimmed.length} chars). Maximum is ${guardrailConfig.maxMessageLength}.`,
    };
  }

  // Prompt injection detection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn("Prompt injection blocked", { pattern: pattern.source });
      return { valid: false, error: "Invalid input detected", code: "INPUT_REJECTED" };
    }
  }

  return { valid: true, sanitized: trimmed };
}

// ─── Tool Safety Guardrails ──────────────────────────────────────────────────

/**
 * Validate a URL for extract/crawl operations.
 * Blocks internal/private IPs, file:// protocols, etc.
 */
export function validateUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    // Block dangerous protocols
    if (guardrailConfig.blockedProtocols.includes(parsed.protocol)) {
      return { valid: false, error: `Protocol not allowed: ${parsed.protocol}` };
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: `Only http/https URLs are allowed` };
    }

    // Block internal/private network addresses
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of guardrailConfig.blockedDomains) {
      if (hostname === blocked || hostname.startsWith(blocked) || hostname.endsWith(`.${blocked}`)) {
        return { valid: false, error: `Access to internal network addresses is not allowed` };
      }
    }

    // Block IPs that look like private ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) {
        return { valid: false, error: "Access to private IP addresses is not allowed" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate tool call arguments before execution.
 * Returns { allowed: boolean, error?: string, modified?: object }
 */
export function validateToolCall(toolName, args) {
  switch (toolName) {
    case "web_extract": {
      if (args.urls) {
        if (args.urls.length > guardrailConfig.maxExtractUrls) {
          return { allowed: false, error: `Too many URLs. Maximum is ${guardrailConfig.maxExtractUrls}.` };
        }
        for (const url of args.urls) {
          const check = validateUrl(url);
          if (!check.valid) return { allowed: false, error: `URL blocked: ${check.error} (${url})` };
        }
      }
      return { allowed: true };
    }

    case "web_crawl": {
      if (args.url) {
        const check = validateUrl(args.url);
        if (!check.valid) return { allowed: false, error: `URL blocked: ${check.error}` };
      }
      // Enforce crawl limits
      const modified = { ...args };
      if (args.maxDepth !== undefined && args.maxDepth > guardrailConfig.maxCrawlDepth) {
        modified.maxDepth = guardrailConfig.maxCrawlDepth;
        logger.warn(`Crawl depth capped at ${guardrailConfig.maxCrawlDepth}`);
      }
      if (args.maxBreadth !== undefined && args.maxBreadth > guardrailConfig.maxCrawlBreadth) {
        modified.maxBreadth = guardrailConfig.maxCrawlBreadth;
        logger.warn(`Crawl breadth capped at ${guardrailConfig.maxCrawlBreadth}`);
      }
      return { allowed: true, modified };
    }

    case "calculator": {
      // Block expressions that are too long (potential DoS)
      if (args.expression && args.expression.length > 200) {
        return { allowed: false, error: "Expression too long (max 200 chars)" };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

// ─── Output Guardrails ───────────────────────────────────────────────────────

/**
 * Scan output text for PII patterns and flag them.
 */
export function scanForPII(text) {
  const findings = [];
  for (const pattern of guardrailConfig.piiPatterns) {
    if (pattern.test(text)) {
      findings.push(pattern.source);
    }
  }
  return findings;
}

/**
 * Check output for blocked content patterns.
 */
export function validateOutput(text) {
  if (!text || typeof text !== "string") return { safe: true };

  for (const pattern of guardrailConfig.blockedOutputPatterns) {
    if (pattern.test(text)) {
      logger.warn("Blocked content pattern detected in output");
      return { safe: false, reason: "Response contained blocked content" };
    }
  }

  const piiFindings = scanForPII(text);
  if (piiFindings.length > 0) {
    logger.warn("PII detected in output", { patterns: piiFindings });
    return { safe: true, warnings: [`Potential PII detected: ${piiFindings.length} pattern(s) matched`] };
  }

  return { safe: true };
}

// ─── Agent Loop Guardrails ───────────────────────────────────────────────────

/**
 * Create a tool call counter that enforces max iterations.
 * Used as a beforeModel hook in the agent.
 */
export function createToolCallGuard() {
  let toolCallCount = 0;

  return {
    /**
     * Increment and check the tool call counter.
     * Throws if the limit is exceeded.
     */
    onToolCall(toolName) {
      toolCallCount++;
      if (toolCallCount > guardrailConfig.maxToolCalls) {
        logger.warn(`Tool call limit exceeded (${guardrailConfig.maxToolCalls})`);
        throw new Error(`Agent exceeded maximum tool calls (${guardrailConfig.maxToolCalls}). Request terminated.`);
      }
      logger.debug(`Tool call #${toolCallCount}: ${toolName}`);
    },

    /** Get the current count. */
    get count() {
      return toolCallCount;
    },
  };
}

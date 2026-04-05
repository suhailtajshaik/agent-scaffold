// src/middleware/index.js
import rateLimit from "express-rate-limit";
import { logger } from "../config/logger.js";

/**
 * Rate limiter — 60 requests per minute per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});

/**
 * Request logger middleware
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next();
}

/**
 * Input sanitizer — basic guardrail against prompt injection attempts
 */
export function sanitizeInput(req, res, next) {
  const { message } = req.body || {};
  if (message && typeof message === "string") {
    // Flag suspicious injection patterns
    const injectionPatterns = [
      /ignore (previous|all) instructions/i,
      /you are now/i,
      /disregard your (system|previous)/i,
      /<\|.*\|>/,
    ];
    for (const pattern of injectionPatterns) {
      if (pattern.test(message)) {
        logger.warn(`Potential prompt injection detected from ${req.ip}`);
        return res.status(400).json({
          error: "Invalid input detected",
          code: "INPUT_REJECTED",
        });
      }
    }
  }
  next();
}

/**
 * Error handler
 */
export function errorHandler(err, req, res, next) {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Anthropic API errors
  if (err.message?.includes("API key")) {
    return res.status(401).json({ error: "Invalid API key configuration" });
  }

  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
}

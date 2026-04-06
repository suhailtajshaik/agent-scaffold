// src/middleware/index.js
import rateLimit from "express-rate-limit";
import { logger } from "../config/logger.js";
import { validateInput } from "../guardrails/index.js";

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
 * Input sanitizer — validates message length, content, and prompt injection
 */
export function sanitizeInput(req, res, next) {
  const { message } = req.body || {};
  if (message) {
    const result = validateInput(message);
    if (!result.valid) {
      logger.warn(`Input rejected from ${req.ip}: ${result.error}`);
      return res.status(400).json({
        error: result.error,
        code: result.code || "INPUT_INVALID",
      });
    }
    // Use sanitized message
    req.body.message = result.sanitized;
  }
  next();
}

/**
 * User identity extractor
 * Reads the x-user-id header and attaches it to req.userId.
 * Swap this out for JWT validation in production.
 */
export function extractUserId(req, res, next) {
  req.userId = req.headers["x-user-id"] || null;
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

// src/routes/httpErrors.js
// Centralized HTTP error-status mapping for the route layer.
//
// The domain layer (agentStore, perAgentMCP, mcpManager) signals failures by
// throwing Error with descriptive messages. Routes previously each re-derived
// an HTTP status from those messages with ad-hoc `err.message.includes(...)`
// chains that had drifted out of sync with the actual messages (e.g. checking
// for "unique" when the store throws "already exists"). This module maps once,
// based on the messages the domain layer really throws.

import { logger } from "../config/logger.js";

// 404 — the requested resource does not exist.
const NOT_FOUND = /not found|no default agent configured/i;

// 400 — the caller sent something invalid. Covers agentStore validation
// ("Validation error: ...", "is required", "must be ...", "already exists"),
// the delete guard ("Cannot delete the last remaining agent"), and generic
// "invalid" messages from the route validators.
const BAD_REQUEST = /validation error|is required|must be|already exists|cannot delete|invalid/i;

/**
 * Derive an HTTP status code from a thrown error.
 * An explicit numeric `err.status` always wins; otherwise the message is
 * classified, defaulting to 500 for anything unrecognised (a real fault).
 *
 * @param {Error} err
 * @returns {number}
 */
export function statusForError(err) {
  if (err && typeof err.status === "number") return err.status;
  const msg = err?.message ?? "";
  if (NOT_FOUND.test(msg)) return 404;
  if (BAD_REQUEST.test(msg)) return 400;
  return 500;
}

/**
 * Log and send a JSON error response with the mapped status code.
 *
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {string} [context] - log line describing the failed operation
 * @param {object} [extra]   - extra fields merged into the JSON body
 */
export function sendError(res, err, context, extra) {
  const status = statusForError(err);
  if (context) logger.error(context, { error: err?.message });
  res.status(status).json({ error: err?.message, ...extra });
}

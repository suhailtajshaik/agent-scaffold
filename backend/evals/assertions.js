// evals/assertions.js
// Assertion library for evaluating agent responses

/**
 * Check if the response text contains a substring (case-insensitive).
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @param {string} value - Substring to search for
 * @returns {{ pass: boolean, message: string }}
 */
export function text_contains(response, value) {
  const haystack = (response.text || "").toLowerCase();
  const needle = value.toLowerCase();
  const pass = haystack.includes(needle);
  return {
    pass,
    message: pass
      ? `Response contains "${value}"`
      : `Expected response to contain "${value}" but it did not.\nResponse text: ${response.text || "(empty)"}`,
  };
}

/**
 * Check if the response text matches a regex pattern.
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @param {string} pattern - Regex pattern string
 * @returns {{ pass: boolean, message: string }}
 */
export function text_matches(response, pattern) {
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch (err) {
    return {
      pass: false,
      message: `Invalid regex pattern "${pattern}": ${err.message}`,
    };
  }

  const pass = regex.test(response.text || "");
  return {
    pass,
    message: pass
      ? `Response matches pattern /${pattern}/`
      : `Expected response to match /${pattern}/ but it did not.\nResponse text: ${response.text || "(empty)"}`,
  };
}

/**
 * Check if a specific tool was called during the response.
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @param {string} toolName - Name of the tool to check for
 * @returns {{ pass: boolean, message: string }}
 */
export function tool_used(response, toolName) {
  const toolsUsed = response.toolsUsed || [];
  const pass = toolsUsed.includes(toolName);
  return {
    pass,
    message: pass
      ? `Tool "${toolName}" was used`
      : `Expected tool "${toolName}" to be used, but tools used were: [${toolsUsed.join(", ") || "none"}]`,
  };
}

/**
 * Check that a specific tool was NOT called during the response.
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @param {string} toolName - Name of the tool that should not appear
 * @returns {{ pass: boolean, message: string }}
 */
export function no_tool_used(response, toolName) {
  const toolsUsed = response.toolsUsed || [];
  const pass = !toolsUsed.includes(toolName);
  return {
    pass,
    message: pass
      ? `Tool "${toolName}" was not used (as expected)`
      : `Expected tool "${toolName}" NOT to be used, but it was called. Tools used: [${toolsUsed.join(", ")}]`,
  };
}

/**
 * Check that the exact ordered sequence of tool calls matches the expected list.
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @param {string[]} expectedTools - Ordered array of tool names
 * @returns {{ pass: boolean, message: string }}
 */
export function tool_trajectory(response, expectedTools) {
  const toolsUsed = response.toolsUsed || [];
  const expected = Array.isArray(expectedTools) ? expectedTools : [];

  const pass =
    toolsUsed.length === expected.length &&
    toolsUsed.every((tool, idx) => tool === expected[idx]);

  return {
    pass,
    message: pass
      ? `Tool trajectory matched: [${expected.join(", ")}]`
      : `Tool trajectory mismatch.\n  Expected: [${expected.join(", ")}]\n  Actual:   [${toolsUsed.join(", ") || "none"}]`,
  };
}

/**
 * Check that the response text is non-empty.
 * @param {object} response - { text, toolsUsed, sessionId, durationMs }
 * @returns {{ pass: boolean, message: string }}
 */
export function response_not_empty(response) {
  const text = (response.text || "").trim();
  const pass = text.length > 0;
  return {
    pass,
    message: pass
      ? `Response is non-empty (${text.length} characters)`
      : "Expected a non-empty response but got an empty string",
  };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

const ASSERTION_HANDLERS = {
  text_contains,
  text_matches,
  tool_used,
  no_tool_used,
  tool_trajectory,
  response_not_empty,
};

/**
 * Dispatch an assertion object to the appropriate handler.
 *
 * Assertion shapes:
 *   { type: "text_contains",     value: "714" }
 *   { type: "text_matches",      pattern: "\\d+" }
 *   { type: "tool_used",         tool: "calculator" }
 *   { type: "no_tool_used",      tool: "calculator" }
 *   { type: "tool_trajectory",   tools: ["calculator", "data_formatter"] }
 *   { type: "response_not_empty" }
 *
 * @param {object} assertion - Assertion config from YAML
 * @param {object} response  - { text, toolsUsed, sessionId, durationMs }
 * @returns {{ pass: boolean, message: string }}
 */
export function runAssertion(assertion, response) {
  const handler = ASSERTION_HANDLERS[assertion.type];

  if (!handler) {
    return {
      pass: false,
      message: `Unknown assertion type: "${assertion.type}". Valid types: ${Object.keys(ASSERTION_HANDLERS).join(", ")}`,
    };
  }

  // Resolve the primary argument for each assertion type
  switch (assertion.type) {
    case "text_contains":
      return handler(response, assertion.value);
    case "text_matches":
      return handler(response, assertion.pattern);
    case "tool_used":
    case "no_tool_used":
      return handler(response, assertion.tool);
    case "tool_trajectory":
      return handler(response, assertion.tools);
    case "response_not_empty":
      return handler(response);
    default:
      return handler(response, assertion);
  }
}

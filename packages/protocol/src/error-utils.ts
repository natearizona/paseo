function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const NESTED_MESSAGE_KEYS = ["details", "errorMessage", "message", "detail", "title"] as const;

const MAX_NESTED_ERROR_DEPTH = 4;

function extractNestedMessage(data: unknown, depth = 0): string | null {
  if (!isRecord(data) || depth > MAX_NESTED_ERROR_DEPTH) {
    return null;
  }

  for (const key of NESTED_MESSAGE_KEYS) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return extractNestedMessage(data.error, depth + 1);
}

/**
 * Extracts a message from a structured, non-Error rejection value.
 *
 * JSON-RPC transports (ACP providers, the worktree wire protocol) reject with plain
 * objects rather than Error instances. Passing those to `String()` yields
 * "[object Object]", which discards the only part a user can act on: the nested
 * `data` detail. Composition mirrors `summarizeACPRequestError` so both paths render
 * a failure the same way.
 *
 * Returns null when the value carries no usable message, so callers keep their own fallback.
 */
export function getStructuredErrorMessage(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  const message = typeof error.message === "string" ? error.message.trim() : "";
  const detail = extractNestedMessage(error.data);

  if (message && detail && detail !== message) {
    return `${message}: ${detail}`;
  }
  if (message) {
    return message;
  }
  if (detail) {
    return detail;
  }

  return extractNestedMessage(error.error);
}

/**
 * Extracts a human-readable error message from an unknown error value.
 * Handles Error instances, string errors, structured rejections, and other types safely.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return getStructuredErrorMessage(error) ?? String(error);
}

/**
 * Extracts an error message from an unknown error value, with a fallback
 * for when no message can be extracted.
 */
export function getErrorMessageOr(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return getStructuredErrorMessage(error) ?? fallback;
}

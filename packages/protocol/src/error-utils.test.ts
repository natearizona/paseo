import { describe, expect, test } from "vitest";
import { getErrorMessage, getErrorMessageOr, getStructuredErrorMessage } from "./error-utils.js";

// Payload shapes captured from daemon logs: ACP providers reject with plain JSON-RPC
// objects, not Error instances. `stack: ""` is what the wire actually carries.
function jsonRpcRejection(code: number, message: string, detail: string): unknown {
  return {
    type: "Object",
    message,
    stack: "",
    code,
    data: { type: "Object", message: detail, stack: "" },
  };
}

describe("getErrorMessage with structured non-Error rejections", () => {
  test("surfaces the nested detail for an unsupported thinking value", () => {
    const error = jsonRpcRejection(-32602, "Invalid params", "Invalid value for thinking: xhigh");
    expect(getErrorMessage(error)).toBe("Invalid params: Invalid value for thinking: xhigh");
  });

  test("surfaces the nested detail when a model does not advertise thinking", () => {
    const error = jsonRpcRejection(
      -32602,
      "Invalid params",
      "Unknown model config option: thinking",
    );
    expect(getErrorMessage(error)).toBe("Invalid params: Unknown model config option: thinking");
  });

  test("surfaces the nested detail when a model does not advertise fast", () => {
    const error = jsonRpcRejection(-32602, "Invalid params", "Unknown model config option: fast");
    expect(getErrorMessage(error)).toBe("Invalid params: Unknown model config option: fast");
  });

  test("surfaces an internal-error detail", () => {
    const error = jsonRpcRejection(
      -32603,
      "Internal error",
      "Failed to set config option 'allow_all' to 'on': Permission service is unavailable",
    );
    expect(getErrorMessage(error)).toBe(
      "Internal error: Failed to set config option 'allow_all' to 'on': Permission service is unavailable",
    );
  });

  test("never renders [object Object] for an object carrying a message", () => {
    const error = jsonRpcRejection(-32602, "Invalid params", "Invalid value for thinking: high");
    expect(getErrorMessage(error)).not.toContain("[object Object]");
  });

  test("does not duplicate the message when the detail repeats it", () => {
    const error = jsonRpcRejection(-32602, "Invalid params", "Invalid params");
    expect(getErrorMessage(error)).toBe("Invalid params");
  });

  test("falls back to the outer message when data carries no detail", () => {
    expect(getErrorMessage({ message: "Invalid params", code: -32602 })).toBe("Invalid params");
  });

  test("reads a detail nested under data.error", () => {
    const error = { code: -32603, data: { error: { details: "upstream refused the write" } } };
    expect(getErrorMessage(error)).toBe("upstream refused the write");
  });

  test("still stringifies objects that carry no usable message", () => {
    expect(getErrorMessage({ code: -32000 })).toBe("[object Object]");
  });
});

describe("existing behavior is preserved", () => {
  test("Error instances use their message", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  test("strings pass through", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  test("null and undefined stringify", () => {
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});

describe("getErrorMessageOr", () => {
  test("prefers a structured message over the fallback", () => {
    const error = jsonRpcRejection(-32602, "Invalid params", "Invalid value for thinking: xhigh");
    expect(getErrorMessageOr(error, "Failed to update agent")).toBe(
      "Invalid params: Invalid value for thinking: xhigh",
    );
  });

  test("uses the fallback when nothing is extractable", () => {
    expect(getErrorMessageOr({ code: -32000 }, "Failed to update agent")).toBe(
      "Failed to update agent",
    );
    expect(getErrorMessageOr("", "Failed to update agent")).toBe("Failed to update agent");
  });
});

describe("getStructuredErrorMessage", () => {
  test("returns null for non-objects so callers keep their fallback", () => {
    expect(getStructuredErrorMessage("nope")).toBeNull();
    expect(getStructuredErrorMessage(null)).toBeNull();
    expect(getStructuredErrorMessage(42)).toBeNull();
  });

  test("does not recurse without bound", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 50; i += 1) {
      const next: Record<string, unknown> = {};
      cursor.error = next;
      cursor = next;
    }
    cursor.message = "too deep to reach";
    expect(getStructuredErrorMessage(deep)).toBeNull();
  });
});

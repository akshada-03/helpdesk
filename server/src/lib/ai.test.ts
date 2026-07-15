import { beforeEach, describe, expect, mock, test } from "bun:test";

// Unit tests for the AI helper itself — the one module the route/component tests
// stub out, so nothing else covers it. The model call is mocked, so these assert
// what we ASK the model (prompt construction, name handling) and how we treat its
// answer, never the model's actual output. Prompt-following is a property of the
// model and can't be pinned down here; it's verified by hand against a real key.

// The AI SDK's generateText, mocked BEFORE importing the module under test so no
// request is ever made and the response is deterministic.
const generateTextMock = mock();
mock.module("ai", () => ({ generateText: generateTextMock }));

// lib/env snapshots process.env at import time, and bun auto-loads server/.env — so
// without this the real AI_* vars leak in and the "not configured" cases become
// unreachable. Re-mocking the module is what re-binds the values in ai.ts (mutating
// a shared object does not: the imports are already bound by then), so each test
// sets the env it needs through setEnv.
type AiEnv = {
  AI_BASE_URL: string | undefined;
  AI_API_KEY: string | undefined;
  AI_MODEL: string | undefined;
};

const configuredEnv: AiEnv = {
  AI_BASE_URL: "https://example.test/v1/",
  AI_API_KEY: "test-key",
  AI_MODEL: "test-model",
};

function setEnv(overrides: Partial<AiEnv> = {}) {
  const env = { ...configuredEnv, ...overrides };
  mock.module("./env", () => env);
}

setEnv();

const { polishReply } = await import("./ai");

// A complete set of inputs; individual tests override just what they exercise.
const baseInput = {
  draft: "we r on it",
  subject: "Cannot log in",
  ticketBody: "I can't log in since yesterday.",
  requesterName: "Sam Rivera" as string | null,
  agentName: "Alice Agent",
};

// The prompt string handed to the model on the most recent call.
function lastPrompt(): string {
  return generateTextMock.mock.calls.at(-1)![0].prompt;
}

// The value of a single `Label: value` line in that prompt. Assertions compare this
// EXACTLY rather than substring-matching the prompt: "Customer's first name: Sam"
// is a substring of "...: Sam Rivera", so a toContain check would still pass if the
// first-name reduction broke. Returns undefined if the label is absent.
function promptField(label: string): string | undefined {
  const prefix = `${label}: `;
  return lastPrompt()
    .split("\n")
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
}

beforeEach(() => {
  generateTextMock.mockReset();
  generateTextMock.mockResolvedValue({ text: "Polished reply." });
  // Restore a fully-configured env — the failure tests below unset parts of it.
  setEnv();
});

describe("polishReply", () => {
  test("returns the model's text", async () => {
    generateTextMock.mockResolvedValue({ text: "Hello Sam,\n\nFixed it." });

    expect(await polishReply(baseInput)).toBe("Hello Sam,\n\nFixed it.");
  });

  test("trims surrounding whitespace off the model's text", async () => {
    generateTextMock.mockResolvedValue({ text: "\n\n  Polished reply.  \n\n" });

    expect(await polishReply(baseInput)).toBe("Polished reply.");
  });

  test("sends the draft and the ticket as context", async () => {
    await polishReply(baseInput);

    const prompt = lastPrompt();
    expect(prompt).toContain("we r on it");
    expect(prompt).toContain("Cannot log in");
    expect(prompt).toContain("I can't log in since yesterday.");
  });

  test("uses the configured model", async () => {
    await polishReply(baseInput);

    expect(generateTextMock.mock.calls[0][0].model.modelId).toBe("test-model");
  });

  describe("names", () => {
    test("reduces both names to first names", async () => {
      await polishReply(baseInput);

      expect(promptField("Customer's first name")).toBe("Sam");
      expect(promptField("Agent's first name")).toBe("Alice");
      // The surnames must not reach the model at all — otherwise it may use them.
      expect(lastPrompt()).not.toContain("Rivera");
    });

    test("keeps a single-word name as-is", async () => {
      await polishReply({
        ...baseInput,
        requesterName: "Cher",
        agentName: "Prince",
      });

      expect(promptField("Customer's first name")).toBe("Cher");
      expect(promptField("Agent's first name")).toBe("Prince");
    });

    test("takes only the leading token of a multi-part name", async () => {
      await polishReply({ ...baseInput, requesterName: "Ana Maria de Souza" });

      expect(promptField("Customer's first name")).toBe("Ana");
    });

    test("ignores extra whitespace around and inside a name", async () => {
      await polishReply({ ...baseInput, requesterName: "  Sam   Rivera  " });

      expect(promptField("Customer's first name")).toBe("Sam");
    });

    test("marks a null customer name as unknown rather than guessing", async () => {
      await polishReply({ ...baseInput, requesterName: null });

      // Inbound email often has no name — the model must be told to fall back to a
      // neutral greeting, not invent one or emit a placeholder.
      expect(promptField("Customer's first name")).toContain("unknown");
    });

    test("treats a blank customer name as unknown", async () => {
      await polishReply({ ...baseInput, requesterName: "   " });

      expect(promptField("Customer's first name")).toContain("unknown");
    });

    test("never marks a present customer name as unknown", async () => {
      await polishReply(baseInput);

      expect(promptField("Customer's first name")).not.toContain("unknown");
    });

    test("falls back to the raw agent name if it is blank", async () => {
      // An app User always has a name, so this is a guard rather than a real case:
      // it must not ask the model to sign off with an empty string.
      await polishReply({ ...baseInput, agentName: "   " });

      expect(promptField("Agent's first name")).toBe("   ");
    });
  });

  describe("failure handling", () => {
    test("throws when the model returns empty text", async () => {
      generateTextMock.mockResolvedValue({ text: "" });

      expect(polishReply(baseInput)).rejects.toThrow("empty");
    });

    test("throws when the model returns only whitespace", async () => {
      generateTextMock.mockResolvedValue({ text: "  \n  " });

      expect(polishReply(baseInput)).rejects.toThrow("empty");
    });

    test("propagates a failed model call", async () => {
      generateTextMock.mockRejectedValue(new Error("upstream is down"));

      expect(polishReply(baseInput)).rejects.toThrow("upstream is down");
    });

    test("throws a configuration error when the API key is unset", async () => {
      setEnv({ AI_API_KEY: undefined });

      expect(polishReply(baseInput)).rejects.toThrow("AI is not configured");
      // It must fail before calling out, not send a keyless request.
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    test("requires the base URL too", async () => {
      setEnv({ AI_BASE_URL: undefined });

      expect(polishReply(baseInput)).rejects.toThrow("AI is not configured");
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    test("requires the model id too", async () => {
      setEnv({ AI_MODEL: undefined });

      expect(polishReply(baseInput)).rejects.toThrow("AI is not configured");
      expect(generateTextMock).not.toHaveBeenCalled();
    });
  });
});

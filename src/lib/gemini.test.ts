import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_BASE_URL = "https://api.vilao.ai/v1";
process.env.GEMINI_API_KEY = "test-key";

test("fetchIpaSingle parses an OpenAI-compatible SSE response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"choices":[{"delta":{"content":"{\\"ipa\\":\\"/test/\\"}"}}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );

  try {
    const { fetchIpaSingle } = await import("./gemini");
    assert.equal(await fetchIpaSingle("test"), "/test/");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

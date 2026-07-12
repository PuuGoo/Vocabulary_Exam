const API_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.1-flash"; // Cập nhật theo yêu cầu của bạn

/** Reads single API key. */
function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

const RATE_LIMIT_MESSAGE =
  "Đã vượt quá hạn mức API. Vui lòng đợi một chút rồi thử lại.";

async function callGeminiOnce(
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key chưa được cấu hình.");

  // If using OpenAI-compatible base URL, adjust endpoint.
  // Google: /v1beta/models/...
  // OpenAI-compatible: /v1/chat/completions or /v1/generateContent
  // Vilao specifically might use /v1/chat/completions
  const isVilao = API_BASE_URL.includes("vilao.ai");
  const url = isVilao
    ? `${API_BASE_URL}/chat/completions`
    : `${API_BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = isVilao
    ? {
        model: "gemini-3.1-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }
    : {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isVilao) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, message: `API lỗi (${res.status}): ${text.slice(0, 300)}` };
  }

  const responseText = await res.text();
  let text: string | undefined;

  if (isVilao && responseText.trimStart().startsWith("data:")) {
    text = responseText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "[DONE]")
      .map((line) => {
        try {
          const chunk = JSON.parse(line.slice(5).trim());
          return chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.message?.content || "";
        } catch {
          return "";
        }
      })
      .join("");
  } else {
    const data = JSON.parse(responseText);
    text = isVilao
      ? data?.choices?.[0]?.message?.content
      : data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  if (!text) return { ok: false, message: "API không trả về nội dung." };
  return { ok: true, text };
}

/**
 * Simplified call function (assuming single key as per user requirement)
 */
async function callGemini(prompt: string): Promise<string> {
  const result = await callGeminiOnce(prompt);
  if (!result.ok) throw new Error(result.message);
  return result.text;
}


function stripToJson(text: string): string {
  // Gemini sometimes wraps JSON in ```json fences even when responseMimeType is set; strip defensively.
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

/** Extract the first /…/ IPA-looking substring from arbitrary text, as a fallback if JSON parsing fails. */
function extractIpaFallback(text: string): string | null {
  const match = text.match(/\/[^/\n]{1,80}\/(?!\s*\/)/);
  return match ? match[0] : null;
}

const CAMBRIDGE_STYLE_INSTRUCTIONS = `Use British English (UK) pronunciation, in the exact IPA notation and formatting conventions used by the Cambridge Dictionary website (https://dictionary.cambridge.org/) — the same standard reference British English learner's dictionaries use (e.g. stress mark ˈ before the stressed syllable, ː for long vowels, standard IPA symbols such as iː, ɪ, e, æ, ʌ, ɒ, ʊ, uː, ɜː, ə, eɪ, aɪ, ɔɪ, aʊ, əʊ, ɪə, eə, ʊə). Do not invent a transcription for words you don't recognize confidently.`;

/** Fetch IPA phonetic transcription for a single English word or short phrase. */
export async function fetchIpaSingle(word: string): Promise<string | null> {
  const prompt = `Give the IPA phonetic transcription for the English word or phrase: "${word}", matching how it is transcribed on the Cambridge Dictionary website (dictionary.cambridge.org).
${CAMBRIDGE_STYLE_INSTRUCTIONS}
Respond with ONLY a JSON object of the form {"ipa": "/.../"} — the transcription wrapped in forward slashes. If you are not sure or it's not a valid English word, respond {"ipa": null}.`;

  const raw = await callGemini(prompt);
  try {
    const parsed = JSON.parse(stripToJson(raw));
    if (typeof parsed.ipa === "string" && parsed.ipa.trim()) return parsed.ipa.trim();
    return null;
  } catch {
    return extractIpaFallback(raw);
  }
}

/** Fetch IPA transcriptions for many words in one Gemini call (much more quota-efficient for bulk imports). */
export async function fetchIpaBatch(wordsList: string[]): Promise<Record<string, string>> {
  if (wordsList.length === 0) return {};
  const prompt = `Give the IPA phonetic transcription for each of the following English words/phrases, matching how each is transcribed on the Cambridge Dictionary website (dictionary.cambridge.org).
${CAMBRIDGE_STYLE_INSTRUCTIONS}
Respond with ONLY a JSON object mapping each exact input word to its transcription string wrapped in forward slashes, e.g. {"hello": "/həˈləʊ/", "run": "/rʌn/"}.
If a word is not valid English or you're unsure of its Cambridge Dictionary transcription, omit it from the object entirely (do not guess, do not include null values).

Words:
${wordsList.map((w) => `- ${w}`).join("\n")}`;

  const raw = await callGemini(prompt);
  try {
    const parsed = JSON.parse(stripToJson(raw));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function isGeminiConfigured(): boolean {
  return !!getApiKey();
}

export function getGeminiKeyCount(): number {
  return getApiKey() ? 1 : 0;
}

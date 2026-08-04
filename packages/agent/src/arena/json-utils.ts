import type { LLMProvider } from "./types.js";

export function extractJSON(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || start >= end) {
    throw new Error(`No JSON object found in response: ${raw.slice(0, 200)}`);
  }
  return raw.slice(start, end + 1);
}

/** Call provider.complete(), validating JSON on response. Retries once on invalid JSON
 *  with a prompt fix. On second failure, throws with a response snippet for debugging. */
export async function complete(
  provider: LLMProvider,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const response = await provider.complete(prompt, { signal });

  try {
    JSON.parse(extractJSON(response));
    return response;
  } catch {
    // First attempt was invalid JSON — retry once with explicit instruction
    signal?.throwIfAborted();
    const retry = await provider.complete(
      prompt + "\n\nYour previous response was not valid JSON. Return ONLY a valid JSON object.",
      { signal },
    );

    try {
      JSON.parse(extractJSON(retry));
      return retry;
    } catch {
      const snippet = retry.slice(0, 300);
      throw new Error(
        `Still invalid JSON after retry. Response snippet (first 300 chars):\n${snippet}`,
      );
    }
  }
}

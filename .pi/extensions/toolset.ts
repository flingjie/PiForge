/**
 * Toolset Extension — modern CLI tool wrappers for Pi.
 *
 * Registers tools that don't have built-in equivalents:
 * - jq: JSON query and transformation
 * - web_fetch: HTTP GET with text extraction
 * - web_search: Web search via Tavily API
 */

import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";

const PRIVATE_IP_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  /^fc00:/, /^fd00:/, /^fe80:/, /^::1$/, /^::$/, /^0:0:0:0:0:0:0:1$/,
];

function isPrivateHost(hostname: string): boolean {
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) return true;
  }
  return hostname === "localhost" || hostname === "metadata.google.internal";
}

function execJqCommand(filter: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("jq", [filter], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || "jq exited with code " + code));
    });
    child.on("error", reject);
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

const jqTool: ToolDefinition = {
  name: "jq",
  label: "jq",
  description:
    "Execute a jq query on JSON data. Provide the jq filter expression and optional JSON input. " +
    "If no input is provided, queries the most recently mentioned JSON file or stdin. " +
    "Use for extracting fields, transforming JSON, or validating structure. " +
    "Examples: '.dependencies | keys', '.[].name', 'map({name, version})'",
  parameters: Type.Object({
    filter: Type.String({ description: "jq filter expression (e.g., '.name', '.items[] | {id, title}')" }),
    input: Type.Optional(Type.String({ description: "JSON input string. If omitted, reads from previously mentioned files." })),
  }),
  execute: async (_id, params) => {
    const output = await execJqCommand(params.filter, params.input);
    return { content: [{ type: "text", text: output }] };
  },
};

const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  label: "Web Fetch",
  description:
    "Fetch content from a URL via HTTP GET. Returns the response body as text. " +
    "Use for reading documentation, checking API responses, or fetching raw data. " +
    "Only fetches public URLs. For complex HTML pages, consider reading a saved copy instead. " +
    "Timeout: 15 seconds. Max response size: 500KB. Blocks private/internal IPs.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to fetch (must start with http:// or https://)" }),
    headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Optional HTTP headers" })),
  }),
  execute: async (_id, params, signal) => {
    let urlStr = params.url;
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      return {
        content: [{ type: "text", text: "Error: URL must start with http:// or https://" }],
        isError: true,
      };
    }

    // SSRF guard: check host before fetching
    try {
      const parsed = new URL(urlStr);
      if (isPrivateHost(parsed.hostname)) {
        return {
          content: [{ type: "text", text: "Error: Requests to private/internal IPs are blocked." }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text", text: "Error: Invalid URL format." }],
        isError: true,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    try {
      // Manual redirect with SSRF check on each hop
      let response: Response | null = null;
      for (let hop = 0; hop < 5; hop++) {
        response = await fetch(urlStr, {
          method: "GET",
          headers: {
            "User-Agent": "PiForge/1.0",
            Accept: "text/plain,text/html,application/json,*/*",
            ...params.headers,
          },
          signal: controller.signal,
          redirect: "manual",
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) break;
          const redirectUrl = new URL(location, urlStr);
          if (isPrivateHost(redirectUrl.hostname)) {
            return {
              content: [{ type: "text", text: "Error: Redirect target is a private/internal IP — blocked." }],
              isError: true,
            };
          }
          urlStr = redirectUrl.href;
          continue;
        }
        break;
      }

      if (!response) {
        return {
          content: [{ type: "text", text: "Error: Too many redirects." }],
          isError: true,
        };
      }

      const maxSize = 500 * 1024;
      const contentType = response.headers.get("content-type") || "";

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          content: [{ type: "text", text: `HTTP ${response.status} ${response.statusText}\n(empty body)` }],
          isError: response.status >= 400,
        };
      }

      // Single TextDecoder for correct multi-byte UTF-8 handling across chunks
      const decoder = new TextDecoder();
      let body = "";
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxSize) {
          const remaining = maxSize - (total - value.length);
          body += decoder.decode(value.slice(0, remaining), { stream: false });
          body += "\n\n[Response truncated at 500KB]";
          break;
        }
        body += decoder.decode(value, { stream: true });
      }

      let displayBody = body;
      if (contentType.includes("json")) {
        try { displayBody = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      }

      return {
        content: [{ type: "text", text: displayBody || `HTTP ${response.status} (empty body)` }],
        isError: response.status >= 400,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Fetch error: ${message}` }],
        isError: true,
      };
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  },
};

const webSearchTool: ToolDefinition = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web via Tavily API. Returns titles, URLs, and content snippets. " +
    "Use for finding current information, documentation, or answers that require " +
    "up-to-date web data. Supports optional search_depth (basic/advanced) and " +
    "max_results (1-10, default 5).",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    max_results: Type.Optional(Type.Number({ description: "Max results 1-10 (default 5)" })),
    search_depth: Type.Optional(Type.String({ description: "'basic' (fast) or 'advanced' (deeper, default basic)" })),
  }),
  execute: async (_id, params, signal) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: TAVILY_API_KEY environment variable not set." }],
        isError: true,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    try {
      const body = JSON.stringify({
        api_key: apiKey,
        query: params.query,
        max_results: Math.min(Math.max(params.max_results ?? 5, 1), 10),
        search_depth: params.search_depth === "advanced" ? "advanced" : "basic",
        include_answer: params.search_depth === "advanced",
      });

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Tavily API error: HTTP ${response.status}` }],
          isError: true,
        };
      }

      const data = (await response.json()) as {
        answer?: string;
        results: Array<{ title: string; url: string; content?: string; score: number }>;
      };

      const lines: string[] = [];
      if (data.answer) {
        lines.push(data.answer, "");
      }
      for (const r of data.results || []) {
        lines.push("## " + r.title);
        lines.push("URL: " + r.url);
        if (r.content) lines.push(r.content.slice(0, 500));
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") || "No results found." }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: "Search error: " + message }],
        isError: true,
      };
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  },
};

export default function toolsetExtension(pi: ExtensionAPI) {
  pi.registerTool(jqTool);
  pi.registerTool(webFetchTool);
  pi.registerTool(webSearchTool);
}

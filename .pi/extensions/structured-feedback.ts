import { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";

const ERROR_PATTERNS = [
  {
    name: "TS",
    test: (text: string) => /TS\d{4}/.test(text),
    format: (text: string, _toolName: string) => {
      const match = text.match(/TS\d{4}/);
      const tsError = match ? match[0] : "unknown";
      return {
        what: "TypeScript compilation error",
        why: `Type error ${tsError} detected`,
        fix: "Fix the type mismatch and run tsc to verify",
      };
    },
  },
  {
    name: "EACCES",
    test: (text: string) => /Permission denied|EACCES/.test(text),
    format: () => ({
      what: "Permission denied",
      why: "The file or command requires elevated access",
      fix: "Check file permissions with ls -la, or use a path you have access to",
    }),
  },
  {
    name: "ENOENT",
    test: (text: string) => /ENOENT|No such file/.test(text),
    format: () => ({
      what: "File not found",
      why: "The specified path doesn't exist",
      fix: "Use ls or find to locate the correct path",
    }),
  },
  {
    name: "CMD_NOT_FOUND",
    test: (text: string) => /command not found/.test(text),
    format: () => ({
      what: "Command not available",
      why: "The tool is not installed or not in PATH",
      fix: "Install the tool with brew install [name], or use an alternative",
    }),
  },
  {
    name: "NETWORK",
    test: (text: string) => /fetch|ECONNREFUSED|ENOTFOUND/.test(text),
    format: (text: string) => {
      const firstLine = text.trim().split("\n")[0].slice(0, 100);
      return {
        what: "Network request failed",
        why: firstLine || "Could not reach the remote service",
        fix: "Check the URL is correct and the service is reachable",
      };
    },
  },
  {
    name: "JSON",
    test: (text: string) => /JSON|Unexpected token|SyntaxError/.test(text),
    format: (text: string) => {
      const firstLine = text.trim().split("\n")[0].slice(0, 100);
      return {
        what: "Invalid JSON",
        why: firstLine || "JSON parsing or structure error",
        fix: "Validate the JSON structure with jq or a JSON validator",
      };
    },
  },
  {
    name: "PERM_BLOCKED",
    test: (text: string) => /Blocked by rule/.test(text),
    format: (text: string) => {
      const reasonLine = text.split("\n").find((l) => l.includes("Blocked by rule")) ?? "";
      const reason = reasonLine.replace(/^.*Blocked by rule[:\s]*/, "").slice(0, 150) || "The operation matched a deny rule";
      return {
        what: "Operation blocked by permission rule",
        why: reason,
        fix: "Use /permission-mode to adjust rules, or find an alternative approach",
      };
    },
  },
];

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function detectError(text: string, toolName: string) {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(text)) {
      return { ...pattern.format(text, toolName), type: pattern.name };
    }
  }
  // Default
  return {
    what: `${toolName} failed`,
    why: text.trim().slice(0, 100),
    fix: "Check the error output and adjust your approach",
    type: "UNKNOWN",
  };
}

export default function structuredFeedbackExtension(pi: ExtensionAPI) {
  const errorHistory: string[] = [];

  // Reset error counter on session restart
  pi.on("session_start", async () => {
    errorHistory.length = 0;
  });

  pi.on("tool_result", (event: ToolResultEvent) => {
    try {
      if (!event.isError) return;

      const rawText = String(event.content ?? "");
      const toolName = String(event.toolName ?? "unknown_tool");
      const result = detectError(rawText, toolName);

      errorHistory.push(result.type);
      const errorCount = errorHistory.length;
      const previousTypes = errorHistory.length > 1
        ? ` (previous: ${errorHistory.slice(0, -1).join(", ")})`
        : "";

      const header = `Error #${errorCount} this session${previousTypes}`;
      const evidence = truncate(rawText, 300);

      event.content = [
        `## Tool Error: ${toolName}`,
        "",
        `> ${header}`,
        "",
        `**What failed:** ${result.what}`,
        `**Why:** ${result.why}`,
        `**Suggested fix:** ${result.fix}`,
        `**Evidence:** ${evidence}`,
      ].join("\n");
    } catch {
      // Silently pass through — formatting must never crash the tool pipeline
    }
  });
}

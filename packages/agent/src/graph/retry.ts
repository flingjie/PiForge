import type { GraphNode, GraphState, NodeInput, NodeResult, ToolSet } from "./types.js";

/** Thrown when retries are exhausted on a node. */
export class RetryExhaustedError extends Error {
  constructor(
    public readonly nodeName: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(`Node "${nodeName}" failed after ${attempts} attempt(s): ${lastError.message}`);
    this.name = "RetryExhaustedError";
  }
}

/**
 * Execute a node with retry logic.
 *
 * On each failure the `feedbackFn` from the node's retryConfig is called
 * to generate contextual feedback. That feedback is merged into a new
 * NodeInput so the retry attempt receives enriched/degraded context.
 */
export async function withRetry<TState extends GraphState>(
  node: GraphNode<TState>,
  baseInput: NodeInput<TState>,
  getTools: (nodeName: string) => ToolSet,
): Promise<{ output: unknown; retryCount: number }> {
  const maxRetries = node.retryConfig?.maxRetries ?? 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On retry attempts, inject feedback from the previous failure.
      const input =
        attempt > 0 && lastError && node.retryConfig
          ? injectFeedback(baseInput, node.retryConfig.feedbackFn(attempt, lastError))
          : baseInput;

      const tools = getTools(node.name);
      const output = await node.run(input);
      return { output, retryCount: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new RetryExhaustedError(node.name, maxRetries + 1, lastError!);
}

function injectFeedback<TState extends GraphState>(
  input: NodeInput<TState>,
  feedback: Record<string, unknown>,
): NodeInput<TState> {
  return {
    ...input,
    state: {
      ...input.state,
      _feedback: feedback,
    } as unknown as TState,
  };
}

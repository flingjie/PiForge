import type { ToolSet } from "../graph/types.js";

/** JSON Schema for a tool's parameters (simplified representation). */
export interface ParameterSchema {
  type?: string;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
  description?: string;
  items?: ParameterSchema;
  enum?: string[];
}

/** A registered tool with metadata and execution logic. */
export interface RegisteredTool {
  /** Unique tool name. */
  name: string;
  /** Natural-language description for agent consumption. */
  description: string;
  /** JSON Schema describing the tool's parameters. */
  parameters: ParameterSchema;
  /** The function backing this tool. */
  execute: (...args: any[]) => unknown;
}

/** Maps node names to the set of tools they are allowed to call. */
export type ToolPermissions = Map<string, Set<string>>;

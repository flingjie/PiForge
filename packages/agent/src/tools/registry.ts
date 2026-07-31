import type { RegisteredTool, ToolPermissions } from "./types.js";
import type { ToolSet } from "../graph/types.js";

/**
 * Minimal-permission tool registry.
 *
 * Each tool is registered with metadata plus a list of node names that
 * are permitted to call it. Nodes only receive tools explicitly granted.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private permissions: ToolPermissions = new Map();

  /**
   * Register a tool and grant access to the named nodes.
   * If `allowedNodes` is empty the tool is registered but no node can call it
   * until permissions are added.
   */
  register(tool: RegisteredTool, allowedNodes: string[]): void {
    this.tools.set(tool.name, tool);
    for (const node of allowedNodes) {
      const perms = this.permissions.get(node) ?? new Set();
      perms.add(tool.name);
      this.permissions.set(node, perms);
    }
  }

  /**
   * Grant an existing tool to an additional node.
   */
  grant(toolName: string, nodeName: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool "${toolName}" is not registered.`);
    }
    const perms = this.permissions.get(nodeName) ?? new Set();
    perms.add(toolName);
    this.permissions.set(nodeName, perms);
  }

  /**
   * Return the minimal tool set for a given node.
   */
  getToolsForNode(nodeName: string): ToolSet {
    const permitted = this.permissions.get(nodeName);
    if (!permitted || permitted.size === 0) return {};

    const toolSet: ToolSet = {};
    for (const toolName of permitted) {
      const tool = this.tools.get(toolName);
      if (tool) {
        toolSet[toolName] = tool.execute;
      }
    }
    return toolSet;
  }

  /**
   * Return metadata for all tools permitted to a node (for prompt construction).
   */
  getToolDescriptions(nodeName: string): Pick<RegisteredTool, "name" | "description" | "parameters">[] {
    const permitted = this.permissions.get(nodeName);
    if (!permitted) return [];

    const result: Pick<RegisteredTool, "name" | "description" | "parameters">[] = [];
    for (const toolName of permitted) {
      const tool = this.tools.get(toolName);
      if (tool) {
        result.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }
    return result;
  }
}

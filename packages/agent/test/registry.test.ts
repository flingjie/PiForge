import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/tools/registry.js";
import type { RegisteredTool } from "../src/tools/types.js";

const toolA: RegisteredTool = {
  name: "readState",
  description: "Read the current state.",
  parameters: { type: "object", properties: {} },
  execute: () => ({ data: "A" }),
};

const toolB: RegisteredTool = {
  name: "writeState",
  description: "Write to state.",
  parameters: { type: "object", properties: { key: { type: "string" } } },
  execute: () => ({ written: true }),
};

describe("ToolRegistry", () => {
  it("registers tools with node permissions", () => {
    const reg = new ToolRegistry();
    reg.register(toolA, ["node1", "node2"]);
    reg.register(toolB, ["node2"]);

    const t1 = reg.getToolsForNode("node1");
    expect(Object.keys(t1)).toEqual(["readState"]);

    const t2 = reg.getToolsForNode("node2");
    expect(Object.keys(t2).sort()).toEqual(["readState", "writeState"]);

    const t3 = reg.getToolsForNode("node3");
    expect(Object.keys(t3)).toEqual([]);
  });

  it("grant() adds a tool to a node post-registration", () => {
    const reg = new ToolRegistry();
    reg.register(toolA, []);
    reg.grant("readState", "node1");

    const tools = reg.getToolsForNode("node1");
    expect(Object.keys(tools)).toEqual(["readState"]);
  });

  it("grant() throws for unregistered tool", () => {
    const reg = new ToolRegistry();
    expect(() => reg.grant("nonexistent", "node1")).toThrow("not registered");
  });

  it("getToolDescriptions returns metadata for prompt construction", () => {
    const reg = new ToolRegistry();
    reg.register(toolA, ["node1"]);

    const descs = reg.getToolDescriptions("node1");
    expect(descs).toHaveLength(1);
    expect(descs[0]!.name).toBe("readState");
    expect(descs[0]!.description).toBe("Read the current state.");
  });

  it("tool execute functions are callable through registry", () => {
    const reg = new ToolRegistry();
    reg.register(toolA, ["node1"]);

    const tools = reg.getToolsForNode("node1");
    const result = tools.readState();
    expect(result).toEqual({ data: "A" });
  });
});

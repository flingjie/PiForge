import { describe, it, expect } from "vitest";
import { validateDesign } from "../../src/arena/validator.js";

const validPlan = `# Test Plan

## Design Decision: Something
Chosen approach: Module A.

## File Structure
- packages/core/src/a.ts
- packages/core/src/b.ts
`;

const validTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | task1 | a.ts | tsc | - | pending |

## Dependency Diagram
\`\`\`
[1]
\`\`\`

## Concurrent Groups
G1: [1]
`;

describe("validateDesign", () => {
  it("passes valid plan + todo", () => {
    const result = validateDesign(validPlan, validTodo);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when plan references a file not in todo", () => {
    const plan = validPlan + "\nUses: packages/core/src/c.ts";
    const result = validateDesign(plan, validTodo);
    // c.ts is mentioned in plan but not in todo nodes
    expect(result.warnings.some((w) => w.includes("c.ts"))).toBe(true);
  });

  it("fails when todo has dependency cycle", () => {
    const cyclicTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|
| 1  | a | a.ts | tsc | 2 | pending |
| 2  | b | b.ts | tsc | 1 | pending |

## Concurrent Groups
G1: [1, 2]
`;
    const result = validateDesign(validPlan, cyclicTodo);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });

  it("warns on empty todo", () => {
    const emptyTodo = `# TODO: test

## Node Table
| ID | Name | Files | Verify | DependsOn | Status |
|----|------|-------|--------|-----------|--------|

## Concurrent Groups
`;
    const result = validateDesign(validPlan, emptyTodo);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("passes when todo has no dependency cycles (valid DAG)", () => {
    // Already tested with validTodo above — just confirm
    const result = validateDesign(validPlan, validTodo);
    expect(result.valid).toBe(true);
  });
});

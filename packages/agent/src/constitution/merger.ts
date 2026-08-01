import type { Constitution, RubricDimension, RubricOverride } from "./types.js";
import type { ArenaConfig } from "../arena/types.js";

export function mergeRubric(
  constitution: Constitution,
  overrides: RubricOverride[],
): RubricDimension[] {
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    overrideMap.set(o.dimensionKey, o.weight);
  }

  return constitution.rubric.map((dim) => {
    const overrideWeight = overrideMap.get(dim.key);
    if (overrideWeight !== undefined) {
      return { ...dim, defaultWeight: overrideWeight };
    }
    return { ...dim };
  });
}

export function toArenaConfig(
  constitution: Constitution,
  overrides: RubricOverride[] = [],
): ArenaConfig {
  const merged = mergeRubric(constitution, overrides);
  const rubric: Record<string, number> = {};
  for (const dim of merged) {
    rubric[dim.key] = dim.defaultWeight;
  }

  return {
    maxDepth: 3,
    maxCritiqueCycles: 2,
    rubric,
  };
}

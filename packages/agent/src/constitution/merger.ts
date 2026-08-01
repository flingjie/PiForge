import type { Constitution, RubricDimension, RubricOverride } from "./types.js";

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

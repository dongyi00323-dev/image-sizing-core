import { describe, expect, it } from "vitest";
import { createAdaptationPlan } from "../src/index.js";

describe("createAdaptationPlan", () => {
  it.each([
    [
      { width: 1200, height: 600 },
      { width: 600, height: 1200 },
      { width: 600, height: 300, x: 0, y: 450 },
    ],
    [
      { width: 600, height: 1200 },
      { width: 1200, height: 600 },
      { width: 300, height: 600, x: 450, y: 0 },
    ],
  ] as const)("contains complete source %#", (source, target, expected) => {
    const plan = createAdaptationPlan(source, target);

    expect(plan.protectedSourceRegion).toEqual(expected);
    expect(plan.scaleX).toBe(plan.scaleY);
    expect(plan.sourceCrop).toBe(false);
    expect(plan.nonUniformDistortion).toBe(false);
  });
});

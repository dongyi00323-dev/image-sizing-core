import { describe, expect, it } from "vitest";
import { calculateTargetPixels } from "../src/index.js";

describe("calculateTargetPixels", () => {
  it.each([
    [
      { width: 2.54, height: 5.08, unit: "cm", dpi: 300 },
      { width: 300, height: 600 },
    ],
    [
      { width: 25.4, height: 12.7, unit: "mm", dpi: 150 },
      { width: 150, height: 75 },
    ],
    [
      { width: 801.4, height: 599.6, unit: "px", dpi: 72 },
      { width: 801, height: 600 },
    ],
  ] as const)("converts target %#", (input, expected) => {
    expect(calculateTargetPixels(input)).toEqual(expected);
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects width %s", (width) => {
    expect(() =>
      calculateTargetPixels({ width, height: 10, unit: "cm", dpi: 300 }),
    ).toThrowError("INVALID_TARGET_DIMENSIONS");
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects height %s", (height) => {
    expect(() =>
      calculateTargetPixels({ width: 10, height, unit: "cm", dpi: 300 }),
    ).toThrowError("INVALID_TARGET_DIMENSIONS");
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects dpi %s", (dpi) => {
    expect(() =>
      calculateTargetPixels({ width: 100, height: 100, unit: "px", dpi }),
    ).toThrowError("INVALID_TARGET_DIMENSIONS");
  });

  it("rejects negative dimensions with a negative dpi", () => {
    expect(() =>
      calculateTargetPixels({
        width: -2.54,
        height: -5.08,
        unit: "cm",
        dpi: -300,
      }),
    ).toThrowError("INVALID_TARGET_DIMENSIONS");
  });
});

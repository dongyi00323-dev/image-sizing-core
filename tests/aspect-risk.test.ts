import { describe, expect, it } from "vitest";
import { classifyAspectRisk } from "../src/index.js";

describe("classifyAspectRisk", () => {
  it.each([
    [1, 1.149, "LOW"],
    [1, 1.15, "MEDIUM"],
    [1, 1.5, "HIGH"],
    [1, 2.5, "EXTREME"],
    [2.5, 1, "EXTREME"],
  ] as const)("classifies %s to %s", (source, target, risk) => {
    expect(classifyAspectRisk(source, target).risk).toBe(risk);
  });
});

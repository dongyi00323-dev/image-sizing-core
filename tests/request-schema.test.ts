import { describe, expect, it } from "vitest";
import {
  assertStrategyAvailable,
  EngineError,
  parseJobRequest,
} from "../src/index.js";

const validRequest = {
  schemaVersion: 1,
  jobId: "job-123",
  inputPath: "D:/assets/source.png",
  outputDirectory: "D:/assets/output",
  target: {
    width: 88,
    height: 40,
    unit: "cm",
    dpi: 300,
  },
};

describe("parseJobRequest", () => {
  it("normalizes a minimal request", () => {
    expect(parseJobRequest(validRequest)).toMatchObject({
      schemaVersion: 1,
      operation: "export",
      output: { format: "source", jpegQuality: 100, overwrite: false },
      background: { strategy: "AUTO" },
    });
  });

  it("defaults an omitted target DPI to 300", () => {
    expect(
      parseJobRequest({
        ...validRequest,
        target: { width: 88, height: 40, unit: "cm" },
      }),
    ).toMatchObject({ target: { dpi: 300 } });
  });

  it("rejects overwrite true", () => {
    expect(() =>
      parseJobRequest({ ...validRequest, output: { overwrite: true } }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  it.each([
    [{ unexpected: "field" }, "the root object"],
    [{ target: { ...validRequest.target, unexpected: "field" } }, "target"],
    [{ output: { unexpected: "field" } }, "output"],
    [{ background: { unexpected: "field" } }, "background"],
  ] as const)("rejects unknown fields in %s", (override) => {
    expect(() =>
      parseJobRequest({ ...validRequest, ...override }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  it.each([
    ["width", 0],
    ["width", -1],
    ["width", Number.NaN],
    ["width", Number.POSITIVE_INFINITY],
    ["width", Number.NEGATIVE_INFINITY],
    ["height", 0],
    ["height", -1],
    ["height", Number.NaN],
    ["height", Number.POSITIVE_INFINITY],
    ["height", Number.NEGATIVE_INFINITY],
    ["dpi", 0],
    ["dpi", -1],
    ["dpi", Number.NaN],
    ["dpi", Number.POSITIVE_INFINITY],
    ["dpi", Number.NEGATIVE_INFINITY],
  ] as const)(
    "rejects non-positive or non-finite target %s %s",
    (field, value) => {
      expect(() =>
        parseJobRequest({
          ...validRequest,
          target: { ...validRequest.target, [field]: value },
        }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    },
  );
});

describe("EngineError", () => {
  it("preserves the stable code, message, and details", () => {
    const error = new EngineError("INVALID_REQUEST", "请求无效", {
      field: "target.width",
    });

    expect(error).toMatchObject({
      name: "EngineError",
      code: "INVALID_REQUEST",
      message: "请求无效",
      details: { field: "target.width" },
    });
  });
});

describe("assertStrategyAvailable", () => {
  it.each(["TEXTURE_SYNTHESIS", "CONTENT_AWARE_EXTEND"] as const)(
    "rejects unavailable strategy %s",
    (strategy) => {
      expect(() => assertStrategyAvailable(strategy)).toThrowError(
        expect.objectContaining({ code: "BACKGROUND_STRATEGY_UNAVAILABLE" }),
      );
    },
  );
});

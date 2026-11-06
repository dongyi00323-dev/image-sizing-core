import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/index.js";

describe("core package", () => {
  it("exports the protocol-visible engine version", () => {
    expect(ENGINE_VERSION).toBe("0.1.0");
  });
});

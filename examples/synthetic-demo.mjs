import { mkdtemp, copyFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  parseJobRequest, calculateTargetPixels, inspectSource,
  createAdaptationPlan, allocateJobPaths, renderSafeJob, sha256File,
} from "../dist/index.js";

// Only procedural shapes are used. Every run gets a new directory.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)), "demo-output");
const { mkdir } = await import("node:fs/promises");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "synthetic-"));
const inputPath = join(directory, "synthetic-source.png");
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#284b63"/><circle cx="150" cy="150" r="90" fill="#f4b942"/><rect x="330" y="70" width="150" height="160" fill="#ffffff"/></svg>'))
  .png().toFile(inputPath);
const request = parseJobRequest({
  schemaVersion: 1, jobId: "synthetic-demo", inputPath,
  outputDirectory: join(directory, "output"),
  target: { width: 50.8, height: 76.2, unit: "mm", dpi: 100 },
  output: { format: "png" }, background: { strategy: "SOLID_EXTEND" },
});
const source = await inspectSource(inputPath);
const target = calculateTargetPixels(request.target);
const plan = createAdaptationPlan(source.oriented, target);
const paths = await allocateJobPaths(request, target);
const artifacts = await renderSafeJob({ request, source, plan, paths });
const metadata = await sharp(artifacts.candidateOutput).metadata();
assert.deepEqual(target, { width: 200, height: 300 });
assert.equal(metadata.width, 200);
assert.equal(metadata.height, 300);
assert.equal(metadata.density, 100);
const expected = await sharp(inputPath).resize({ width: 200 }).ensureAlpha().raw().toBuffer();
const actual = await sharp(artifacts.candidateOutput)
  .extract({ left: 0, top: 100, width: 200, height: 100 })
  .ensureAlpha().raw().toBuffer();
assert.ok(actual.equals(expected));
const corner = await sharp(artifacts.candidateOutput)
  .extract({ left: 0, top: 0, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();
assert.deepEqual([...corner], [255, 255, 255, 255]);
assert.equal(await sha256File(inputPath), source.sha256);
// The core emits a candidate; this example copies it for inspection.
// This is not a production atomic commit or concurrency-safe output protocol.
await copyFile(artifacts.candidateOutput, paths.finalImage);
const bytes = await readFile(paths.finalImage);
console.log(JSON.stringify({
  example: "procedural shapes only", target, plan,
  output: paths.finalImage, dpi: metadata.density,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  checks: ["physical-to-pixels", "target-dimensions", "DPI-metadata", "uniform-source-region", "white-margin", "unchanged-input"],
}, null, 2));

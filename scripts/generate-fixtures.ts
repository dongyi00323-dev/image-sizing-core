import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

interface FixtureDefinition {
  readonly fileName: string;
  readonly stored: Dimensions;
  readonly oriented?: Dimensions;
  readonly render: (outputPath: string) => Promise<unknown>;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = resolve(
  repositoryRoot,
  "tests",
  "fixtures",
  "synthetic",
  "generated",
);

interface DirectoryIdentity {
  readonly device: bigint;
  readonly inode: bigint;
  readonly birthtimeNanoseconds: bigint;
}

interface FixtureBoundary {
  readonly directory: string;
  readonly identity: DirectoryIdentity;
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function samePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return platform() === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function sameIdentity(
  left: DirectoryIdentity,
  right: DirectoryIdentity,
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthtimeNanoseconds === right.birthtimeNanoseconds
  );
}

async function readDirectoryIdentity(
  directoryPath: string,
): Promise<DirectoryIdentity> {
  const stats = await lstat(directoryPath, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      "Synthetic fixture destination must be a physical directory",
    );
  }
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
  });
}

async function establishFixtureBoundary(): Promise<FixtureBoundary> {
  const physicalRepositoryRoot = await realpath(repositoryRoot);
  const syntheticDirectory = dirname(generatedDirectory);
  const physicalSyntheticDirectory = await realpath(syntheticDirectory);
  const expectedSyntheticDirectory = resolve(
    physicalRepositoryRoot,
    "tests",
    "fixtures",
    "synthetic",
  );
  if (!samePath(physicalSyntheticDirectory, expectedSyntheticDirectory)) {
    throw new Error("Synthetic fixture parent is redirected");
  }

  try {
    const stats = await lstat(generatedDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Synthetic fixture destination is redirected");
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
    await mkdir(generatedDirectory);
  }

  const physicalGeneratedDirectory = await realpath(generatedDirectory);
  const expectedGeneratedDirectory = resolve(
    physicalSyntheticDirectory,
    "generated",
  );
  if (!samePath(physicalGeneratedDirectory, expectedGeneratedDirectory)) {
    throw new Error("Synthetic fixture destination is outside its parent");
  }

  return Object.freeze({
    directory: physicalGeneratedDirectory,
    identity: await readDirectoryIdentity(physicalGeneratedDirectory),
  });
}

async function assertFixtureBoundary(boundary: FixtureBoundary): Promise<void> {
  const physicalDirectory = await realpath(boundary.directory);
  const identity = await readDirectoryIdentity(physicalDirectory);
  if (
    !samePath(physicalDirectory, boundary.directory) ||
    !sameIdentity(identity, boundary.identity)
  ) {
    throw new Error("Synthetic fixture destination identity changed");
  }
}

async function assertSafeExistingDestination(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath, { bigint: true });
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n) {
      throw new Error("Synthetic fixture destination entry is redirected");
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return;
    }
    throw error;
  }
}

function svg(width: number, height: number, body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

const bitmapGlyphs: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  中: [
    "00111000",
    "00101000",
    "11111110",
    "10101010",
    "10101010",
    "11111110",
    "00101000",
    "00111000",
  ],
  文: [
    "00010000",
    "11111110",
    "00101000",
    "00101000",
    "00010000",
    "00101000",
    "01000100",
    "10000010",
  ],
};

function bitmapText(
  text: string,
  x: number,
  y: number,
  cellSize: number,
  color: string,
): string {
  let cursor = x;
  const rectangles: string[] = [];

  for (const character of text) {
    const glyph = bitmapGlyphs[character];
    if (glyph === undefined) {
      cursor += cellSize * 4;
      continue;
    }

    for (const [row, cells] of glyph.entries()) {
      for (const [column, cell] of [...cells].entries()) {
        if (cell === "1") {
          rectangles.push(
            `<rect x="${cursor + column * cellSize}" y="${y + row * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
          );
        }
      }
    }

    cursor += (glyph[0]?.length ?? 0) * cellSize + cellSize;
  }

  return `<g fill="${color}">${rectangles.join("")}</g>`;
}

function pngFixture(
  fileName: string,
  width: number,
  height: number,
  body: string,
): FixtureDefinition {
  return {
    fileName,
    stored: { width, height },
    render: (outputPath) =>
      sharp(svg(width, height, body))
        .png({ compressionLevel: 9, adaptiveFiltering: false })
        .toFile(outputPath),
  };
}

const fixtures: readonly FixtureDefinition[] = [
  pngFixture(
    "landscape.png",
    1200,
    600,
    '<rect width="1200" height="600" fill="#dce7f2"/><rect x="80" y="80" width="1040" height="440" rx="40" fill="#315f86"/>',
  ),
  pngFixture(
    "portrait.png",
    600,
    1200,
    '<rect width="600" height="1200" fill="#f2e3d5"/><circle cx="300" cy="430" r="210" fill="#a74d38"/><rect x="120" y="760" width="360" height="280" fill="#5c342b"/>',
  ),
  pngFixture(
    "square.png",
    800,
    800,
    '<rect width="800" height="800" fill="#e8ead9"/><path d="M100 400 400 100 700 400 400 700Z" fill="#64734a"/>',
  ),
  pngFixture(
    "transparent.png",
    800,
    600,
    '<circle cx="260" cy="300" r="190" fill="#ed7658" fill-opacity="0.72"/><circle cx="540" cy="300" r="190" fill="#3d80c3" fill-opacity="0.58"/>',
  ),
  pngFixture(
    "chinese-text.png",
    1000,
    600,
    `<rect width="1000" height="600" fill="#fffaf0"/>${bitmapText("中文", 300, 140, 32, "#252525")}`,
  ),
  pngFixture(
    "english-text.png",
    1000,
    600,
    `<rect width="1000" height="600" fill="#f8fbff"/>${bitmapText("SAFE TEXT", 120, 140, 30, "#163b63")}`,
  ),
  pngFixture(
    "bilingual-text.png",
    1000,
    600,
    `<rect width="1000" height="600" fill="#f7f0e4"/>${bitmapText("SAFE", 220, 80, 26, "#17202a")}${bitmapText("中文", 300, 330, 25, "#8c2f39")}`,
  ),
  pngFixture(
    "logo-layout.png",
    1200,
    800,
    `<rect width="1200" height="800" fill="#f4f0e8"/><circle cx="180" cy="160" r="72" fill="#d64545"/><rect x="930" y="96" width="150" height="150" rx="24" fill="#2467a6"/><path d="M96 650h210v54H96zM894 638h210v66H894z" fill="#202020"/>${bitmapText("MARKERS", 230, 320, 22, "#202020")}`,
  ),
  pngFixture(
    "landscape-text-logo.png",
    1200,
    600,
    `<rect width="1200" height="600" fill="#f3eee2"/><circle cx="120" cy="110" r="62" fill="#ce3e43"/><rect x="1018" y="48" width="128" height="128" rx="18" fill="#236fa5"/>${bitmapText("SAFE", 310, 180, 26, "#20242a")}${bitmapText("中文", 740, 180, 20, "#20242a")}<path d="M120 500h240M840 500h240" stroke="#20242a" stroke-width="24"/>`,
  ),
  pngFixture(
    "solid.png",
    1000,
    700,
    '<rect width="1000" height="700" fill="#4d7c6f"/>',
  ),
  pngFixture(
    "gradient.png",
    1000,
    700,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#143a52"/><stop offset="0.5" stop-color="#5a7891"/><stop offset="1" stop-color="#e0ad76"/></linearGradient></defs><rect width="1000" height="700" fill="url(#g)"/>',
  ),
  pngFixture(
    "pattern.png",
    1000,
    700,
    '<defs><pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#f5efe1"/><path d="M0 0h40v40H0zm40 40h40v40H40z" fill="#315f86"/><circle cx="40" cy="40" r="10" fill="#d65a4a"/></pattern></defs><rect width="1000" height="700" fill="url(#p)"/>',
  ),
  pngFixture(
    "complex.png",
    1200,
    800,
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fa6cb"/><stop offset="1" stop-color="#e9d9bd"/></linearGradient></defs><rect width="1200" height="800" fill="url(#sky)"/><path d="M0 570 210 330 390 530 585 250 850 550 1030 360 1200 520V800H0Z" fill="#334f48"/><path d="M0 650 260 490 500 670 760 460 1000 640 1200 550V800H0Z" fill="#56725a"/><circle cx="1040" cy="140" r="78" fill="#f4cc66"/><g fill="#f4f0e8"><circle cx="190" cy="120" r="32"/><circle cx="228" cy="112" r="44"/><circle cx="272" cy="124" r="30"/></g>',
  ),
  {
    fileName: "photo.jpg",
    stored: { width: 1200, height: 800 },
    render: (outputPath) =>
      sharp(
        svg(
          1200,
          800,
          '<defs><radialGradient id="r"><stop offset="0" stop-color="#f9d982"/><stop offset="1" stop-color="#385c74"/></radialGradient></defs><rect width="1200" height="800" fill="url(#r)"/><path d="M0 650 300 350 520 610 760 300 1200 680V800H0Z" fill="#263d3a"/>',
        ),
      )
        .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
        .toFile(outputPath),
  },
  {
    fileName: "oriented-6.jpg",
    stored: { width: 1200, height: 600 },
    oriented: { width: 600, height: 1200 },
    render: (outputPath) =>
      sharp(
        svg(
          1200,
          600,
          '<rect width="1200" height="600" fill="#eee5d6"/><path d="M120 300h820" stroke="#222" stroke-width="48"/><path d="m940 180 160 120-160 120Z" fill="#d84a4a"/>',
        ),
      )
        .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
        .withMetadata({ orientation: 6 })
        .toFile(outputPath),
  },
  {
    fileName: "unsupported.webp",
    stored: { width: 320, height: 240 },
    render: (outputPath) =>
      sharp(
        svg(
          320,
          240,
          '<rect width="320" height="240" fill="#694f8e"/><circle cx="160" cy="120" r="72" fill="#f2c14e"/>',
        ),
      )
        .webp({ lossless: true })
        .toFile(outputPath),
  },
  {
    fileName: "corrupt.jpg",
    stored: { width: 0, height: 0 },
    render: (outputPath) =>
      writeFile(
        outputPath,
        Uint8Array.from([
          0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
          0x01, 0x01, 0x00, 0x00, 0x01,
        ]),
      ),
  },
];

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

const boundary = await establishFixtureBoundary();
const outputNames = [
  ...fixtures.map(({ fileName }) => fileName),
  "manifest.json",
];

for (const outputName of outputNames) {
  await assertSafeExistingDestination(resolve(boundary.directory, outputName));
}

await assertFixtureBoundary(boundary);
const stagingDirectory = await mkdtemp(
  resolve(boundary.directory, ".fixture-stage-"),
);
const physicalStagingDirectory = await realpath(stagingDirectory);
if (!samePath(dirname(physicalStagingDirectory), boundary.directory)) {
  throw new Error("Synthetic fixture staging directory is redirected");
}
const stagingBoundary = Object.freeze({
  directory: physicalStagingDirectory,
  identity: await readDirectoryIdentity(physicalStagingDirectory),
});

const manifestEntries: Record<string, object> = {};
for (const fixture of fixtures) {
  await assertFixtureBoundary(boundary);
  await assertFixtureBoundary(stagingBoundary);
  const stagingPath = resolve(physicalStagingDirectory, fixture.fileName);
  await assertSafeExistingDestination(stagingPath);
  await fixture.render(stagingPath);
  manifestEntries[fixture.fileName] = {
    stored: fixture.stored,
    oriented: fixture.oriented ?? fixture.stored,
    sha256: await sha256File(stagingPath),
  };
}

await assertFixtureBoundary(boundary);
await assertFixtureBoundary(stagingBoundary);
await writeFile(
  resolve(physicalStagingDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedBy: "scripts/generate-fixtures.ts",
      fixtures: manifestEntries,
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", flag: "wx" },
);

for (const outputName of outputNames) {
  await assertFixtureBoundary(boundary);
  await assertFixtureBoundary(stagingBoundary);
  const finalPath = resolve(boundary.directory, outputName);
  await assertSafeExistingDestination(finalPath);
  await rename(resolve(physicalStagingDirectory, outputName), finalPath);
}

await assertFixtureBoundary(boundary);
await assertFixtureBoundary(stagingBoundary);
await rmdir(physicalStagingDirectory);

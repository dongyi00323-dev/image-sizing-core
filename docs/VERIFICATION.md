# Verification record

Date: 2026-11-06. Checks were rerun after applying the user-confirmed MIT license; all reported successful checks passed again. Environment: Windows x64, Node.js 24.16.0, npm 11.13.0; Sharp 0.35.4, libvips 8.18.6, Zod 4.6.5, TypeScript 5.9.3, Vitest 5.0.0.

The 13 TypeScript source files and 8 existing test files were extracted unchanged. Packaging/configuration, documentation and the runnable synthetic demonstration were added separately.

| Check | Result |
| --- | --- |
| `npm run typecheck` | passed, exit 0 |
| `npm run build` | passed, exit 0 |
| `npm test -- --reporter=dot` | 8 files, 88 tests passed; exit 0 |
| `node examples/synthetic-demo.mjs` after build | passed, exit 0; 6 explicit assertions described below |
| Fresh `npm ci` | not verified: npm enforced offline mode and required tarballs were not cached |

Dependencies used for execution were copied into the isolated workspace from the pre-existing local installation. `npm rebuild --ignore-scripts --offline` restored local executable links. No dependencies, generated outputs or native binaries are included in the proposed source upload. The lockfile was derived from the original lockfile and pruned using npm in offline package-lock-only mode.

Vitest's default bundled config loader initially failed with Windows `spawn EPERM` in Vite's network-drive probe. The documented test command uses Node's native config loader and a thread pool with one concurrent worker; all 88 tests then passed. No dependency code was edited.

Test distribution: render integration 19, path allocation/cleanup 12, request/errors/strategy 25, source inspection integration 5, units 19, adaptation plan 2, aspect risk 5, package smoke 1.

The synthetic demonstration generates a 600×300 PNG of geometric shapes, requests 50.8×76.2 mm at 100 DPI, and verifies 200×300 output pixels, 100 DPI metadata, a 200×100 uniformly scaled source region at (0,100), an opaque white margin, and unchanged input SHA-256. It checks conversion and output dimensions separately. The inspected PNG's SHA-256 was `ef05ea5b55f7591e0bbac57c78739d3a7e5772c40554db1f0fe944ae54f11f15` in this environment; output bytes may differ across future codec/platform builds.

Fixtures are generated from code: geometry, gradients, hand-coded text glyphs, EXIF-oriented JPEG, transparency, intentionally corrupt JPEG bytes, and a WebP rejection sample. No real customer images, fonts or shop data are used. The generated manifest records dimensions and SHA-256 locally.

Scope limits: this is not a performance benchmark, exhaustive security audit, legal rights determination, production print validation or cross-platform certification. There is no CLI end-to-end test because no complete CLI is included. Huge inputs, concurrent finalization, animation, arbitrary color spaces and every EXIF orientation are not exhaustively covered. Automated vulnerability querying was not performed in this offline dependency environment.


# Third-party notices

Checked 2026-11-06 against the installed packages and the pinned lockfile. Original project code is licensed under MIT (copyright dongyi00323-dev); third-party dependencies retain their own licenses and are not relicensed by this project's LICENSE.

| Dependency | Version | Declared license | Evidence |
| --- | --- | --- | --- |
| sharp | 0.35.4 | Apache-2.0 | [upstream license](https://github.com/lovell/sharp/blob/v0.35.4/LICENSE), [copy](third-party-licenses/sharp-Apache-2.0.txt) |
| zod | 4.6.5 | MIT | [upstream](https://github.com/colinhacks/zod), [installed license copy](third-party-licenses/zod-MIT.txt) |
| @img/sharp-win32-x64 | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later | [upstream package manifest](https://github.com/lovell/sharp/blob/v0.35.4/npm/win32-x64/package.json), [upstream notices copy](third-party-licenses/sharp-win32-x64-upstream-notices.md) |
| @img/colour | 1.1.0 | MIT | installed package manifest; resolved in lockfile |
| semver | 7.8.5 | ISC | installed package manifest; resolved in lockfile |
| detect-libc | 2.1.2 | Apache-2.0 | optional runtime dependency; resolved in lockfile |

The installed Windows package carries Sharp's Apache license text plus its README's native-library licensing table. Both are preserved unchanged under `third-party-licenses/`; no native binary is included here. The table identifies LGPLv3 usage via the “any later version” terms of LGPLv2/LGPLv2.1. Do not summarize the entire Windows binary as only “libvips LGPL-2.1”. The checked binary reports libvips **8.18.6**.

The [native version inventory](third-party-licenses/sharp-win32-x64-versions.json) records aom, archive, cairo, cgif, exif, expat, ffi, fontconfig, freetype, fribidi, glib, harfbuzz, heif, highway, imagequant, lcms, mozjpeg, pango, pixman, png, proxy-libintl, rsvg, tiff, uhdr, vips, webp, xml2 and zlib-ng. The upstream README gives the corresponding licensing families, including LGPLv3, MPL-2.0, MIT, BSD and codec-specific terms. It is retained as evidence, not replaced by a single project license.

Optional native packages for other platforms are selected by npm. They were not installed or audited as binaries in this extraction. A custom/system libvips build may contain a different set of libraries. See [Sharp installation documentation](https://sharp.pixelplumbing.com/install/).

Build/test tools: TypeScript 5.9.3 (Apache-2.0), @types/node 24.12.1 (MIT), Vitest 5.0.0 (MIT). Their dependencies are pinned in the lockfile; tools and their binaries are not included in the source publication.

When redistributing native binaries or an installer, retain required copyright/license notices and review source provision and replacement/relinking obligations against the exact shipped artifacts. The copied notices are not a complete binary distribution compliance bundle. Upstream build/source information: [sharp-libvips](https://github.com/lovell/sharp-libvips), [libvips](https://github.com/libvips/libvips).

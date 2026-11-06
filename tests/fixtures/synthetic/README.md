# Synthetic image fixtures

All files beneath `generated/` are deterministic synthetic test fixtures.
They are created by `npm run fixtures:generate`; they are not customer
material and must not be described as such.

`generated/manifest.json` records the expected stored and EXIF-oriented pixel
dimensions and SHA-256 digest for every generated file. The generator has a
fixed destination and does not read, rename, overwrite, or delete source images
outside this directory.

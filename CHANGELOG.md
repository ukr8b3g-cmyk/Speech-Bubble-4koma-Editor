# Changelog

## v0.1.10 - 2026-09-26

- Share one Page Image Library between 4-Panel Manga and free Comic workspaces.
- Migrate legacy `image-*` and `general-comic-image:*` records from the previous per-workspace IndexedDB stores.
- Save shared Page Images only once in `.sbeproj` while preserving existing image IDs and project schema compatibility.
- Aggregate Page Image count, bytes and unused cleanup across both comic workspaces.
- Port the current Forge Neo Black & White Conversion flow and terminology, including source-context aware Single Image application.
- Keep grayscale, Black & White Comic, Simple Monochrome and XDoG 100 modes with full-resolution apply.
- Distinguish Single Image, 4-Panel Manga and Comic in the conversion dialog while keeping both comic workspaces on the shared Page Image Library.
- Fix Reset so the visible Grayscale preset also restores the actual grayscale processing mode.
- Preserve explicit Single Image source context so external-file conversion cannot inherit an unrelated selected layer.

## v0.1.9 - 2026-09-24

- Port bounded streaming request readers and JSON object validation from the validated Forge Neo maintenance work.
- Bound Desktop image/JSON/project/recovery requests even when Content-Length is absent.
- Reconcile CR/LF image Data URLs with strict Base64 validation and reject oversized encoded data before decoding.
- Check image pixel limits before full Pillow allocation in editor assets, exports and background removal.
- Restore overlap/radiant speech-bubble decoration rendering that was unreachable after an early return.
- Split shared SFX/frame Asset Catalogs from the Pillow compatibility renderer and lazy-load rendering.
- Align Desktop/API/User-Agent version reporting and release metadata; release builds fail when source and Windows version metadata disagree.
- Add Windows/Linux/Chromium regression CI and maintenance documentation.
- No project schema, model, web asset URL or mandatory runtime dependency change.
- Reject oversized project image Base64 before decoding and oversized ZIP image entries before reading them into memory.
- Stop background-removal model downloads as soon as the response exceeds the expected model size.
- Remove the unused Desktop cache helper and update CI artifact upload to the current Node 24 generation.

## v0.1.8 - 2026-08-04

See the GitHub release notes and README for release features.

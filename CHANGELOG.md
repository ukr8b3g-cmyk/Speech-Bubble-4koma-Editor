# Changelog

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

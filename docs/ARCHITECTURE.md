# Architecture

## Desktop host

`desktop_app.main` starts a loopback-only FastAPI server and a WebView2/pywebview window. A random per-launch token protects non-static Desktop/editor API routes. Native dialogs, window lifecycle and the Properties/Layers tool window remain in the Desktop bridge.

## Editor support

The current UI remains `web/speech-bubble-editor.html`. `speech_bubble_editor.api` provides layout, preset, user-asset, font and export endpoints. Browser Canvas is the normal export path. `speech_bubble_editor.renderer` is retained for saved/explicit Pillow compatibility rendering and is loaded lazily.

SFX/frame discovery now lives in `speech_bubble_editor.asset_catalog`. This ports the validated Forge Neo separation while preserving the standalone-specific per-item SFX geometry and emphasis presets.

## Request boundaries

`speech_bubble_editor.request_limits` contains bounded streaming body/JSON readers. Desktop metadata endpoints use a small JSON bound, background-removal input remains capped at 96 MiB, and project/recovery JSON has an explicit 768 MiB transport ceiling to cover base64 overhead for the existing 512 MiB project archive limit. JSON roots must be objects.

## Compatibility scope

- Distribution version is 0.1.11.
- `.sbeproj`, recovery, layout, preset and user-asset schemas are unchanged.
- Existing web asset URLs and the optional model URL/SHA-256 are unchanged.
- No mandatory runtime dependency was added; CI dependencies are test-only.
- The standalone HTML shell is intentionally not split in this maintenance port. The Forge Project Editor shell differs materially from the Desktop shell, so copying that refactor would add risk without fixing a correctness issue.


## Shared Page Images

`web/shared-page-images.js` owns the document-scoped Page Image Blob store. Both structural editors receive the same `imageStore`, while panel assignment remains workspace-local. New images use `page-image:*` IDs; legacy `image-*` and `general-comic-image:*` IDs remain valid and are migrated from the old per-workspace IndexedDB stores.

Project save exports the shared library once, so a Blob reused by both 4-Panel Manga and Comic is not serialized twice. Project load restores every non-Single-Image project image into the shared store before the workspace layouts hydrate.

Deleting a Page Image removes its panel usage across both comic workspaces. Settings storage status and unused cleanup operate on the shared library rather than only the 4-panel editor.

## Black & White Conversion

The standalone `web/comic-converter.js` follows the current Forge Neo implementation. Conversion processing remains browser-local and uses a Worker for preview/full-resolution processing. Applying to Single Image carries the exact source-layer context; applying in either comic workspace inserts the result into the shared Page Image Library.

## Quick Retouch

The three browser-local `web/quick-retouch*` assets are ported from Forge commit `929752a2080f7eb8be680ad29f6868d753acf729`. The pure core and CSS remain byte-identical. Only the UI/host boundary adapts three-mode routing, explicit source context, modal event isolation and asynchronous session lifecycle. Both comic modes write through the existing shared Page Images adapter; Single Image uses `applyProcessedSingleImage(..., "quick-retouch", source)`. No new image database, API, AI model or project schema is introduced. Internal layers/masks/history are not serialized; only the flattened PNG enters the existing save/recovery pipeline.

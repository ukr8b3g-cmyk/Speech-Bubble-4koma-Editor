# Validation

Use a clean checkout and install test-only dependencies:

```powershell
python -m pip install -r requirements-ci.txt
python tools/validate_repo.py
```

The gate compiles Python, checks all JavaScript and inline desktop HTML scripts, runs pytest, runs each `tests/*_test.cjs`, and runs `git diff --check`.

GitHub Actions runs the core gate on Windows/Python 3.13 and Ubuntu/Python 3.10. A separate Ubuntu Chromium job starts the real loopback Desktop FastAPI app with a temporary data directory and verifies the current HTML shell, Desktop fetch authentication and health/config APIs. Linux installs a Japanese CJK font for Pillow renderer coverage.

## 2026-09-24 maintenance coverage

Regression coverage includes chunked body limits, JSON object validation, CR/LF Data URLs, version consistency, lazy Pillow renderer loading, early pixel-limit checks, Desktop API limits, overlap/radiant bubble decorations and a real browser startup smoke.

## Manual Windows release checks

CI does not replace the packaged WebView2/Windows check. Before publishing a new binary release verify:

1. EXE/start.cmd launch, second-launch focus and normal close/Alt+F4 handling.
2. New/open/save `.sbeproj`, recovery after restart and recent-project list.
3. Single Image, 4-panel and free Comic workspaces, image import/crop and Undo/Redo.
4. Background removal with the real ONNX model and final image export.
5. Japanese/system fonts, user presets/SFX/stamps, Properties/Layers external palette.
6. Installer/EXE FileVersion/ProductVersion and generated SHA256SUMS.

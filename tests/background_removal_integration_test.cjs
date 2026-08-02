"use strict";

const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("web/speech-bubble-editor.html", "utf8");
const script = fs.readFileSync("web/background-removal.js", "utf8");
const css = fs.readFileSync("web/background-removal.css", "utf8");
const shell = fs.readFileSync("web/desktop/desktop-shell.js", "utf8");
const settingsStore = fs.readFileSync("desktop_app/settings_store.py", "utf8");
const server = fs.readFileSync("desktop_app/server.py", "utf8");
const service = fs.readFileSync("desktop_app/background_removal.py", "utf8");
const spec = fs.readFileSync("SpeechBubble4komaEditor.spec", "utf8");
const requirements = fs.readFileSync("requirements-desktop.txt", "utf8");

for (const asset of ["background-removal.css", "background-removal.js"]) assert.match(html, new RegExp(asset.replace(".", "\\.")));
assert.match(html, /data-background-removal-open/);
assert.match(html, /initializeBackgroundRemoval/);
assert.match(html, /getComicSources:[\s\S]*getConversionSources/);
assert.match(html, /addPageImage:[\s\S]*addConvertedImage/);
assert.match(html, /applySingleImage:[\s\S]*displayImageBlob/);

for (const feature of [
  "data-br-tool=\"keep\"",
  "data-br-tool=\"erase\"",
  "data-br-brush-hardness",
  "data-br-brush-hardness-number",
  "data-br-action=\"undo\"",
  "data-br-action=\"redo\"",
  "data-br-action=\"reset-mask\"",
  "data-br-mask-mode=\"auto\"",
  "data-br-mask-mode=\"guided\"",
  "data-br-action=\"run-mask\"",
  "data-br-process-state",
  "data-br-fill-holes",
  "data-br-remove-small",
  "data-br-morph",
  "data-br-feather",
  "data-br-view",
  "DEFAULT_HISTORY_LIMIT = 24",
  "Right-drag: change size",
]) assert.ok(script.includes(feature), `background removal UI must include ${feature}`);

assert.match(script, /function clientToImagePoint/);
assert.match(script, /function updateBrushCursor/);
assert.match(script, /data-br-brush-hardness type="range" min="0" max="100" value="100"/);
assert.match(script, /brushHardness: \["ブラシの硬さ", "Brush Hardness"\]/);
assert.match(script, /const hardness = clamp\(Number\(brushHardnessInput\.value\) \|\| 0, 0, 100\) \/ 100/);
assert.match(script, /hardness >= 0\.999 \|\| normalizedDistance <= hardness[\s\S]*\? 1/);
assert.match(script, /bindRangeAndNumber\(brushHardnessInput, brushHardnessNumber, 0, 100, scheduleRender\)/);
assert.doesNotMatch(script, /edge \* 1\.8/);
assert.match(script, /brushResizeState = \{ pointerId: event\.pointerId, startClientX: event\.clientX, startSize:/);
assert.match(script, /brushResizeState\.startSize \+ \(event\.clientX - brushResizeState\.startClientX\)/);
assert.doesNotMatch(script, /brushResizeState\.(?:startClientY|deltaY)/);
assert.match(script, /\[\[sourceViewport, false\], \[resultViewport, true\]\]/);
assert.match(script, /setScale\(view\.scale \* [\s\S]*event\.clientX, event\.clientY, viewport/);
assert.doesNotMatch(script, /prompt\(/);

assert.match(script, /candidates\.find\(\(candidate\) => candidate\.selected\) \|\| null/);
assert.match(script, /fetch\("\/desktop\/background-removal\/infer"/);
assert.match(script, /let maskMode = "auto"/);
assert.match(script, /maskModeStates = \{ auto: null, guided: null \}/);
assert.match(script, /function initializeGuideMasks\(\)/);
assert.match(script, /function saveActiveMaskModeState\(\)/);
assert.match(script, /async function selectMaskMode\(nextMode\)/);
assert.match(script, /function applyGuidedResult\(\)/);
assert.match(script, /editedMask\[index\] = Math\.max\(editedMask\[index\], guideKeepMask\[index\]\)/);
assert.match(script, /editedMask\[index\] = Math\.min\(editedMask\[index\], 255 - guideRemoveMask\[index\]\)/);
assert.match(script, /requestRevision !== inferenceRevision[\s\S]*maskMode !== targetMode/);
assert.match(script, /自動マスクを初期状態に戻す/);
assert.match(script, /範囲指定をリセット/);
assert.match(script, /範囲指定（緑：残す／赤：消す）/);
assert.match(css, /\.background-removal-mask-mode[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /data-br-mask-mode="auto"[\s\S]*background: #343b45/);
assert.match(css, /data-br-mask-mode="guided"[\s\S]*background: #b96f24/);
assert.match(css, /\.background-removal-run-mask\.guided[\s\S]*background: #2f8654/);
assert.match(css, /data-mask-mode="guided"[\s\S]*data-br-tool="keep"[\s\S]*background: #2f8654/);
assert.match(css, /data-mask-mode="guided"[\s\S]*data-br-tool="erase"[\s\S]*background: #a83f3f/);
assert.match(script, /guidedDirty = true/);
assert.match(script, /guidedProcessed && !guidedDirty \? "guidedApplied" : "guidedPending"/);
assert.match(script, /runTextKey = processingRunning[\s\S]*rerunAutomatic[\s\S]*runAutomatic/);
assert.match(script, /指定内容は未反映/);
assert.match(script, /指定内容を反映済み/);
assert.doesNotMatch(script, /data-br-mask-mode="manual"|fullyVisibleMask|resetManualMask/);
assert.match(script, /options\.getMode\(\) === "comic"[\s\S]*options\.addPageImage[\s\S]*options\.applySingleImage/);
assert.match(css, /dialog\.background-removal-dialog\.maximized/);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.background-removal-result-canvas/);
assert.match(css, /\.background-removal-brush-cursor::before/);
assert.match(css, /\.background-removal-footer[\s\S]*justify-content: flex-end/);
assert.doesNotMatch(css, /\.background-removal-viewport\.checkerboard/);
assert.doesNotMatch(css, /#0f7[0-9a-f]{3}/i);

for (const route of [
  "/desktop/background-removal/model",
  "/desktop/background-removal/model/download",
  "/desktop/background-removal/model/cancel",
  "/desktop/background-removal/infer",
]) assert.ok(server.includes(route), `Desktop API must include ${route}`);

assert.match(service, /MODEL_SHA256 = "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99"/);
assert.match(service, /providers=\["CPUExecutionProvider"\]/);
assert.match(service, /os\.replace\(self\.partial_path, self\.model_path\)/);
assert.match(service, /self\._session = ort\.InferenceSession/);
assert.match(requirements, /onnxruntime/);
assert.match(spec, /collect_submodules\("onnxruntime"\)/);
assert.match(shell, /data-desktop-background-model-status/);
assert.doesNotMatch(shell, /data-desktop-setting="background_removal_history_limit"/);
assert.doesNotMatch(settingsStore, /DEFAULTS\s*=\s*\{[\s\S]*?"background_removal_history_limit"\s*:/);
assert.match(settingsStore, /merged\.pop\("background_removal_history_limit", None\)/);
assert.doesNotMatch(server, /backgroundRemovalHistoryLimit/);
assert.doesNotMatch(html, /getHistoryLimit|backgroundRemovalHistoryLimit/);
assert.match(script, /Restore Brush/);
assert.match(script, /Eraser Tool/);
assert.match(css, /width:\s*16px;[\s\S]*height:\s*16px/);
assert.doesNotMatch(html, /data-comic-converter-source-summary/);

console.log("background_removal_integration_test: OK");

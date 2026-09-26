"""One-shot, guarded port. This helper is excluded from the deliverable commit."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

BASE = "192623f17dc054101f8ef4a6ea5926b12c1a7f90"
DONOR = "929752a2080f7eb8be680ad29f6868d753acf729"
root, donor, seed = (Path(value).resolve() for value in sys.argv[1:4])


def git(path: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(path), *args], text=True).strip()


def read(path: str) -> str:
    return (root / path).read_text(encoding="utf-8")


changed: list[str] = []


def write(path: str, text: str) -> None:
    destination = root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text, encoding="utf-8", newline="\n")
    if path not in changed:
        changed.append(path)


def once(text: str, before: str, after: str) -> str:
    if text.count(before) != 1:
        raise RuntimeError(f"Expected one anchor, got {text.count(before)}: {before[:140]!r}")
    return text.replace(before, after, 1)


assert git(root, "rev-parse", "HEAD") == BASE
assert git(donor, "rev-parse", "HEAD") == DONOR
assert not git(root, "status", "--porcelain"), "The target checkout must be clean"
for rel in git(root, "ls-files").splitlines():
    if Path(rel).name in {"AGENTS.md", "CLAUDE.md"}:
        raise RuntimeError(f"Review repository instructions before porting: {rel}\n{read(rel)}")

hashes = {
    "quick-retouch-core.js": "e20a3ac3425efaf4d394fb909500656265523004",
    "quick-retouch.js": "5f266f5df14569f5bd9fa3463d2dcaba9dcdc945",
    "quick-retouch.css": "ef380b1f2c1bd2119aded5a1184e9df6ad10186a",
}
for name, expected in hashes.items():
    data = (donor / "web/project" / name).read_bytes()
    actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    assert actual == expected, f"Donor changed: {name} {actual}"
    write(f"web/{name}", data.decode("utf-8"))

# Keep the complete drawing/selection/adjustment engine. Adapt its host boundary.
js = read("web/quick-retouch.js")
js = once(js, '    let source = null;', '''    // Session identity prevents late image decodes from leaking into another document.
    let sessionGeneration = 0;
    let sourceLoadGeneration = 0;
    let sessionMode = "single";
    let sessionDocumentId = "";
    let applying = false;
    let source = null;''')
js = once(js, '''    function currentMode() {
      return options.getMode?.() === "comic" ? "comic" : "single";
    }''', '''    function hostMode() {
      const mode = options.getMode?.();
      return ["single", "comic", "comic_layout"].includes(mode) ? mode : "single";
    }

    function currentMode() {
      return dialog.open ? sessionMode : hostMode();
    }

    function isPageImageMode() {
      return currentMode() !== "single";
    }

    function currentModeLabel() {
      const mode = currentMode();
      if (mode === "comic_layout") return tr("コミック", "Comic");
      if (mode === "comic") return tr("4コマ漫画", "4-Panel Manga");
      return tr("一枚画像", "Single Image");
    }

    function releaseSession() {
      sessionGeneration += 1;
      sourceLoadGeneration += 1;
      previewRevision += 1;
      colorRangeRecalcGeneration += 1;
      clearTimeout(previewTimer);
      clearTimeout(brushSizeTimer);
      clearTimeout(colorRangeRecalcTimer);
      if (brushRingFrame) cancelAnimationFrame(brushRingFrame);
      brushRingFrame = 0;
      sourceBitmap?.close?.();
      sourceBitmap = null;
      for (const canvas of [sourceCanvas, baseCanvas, selectionCanvas,
        ...layers.flatMap(layer => [layer.canvas, layer.mask])]) {
        if (canvas) canvas.width = canvas.height = 1;
      }
      source = sourceCanvas = baseCanvas = selectionCanvas = sourceImageData = null;
      previewData = initialDocumentSnapshot = lastDeselectedSelection = null;
      pendingColorRangeMask = colorRangeBaseSelection = null;
      layers = []; history = []; redo = [];
      colorRangeSamples = []; colorRangeExcluded = [];
      pointerState = null; lassoPoints = [];
      clearSourceCandidateUrls();
      sourceCandidatesHost.replaceChildren();
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = "";
      sourceThumb.style.backgroundImage = "";
      originalCanvas.width = originalCanvas.height = 1;
      resultCanvas.width = resultCanvas.height = 1;
      applyButton.disabled = true;
    }

    async function loadSource(next) {
      try { return await setSource(next); }
      catch (error) {
        setStatus(String(error?.message || error), "error");
        applyButton.disabled = !source;
        return false;
      }
    }''')
assert js.count('currentMode() === "comic"') == 4
js = js.replace('currentMode() === "comic"', 'isPageImageMode()')
js = once(js, '          <span data-retouch-document></span>', '          <span data-retouch-mode></span>\n          <span data-retouch-document></span>')
js = once(js, '    function applyLanguage() {', '''    function applyLanguage() {
      dialog.querySelector("[data-retouch-mode]").textContent = currentModeLabel();''')
js = js.replace('ページ画像・画像トレイから選ぶか、画像ファイルを読み込んでください。', 'ページ画像から選ぶか、画像ファイルを読み込んでください。')
js = js.replace('Choose a Page Image / Image Tray item, or load an image file.', 'Choose a Page Image, or load an image file.')
js = js.replace('source_kind: "external"', 'source_kind: "external-file"')
js = once(js, '''    async function setSource(next) {
      if (!next?.blob) return false;
      sourceBitmap?.close?.();
      sourceBitmap = await blobImage(next.blob);''', '''    async function setSource(next) {
      if (!next?.blob || !dialog.open || applying) return false;
      if (!(next.blob instanceof Blob) || !next.blob.size || next.blob.size > 96 * 1024 * 1024) {
        throw new Error(tr("画像が空、または96 MiBを超えています。", "The image is empty or exceeds 96 MiB."));
      }
      const session = sessionGeneration;
      const load = ++sourceLoadGeneration;
      applyButton.disabled = true;
      const bitmap = await blobImage(next.blob);
      if (!dialog.open || session !== sessionGeneration || load !== sourceLoadGeneration) {
        bitmap.close?.();
        return false;
      }
      sourceBitmap?.close?.();
      sourceBitmap = bitmap;''')
# User-driven source changes must report decode failures instead of unhandled promises.
js = js.replace('await setSource({ blob: file,', 'await loadSource({ blob: file,')
js = once(js, 'event.stopPropagation(); await setSource(candidate);', 'event.stopPropagation(); await loadSource(candidate);')
js = once(js, '''    function openDialog() {
      applyLanguage();''', '''    function openDialog() {
      if (dialog.open || applying) return;
      releaseSession();
      sessionMode = hostMode();
      sessionDocumentId = String(options.getDocumentId?.() || "");
      applyLanguage();''')
js = once(js, '''    function closeDialog() {
      if (!dialog.open) return;''', '''    function closeDialog(force = false) {
      if (!dialog.open || (applying && force !== true)) return;''')
js = once(js, '''    dialog.addEventListener("close", () => {
      brushRing.classList.remove''', '''    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      releaseSession();
      brushRing.classList.remove''')
js = once(js, '''    async function applyResult() {
      if (!source) return;''', '''    async function applyResult() {
      if (!source || applying || !dialog.open) return;
      applying = true;
      const session = sessionGeneration;
      dialog.querySelector(".quick-retouch-window").inert = true;''')
js = once(js, '''        const { blob, elapsed } = await renderFullBlob();
        const name =''', '''        if (session !== sessionGeneration || !dialog.open) return;
        const { blob, elapsed } = await renderFullBlob();
        if (session !== sessionGeneration || !dialog.open || hostMode() !== sessionMode ||
            String(options.getDocumentId?.() || "") !== sessionDocumentId) {
          throw new Error(tr("編集対象が変わったため適用を中止しました。", "The editing document changed; apply was cancelled."));
        }
        const name =''')
js = once(js, '''        closeDialog();
      } catch (error) {''', '''        closeDialog(true);
      } catch (error) {''')
js = once(js, '''      } finally {
        applyButton.disabled = !source;''', '''      } finally {
        applying = false;
        dialog.querySelector(".quick-retouch-window").inert = false;
        applyButton.disabled = !source;''')
# A modal must own shortcuts; the host's Undo/Delete/Paste must not run underneath.
for event in ("keydown", "keyup"):
    before = f'    root.addEventListener("{event}", (event) => {{\n      if (!dialog.open) return;'
    after = f'    dialog.addEventListener("{event}", (event) => {{\n      if (!dialog.open) return;\n      event.stopPropagation();\n      if (applying) {{ event.preventDefault(); return; }}'
    js = once(js, before, after)
js = once(js, '    launcher.addEventListener("click", openDialog);', '''    dialog.addEventListener("drop", event => event.stopPropagation());
    dialog.addEventListener("paste", async event => {
      if (!dialog.open) return;
      event.stopPropagation();
      if (applying || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const entry = [...(event.clipboardData?.items || [])].find(item => item.kind === "file" && /^image\\/(png|jpeg|webp)$/i.test(item.type));
      const file = entry?.getAsFile?.();
      if (!file) return;
      event.preventDefault();
      await loadSource({blob:file, name:file.name || "clipboard-image.png", source_kind:"external-file"});
    });
    launcher.addEventListener("click", openDialog);''')
js = once(js, '      dispose() {\n        clearTimeout(previewTimer);', '      dispose() {\n        releaseSession();\n        clearTimeout(previewTimer);')
write("web/quick-retouch.js", js)

# Integrate without importing Forge's shell, storage, Python services or schemas.
html = read("web/speech-bubble-editor.html")
html = once(html, '  <script src="./project-schema.js', '  <link rel="stylesheet" href="./quick-retouch.css?v=standalone-quick-retouch-1">\n  <script src="./quick-retouch-core.js?v=standalone-quick-retouch-1"></script>\n  <script src="./quick-retouch.js?v=standalone-quick-retouch-1"></script>\n  <script src="./project-schema.js')
converter_block = re.search(r'      <details class="left-section comic-converter-launcher"[\s\S]*?</details>', html)
background_block = re.search(r'      <details class="left-section background-removal-launcher"[\s\S]*?</details>', html)
assert converter_block and background_block
start, end = min(converter_block.start(), background_block.start()), max(converter_block.end(), background_block.end())
expected_between = html[start:end]
assert expected_between.strip() == (converter_block.group() + '\n' + background_block.group()).strip()
quick_block = '''      <details class="left-section quick-retouch-launcher" data-left-section="quick-retouch" open>
        <summary>簡易レタッチ</summary>
        <button type="button" data-quick-retouch-open>簡易レタッチを開く</button>
      </details>'''
html = html[:start] + background_block.group() + '\n' + converter_block.group() + '\n' + quick_block + html[end:]
html = once(html, 'backgroundRemoval=null,comicOverlayExport=false;', 'backgroundRemoval=null,quickRetouch=null,comicOverlayExport=false;')
adapter = '''    function initializeQuickRetouch(){
      if(quickRetouch||!window.SpeechBubbleQuickRetouch)return quickRetouch;
      quickRetouch=window.SpeechBubbleQuickRetouch.create({
        getMode:()=>activeWorkspace,
        getDocumentId:()=>documentId,
        getSingleSource:selectedSingleImageSource,
        getComicSources:()=>activeStructuralEditor()?.getConversionSources?.()||Promise.resolve([]),
        addPageImage:(blob,name)=>activeStructuralEditor()?.addConvertedImage?.(blob,name),
        applySingleImage:(blob,name,source)=>applyProcessedSingleImage(blob,name||"image-retouched.png","quick-retouch",source),
        setStatus:setSaveState,
      });
      return quickRetouch;
    }
'''
html = once(html, '    function initializeComicConverter(){', adapter + '    function initializeComicConverter(){')
html = once(html, '<button id="processLayerBackgroundRemoval" hidden>', '<button id="processLayerQuickRetouch" hidden>この画像を簡易レタッチ</button><button id="processLayerBackgroundRemoval" hidden>')
html = once(html, 'document.getElementById("processLayerBackgroundRemoval").hidden=!imageSelected;', 'document.getElementById("processLayerQuickRetouch").hidden=!imageSelected;document.getElementById("processLayerBackgroundRemoval").hidden=!imageSelected;')
html = once(html, '    document.getElementById("processLayerBackgroundRemoval").onclick=', '''    document.getElementById("processLayerQuickRetouch").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");if(selectedSingleImageLayer())initializeQuickRetouch()?.open?.();};
    document.getElementById("processLayerBackgroundRemoval").onclick=''')
assert html.count('initializeBackgroundRemoval();') == 1
html = once(html, 'initializeBackgroundRemoval();', 'initializeBackgroundRemoval();initializeQuickRetouch();')
# Do not regress v0.1.10's explicit external-file source-context protection.
assert 'sourceContext?null:' in html
assert '"comic-conversion",source)' in html
write("web/speech-bubble-editor.html", html)

shell = read("web/desktop/desktop-shell.js")
shell = once(shell, '    ["白黒変換", "Black & White Conversion"],', '''    ["簡易レタッチ", "Quick Retouch"],
    ["簡易レタッチを開く", "Open Quick Retouch"],
    ["この画像を簡易レタッチ", "Quick Retouch This Image"],
    ["白黒変換", "Black & White Conversion"],''')
write("web/desktop/desktop-shell.js", shell)

# Reuse upstream behavior tests; only replace host-specific integration contracts.
for name in ("quick_retouch_core_test.cjs", "quick_retouch_browser_harness.html", "quick_retouch_browser_smoke.cjs", "quick_retouch_simplified_ui_test.cjs", "quick_retouch_integration_test.cjs"):
    text = (donor / "tests" / name).read_text(encoding="utf-8")
    text = text.replace("../web/project/quick-retouch", "../web/quick-retouch").replace("web/project/quick-retouch", "web/quick-retouch")
    text = text.replace('require("./read_editor_source.cjs")("web/project-editor.html")', 'fs.readFileSync("web/speech-bubble-editor.html", "utf8")')
    text = text.replace('quick-retouch-078-compact-controls-1', 'standalone-quick-retouch-1')
    lines = text.splitlines()
    lines = [line for line in lines if not any(line.startswith(prefix) for prefix in (
        'const projectApi =', 'const projectBridge =', 'const projectSchema =', 'const projectStore =',
        'assert.match(projectApi,', 'assert.match(projectBridge,', 'assert.match(projectSchema,', 'assert.match(projectStore,'
    )) and 'metadata\\?\\.source === "quick-retouch"' not in line]
    text = '\n'.join(lines) + '\n'
    if name == "quick_retouch_integration_test.cjs":
        text += '''\nassert.match(editor, /getMode:\\(\\)=>activeWorkspace/);
assert.match(editor, /getDocumentId:\\(\\)=>documentId/);
assert.match(editor, /activeStructuralEditor\\(\\)\\?\\.addConvertedImage/);
assert.match(editor, /sourceContext\\?null:/);
assert.match(quickRetouch, /comic_layout/);
assert.match(quickRetouch, /sessionGeneration/);
assert.match(quickRetouch, /dialog\\.addEventListener\\("keydown"/);
assert.match(quickRetouch, /event\\.stopPropagation\\(\\)/);
assert.match(quickRetouch, /releaseSession/);
assert.doesNotMatch(quickRetouch, /indexedDB/);
'''
    write("tests/" + name, text)

write("tests/quick_retouch_desktop_gate.cjs", (seed / "tools/quick_retouch_desktop_gate.cjs").read_text(encoding="utf-8"))
smoke = read("tests/desktop_browser_smoke.cjs")
smoke = once(smoke, '    assert.deepEqual(pageErrors, []);', '    await require("./quick_retouch_desktop_gate.cjs")(page);\n    assert.deepEqual(pageErrors, []);')
write("tests/desktop_browser_smoke.cjs", smoke)
workflow = read(".github/workflows/validate.yml")
workflow = once(workflow, '      - run: node tests/desktop_browser_smoke.cjs', '      - run: node tests/quick_retouch_browser_smoke.cjs\n      - run: node tests/desktop_browser_smoke.cjs')
write(".github/workflows/validate.yml", workflow)

readme = read("README.md")
section = '''## 簡易レタッチ（ソース版 / Unreleased）

左パネルは「背景削除 → 白黒変換 → 簡易レタッチ」の順です。紫色の「簡易レタッチを開く」、または一枚画像の画像レイヤーメニュー「この画像を簡易レタッチ」から開始します。

ブラシ・消しゴム・スポイト、投げ縄・長方形・楕円・自動選択・色から選択、選択の追加／削除／交差／反転／ぼかし／拡張／縮小、Quick Maskを利用できます。ペイントレイヤーと、色相・彩度、明るさ・コントラスト・ガンマ、RGB／各色トーンカーブの調整レイヤーを重ねられます。表示、不透明度、複製、削除、並び替え、調整レイヤーマスクも編集できます。

プレビューは長辺920px、適用時は元解像度のPNGです。一枚画像では元画像を残して新しい画像レイヤーを追加し、処理元レイヤーの位置・サイズ・回転等を継承します。外部画像は無関係な選択レイヤーの変形を継承しません。4コマ漫画とコミックでは共通Page Imagesへ追加し、コマへ自動配置しません。

Quick Retouch内部のUndoは最大32段階・512 MiBを目安とする既存履歴制限を維持します（画像・描画バッファを含む総メモリ上限ではありません）。「開始時に戻す」もUndo可能です。キャンセル・閉じるでは本体に反映せず、編集中の画像・マスク・履歴はメモリから解放します。ウィンドウ・パネル位置とツール設定だけを保存します。

`.sbeproj`には適用済みPNGと本体の編集状態を保存します。簡易レタッチ内のペイント／調整レイヤー・マスク・Undo履歴は保存されず、再度開く際は画像から新しく編集します。AIモデル、追加Python依存、外部画像送信はありません。公開済みv0.1.10インストーラーには、このUnreleased機能は含まれません。

'''
readme = once(readme, '## 白黒変換\n', section + '## 白黒変換\n')
write("README.md", readme)
changelog = read("CHANGELOG.md")
changelog = once(changelog, '# Changelog\n', '''# Changelog

## Unreleased

- Port the complete Forge Neo Quick Retouch 0.7.10 tools into the standalone editor.
- Preserve Single Image / 4-Panel Manga / Comic routing and shared Page Images output.
- Preserve source transforms only for the explicitly selected Single Image source layer.
- Keep full-resolution PNG apply, internal selection/paint/adjustment layers and session-only Undo.
- Isolate modal shortcuts, paste/drop events and asynchronous source loading from the main editor.
- Release image buffers and history on close; preserve UI/tool preferences only.
- Add upstream core/UI regressions and real Desktop cross-workspace retouch tests.
- Distribution version and existing Windows release assets are unchanged.
''')
write("CHANGELOG.md", changelog)
architecture = read("docs/ARCHITECTURE.md")
architecture += f'''\n## Standalone Quick Retouch\n\nThe core and CSS are imported unchanged from `ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo` commit `{DONOR}`. `web/quick-retouch.js` retains the full upstream tools, with standalone three-workspace routing, document/session guards and modal event isolation. `initializeQuickRetouch()` in the existing HTML shell uses `selectedSingleImageSource`, `applyProcessedSingleImage` and the active structural editor's existing shared Page Image adapter. No second image store, Forge bridge, server endpoint, project schema change or runtime dependency is introduced.\n\nOnly the final full-resolution PNG is persisted by the host. Paint/adjustment layers, selection masks and undo/redo buffers are local to the open retouch session and released on close. Tool preferences and panel geometry use localStorage, not image data. The 512 MiB upstream Undo budget is not a total-process memory bound.\n\nCore donor Git blob: `{hashes['quick-retouch-core.js']}`. CSS donor Git blob: `{hashes['quick-retouch.css']}`. New installer/release publication remains a separate step.\n'''
write("docs/ARCHITECTURE.md", architecture)

# Scope guard: delivery excludes this one-shot helper and its workflow.
protected = ["web/shared-page-images.js", "web/comic-converter.js", "web/background-removal.js", "web/comic-editor.js", "web/general-comic-editor.js", "desktop_app/version.py", ".github/workflows/release.yml"]
for path in protected:
    assert not git(root, "diff", "--", path), f"Unexpected protected-file change: {path}"
(root / "port-files.json").write_text(json.dumps(changed, indent=2), encoding="utf-8")
print(json.dumps({"base": BASE, "donor": DONOR, "files": changed}, indent=2))

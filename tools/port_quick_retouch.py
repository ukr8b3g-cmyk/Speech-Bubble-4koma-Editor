"""One-time, pinned Quick Retouch port. No runtime dependency changes."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = "929752a2080f7eb8be680ad29f6868d753acf729"
BASE = "192623f17dc054101f8ef4a6ea5926b12c1a7f90"
REPO = "ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo"
HASHES = {
    "quick-retouch-core.js": "e20a3ac3425efaf4d394fb909500656265523004",
    "quick-retouch.js": "5f266f5df14569f5bd9fa3463d2dcaba9dcdc945",
    "quick-retouch.css": "ef380b1f2c1bd2119aded5a1184e9df6ad10186a",
}
CHANGED: dict[str, str] = {}


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def once(s: str, old: str, new: str) -> str:
    if s.count(old) != 1:
        raise RuntimeError(f"Expected one match ({s.count(old)}): {old[:160]}")
    return s.replace(old, new, 1)


def upstream(path: str) -> str:
    url = f"https://raw.githubusercontent.com/{REPO}/{UPSTREAM}/{path}"
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = response.read(2 * 1024 * 1024)
    expected = HASHES.get(Path(path).name)
    actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if expected and actual != expected:
        raise RuntimeError(f"Upstream blob mismatch for {path}: {actual}")
    return raw.decode("utf-8")


def keyboard_guard(s: str) -> str:
    # Let the retouch dialog own its shortcuts, not the underlying editor.
    pattern = r'((?:window|root|document)\.addEventListener\("(?:keydown|keyup|paste)",\s*(?:async\s*)?\(?([a-zA-Z_$][\w$]*)\)?\s*=>\s*\{)'
    return re.sub(pattern, lambda m: m[1] + '\n      if(document.querySelector("dialog.quick-retouch-dialog[open]"))return;\n', s)


def patch_quick(s: str) -> str:
    s = once(s, '    function currentMode() {\n      return options.getMode?.() === "comic" ? "comic" : "single";\n    }', '''    let sourceRevision = 0;
    let applying = false;
    let committing = false;

    function currentMode() {
      const mode = options.getMode?.();
      return mode === "comic_layout" ? "comic_layout" : mode === "comic" ? "comic" : "single";
    }
    function isPageImageMode() { return currentMode() !== "single"; }
    function modeLabel() {
      const mode = currentMode();
      return mode === "comic_layout" ? tr("コミック", "Comic")
        : mode === "comic" ? tr("4コマ漫画", "4-Panel Manga") : tr("一枚画像", "Single Image");
    }
    function setApplying(value) {
      applying = value;
      for (const selector of [".quick-retouch-body", ".quick-retouch-tool-options", ".quick-retouch-source-bar", ".quick-retouch-source-picker"])
        dialog.querySelector(selector).inert = value;
      dialog.querySelector('[data-retouch-action="reset"]').disabled = value || !source;
      applyButton.disabled = value || !source;
    }
    function releaseDocument() {
      ++sourceRevision;
      ++previewRevision;
      ++colorRangeRecalcGeneration;
      clearTimeout(previewTimer);
      clearTimeout(brushSizeTimer);
      sourceBitmap?.close?.(); sourceBitmap = null;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = ""; clearSourceCandidateUrls();
      source = null; sourceCanvas = null; baseCanvas = null;
      selectionCanvas = null; sourceImageData = null; previewData = null;
      layers = []; history = []; redo = []; initialDocumentSnapshot = null;
      pendingColorRangeMask = null; colorRangeBaseSelection = null; lastDeselectedSelection = null;
      originalCanvas.width = resultCanvas.width = 1;
      originalCanvas.height = resultCanvas.height = 1;
      sourceThumb.style.backgroundImage = "";
      setApplying(false); syncUndoButtons();
    }''')
    s = s.replace('currentMode() === "comic"', 'isPageImageMode()')
    s = once(s, '<span data-retouch-document></span>', '<span data-retouch-mode></span><span data-retouch-document></span>')
    s = once(s, '    function applyLanguage() {', '    function applyLanguage() {\n      dialog.querySelector("[data-retouch-mode]").textContent = modeLabel();')
    s = s.replace('ページ画像・画像トレイから選ぶか、画像ファイルを読み込んでください。', 'ページ画像から選ぶか、画像ファイルを読み込んでください。')
    s = s.replace('Choose a Page Image / Image Tray item, or load an image file.', 'Choose a Page Image, or load an image file.')
    s = s.replace('source_kind: "external"', 'source_kind: "external-file"')
    s = once(s, '''      if (!next?.blob) return false;
      sourceBitmap?.close?.();
      sourceBitmap = await blobImage(next.blob);''', '''      if (!next?.blob || applying || !dialog.open) return false;
      const revision = ++sourceRevision;
      applyButton.disabled = true;
      let bitmap;
      try {
        if (!next.blob.size || next.blob.size > 96 * 1024 * 1024) throw new Error(tr("空でない96 MiB以下の画像を指定してください。", "Choose a non-empty image no larger than 96 MiB."));
        bitmap = await blobImage(next.blob);
      } catch (error) {
        if (revision === sourceRevision) setStatus(String(error?.message || error), "error");
        return false;
      }
      if (revision !== sourceRevision || !dialog.open) { bitmap.close?.(); return false; }
      sourceBitmap?.close?.();
      sourceBitmap = bitmap;''')
    s = once(s, '      applyButton.disabled = false;\n      const initialPaint', '      setApplying(false);\n      const initialPaint')
    s = once(s, '''    async function refreshSource() {
      const candidates = await sourceCandidates();''', '''    async function refreshSource() {
      const revision = sourceRevision;
      const candidates = await sourceCandidates();
      if (!dialog.open || revision !== sourceRevision) return false;''')
    start = s.index('    async function applyResult() {')
    end = s.index('    function resetDocument() {', start)
    s = s[:start] + '''    async function applyResult() {
      if (!source || applying || !dialog.open) return;
      const revision = sourceRevision, origin = source, mode = currentMode();
      const documentId = options.getDocumentId?.();
      const isCurrent = () => dialog.open && revision === sourceRevision;
      setApplying(true);
      applyButton.textContent = tr("適用中…", "Applying…");
      setStatus(tr("元解像度でレタッチ結果を生成しています…", "Rendering the retouch result at full resolution…"));
      try {
        await new Promise(resolve => setTimeout(resolve, 20));
        if (!isCurrent()) return;
        const { blob, elapsed } = await renderFullBlob();
        if (!isCurrent()) return;
        if (mode !== currentMode() || documentId !== options.getDocumentId?.())
          throw new Error(tr("編集先が変わりました。画像を選び直してください。", "The destination changed. Reopen the source image."));
        const name = `${origin.name}-retouched.png`;
        committing = true;
        if (mode !== "single") {
          const id = await options.addPageImage?.(blob, name, origin);
          if (!id) throw new Error(tr("ページ画像へ追加できませんでした。", "Could not add the result to Page Images."));
          options.setStatus?.(tr(`${name}をページ画像へ追加しました。`, `${name} was added to Page Images.`), "saved");
        } else {
          const applied = await options.applySingleImage?.(blob, name, origin);
          if (!applied) throw new Error(tr("一枚画像へ適用できませんでした。", "Could not apply the result to Single Image."));
          options.setStatus?.(tr("簡易レタッチ結果を新しい画像レイヤーへ適用しました。", "Quick Retouch was applied as a new image layer."), "saved");
        }
        committing = false;
        setStatus(tr(`適用完了（${(elapsed / 1000).toFixed(1)}秒）`, `Applied in ${(elapsed / 1000).toFixed(1)} seconds.`), "ready");
        closeDialog();
      } catch (error) {
        if (isCurrent()) setStatus(String(error?.message || error), "error");
      } finally {
        committing = false;
        if (isCurrent()) {
          setApplying(false);
          applyButton.textContent = isPageImageMode()
            ? tr("新しいページ画像として適用", "Apply as New Page Image")
            : tr("一枚画像へ適用", "Apply to Single Image");
        }
      }
    }

''' + s[end:]
    s = once(s, '    function openDialog() {\n      applyLanguage();', '    function openDialog() {\n      if (dialog.open) return;\n      releaseDocument();\n      applyLanguage();')
    s = once(s, '    function closeDialog() {\n      if (!dialog.open) return;', '    function closeDialog() {\n      if (!dialog.open || committing) return;')
    s = once(s, '      saveSettings();\n      dialog.close();', '      saveSettings();\n      ++sourceRevision;\n      dialog.close();')
    s = once(s, '    dialog.addEventListener("close", () => {', '    dialog.addEventListener("close", () => {\n      if (dialog.open) return;\n      releaseDocument();')
    s = once(s, '      if (!source) return;\n      if (event.button === 1)', '      if (!source || applying) return;\n      if (event.button === 1)')
    s = once(s, '        const operation = effectiveSelectionOperation(event);\n        setTimeout(() => {', '        const operation = effectiveSelectionOperation(event);\n        const revision = sourceRevision;\n        setTimeout(() => {\n          if (!dialog.open || revision !== sourceRevision || !source) return;')
    s = once(s, '      dropZone.classList.remove("quick-retouch-drop-active");\n      await setSource', '      event.stopPropagation();\n      dropZone.classList.remove("quick-retouch-drop-active");\n      await setSource')
    s = once(s, '    canvasWrap.addEventListener("wheel", (event) => {', '''    dialog.addEventListener("paste", async event => {
      if (!dialog.open || applying || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const item = [...(event.clipboardData?.items || [])].find(entry => entry.kind === "file" && /^image\\/(png|jpeg|webp)$/i.test(entry.type));
      const file = item?.getAsFile?.();
      if (!file) return;
      event.preventDefault(); event.stopPropagation();
      await setSource({ blob: file, name: file.name || "clipboard-image.png", source_kind: "external-file" });
    });

    canvasWrap.addEventListener("wheel", (event) => {''')
    s = once(s, '      const key = event.key.toLowerCase();\n      if (modifier && key === "z")', '      const key = event.key.toLowerCase();\n      if (applying || (modifier && ["n", "s"].includes(key))) { event.preventDefault(); return; }\n      if (modifier && key === "z")')
    s = once(s, '      open: openDialog,\n      close: closeDialog,', '      open: openDialog,\n      close: closeDialog,\n      isOpen: () => dialog.open,')
    return s


def main() -> None:
    for name in HASHES:
        value = upstream(f"web/project/{name}")
        CHANGED[f"web/{name}"] = patch_quick(value) if name == "quick-retouch.js" else value
    for name in ["quick_retouch_core_test.cjs", "quick_retouch_browser_smoke.cjs", "quick_retouch_browser_harness.html"]:
        value = upstream(f"tests/{name}").replace("../web/project/", "../web/")
        CHANGED[f"tests/{name}"] = value
    html = read("web/speech-bubble-editor.html")
    html = once(html, '    let modeController=null,comicEditor=null,generalComicEditor=null,comicConverter=null,backgroundRemoval=null,comicOverlayExport=false;', '    let modeController=null,comicEditor=null,generalComicEditor=null,comicConverter=null,backgroundRemoval=null,quickRetouch=null,comicOverlayExport=false;')
    html = once(html, '  <link rel="stylesheet" href="./desktop/desktop.css', '  <link rel="stylesheet" href="./quick-retouch.css?v=standalone-retouch-1">\n  <link rel="stylesheet" href="./desktop/desktop.css')
    html = once(html, '  <script src="./desktop/desktop-shell.js?v=0.1.4-multi-image-1"></script>', '  <script src="./quick-retouch-core.js?v=standalone-retouch-1"></script>\n  <script src="./quick-retouch.js?v=standalone-retouch-1"></script>\n  <script src="./desktop/desktop-shell.js?v=standalone-retouch-1"></script>')
    white = re.search(r'      <details class="left-section comic-converter-launcher"[\s\S]*?</details>\n', html)
    background = re.search(r'      <details class="left-section background-removal-launcher"[\s\S]*?</details>\n', html)
    if not white or not background: raise RuntimeError("Launcher blocks not found")
    retouch = '''      <details class="left-section quick-retouch-launcher" data-left-section="quick-retouch" open>
        <summary>簡易レタッチ</summary>
        <button type="button" data-quick-retouch-open>簡易レタッチを開く</button>
      </details>
'''
    html = once(html, white[0] + background[0], background[0] + white[0] + retouch)
    initializer = '''    function initializeQuickRetouch(){
      if(quickRetouch||!window.SpeechBubbleQuickRetouch)return quickRetouch;
      quickRetouch=window.SpeechBubbleQuickRetouch.create({
        getMode:()=>generalComicEditor?.isActive()?"comic_layout":comicEditor?.isActive()?"comic":"single",
        getDocumentId:()=>documentId,
        getSingleSource:selectedSingleImageSource,
        getComicSources:()=>generalComicEditor?.isActive()?generalComicEditor.getConversionSources?.()||Promise.resolve([]):comicEditor?.getConversionSources?.()||Promise.resolve([]),
        addPageImage:(blob,name)=>generalComicEditor?.isActive()?generalComicEditor.addConvertedImage?.(blob,name):comicEditor?.addConvertedImage?.(blob,name),
        applySingleImage:(blob,name,source)=>applyProcessedSingleImage(blob,name,"quick-retouch",source),
        setStatus:setSaveState,
      });
      return quickRetouch;
    }
'''
    html = once(html, '    const savedLayoutKey =', initializer + '    const savedLayoutKey =')
    html = once(html, '      initializeBackgroundRemoval();', '      initializeBackgroundRemoval();\n      initializeQuickRetouch();')
    html = once(html, '<button id="processLayerBackgroundRemoval" hidden>', '<button id="processLayerQuickRetouch" hidden>この画像を簡易レタッチ</button><button id="processLayerBackgroundRemoval" hidden>')
    html = once(html, 'document.getElementById("processLayerBackgroundRemoval").hidden=!imageSelected;', 'document.getElementById("processLayerQuickRetouch").hidden=activeWorkspace!=="single"||!imageSelected;document.getElementById("processLayerBackgroundRemoval").hidden=!imageSelected;')
    html = once(html, '    document.getElementById("processLayerBackgroundRemoval").onclick=', '    document.getElementById("processLayerQuickRetouch").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");if(activeWorkspace==="single"&&selectedSingleImageLayer())initializeQuickRetouch()?.open?.();};\n    document.getElementById("processLayerBackgroundRemoval").onclick=')
    CHANGED["web/speech-bubble-editor.html"] = keyboard_guard(html)
    desktop = keyboard_guard(read("web/desktop/desktop-shell.js"))
    desktop = once(desktop, '["白黒変換", "Black & White Conversion"],', '["簡易レタッチ", "Quick Retouch"],\n    ["簡易レタッチを開く", "Open Quick Retouch"],\n    ["この画像を簡易レタッチ", "Quick Retouch this image"],\n    ["白黒変換", "Black & White Conversion"],')
    CHANGED["web/desktop/desktop-shell.js"] = desktop
    smoke = read("tests/desktop_browser_smoke.cjs")
    CHANGED["tests/desktop_browser_smoke.cjs"] = once(smoke, '    assert.deepEqual(pageErrors, []);', '    await require("./quick_retouch_desktop_gate.cjs")(page);\n    assert.deepEqual(pageErrors, []);')
    validation = read(".github/workflows/validate.yml")
    CHANGED[".github/workflows/validate.yml"] = once(validation, '      - run: node tests/desktop_browser_smoke.cjs', '      - run: node tests/quick_retouch_browser_smoke.cjs\n      - run: node tests/desktop_browser_smoke.cjs')
    readme_section = '''## 簡易レタッチ（Quick Retouch）

左パネルの「背景削除 → 白黒変換 → 簡易レタッチ」または一枚画像のLayersメニュー「この画像を簡易レタッチ」から開きます。Forge Neo版Quick Retouch 0.7.10を移植しています。

ブラシ、消しゴム、スポイト、投げ縄、長方形／楕円、自動選択、色から選択、クイックマスク、色相・彩度、明るさ・コントラスト・ガンマ、RGB別トーンカーブを使用できます。元画像は上書きしません。一枚画像では位置・倍率・回転・不透明度・ロックを継承した新規画像レイヤーを作り、元レイヤーを非表示で残します。外部ファイルを直接読み込んだ場合は無関係な選択レイヤーの変形を継承しません。

4コマ漫画／コミックでは両モード共通のPage Imagesへ新規追加します。選択コマの画像を自動置換・自動配置しません。プレビューは長辺920px、適用結果は元解像度PNGです。調整レイヤーは透過を保持し、ペイント／消しゴムは編集対象のアルファを変更できます。

編集前表示、左右／上下比較、3つのフローティングパネル、内部Undo／Redo、開始時に戻すを利用できます。内部履歴は最大32段階・512 MiBを目安に古い履歴から制限します（画像キャンバス等を含むアプリ全体のメモリ上限ではありません）。閉じると内部編集状態を破棄し、再度開くと選んだ画像から開始します。

`.sbeproj`へ保存するのは適用済みPNGと通常の配置情報です。レタッチ内部の調整レイヤー・選択範囲・マスク・履歴は保存しません。保存・自動復元も既存の画像経路を使用します。新しいAIモデルや必須依存パッケージは追加していません。

> この機能はソース版の追加です。公開済みv0.1.10インストーラーは変更していません。

'''
    CHANGED["README.md"] = once(read("README.md"), '## 白黒変換\n', readme_section + '## 白黒変換\n')
    CHANGED["CHANGELOG.md"] = once(read("CHANGELOG.md"), '# Changelog\n', '# Changelog\n\n## Unreleased\n\n- Port pinned Forge Quick Retouch 0.7.10 into all three standalone workspaces.\n- Keep Page Images shared and Single Image results source-context aware and non-destructive.\n- Preserve full-resolution PNG, selection/paint/adjustment tools and session-only history.\n- Isolate retouch keyboard/clipboard events and reject stale asynchronous apply operations.\n- Add core, UI and real Desktop Chromium regressions. Published v0.1.10 binaries are unchanged.\n')
    CHANGED["docs/ARCHITECTURE.md"] = read("docs/ARCHITECTURE.md") + '\n## Quick Retouch\n\nThe three browser-local `web/quick-retouch*` assets are ported from Forge commit `' + UPSTREAM + '`. The pure core and CSS remain byte-identical. Only the UI/host boundary adapts three-mode routing, explicit source context, modal event isolation and asynchronous session lifecycle. Both comic modes write through the existing shared Page Images adapter; Single Image uses `applyProcessedSingleImage(..., "quick-retouch", source)`. No new image database, API, AI model or project schema is introduced. Internal layers/masks/history are not serialized; only the flattened PNG enters the existing save/recovery pipeline.\n'
    CHANGED["docs/QUICK_RETOUCH_PORT.md"] = '# Quick Retouch port provenance\n\nStandalone base: `' + BASE + '`\n\nForge source: `' + REPO + '@' + UPSTREAM + '`\n\n' + '\n'.join(f'- `{name}`: Git blob `{sha}`' for name, sha in HASHES.items()) + '\n\nNo full Forge editor shell, settings store, Python project store, or runtime dependencies are copied. The generated candidate is validated on Windows/Ubuntu and Chromium before promotion. Packaged Windows/WebView2 UI verification remains a separate binary gate.\n'
    for name in ["quick_retouch_integration_test.cjs", "quick_retouch_desktop_gate.cjs"]:
        CHANGED[f"tests/{name}"] = read(f"tests/{name}")
    for path, content in CHANGED.items():
        target = ROOT / path; target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="\n")
    with zipfile.ZipFile(ROOT / "quick-retouch-prepared.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(CHANGED): archive.write(ROOT / path, path)
    (ROOT / "quick-retouch-files.json").write_text(json.dumps(sorted(CHANGED)), encoding="utf-8")
    print(json.dumps({"base": BASE, "upstream": UPSTREAM, "files": sorted(CHANGED)}))

if __name__ == "__main__":
    main()

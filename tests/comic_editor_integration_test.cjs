const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("web/speech-bubble-editor.html", "utf8");
const editor = fs.readFileSync("web/comic-editor.js", "utf8");
const converter = fs.readFileSync("web/comic-converter.js", "utf8");
const css = fs.readFileSync("web/comic-editor.css", "utf8");
const desktopShell = fs.readFileSync("web/desktop/desktop-shell.js", "utf8");
const desktopMain = fs.readFileSync("desktop_app/main.py", "utf8");
const renderer = fs.readFileSync("speech_bubble_editor/renderer.py", "utf8");
const shapeManifest = JSON.parse(fs.readFileSync("web/assets/shapes/manifest.json", "utf8"));
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) assert.doesNotThrow(() => new Function(match[1]), "Inline Editor script must parse");
}

for (const asset of ["comic-editor.css", "comic-panels.js", "comic-editor.js"]) {
  assert.ok(html.includes(`./${asset}?v=`), `${asset} must be loaded by the Editor with cache busting`);
}

assert.match(html, /comicEditor=window\.SpeechBubbleComicEditor\.create/);
assert.match(html, /comicEditor\?\.restore\(comicLayout\)/);
assert.match(html, /payload\.comic=comic/);
assert.match(html, /comic:comicEditor\?\.serialize\(\)/);
for (const phase of ["base", "images", "borders"]) {
  assert.match(html, new RegExp(`comicEditor\\.drawUnderlay\\(ctx,\\{overlay:comicOverlayExport,phase:"${phase}"\\}\\)`));
}
assert.match(html, /comic_stack==="below_image"/);
assert.match(html, /assignLayerComicTarget/);
assert.match(html, /id:"center",label:"Center",line_count:180,inner_x:\.5,inner_y:\.5/);
assert.match(html, /id:"wide",label:"Wide",line_count:210,inner_x:\.45,inner_y:\.45/);
assert.match(html, /id:"tall",label:"Tall",line_count:190,inner_x:\.45,inner_y:\.45/);
assert.match(html, /id:"side",label:"One Side",line_count:130,inner_x:\.45,inner_y:\.45/);
for (const preset of ["wide", "tall", "side"]) {
  assert.match(renderer, new RegExp(`"${preset}": \\{[\\s\\S]*?"inner_x": 0\\.45, "inner_y": 0\\.45`));
}
assert.match(html, /function refreshQuickEmphasisLines\(\)/);
assert.match(html, /favoriteAssets\("emphasis",EMPHASIS_PRESETS,\["center","wide"\]\)/);
assert.match(html, /id="openEmphasisDrawer"/);
assert.match(html, /id="emphasisDrawer"/);
assert.match(html, /renderEmphasisBrowser\(\)/);
assert.match(html, /comicEditor\?\.drawOverlay\(ctx\)/);
assert.match(html, /comicOverlayExport=true/);
assert.match(html, /exportTransport==="multipart_canvas_v1"\|\|comicEditor\?\.isActive\(\)/);
assert.match(html, /comicEditor\?\.handlePointerDown/);
assert.match(html, /comicEditor\?\.handlePointerMove/);
assert.match(html, /comicEditor\?\.handlePointerEnd/);
assert.match(html, /comicEditor\?\.handleImageDrop/);
assert.match(html, /comicEditor\?\.handleContextMenu/);
assert.match(html, /comicEditor\.confirmExport/);
assert.match(editor, /data-comic-mode="comic"/);
assert.doesNotMatch(editor, /data-comic-mode="panels"/);
assert.match(html, /speech_bubble:open_settings/);
assert.match(html, /bubbleShapeAssetsReady/);
assert.match(html, /base-thought/);
assert.match(html, /base-heart/);
assert.match(html, /function hasEditableDocument\(\)/);
assert.match(html, /comicEditor\?\.isActive\(\)/);
assert.match(html, /hostMode==="desktop"/);
assert.match(html, /comic_scope/);
assert.match(html, /data-comic-target="emphasis"/);
assert.match(html, /data-comic-target="asset"/);
assert.match(html, /assignElementTarget/);
assert.match(html, /text:uiText\("こんにちは","Hello!"\)/);
assert.match(html, /installBubbleFallbackAssets/);
assert.match(html, /complete built-in fallback/);
assert.match(html, /start\.cmd から起動すると利用できます/);
assert.match(html, /システムフォントを読み込めませんでした/);
assert.match(html, /url\.searchParams\.set\("token",desktopLaunchToken\)/);
assert.match(html, /function authenticatedAssetUrl\(value\)/);

const shapeIds = new Set(shapeManifest.presets.map((preset) => preset.id));
for (const shapeId of [
  "base-thought",
  "base-heart",
  "comic_tall_panel_soft",
  "comic_tall_panel_irregular",
  "comic_vertical_oval_notched",
  "rpg-dialogue-box-no-marker",
  "classic-sticky-note",
]) {
  assert.equal(shapeIds.has(shapeId), true, `shape manifest must include ${shapeId}`);
}

for (const feature of [
  "vertical_four",
  "data-comic-heading",
  "heading-resize",
  "border_color",
  "border_width",
  "image_scale",
  "image_locked",
  "structure_locked",
  "frame_style",
  "comicLayerRow",
  "renderLayers",
  "ページ画像",
  "画像はコマ内へドロップしてください",
  "elementTargetOptions",
  "assignElementTarget",
  "effectTargetRect",
  "panelContentRect",
]) {
  assert.ok(editor.includes(feature), `comic editor must include ${feature}`);
}

assert.doesNotMatch(editor, /<strong>Screen Tone<\/strong>/);
assert.doesNotMatch(editor, /data-comic-property="tone_enabled"/);
assert.doesNotMatch(editor, /data-comic-template="four_grid"/);
assert.doesNotMatch(editor, /data-comic-template="blank"/);
assert.doesNotMatch(editor, /data-comic-template="two_column"/);
assert.doesNotMatch(editor, /data-comic-action="canvas-swap"/);
assert.doesNotMatch(editor, /data-comic-property="fit"/);
assert.doesNotMatch(editor, /data-comic-context="split-/);
assert.doesNotMatch(editor, /data-comic-context="merge"/);
assert.doesNotMatch(editor, /placeSequentially/);
assert.doesNotMatch(editor, /空きコマへ順番に配置/);
assert.doesNotMatch(editor, /heading\.text/);
assert.match(editor, /漫画ページレイヤーをロックすると、見出しとコマ境界も固定されます/);
assert.doesNotMatch(editor, /data-comic-page="visible"/);
assert.doesNotMatch(editor, /data-comic-page="structure_locked"/);
assert.doesNotMatch(editor, /data-comic-property="image_locked"/);
assert.match(editor, /target\.strokeRect\(\s*item\.rect\.x \+ inset/);
assert.match(editor, /Ctrl＋ホイールで拡大・縮小/);
assert.match(editor, /speech-bubble-editor-comic-images/);
assert.match(editor, /MAX_IMAGE_BYTES = 96 \* 1024 \* 1024/);
assert.match(editor, /MAX_IMAGES = 100/);
assert.match(editor, /source: "stored"/);
assert.match(editor, /function removeTrayImage\(imageId\)/);
assert.match(editor, /comic\.images\.splice\(index, 1\)/);
assert.match(editor, /options\.switchWorkspace\?\.\(enableComic \? "comic" : "single"\)/);
assert.match(css, /\.comic-image-tray/);
assert.match(css, /\.comic-context-menu/);
assert.match(css, /\.comic-layer-nested/);
assert.match(html, /dataset\.comicPanelTarget/);
assert.match(html, /insertAdjacentElement\("afterend",row\)/);
for (const removedDockControl of ["propertiesDockFloat", "propertiesDockReturn", "layersDockFloat", "layersDockReturn", "layersDockToggle", "rightDockDivider"]) {
  assert.doesNotMatch(html, new RegExp(`id="${removedDockControl}"`));
}
assert.match(html, /function initializeRightDockFloating\(\)/);
assert.match(html, /speech_bubble:floating_panels:v4/);
assert.match(html, /delete next\.leftRatio;delete next\.topRatio;applyGeometry\(entry,next\)/);
assert.doesNotMatch(html, /const detachExternal=/);
assert.match(html, /class="properties-dock floating-panel"/);
assert.match(html, /class="layers-dock floating-panel"/);
assert.match(html, /propertiesLeft=layersLeft-gap-width/);
assert.match(html, /EXTERNAL_PALETTE_GEOMETRY_KEY/);
assert.match(editor, /if \(heading\) \{[\s\S]*if \(!comic\.page\.structure_locked\) \{/);
assert.match(html, /modeKey=\(\)=>/);
assert.match(html, /viewportWidth:innerWidth,viewportHeight:innerHeight/);
assert.match(html, /speech_bubble:workspace_views:v1/);
assert.match(html, /if\(firstApplicationView\)fitView\(false\);else restoreWorkspaceView/);
assert.match(html, /SpeechBubbleWorkspaceLayout/);
assert.match(html, /document\.getElementById\("emphasisDrawer"\)\.classList\.remove\("open"\)/);
assert.match(html, /\.properties-dock\.floating-panel,\.layers-dock\.floating-panel/);
assert.match(html, /\.font-browser \{ position:fixed; z-index:100000/);
assert.match(html, /FONT_BROWSER_GEOMETRY_KEY/);
assert.match(html, /function initializeFontBrowserDrag\(\)/);
assert.match(html, /function hasSavedFontIdentity\(item\)/);
assert.match(html, /matchingSavedFont\(item,catalog\)\|\|\(hasSavedFontIdentity\(item\)\?null:fallback\)/);
assert.doesNotMatch(html, /if\(!font\)font=fallback/);
assert.match(html, /const restoredFont=matchingSavedFont\(item\);if\(restoredFont\)\{applyResolvedFont\(item,restoredFont\);ensureFontLoaded\(restoredFont\)/);
assert.match(html, /propertiesDock\?\.classList\.contains\("floating-panel"\)/);
assert.ok(
  html.indexOf("selectedInteractionHit") < html.indexOf("!selectedInteractionHit&&comicEditor?.handlePointerDown"),
  "selected canvas handles must be tested before comic page/image hit testing",
);
assert.match(html, /findRotationHandle\(item,point\)\{const handle=rotationHandle\(item\),radius=20\/state\.zoom/);
assert.match(html, /findTailHandle\(item,point\).*radius=28\/state\.zoom/);
assert.match(editor, /const resizeHeading =[\s\S]*headingResizeHandleRect\(activeHeading\)/);
assert.match(editor, /data-comic-action="reset-heading"/);
assert.match(editor, /const trayImages = comic\.images\.filter\(\(metadata\) => metadata\.id !== "source"\)/);
assert.match(editor, /event\.dataTransfer\.setData\("text\/plain", metadata\.id\)/);
assert.match(editor, /event\.dataTransfer\.setDragImage\(ghost, 18, 18\)/);
assert.match(editor, /function createTrayDragGhost\(name\)/);
assert.doesNotMatch(editor, />画像を差し替え</);
assert.doesNotMatch(editor, /画像を選択／差し替え/);
assert.ok(
  html.indexOf('data-left-section="emphasis"') < html.indexOf('data-left-section="frames"'),
  "Emphasis Lines must appear before Frames",
);
assert.doesNotMatch(html, /id="propertiesDockToggle"/);
assert.match(html, /let autoSaveDelay = Math\.max\(5000, Math\.min\(3600000/);
assert.match(html, /if\(layoutDirty&&autoSaveEnabled\)persistDraftNow\(\);\s*clearTimeout\(autoSaveTimer\)/);
assert.match(css, /\.comic-tray-heading button[\s\S]*white-space: nowrap/);
assert.match(html, /SpeechBubbleApplyRuntimeSettings/);
assert.match(desktopShell, /SpeechBubbleApplyRuntimeSettings/);
assert.match(html, /id="fitTextBoxNow"/);
assert.match(html, /fitTextBox\(current,true,false\)/);
assert.match(html, /const preserveManualBox=!item\.auto_fit/);
assert.match(html, /persistDesktopRecovery\(true,true\)/);
assert.match(html, /async function persistDesktopRecovery\(checkpoint=false,force=false\)/);
assert.match(html, /const resolved=await Promise\.all\(loaders\)/);
assert.match(html, /applyResolvedFont\(result\.item,result\.font\)/);
assert.match(html, /if\(layerClipboard\?\.length\)\{event\.preventDefault\(\);pasteLayers\(\);return;\}/);
assert.match(html, /comicEditor\?\.handleWheel\(event,imagePoint\(event\)\)/);
assert.match(html, /const fontTask=loadSystemFonts\(\),assetTask=Promise\.all/);
assert.match(css, /\.canvas-panel\.comic-tray-visible #viewport/);
assert.match(css, /\.comic-page-checks/);
assert.match(css, /\.comic-color-swatches\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*16px\)/);
assert.match(css, /\.comic-color-swatches button\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
assert.match(css, /\.comic-image-card\.selected/);
assert.match(css, /\.comic-image-card\.selected::before/);
assert.match(css, /content: "SELECTED"/);
assert.match(css, /\.comic-image-card\.used::after/);
assert.match(css, /content: "使用中"/);
assert.match(editor, /selectedTrayImageId/);
assert.match(editor, /function selectedInsertionTarget\(\)/);
assert.match(editor, /function panelInsertionTarget\(panelId\)/);
assert.match(editor, /function insertionTargetAt\(point\)/);
assert.match(editor, /function defaultPanelInsertionTarget\(\)/);
assert.match(editor, /data-comic-page="heading_gap" type="range"/);
assert.match(editor, /data-comic-page="heading_gap" type="number"/);
assert.doesNotMatch(editor, /emptyImageButtonRect/);
assert.doesNotMatch(editor, /fillText\(tr\("＋ 画像を入れる", "\+ Add Image"\)/);
assert.match(editor, /locked:\s*comic\.page\.structure_locked !== false/);
assert.match(editor, /event\.target\.closest\('\[data-comic-action="remove-image"\]'\)/);
assert.match(editor, /selectedTrayImageId = addedId/);
assert.match(converter, /applyButton\.textContent = tr\("追加処理中…", "Adding…"\)/);
assert.match(html, /function insertSfx[\s\S]*insertionTargetAt[\s\S]*applyComicPanelTarget/);
assert.match(html, /workspaces:\{\s*single:\{canvas:[\s\S]*comic:\{canvas:/);
assert.match(html, /for\(const name of \["single","comic"\]\)/);
assert.match(html, /active_workspace:activeWorkspace/);
assert.match(html, /id="comicInsertTargetStatus"/);
assert.match(html, /function visibleCanvasDocumentRect\(\)/);
assert.match(html, /function addTextLayer\(\)[\s\S]*bubbleIndex\+1/);
assert.match(html, /item\.comic_scope="panel";item\.comic_panel_id=target\.panelId;item\.comic_stack="above_image"/);
assert.ok(
  html.indexOf('data-left-section="bubbles"') < html.indexOf('id="addText"') &&
  html.indexOf('id="addText"') < html.indexOf('data-left-section="sfx"'),
  "Add Text must appear between Speech Bubbles and SFX",
);
assert.match(html, /grid-template-columns:clamp\(150px,20vw,224px\) minmax\(220px,1fr\)/);
assert.match(html, /\.right \{ position:fixed; inset:0;/);
assert.match(
  html,
  /\.layer\[data-comic-layer="page"\]\s*\{[^}]*border-left:4px solid #4fb7bd;[^}]*background:#19383d;/,
);
for (const setting of [
  "export_directory",
  "auto_export_to_directory",
  "output_format",
  "filename_format",
  "backup_enabled",
  "auto_save",
  "auto_save_interval_seconds",
  "startup_behavior",
]) {
  assert.ok(desktopShell.includes(`data-desktop-setting="${setting}"`), `Desktop settings must include ${setting}`);
}
assert.match(desktopShell, /data-desktop-action="cache-clear"/);
assert.match(desktopShell, /data-desktop-action="user-preset-replace-image"/);
assert.match(desktopShell, /data-desktop-action="user-preset-organize"/);
assert.match(desktopShell, /function applyTheme/);
assert.match(desktopShell, /function applyLanguage/);
assert.match(desktopShell, /activeDesktopLanguage/);
assert.match(desktopMain, /SetProcessDpiAwarenessContext/);
assert.match(desktopMain, /maximized=True/);
assert.match(desktopShell, /\["＋ 画像を追加", "＋ Add Images"\]/);
assert.doesNotMatch(desktopMain, /self\.(?:window|palette_window|webview)\s*=/);
assert.match(desktopMain, /SizableToolWindow/);
assert.match(desktopMain, /palette=1/);
assert.doesNotMatch(desktopMain, /SystemEvents|Screen\.AllScreens|begin_palette_drag/);
assert.match(html, /isPaletteWindow/);
assert.match(html, /palette_ready/);
assert.match(html, /id="openExternalPalette"/);
assert.match(html, /function insertEmphasisLines[\s\S]*item\.comic_scope="panel"[\s\S]*item\.comic_panel_id=resolved\.panelId/);
assert.match(desktopShell, /async function saveRecovery\(checkpoint = false\)/);
assert.match(desktopShell, /async function loadRecovery\(\)/);
assert.match(html, /SpeechBubbleDesktopEditor\.loadRecovery\(recovery\)/);
assert.match(html, /if\(standaloneResumePromise\)return standaloneResumePromise/);
assert.match(html, /startStandaloneDocument\(standaloneId,\{offerResume:!isDesktop,behavior:isDesktop\?"new":"ask"\}\)/);
assert.match(html, /event\.key==="Delete"\|\|event\.key==="Backspace"\)&&state\.selection\.length/);
assert.match(html, /Date\.now\(\)-lastRecoveryCheckpoint>=600000/);
assert.match(html, /DESKTOP_SINGLE_BACKGROUND_ID="__single_background__"/);
assert.match(html, /snapshot:desktopSnapshot/);
assert.match(desktopShell, /data-desktop-action="workspace-layout-reset"/);
assert.match(desktopShell, /speech-bubble:language-change/);
assert.match(desktopShell, /\["コマ", "Panel"\]/);
assert.match(desktopShell, /function authenticatedMediaUrl\(value\)/);
assert.match(desktopShell, /addEventListener\("input"/);
assert.match(
  desktopShell,
  /data-desktop-setting="startup_behavior"[\s\S]*desktop-autosave-row[\s\S]*data-desktop-setting="auto_save"[\s\S]*data-desktop-setting="auto_save_interval_seconds"/,
);
assert.match(editor, /if \(!selectedTarget && !selectedTrayImageId\) return false/);
assert.match(editor, /selectedTrayImageId = ""/);
assert.match(editor, /Keep the blob alive while this deletion is present in the editor/);

console.log("comic_editor_integration_test: OK");

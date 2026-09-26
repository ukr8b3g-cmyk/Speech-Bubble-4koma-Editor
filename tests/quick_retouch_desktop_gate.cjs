"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

module.exports = async function quickRetouchDesktopGate(page) {
  const dialog = page.locator("dialog.quick-retouch-dialog");
  const result = dialog.locator("[data-retouch-result]");
  const snapshot = () => page.evaluate(() => window.SpeechBubbleDesktopEditor.snapshot());
  const pixelSignature = () => result.evaluate(canvas => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let value = 2166136261;
    for (const byte of data) value = Math.imul(value ^ byte, 16777619) >>> 0;
    return value;
  });
  const settle = () => page.waitForTimeout(90);
  const switchMode = async mode => {
    await page.locator(`button[data-editor-mode="${mode}"]`).click();
    await page.waitForFunction(value => document.documentElement.dataset.editorMode === value, mode);
  };
  const open = async () => {
    await page.locator("[data-quick-retouch-open]").click();
    await page.waitForFunction(() => document.querySelector("dialog.quick-retouch-dialog")?.open && !document.querySelector('[data-retouch-action="apply"]').disabled);
    await settle();
  };
  const cancel = async () => {
    await dialog.locator('[data-retouch-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector("dialog.quick-retouch-dialog")?.open);
    await settle();
  };
  const apply = async () => {
    await dialog.locator('[data-retouch-action="apply"]').click();
    await page.waitForFunction(() => !document.querySelector("dialog.quick-retouch-dialog")?.open, null, { timeout: 30000 });
    await settle();
  };
  const setNumber = async (key, value) => {
    const control = dialog.locator(`[data-retouch-setting-number="${key}"]`).first();
    await control.fill(String(value));
    await control.dispatchEvent("change");
    await control.blur();
    await settle();
  };
  const stroke = async (tool, points) => {
    await dialog.locator(`[data-retouch-tool="${tool}"]`).click();
    const box = await result.boundingBox();
    const pos = p => ({ clientX: box.x + box.width * p[0], clientY: box.y + box.height * p[1], pointerId: 42, pointerType: "mouse", isPrimary: true });
    await result.dispatchEvent("pointerdown", { ...pos(points[0]), button: 0, buttons: 1 });
    for (const point of points.slice(1)) await result.dispatchEvent("pointermove", { ...pos(point), button: -1, buttons: 1 });
    await result.dispatchEvent("pointerup", { ...pos(points.at(-1)), button: 0, buttons: 0 });
    await settle();
  };
  const dimensions = record => page.evaluate(async data => {
    const bitmap = await createImageBitmap(await (await fetch(data)).blob());
    const value = [bitmap.width, bitmap.height]; bitmap.close(); return value;
  }, record.data_url);
  const makeFile = async (name, width, height) => ({
    name, mimeType: "image/png", buffer: Buffer.from(await page.evaluate(({width, height}) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#3070a0"; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ed6020"; ctx.fillRect(width / 2, 0, width / 2, height);
      ctx.clearRect(0, 0, 8, 8);
      return canvas.toDataURL("image/png").split(",")[1];
    }, {width, height}), "base64")
  });
  const chooseFile = async file => {
    await dialog.locator("[data-retouch-file]").setInputFiles(file);
    await page.waitForFunction(() => !document.querySelector('[data-retouch-action="apply"]').disabled);
    await settle();
  };
  const shortFile = await makeFile("retouch-color.png", 96, 72);
  const largeFile = await makeFile("external-large.png", 1024, 768);
  const launcherOrder = await page.locator("aside.left > details[data-left-section]").evaluateAll(nodes => nodes.slice(0, 4).map(n => n.dataset.leftSection));
  assert.deepEqual(launcherOrder, ["background-removal", "comic-converter", "quick-retouch", "bubbles"]);

  // Actual Desktop mode: apply writes real Page Images, without host callback mocks.
  for (const [mode, other, label] of [["comic", "comic_layout", /4コマ漫画|4-Panel Manga/], ["comic_layout", "comic", /コミック|Comic/]]) {
    await switchMode(mode);
    const before = await snapshot();
    await open();
    assert.match(await dialog.locator("[data-retouch-mode]").innerText(), label);
    await chooseFile(shortFile);
    await stroke("brush", [[.1,.5],[.2,.5],[.3,.5]]);
    const painted = await pixelSignature();
    await dialog.locator('[data-retouch-action="undo"]').click(); await settle();
    const original = await pixelSignature(); assert.notEqual(painted, original);
    await dialog.locator('[data-retouch-action="redo"]').click(); await settle();
    assert.equal(await pixelSignature(), painted);
    await stroke("eraser", [[.1,.5],[.2,.5],[.3,.5]]);
    assert.notEqual(await pixelSignature(), painted);
    await dialog.locator('[data-retouch-add="brightness_contrast"]').click();
    await setNumber("brightness", 25);
    await setNumber("gamma", 1.2);
    await apply();
    const after = await snapshot();
    const added = after.images.filter(item => !before.images.some(old => old.id === item.id));
    assert.equal(added.length, 1); assert.match(added[0].id, /^page-image:/);
    assert.deepEqual(await dimensions(added[0]), [96, 72]);
    const panelIds = tree => !tree ? [] : tree.kind === "split" ? [...panelIds(tree.first), ...panelIds(tree.second)] : [tree.image_id || null];
    assert.deepEqual(panelIds(after.layout.comic?.tree), panelIds(before.layout.comic?.tree), "4-panel assignment must not change");
    assert.deepEqual(panelIds(after.layout.general_comic?.tree), panelIds(before.layout.general_comic?.tree), "Comic assignment must not change");
    await switchMode(other);
    const shared = (await snapshot()).images.find(item => item.id === added[0].id);
    assert.equal(shared.data_url, added[0].data_url, "both workspaces must share identical PNG bytes");
    assert.equal(await page.evaluate(async ({mode,id}) => (await (mode === "comic" ? comicEditor : generalComicEditor).getConversionSources()).some(item => item.id === id), {mode:other,id:added[0].id}), true);
    console.log(`QUICK_RETOUCH_GATE ${mode} -> ${other}: PASS`);
  }

  await switchMode("single");
  const initial = await page.evaluate(async base64 => {
    const blob = await (await fetch("data:image/png;base64," + base64)).blob();
    const layer = await addSingleImageLayerFromBlob(blob, "selected.png", {role:"image", locked:false});
    Object.assign(layer, {x:37,y:51,w:320,h:240,rotation:23,opacity:0.65,locked:true});
    setSelection([layer.id], layer.id); syncProperties(); updateLayerMenuState(); requestRender({canvas:true,layers:true});
    return JSON.parse(JSON.stringify(layer));
  }, shortFile.buffer.toString("base64"));
  const beforeSingle = await snapshot();
  await page.evaluate(() => document.getElementById("processLayerQuickRetouch").click());
  await page.waitForFunction(() => document.querySelector("dialog.quick-retouch-dialog")?.open && !document.querySelector('[data-retouch-action="apply"]').disabled);
  await settle();
  assert.match(await dialog.locator("[data-retouch-mode]").innerText(), /一枚画像|Single Image/);
  assert.equal(await dialog.locator("[data-retouch-source-name]").innerText(), "selected");
  const baseline = await pixelSignature();
  await dialog.locator('[data-retouch-add="hue_saturation"]').click();
  await setNumber("hue", 80);
  assert.notEqual(await pixelSignature(), baseline);
  await dialog.locator('[data-retouch-add="curves"]').click();
  await dialog.locator('[data-retouch-curve-preset]').selectOption("contrast"); await settle();
  const edited = await pixelSignature();
  page.once("dialog", event => event.accept());
  await dialog.locator('[data-retouch-action="reset"]').click(); await settle();
  assert.equal(await pixelSignature(), baseline, "Return to Start must restore exact preview");
  await dialog.locator('[data-retouch-action="undo"]').click(); await settle();
  assert.equal(await pixelSignature(), edited, "Reset must itself be undoable");
  const undoDepth = await page.evaluate(() => state.undo.length);
  await dialog.locator('[data-retouch-tool="hand"]').click();
  await page.keyboard.press("Control+z"); await settle();
  assert.equal(await page.evaluate(() => state.undo.length), undoDepth, "host undo must not receive retouch shortcut");
  await page.keyboard.press("Control+y"); await settle();
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Delete");
  assert.deepEqual((await snapshot()).layout, beforeSingle.layout, "editing inside modal must not mutate host layers");
  fs.mkdirSync("artifacts", {recursive:true});
  await page.screenshot({path:"artifacts/quick-retouch-single.png"});
  await cancel();
  assert.deepEqual((await snapshot()).layout, beforeSingle.layout, "Cancel must be non-destructive");
  assert.deepEqual((await snapshot()).images, beforeSingle.images);

  // Selected-layer result: transform/opacity/lock inheritance and original retained.
  await open();
  await dialog.locator('[data-retouch-add="brightness_contrast"]').click(); await setNumber("brightness", 20);
  await apply();
  const appliedSingle = await snapshot();
  const singleLayers = appliedSingle.layout.workspaces.single.elements;
  const originalLayer = singleLayers.find(item => item.id === initial.id);
  const processed = singleLayers.find(item => item.source_role === "quick-retouch" && item.source_image_layer_id === initial.id);
  assert.ok(processed, "new retouch layer must keep provenance");
  assert.equal(originalLayer.visible, false);
  for (const key of ["x","y","w","h","rotation","opacity","locked"]) assert.equal(processed[key], initial[key], key);
  assert.deepEqual(await dimensions(appliedSingle.images.find(item => item.id === processed.image_asset_id)), [96,72]);
  console.log("QUICK_RETOUCH_GATE single source/transform/cancel/undo: PASS");

  // External source never inherits or hides the unrelated selected layer.
  await page.evaluate(id => { setSelection([id], id); syncProperties(); }, processed.id);
  const externalBefore = await snapshot();
  await open(); await chooseFile(largeFile);
  assert.equal(await result.evaluate(canvas => canvas.width), 920);
  await dialog.locator('[data-retouch-add="hue_saturation"]').click(); await setNumber("saturation", -35);
  await apply();
  const externalAfter = await snapshot();
  const newLayer = externalAfter.layout.workspaces.single.elements.find(item => !externalBefore.layout.workspaces.single.elements.some(old => old.id === item.id));
  assert.ok(newLayer);
  assert.notEqual(newLayer.source_image_layer_id, processed.id);
  assert.equal(newLayer.rotation, 0);
  assert.equal(externalAfter.layout.workspaces.single.elements.find(item => item.id === processed.id).visible, processed.visible);
  assert.deepEqual(await dimensions(externalAfter.images.find(item => item.id === newLayer.image_asset_id)), [1024,768]);

  const roundTrip = await page.evaluate(async () => {
    const saved = await window.SpeechBubbleDesktopEditor.snapshot();
    const write = await fetch("/desktop/recovery/save", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(saved)});
    if (!write.ok) throw new Error("Recovery save failed: " + await write.text());
    await window.SpeechBubbleDesktopEditor.loadProject(saved);
    return window.SpeechBubbleDesktopEditor.snapshot();
  });
  assert.deepEqual(roundTrip.images.map(x => [x.id,x.data_url]).sort(), externalAfter.images.map(x => [x.id,x.data_url]).sort());
  assert.ok(roundTrip.layout.workspaces.single.elements.some(item => item.source_role === "quick-retouch"));
  assert.equal(JSON.stringify(roundTrip.layout).includes("adjustmentType"), false, "retouch internals must not enter project layout");
  console.log("QUICK_RETOUCH_GATE external/full-resolution/save-reload: PASS");

  // Empty workspace must never reuse the previous dialog's pixels.
  await page.evaluate(() => { for(const key of Object.keys(localStorage)) if(key.includes("quick-retouch")) localStorage.removeItem(key); });
  const persisted = await snapshot();
  await page.evaluate(async () => {
    const saved = await window.SpeechBubbleDesktopEditor.snapshot();
    saved.images = []; saved.layout.workspaces.single.elements = []; saved.layout.elements = [];
    if(saved.layout.comic) saved.layout.comic.images = [];
    if(saved.layout.general_comic) saved.layout.general_comic.images = [];
    await window.SpeechBubbleDesktopEditor.loadProject(saved);
  });
  await page.locator("[data-quick-retouch-open]").click(); await settle();
  assert.equal(await dialog.locator('[data-retouch-action="apply"]').isDisabled(), true);
  assert.equal(await result.evaluate(canvas => canvas.width), 1);
  await cancel();
  await page.evaluate(payload => window.SpeechBubbleDesktopEditor.loadProject(payload), persisted);
  console.log("quick_retouch_desktop_gate: OK");
};

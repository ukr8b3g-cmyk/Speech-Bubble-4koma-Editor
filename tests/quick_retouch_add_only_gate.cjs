"use strict";
const assert = require("node:assert/strict");

module.exports = async function retouchAddOnlyGate(page) {
  await page.locator('button[data-editor-mode="comic_layout"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.editorMode === "comic_layout");
  const before = await page.evaluate(async () => {
    if (!generalComicEditor.hasPage()) generalComicEditor.createPage();
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 96;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#52739b"; ctx.fillRect(0,0,160,96);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const ids = await generalComicEditor.importFiles([new File([blob], "retouch-occupied-panel.png", {type:"image/png"})]);
    let panel = generalComicEditor.state().tree;
    while (panel?.kind === "split") panel = panel.first;
    if (!panel?.id || !ids[0]) throw new Error("Could not create an occupied panel fixture");
    panel.image_id = ids[0];
    generalComicEditor.selectPanel(panel.id);
    return {panelId:panel.id, sourceId:ids[0], imageIds:(await sharedPageImageStore.list()).map(item=>item.id)};
  });
  await page.locator("[data-quick-retouch-open]").click();
  const dialog = page.locator("dialog.quick-retouch-dialog");
  await page.waitForFunction(() => document.querySelector("dialog.quick-retouch-dialog")?.open && !document.querySelector('[data-retouch-action="apply"]').disabled);
  assert.match(await dialog.locator("[data-retouch-source-name]").innerText(), /retouch-occupied-panel/);
  await dialog.locator('[data-retouch-add="brightness_contrast"]').click();
  const brightness = dialog.locator('[data-retouch-setting-number="brightness"]');
  await brightness.fill("15"); await brightness.dispatchEvent("change"); await brightness.blur();
  await dialog.locator('[data-retouch-action="apply"]').click();
  await page.waitForFunction(() => !document.querySelector("dialog.quick-retouch-dialog")?.open);
  const after = await page.evaluate(async previous => {
    let panel=generalComicEditor.state().tree;
    const find=node => node?.id===previous.panelId ? node : node?.kind==="split" ? find(node.first)||find(node.second) : null;
    panel=find(panel);
    const added=(await sharedPageImageStore.list()).filter(item=>!previous.imageIds.includes(item.id));
    return {panelImageId:panel?.image_id, added};
  },before);
  assert.equal(after.panelImageId,before.sourceId,"Quick Retouch must not replace the selected Comic panel");
  assert.equal(after.added.length,1);
  assert.equal(after.added[0].mime,"image/png");
  assert.deepEqual([after.added[0].width,after.added[0].height],[160,96]);
  await page.locator('button[data-editor-mode="comic"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.editorMode === "comic");
  const shared=await page.evaluate(async imageId=>{
    const left=(await comicEditor.getConversionSources()).find(item=>item.id===imageId);
    const right=(await generalComicEditor.getConversionSources()).find(item=>item.id===imageId);
    const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))).join(",");
    return Boolean(left&&right&&(await hash(left.blob))===(await hash(right.blob)));
  },after.added[0].id);
  assert.equal(shared,true,"The added PNG must be shared with the 4-panel workspace");
  console.log("quick_retouch_add_only_gate: OK (occupied panel retained; new full-resolution PNG shared)");
};

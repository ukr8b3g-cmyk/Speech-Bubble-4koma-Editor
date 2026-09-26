"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

module.exports = async function quickRetouchDesktopGate(page) {
  const dialog = page.locator("dialog.quick-retouch-dialog");
  const scene = () => page.evaluate(() => JSON.stringify({
    single: workspaces.single.elements,
    comic: comicEditor.serialize(),
    general: generalComicEditor.serialize(),
    undo: state.undo.length,
    redo: state.redo.length,
  }));
  const setMode = async mode => {
    await page.locator(`button[data-editor-mode="${mode}"]`).click();
    await page.waitForFunction(value => document.documentElement.dataset.editorMode === value, mode);
  };
  const ready = () => page.waitForFunction(() => {
    const d = document.querySelector("dialog.quick-retouch-dialog");
    return d?.open && d.querySelector('[data-retouch-status]')?.dataset.level === "ready" &&
      !d.querySelector('[data-retouch-action="apply"]').disabled;
  });
  const open = async expected => {
    await page.locator("[data-quick-retouch-open]").click();
    await page.waitForFunction(() => document.querySelector("dialog.quick-retouch-dialog")?.open);
    assert.match(await dialog.locator("[data-retouch-mode]").innerText(), expected);
  };
  const apply = async () => {
    await dialog.locator('[data-retouch-action="apply"]').click();
    await page.waitForFunction(() => {
      const d = document.querySelector("dialog.quick-retouch-dialog");
      return !d.open || d.querySelector('[data-retouch-status]').dataset.level === "error";
    });
    assert.equal(await dialog.evaluate(d => d.open), false, await dialog.locator('[data-retouch-status]').innerText());
  };
  const setting = async (name, value) => {
    const input = dialog.locator(`[data-retouch-setting-number="${name}"]`);
    await input.fill(String(value));
    await input.dispatchEvent("change");
    await input.blur();
  };
  const focusDialog = () => dialog.evaluate(d => { d.tabIndex = -1; d.focus(); });
  const chooseSource = async name => {
    if (!(await dialog.locator("[data-retouch-source-name]").innerText()).includes(name)) {
      await dialog.locator('button[data-retouch-action="toggle-source-picker"]').click();
      await dialog.locator(".quick-retouch-source-candidate").filter({hasText:name}).first().click();
    }
    await ready();
    assert.match(await dialog.locator("[data-retouch-source-name]").innerText(), new RegExp(name));
  };
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 640;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#405080"; ctx.fillRect(32, 0, 968, 640);
    ctx.fillStyle = "#b04030"; ctx.fillRect(200, 100, 300, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const fixture = Buffer.from(bytes, "base64");
  const fixtureInput = name => ({name, mimeType:"image/png", buffer:fixture});
  fs.mkdirSync("artifacts", {recursive:true});

  try {
    assert.equal(await page.evaluate(() => Boolean(window.SpeechBubbleQuickRetouch)), true);
    const order = await page.locator("aside.left > details[data-left-section]").evaluateAll(nodes => nodes.slice(0,3).map(n => n.dataset.leftSection));
    assert.deepEqual(order, ["background-removal", "comic-converter", "quick-retouch"]);
    await setMode("single");
    const original = await page.evaluate(async encoded => {
      const blob = await (await fetch("data:image/png;base64," + encoded)).blob();
      const layer = await addSingleImageLayerFromBlob(blob, "qr-original.png", {role:"original", locked:false});
      Object.assign(layer, {x:123,y:75,w:500,h:320,rotation:17,opacity:0.65,locked:true});
      setSelection([layer.id], layer.id);
      syncProperties(); requestRender({canvas:true,layers:true});
      return {id:layer.id,x:layer.x,y:layer.y,w:layer.w,h:layer.h,rotation:layer.rotation,opacity:layer.opacity,locked:layer.locked};
    }, bytes);
    const before = await scene();
    // Exercise the image-layer menu adapter, not a standalone mock host.
    await page.evaluate(() => { updateLayerMenuState(); document.getElementById("processLayerQuickRetouch").click(); });
    await ready();
    assert.match(await dialog.locator("[data-retouch-source-name]").innerText(), /qr-original/);
    assert.match(await dialog.locator("[data-retouch-mode]").innerText(), /一枚画像|Single Image/);
    assert.equal(await dialog.locator("[data-retouch-result]").evaluate(c => c.width), 920);

    await focusDialog();
    await page.keyboard.press("Control+j");
    assert.equal(await dialog.locator("[data-retouch-layer-id]").count(), 2);
    await page.keyboard.press("Control+z");
    assert.equal(await dialog.locator("[data-retouch-layer-id]").count(), 1);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await dialog.locator("[data-retouch-layer-id]").count(), 2);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Delete");
    assert.equal(await scene(), before, "Modal shortcuts must not edit the host document");

    // Real pointer events on the Canvas exercise paint and erase plumbing.
    const result = dialog.locator("[data-retouch-result]");
    const stroke = async tool => {
      await dialog.locator(`[data-retouch-tool="${tool}"]`).click();
      const box = await result.boundingBox();
      const p = {pointerId:79,button:0,clientX:box.x+box.width*0.12,clientY:box.y+box.height*0.30};
      await result.dispatchEvent("pointerdown", {...p,buttons:1});
      await result.dispatchEvent("pointermove", {...p,buttons:1,clientX:p.clientX+10});
      await result.dispatchEvent("pointerup", {...p,buttons:0,clientX:p.clientX+10});
    };
    await stroke("brush");
    await stroke("eraser");
    await dialog.locator('[data-retouch-add="hue_saturation"]').click();
    await setting("hue", 20);
    await setting("saturation", 10);
    await dialog.locator('[data-retouch-add="brightness_contrast"]').click();
    await setting("brightness", 10);
    await setting("contrast", 5);
    await setting("gamma", 1.1);
    await dialog.locator('[data-retouch-add="curves"]').click();
    await dialog.locator("[data-retouch-curve-preset]").selectOption("contrast");
    const countBeforeReset = await dialog.locator("[data-retouch-layer-id]").count();
    page.once("dialog", native => native.accept());
    await dialog.locator('[data-retouch-action="reset"]').click();
    assert.equal(await dialog.locator("[data-retouch-layer-id]").count(), 1);
    await dialog.locator('[data-retouch-action="undo"]').click();
    assert.equal(await dialog.locator("[data-retouch-layer-id]").count(), countBeforeReset);
    await page.screenshot({path:"artifacts/quick-retouch-desktop.png"});
    assert.equal(await scene(), before, "Internal edits must remain local until Apply");
    await apply();
    const processed = await page.evaluate(async sourceId => {
      const layer = state.elements.find(item => item.type === "image" && item.source_image_layer_id === sourceId);
      if (!layer) return null;
      const asset = singleImageAssetFor(layer);
      const bitmap = await createImageBitmap(asset.blob);
      const canvas = document.createElement("canvas"); canvas.width=bitmap.width; canvas.height=bitmap.height;
      const ctx=canvas.getContext("2d"); ctx.drawImage(bitmap,0,0);
      const alpha=ctx.getImageData(0,0,1,1).data[3]; bitmap.close();
      return {...layer, pixelWidth:canvas.width,pixelHeight:canvas.height,alpha,originalVisible:state.elements.find(item=>item.id===sourceId).visible};
    }, original.id);
    assert.ok(processed, "Apply must create a layer linked to the exact source");
    for (const key of ["x","y","w","h","rotation","opacity","locked"]) assert.equal(processed[key],original[key],`Transform ${key}`);
    assert.equal(processed.originalVisible,false);
    assert.equal(processed.source_role,"quick-retouch");
    assert.deepEqual([processed.pixelWidth,processed.pixelHeight,processed.alpha],[1000,640,0]);
    await page.locator("#undo").click();
    assert.equal(await page.evaluate(id => state.elements.some(item=>item.id===id), processed.id), false);
    await page.locator("#redo").click();
    assert.equal(await page.evaluate(id => state.elements.some(item=>item.id===id), processed.id), true);

    // Cancel must preserve pixels, layout and outer Undo/Redo.
    const beforeCancel = await scene();
    await open(/一枚画像|Single Image/); await ready();
    await dialog.locator('[data-retouch-add="paint"]').click();
    await dialog.locator('[data-retouch-action="cancel"]').click();
    await page.waitForFunction(() => !quickRetouch.hasDocument());
    assert.equal(await scene(), beforeCancel);

    // An external source cannot inherit the unrelated selected processed layer.
    await page.evaluate(id => setSelection([id],id), processed.id);
    const existingIds = await page.evaluate(() => state.elements.map(item=>item.id));
    await open(/一枚画像|Single Image/); await ready();
    await dialog.locator("[data-retouch-file]").setInputFiles(fixtureInput("qr-external.png"));
    await ready();
    assert.match(await dialog.locator("[data-retouch-source-name]").innerText(), /qr-external/);
    await apply();
    const external = await page.evaluate(({ids,previous}) => {
      const added=state.elements.find(item=>item.type==="image"&&!ids.includes(item.id));
      return {added,previousVisible:state.elements.find(item=>item.id===previous).visible};
    }, {ids:existingIds,previous:processed.id});
    assert.ok(external.added);
    assert.notEqual(external.added.source_image_layer_id,processed.id);
    assert.notEqual(external.previousVisible,false);
    assert.equal(Number(external.added.rotation)||0,0);

    // Both directions use the same actual document-scoped IndexedDB library.
    await setMode("comic");
    const beforeImport = await page.evaluate(async()=> (await sharedPageImageStore.list()).map(item=>item.id));
    await page.locator("[data-comic-image-input]").setInputFiles(fixtureInput("qr-shared.png"));
    await page.waitForFunction(async count => (await sharedPageImageStore.list()).length>count,beforeImport.length);
    for (const [from,to,pattern] of [["comic","comic_layout",/4コマ漫画|4-Panel Manga/],["comic_layout","comic",/コミック|Comic/]]) {
      await setMode(from);
      if(from==="comic_layout") {
        await page.evaluate(async()=>{
          if(!generalComicEditor.hasPage())generalComicEditor.createPage();
          const source=(await sharedPageImageStore.list()).find(item=>/^qr-shared(?:\.png)?$/.test(item.name));
          if(!source)throw new Error("Shared source fixture is missing");
          let panel=generalComicEditor.state().tree;
          while(panel?.kind==="split")panel=panel.first;
          if(!panel?.id)throw new Error("Comic panel fixture is missing");
          panel.image_id=source.id;
          generalComicEditor.selectPanel(panel.id);
        });
      }
      const prev = await page.evaluate(async()=>({ids:(await sharedPageImageStore.list()).map(item=>item.id),used:[...comicEditor.usedImageIds(),...generalComicEditor.usedImageIds()]}));
      await open(pattern); await chooseSource("qr-shared");
      await dialog.locator('[data-retouch-add="brightness_contrast"]').click();
      await setting("brightness",from==="comic"?15:25);
      await apply();
      const added = await page.evaluate(async ids => (await sharedPageImageStore.list()).filter(item=>!ids.includes(item.id)),prev.ids);
      assert.equal(added.length,1);
      assert.equal(added[0].name,from==="comic"?"qr-shared-retouched.png":"qr-shared-retouched");
      assert.equal(added[0].mime,"image/png");
      assert.deepEqual([added[0].width,added[0].height],[1000,640]);
      assert.deepEqual(await page.evaluate(()=>[...comicEditor.usedImageIds(),...generalComicEditor.usedImageIds()]),prev.used,"Do not auto-assign panel images");
      await setMode(to);
      const shared = await page.evaluate(async id=>{
        const a=(await comicEditor.getConversionSources()).find(item=>item.id===id);
        const b=(await generalComicEditor.getConversionSources()).find(item=>item.id===id);
        const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))).join(",");
        return {a:Boolean(a),b:Boolean(b),same:a&&b?(await digest(a.blob))===(await digest(b.blob)):false};
      },added[0].id);
      assert.deepEqual(shared,{a:true,b:true,same:true});
      const records = await page.evaluate(async id=>sharedPageImageStore.exportRecords([id]),added[0].id);
      assert.equal(records.length,1); assert.ok(records[0].data_url.startsWith("data:image/png;base64,"));
    }
    const imageCount=await page.evaluate(async()=> (await sharedPageImageStore.list()).length);
    const beforePageCancel=await scene();
    await open(/4コマ漫画|4-Panel Manga/); await ready();
    await dialog.locator('[data-retouch-add="paint"]').click();
    await dialog.locator('[data-retouch-action="cancel"]').click();
    await page.waitForFunction(()=>!quickRetouch.hasDocument());
    assert.equal(await page.evaluate(async()=> (await sharedPageImageStore.list()).length),imageCount);
    assert.equal(await scene(),beforePageCancel);
    console.log("quick_retouch_desktop_gate: OK (three modes, source transforms, external source, drawing/adjustments, Undo/Redo/reset, alpha/full resolution, cancellation, shared ID/Blob both directions)");
  } catch (error) {
    await page.screenshot({path:"artifacts/quick-retouch-failure.png"}).catch(()=>{});
    console.error("QUICK_RETOUCH_STATE",await page.evaluate(()=>({mode:document.documentElement.dataset.editorMode,status:document.querySelector('[data-retouch-status]')?.textContent,save:document.querySelector('#saveState')?.textContent,api:Object.keys(window.SpeechBubbleDesktopEditor||{})})));
    throw error;
  }
};

"""Preserve the current main port; patch only its Quick Retouch output adapter."""
from pathlib import Path
import json
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
base = "438b2635617cde5b6e990c99fb76fc91b839c36d"
def git(*args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()
assert git("rev-parse", "HEAD") == base
assert not git("status", "--porcelain")

def replace(path, before, after):
    p=root/path
    text=p.read_text(encoding="utf-8")
    assert text.count(before)==1, (path,text.count(before),before[:80])
    p.write_text(text.replace(before,after,1),encoding="utf-8",newline="\n")

html_path="web/speech-bubble-editor.html"
helper='''    async function addQuickRetouchPageImage(blob,name){
      if(!(blob instanceof Blob)||!["comic","comic_layout"].includes(activeWorkspace))return "";
      const editor=activeStructuralEditor();
      if(!editor)return "";
      if(activeWorkspace==="comic")return editor.addConvertedImage(blob,name);
      // The Comic conversion adapter replaces the selected panel. Retouch is add-only.
      const safeName=String(name||"image-retouched.png").replace(/[\\\\/:*?"<>|]+/g,"-");
      const file=new File([blob],/\\.png$/i.test(safeName)?safeName:`${safeName}.png`,{type:"image/png",lastModified:Date.now()});
      pushUndo();
      const ids=await editor.importFiles([file]);
      return ids?.[0]||"";
    }
'''
replace(html_path,"    function initializeQuickRetouch(){",helper+"    function initializeQuickRetouch(){")
p=root/html_path
text=p.read_text()
start=text.index("    function initializeQuickRetouch(){")
end=text.index("    const savedLayoutKey",start)
block=text[start:end]
before='        addPageImage:(blob,name)=>generalComicEditor?.isActive()?generalComicEditor.addConvertedImage?.(blob,name):comicEditor?.addConvertedImage?.(blob,name),'
assert block.count(before)==1
block=block.replace(before,'        addPageImage:addQuickRetouchPageImage,')
p.write_text(text[:start]+block+text[end:],encoding="utf-8",newline="\n")

new_test=r'''"use strict";
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
'''
(root/"tests/quick_retouch_add_only_gate.cjs").write_text(new_test,encoding="utf-8",newline="\n")
replace("tests/desktop_browser_smoke.cjs",'    assert.deepEqual(pageErrors, []);','    await require("./quick_retouch_add_only_gate.cjs")(page);\n    assert.deepEqual(pageErrors, []);')
p=root/"tests/quick_retouch_integration_test.cjs"
p.write_text(p.read_text()+'''\nassert.match(html, /addPageImage:addQuickRetouchPageImage/);
assert.match(html, /const ids=await editor\\.importFiles\\(\\[file\\]\\)/);
''',encoding="utf-8",newline="\n")
replace("CHANGELOG.md","## Unreleased\n","## Unreleased\n\n- Keep an occupied Comic panel unchanged when Quick Retouch adds its output to shared Page Images.\n")
files=[html_path,"tests/quick_retouch_add_only_gate.cjs","tests/desktop_browser_smoke.cjs","tests/quick_retouch_integration_test.cjs","CHANGELOG.md"]
for protected in ["web/quick-retouch.js","web/quick-retouch-core.js","web/quick-retouch.css","web/shared-page-images.js","web/comic-converter.js","web/background-removal.js","web/general-comic-editor.js","web/desktop/desktop-shell.js",".github/workflows/validate.yml",".github/workflows/release.yml","desktop_app/version.py"]:
    assert not git("diff","--",protected), protected
(root/"port-files.json").write_text(json.dumps(files))
print(json.dumps({"base":base,"files":files},indent=2))

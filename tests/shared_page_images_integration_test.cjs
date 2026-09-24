const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("web/speech-bubble-editor.html", "utf8");
const store = fs.readFileSync("web/shared-page-images.js", "utf8");
const four = fs.readFileSync("web/comic-editor.js", "utf8");
const general = fs.readFileSync("web/general-comic-editor.js", "utf8");
const converter = fs.readFileSync("web/comic-converter.js", "utf8");
const desktop = fs.readFileSync("web/desktop/desktop-shell.js", "utf8");

assert.match(store, /speech-bubble-editor-shared-page-images/);
assert.match(store, /speech-bubble-editor-comic-images/);
assert.match(store, /speech-bubble-editor-general-comic-images/);
assert.match(store, /async function migrateLegacy/);
assert.match(store, /async function exportRecords/);
assert.match(store, /async function status/);
assert.match(store, /speech-bubble:page-images-changed/);

assert.match(html, /sharedPageImageStore=window\.SpeechBubbleSharedPageImages\?\.create/);
assert.match(html, /imageStore:sharedPageImageStore\|\|undefined/);
assert.equal((html.match(/imageStore:sharedPageImageStore\|\|undefined/g) || []).length, 2);
assert.match(html, /syncSharedPageImages/);
assert.match(html, /removeSharedPageImage/);
assert.match(html, /sharedPageImageStorageStatus/);
assert.match(html, /cleanupUnusedSharedPageImages/);
assert.match(html, /sharedPageImageStore\.exportRecords\(\)/);
assert.match(html, /sharedPageImageStore\.importRecords\(pageRecords/);
assert.match(html, /migrateLegacy/);

for (const source of [four, general]) {
  assert.match(source, /const imageStore = options\.imageStore/);
  assert.match(source, /page-image:/);
  assert.match(source, /syncSharedImages/);
  assert.match(source, /removeAssetUsage/);
  assert.match(source, /imageUsageCount/);
  assert.match(source, /usedImageIds/);
}
assert.match(converter, /白黒変換/);
assert.match(converter, /Black & White Conversion/);
assert.match(converter, /applySingleImage\?\.\(blob, name, source\)/);
assert.match(desktop, /白黒変換/);

console.log("shared_page_images_integration_test: OK");

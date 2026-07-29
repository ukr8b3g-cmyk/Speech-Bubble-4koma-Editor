const assert = require("node:assert/strict");
const core = require("../web/comic-panels.js");

let nextId = 0;
const makeId = () => String(++nextId);
const page = { x: 0, y: 0, w: 1200, h: 1600 };

function verifyTemplate(id, expectedPanels) {
  nextId = 0;
  const tree = core.createTemplate(id, makeId);
  const layout = core.computeLayout(tree, page, 16);
  assert.equal(layout.panels.length, expectedPanels);
  assert.equal(layout.dividers.length, expectedPanels - 1);
  for (const panel of layout.panels) {
    assert.ok(panel.rect.w >= core.MIN_PANEL_SIZE);
    assert.ok(panel.rect.h >= core.MIN_PANEL_SIZE);
    assert.ok(panel.rect.x >= 0 && panel.rect.y >= 0);
    assert.ok(panel.rect.x + panel.rect.w <= page.w + 1e-6);
    assert.ok(panel.rect.y + panel.rect.h <= page.h + 1e-6);
  }
}

verifyTemplate("vertical_four", 4);
verifyTemplate("two_column", 8);
verifyTemplate("two_column_sample", 8);
verifyTemplate("blank", 4);
assert.deepEqual([...core.PUBLIC_TEMPLATE_IDS], ["vertical_four"]);

nextId = 0;
let tree = core.panelNode(makeId);
const originalId = tree.id;
let result = core.splitPanel(tree, originalId, "x", makeId);
assert.equal(result.changed, true);
tree = result.tree;
assert.equal(core.computeLayout(tree, page, 16).panels.length, 2);
result = core.mergeSibling(tree, result.panelId, result.panelId, makeId);
assert.equal(result.changed, true);
tree = result.tree;
assert.equal(core.computeLayout(tree, page, 16).panels.length, 1);

nextId = 0;
tree = core.panelNode(makeId);
result = core.splitPanel(tree, tree.id, "y", makeId);
tree = result.tree;
const first = core.findNode(tree, result.panelId);
const second = core.findNode(tree, result.siblingId);
first.image_id = "first-image";
second.image_id = "second-image";
first.tone = core.defaultTone();
result = core.mergeSibling(tree, first.id, first.id, makeId);
assert.equal(result.changed, true);
assert.equal(result.tree.image_id, "first-image");
assert.equal(result.tree.tone.type, "halftone_dots");

const tone = core.normalizeTone({
  type: "halftone_dots",
  dot_size: 80,
  spacing: 10,
  opacity: 2,
});
assert.equal(tone.dot_size, 9.5);
assert.equal(tone.opacity, 1);

const cover = core.imageFit({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "cover", 1, 0, 0);
assert.equal(cover.w, 200);
assert.equal(cover.h, 100);
assert.equal(cover.x, -50);
const contain = core.imageFit({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "contain", 1, 0, 0);
assert.equal(contain.w, 100);
assert.equal(contain.h, 50);
assert.equal(contain.y, 25);

const malformed = core.normalizeState(
  {
    enabled: true,
    page: { gutter: 999, border_width: -3 },
    tree: { kind: "split", axis: "bad", ratio: Number.NaN, first: {}, second: {} },
  },
  { width: 800, height: 600, makeId },
);
assert.equal(malformed.enabled, true);
assert.equal(malformed.page.gutter, 64);
assert.equal(malformed.page.border_width, 0);
assert.equal(malformed.tree.axis, "x");
assert.equal(malformed.page.margin, 24);
assert.equal(malformed.page.visible, true);
  assert.equal(malformed.page.structure_locked, true);
  assert.equal(malformed.page.frame_style, "white");
  assert.equal(malformed.headings.length, 1);
assert.equal(malformed.headings[0].background, "#ffffff");
assert.equal(malformed.headings[0].border_color, "#111111");
assert.equal(malformed.headings[0].border_width, 2);
assert.equal("text" in malformed.headings[0], false);
assert.equal(core.panelNode(makeId).image_locked, false);
const standard = core.defaultState(undefined, undefined, makeId);
assert.equal(standard.page.width, 720);
assert.equal(standard.page.height, 2160);
assert.equal(standard.page.structure_locked, true);

const legacy = core.normalizeState(
  {
    enabled: true,
    template_id: "two_column_sample",
    page: { visible: false, structure_locked: false, frame_style: "black", margin: 30 },
    tree: {
      kind: "panel",
      id: "legacy-panel",
      visible: false,
      image_visible: false,
    },
  },
  { width: 1200, height: 1600, makeId },
);
assert.equal(legacy.template_id, "vertical_four");
assert.equal(legacy.page.visible, false);
assert.equal(legacy.page.structure_locked, false);
assert.equal(legacy.page.frame_style, "black");
assert.equal(legacy.page.margin, 30);
assert.equal(core.computeLayout(legacy.tree, page, legacy.page.gutter).panels.length, 4);
assert.equal(legacy.headings.length, 1);

console.log("comic_panels_core_test: OK");

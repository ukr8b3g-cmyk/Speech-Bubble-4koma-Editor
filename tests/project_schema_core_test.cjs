const assert = require("node:assert/strict");

const schema = require("../web/project-schema.js");

function currentLayout(activeWorkspace = "single") {
  return {
    format: "speech-bubble-editor-layout",
    version: 4,
    active_workspace: activeWorkspace,
    canvas: { width: activeWorkspace === "comic" ? 720 : 1024, height: activeWorkspace === "comic" ? 2200 : 1024 },
    background_visible: true,
    elements: activeWorkspace === "comic" ? [{ id: "comic-1", type: "text" }] : [{ id: "single-1", type: "image" }],
    workspaces: {
      single: {
        canvas: { width: 1024, height: 1024 },
        background_visible: true,
        canvas_background: { color: "#ffffff", transparent: false },
        elements: [{ id: "single-1", type: "image" }],
        view: { zoom: 1, panX: 0, panY: 0 },
      },
      comic: {
        canvas: { width: 720, height: 2200 },
        background_visible: true,
        elements: [{ id: "comic-1", type: "text" }],
        view: { zoom: 1, panX: 0, panY: 0 },
      },
    },
    comic: { version: 1, enabled: true },
  };
}

const source = currentLayout();
const sourceJson = JSON.stringify(source);
const normalized = schema.normalize(source);
assert.equal(normalized.version, 4);
assert.equal(normalized.workspaces.single.elements[0].id, "single-1");
assert.equal(normalized.workspaces.comic.elements[0].id, "comic-1");
assert.equal(JSON.stringify(source), sourceJson, "normalize must not mutate input");

const built = schema.build({
  activeWorkspace: "comic",
  workspaces: {
    single: {
      width: 1024,
      height: 1024,
      backgroundVisible: true,
      canvasBackground: { color: "#ffffff", transparent: false },
      elements: [{ id: "single-1", type: "image" }],
      view: { zoom: 1, panX: 0, panY: 0 },
    },
    comic: {
      width: 720,
      height: 2200,
      backgroundVisible: true,
      elements: [{ id: "comic-1", type: "text" }],
      view: { zoom: 1, panX: 0, panY: 0 },
    },
  },
  comic: { version: 1, enabled: true },
});
const rebuilt = schema.normalize(built);
assert.equal(rebuilt.active_workspace, "comic");
assert.equal(rebuilt.workspaces.single.elements[0].id, "single-1");
assert.equal(rebuilt.workspaces.comic.elements[0].id, "comic-1");
assert.notEqual(rebuilt.workspaces.single.elements, rebuilt.workspaces.comic.elements);

const legacy = schema.normalize({
  canvas: { width: 640, height: 900 },
  background_visible: false,
  elements: [{ id: "legacy-layer", type: "text" }],
});
assert.equal(legacy.version, 4);
assert.equal(legacy.active_workspace, "single");
assert.equal(legacy.workspaces.single.canvas.width, 640);
assert.equal(legacy.workspaces.single.elements[0].id, "legacy-layer");
assert.deepEqual(legacy.workspaces.comic.elements, []);

assert.throws(
  () => schema.normalize({ version: 999 }),
  (error) => error?.code === "UNSUPPORTED_LAYOUT_VERSION",
);
assert.throws(
  () => schema.normalize({ ...currentLayout(), comic: { version: 999 } }),
  (error) => error?.code === "UNSUPPORTED_COMIC_VERSION",
);
assert.throws(
  () => schema.normalize({ ...currentLayout(), workspaces: { ...currentLayout().workspaces, single: { ...currentLayout().workspaces.single, canvas: { width: 0, height: 100 } } } }),
  (error) => error?.code === "INVALID_WORKSPACE",
);
assert.throws(
  () => schema.normalize({ ...currentLayout(), workspaces: { ...currentLayout().workspaces, single: { ...currentLayout().workspaces.single, elements: [{ id: "duplicate" }, { id: "duplicate" }] } } }),
  (error) => error?.code === "DUPLICATE_ELEMENT_ID",
);
assert.throws(
  () => schema.preflightPayload({
    layout: currentLayout(),
    images: [
      { id: "single-image:1", name: "one.png", mime: "image/png", data_url: "data:image/png;base64,AA==" },
      { id: "single-image:1", name: "two.png", mime: "image/png", data_url: "data:image/png;base64,AA==" },
    ],
  }),
  (error) => error?.code === "DUPLICATE_IMAGE_ID",
);

console.log("project_schema_core_test: OK");

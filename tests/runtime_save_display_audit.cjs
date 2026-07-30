const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbe-audit-"));
const port = 23000 + Math.floor(Math.random() * 10000);
const origin = `http://127.0.0.1:${port}`;
const token = "audit-token";
const headers = { "X-SBE-Token": token };
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAWwW6vQAAAAASUVORK5CYII=",
  "base64",
);

const server = spawn(
  process.env.PYTHON || "python",
  [path.join(repoRoot, "tests", "audit_server.py"), dataRoot, String(port)],
  { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(route, options = {}) {
  const requestHeaders = { ...headers, ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body !== "string" && !(body instanceof Buffer)) {
    requestHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`${origin}${route}`, { ...options, headers: requestHeaders, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`audit server exited early (${server.exitCode})\n${serverOutput}`);
    try {
      const health = await api("/desktop/health");
      if (health.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`audit server did not start\n${serverOutput}`);
}

async function waitForEditor(page) {
  await page.waitForFunction(() => Boolean(window.SpeechBubbleDesktopEditor?.snapshot));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-comic-mode="comic"]')));
  await page.waitForTimeout(250);
}

async function snapshot(page) {
  return page.evaluate(() => window.SpeechBubbleDesktopEditor.snapshot());
}

function elementCount(value, workspace) {
  return value?.layout?.workspaces?.[workspace]?.elements?.length || 0;
}

async function addSingleBackground(page) {
  await page.locator("#backgroundFileInput").setInputFiles({
    name: "single-background.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await page.waitForFunction(async () => {
    const value = await window.SpeechBubbleDesktopEditor.snapshot();
    return value.images.some((record) => record.id === "__single_background__");
  });
}

async function run() {
  await waitForServer();
  await api("/desktop/config", {
    method: "PUT",
    body: {
      startup_behavior: "new",
      auto_save: true,
      auto_save_interval_seconds: 3600,
      language: "en",
    },
  });

  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(String(error?.stack || error)));
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await waitForEditor(page);

    await page.locator('[data-comic-mode="comic"]').click();
    await page.locator("#addText").click();
    const comicFirst = await snapshot(page);
    assert.ok(elementCount(comicFirst, "comic") >= 1, "comic workspace must retain its inserted layer");

    await page.locator('[data-comic-mode="single"]').click();
    await addSingleBackground(page);
    await page.locator("#addText").click();
    const dual = await snapshot(page);
    assert.equal(dual.layout.active_workspace, "single");
    assert.ok(elementCount(dual, "single") >= 1, "single workspace must retain its inserted layer");
    assert.ok(elementCount(dual, "comic") >= 1, "switching to single must not clear comic layers");

    await page.locator('[data-comic-mode="comic"]').click();
    const switchedBack = await snapshot(page);
    assert.equal(switchedBack.layout.active_workspace, "comic");
    assert.ok(elementCount(switchedBack, "single") >= 1, "switching back must preserve single layers");
    assert.ok(elementCount(switchedBack, "comic") >= 1, "switching back must preserve comic layers");

    const recoverySave = await page.evaluate(() => window.SpeechBubbleDesktopShell.saveRecovery(true));
    assert.equal(recoverySave.ok, true);
    const recovery = await api("/desktop/recovery/load");
    assert.ok(elementCount(recovery, "single") >= 1, "recovery must contain single workspace layers");
    assert.ok(elementCount(recovery, "comic") >= 1, "recovery must contain comic workspace layers");
    assert.equal(recovery.layout.active_workspace, "comic");

    await api("/desktop/config", {
      method: "PUT",
      body: { startup_behavior: "resume", auto_save: true, auto_save_interval_seconds: 3600, language: "en" },
    });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await waitForEditor(page);
    await page.waitForFunction(async () => {
      const value = await window.SpeechBubbleDesktopEditor.snapshot();
      return (value.layout?.workspaces?.single?.elements?.length || 0) > 0 &&
        (value.layout?.workspaces?.comic?.elements?.length || 0) > 0;
    });
    const resumed = await snapshot(page);
    assert.ok(elementCount(resumed, "single") >= 1, "restart recovery must restore single workspace");
    assert.ok(elementCount(resumed, "comic") >= 1, "restart recovery must restore comic workspace");

    const projectPath = path.join(dataRoot, "dual-workspace.sbeproj");
    const saveResponse = await api("/desktop/project/save", {
      method: "POST",
      body: { path: projectPath, ...resumed },
    });
    assert.equal(saveResponse.ok, true);
    const opened = await api("/desktop/project/open", { method: "POST", body: { path: projectPath } });
    assert.ok(elementCount(opened, "single") >= 1, "project archive must retain single workspace");
    assert.ok(elementCount(opened, "comic") >= 1, "project archive must retain comic workspace");
    assert.ok(opened.images.some((record) => record.id === "__single_background__"), "project archive must retain the single background");

    await page.locator("#addText").click();
    const uiProjectPath = path.join(dataRoot, "ui-save.sbeproj");
    await page.evaluate((selectedPath) => {
      window.pywebview = { api: { choose_project_save: async () => selectedPath } };
    }, uiProjectPath);
    await page.locator('[data-desktop-action="project-save"]').click();
    await page.waitForFunction(() => document.getElementById("saveState")?.textContent.includes("保存しました"));
    const projectSaveLeavesDirty = await page.evaluate(() => !document.getElementById("discardChanges").disabled);

    const smallLayout = await (async () => {
      const smallContext = await browser.newContext({ viewport: { width: 900, height: 640 } });
      const smallPage = await smallContext.newPage();
      await smallPage.goto(`${origin}/`, { waitUntil: "networkidle" });
      await waitForEditor(smallPage);
      const result = await smallPage.evaluate(() => {
        const describe = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const visibleWidth = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
          const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            visibleRatio: rect.width && rect.height ? (visibleWidth * visibleHeight) / (rect.width * rect.height) : 0,
          };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          canvas: describe("#viewport"),
          properties: describe("#propertiesDock"),
          layers: describe("#layersDock"),
          header: describe("body > header"),
        };
      });
      await smallContext.close();
      return result;
    })();

    await api("/desktop/cache/clear", { method: "POST" });
    await api("/desktop/config", {
      method: "PUT",
      body: { startup_behavior: "new", auto_save: true, auto_save_interval_seconds: 3600, language: "en" },
    });
    const closeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const closePage = await closeContext.newPage();
    await closePage.goto(`${origin}/`, { waitUntil: "networkidle" });
    await waitForEditor(closePage);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const baseline = await api("/desktop/recovery/load");
      if (baseline.available !== false || baseline.layout) break;
      await sleep(100);
    }
    const beforeClose = await snapshot(closePage);
    const baselineCount = elementCount(beforeClose, "comic");
    await closePage.locator("#addText").click();
    const editedBeforeClose = await snapshot(closePage);
    assert.ok(elementCount(editedBeforeClose, "comic") > baselineCount);
    await closePage.close({ runBeforeUnload: false });
    await sleep(1500);
    const afterNativeClose = await api("/desktop/recovery/load");
    const nativeCloseRecoveryPersisted = elementCount(afterNativeClose, "comic") >= elementCount(editedBeforeClose, "comic");
    await closeContext.close();

    const mainSource = fs.readFileSync(path.join(repoRoot, "desktop_app", "main.py"), "utf8");
    const editorSource = fs.readFileSync(path.join(repoRoot, "web", "speech-bubble-editor.html"), "utf8");
    const findings = {
      dualWorkspaceSwitchRoundTrip: true,
      recoveryRoundTrip: true,
      restartResumeRoundTrip: true,
      projectArchiveRoundTrip: true,
      projectSaveLeavesDirty,
      nativeCloseRecoveryPersisted,
      secondLaunchHasRestoreSignal: /FindWindowW|ShowWindow\(|SetForegroundWindow|restore\(\)/.test(mainSource),
      nativeCloseHasAwaitableGuard: /events\.closing|prepareForNativeClose|beforeClose/.test(mainSource),
      storedNativeWindowStateIsRead: /getItem\(EDITOR_WINDOW_STATE_KEY\)/.test(editorSource),
      smallViewportLayout: smallLayout,
      browserErrors,
    };
    fs.writeFileSync(path.join(repoRoot, "audit-results.json"), JSON.stringify(findings, null, 2));
    console.log(JSON.stringify(findings, null, 2));
    assert.deepEqual(browserErrors, [], "browser runtime must not raise page errors");
    await context.close();
  } finally {
    await browser.close();
  }
}

run()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server.exitCode === null) server.kill();
    await sleep(250);
    if (server.exitCode === null) server.kill("SIGKILL");
  });

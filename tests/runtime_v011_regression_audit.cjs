const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sbe-v011-audit-"));
const port = 24000 + Math.floor(Math.random() * 8000);
const origin = `http://127.0.0.1:${port}`;
const token = "audit-token";
const headers = { "X-SBE-Token": token };

const pngA = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const pngB = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAWwW6vQAAAAASUVORK5CYII=",
  "base64",
);

const server = spawn(
  process.env.PYTHON || "python",
  [path.join(repoRoot, "tests", "audit_server_v011.py"), dataRoot, String(port)],
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
    if (server.exitCode !== null) {
      throw new Error(`audit server exited early (${server.exitCode})\n${serverOutput}`);
    }
    try {
      const result = await api("/desktop/health");
      if (result.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`audit server did not start\n${serverOutput}`);
}

async function waitForEditor(page) {
  await page.waitForFunction(() => Boolean(window.SpeechBubbleDesktopEditor?.snapshot));
  await page.waitForFunction(() => Boolean(window.SpeechBubbleDesktopShell?.saveRecovery));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-comic-mode="comic"]')));
  await page.waitForTimeout(250);
}

async function snapshot(page) {
  return page.evaluate(() => window.SpeechBubbleDesktopEditor.snapshot());
}

function workspace(value, name) {
  return value?.layout?.workspaces?.[name] || {};
}

function elementCount(value, name) {
  return Array.isArray(workspace(value, name).elements) ? workspace(value, name).elements.length : 0;
}

function comicImageRecords(value) {
  return (value?.images || [])
    .filter((item) => item?.id && item.id !== "__single_background__")
    .map((item) => ({ id: item.id, name: item.name, mime: item.mime }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function collectImageRefs(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageRefs(item, output));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if ((key === "image_id" || key === "imageId") && typeof child === "string") output.push(child);
      collectImageRefs(child, output);
    }
  }
  return [...new Set(output)].sort();
}

function comicFingerprint(value) {
  const item = JSON.parse(JSON.stringify(workspace(value, "comic")));
  return {
    elementIds: (item.elements || []).map((entry) => entry.id).sort(),
    elementCount: (item.elements || []).length,
    imageRecords: comicImageRecords(value),
    panelImageRefs: collectImageRefs(item),
    comicState: item.comic || item.comic_state || null,
  };
}

async function configureNew() {
  await api("/desktop/config", {
    method: "PUT",
    body: {
      startup_behavior: "new",
      auto_save: true,
      auto_save_interval_seconds: 3600,
      language: "en",
    },
  });
}

async function openFreshPage(browser, errors, consoleErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error?.stack || error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await waitForEditor(page);
  return { context, page };
}

async function seedComic(page) {
  await page.locator('[data-comic-mode="comic"]').click();
  for (let index = 0; index < 4; index += 1) {
    await page.locator("#addText").click();
  }
  const input = page.locator("[data-comic-image-input]");
  await input.setInputFiles([
    { name: "panel-1.png", mimeType: "image/png", buffer: pngA },
    { name: "panel-2.png", mimeType: "image/png", buffer: pngB },
    { name: "panel-3.png", mimeType: "image/png", buffer: pngA },
    { name: "panel-4.png", mimeType: "image/png", buffer: pngB },
  ]);
  await page.waitForFunction(async () => {
    const value = await window.SpeechBubbleDesktopEditor.snapshot();
    return (value.images || []).filter((item) => item.id !== "__single_background__").length >= 4;
  });
  const value = await snapshot(page);
  assert.ok(elementCount(value, "comic") >= 4, "comic seed must contain four layers");
  assert.ok(comicImageRecords(value).length >= 4, "comic seed must contain four page images");
  return value;
}

async function loadSingleBackground(page, fileName, buffer) {
  await page.locator('[data-comic-mode="single"]').click();
  await page.locator("#backgroundFileInput").setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer,
  });
  await page.waitForFunction(async () => {
    const value = await window.SpeechBubbleDesktopEditor.snapshot();
    return (value.images || []).some((item) => item.id === "__single_background__");
  });
  if (await page.locator("#imageLayoutRestoreDialog[open]").count()) {
    await page.locator("#imageRestoreNew").click();
  }
  await page.waitForTimeout(200);
}

async function saveLayoutIfAvailable(page) {
  const save = page.locator("#saveLayout");
  if (!(await save.isDisabled())) {
    await save.click();
    await page.waitForTimeout(250);
  }
}

async function runReplacementScenario(browser, action, errors, consoleErrors) {
  await configureNew();
  const { context, page } = await openFreshPage(browser, errors, consoleErrors);
  try {
    const seeded = await seedComic(page);
    const before = comicFingerprint(seeded);

    await loadSingleBackground(page, "single-first.png", pngA);
    await page.locator("#addText").click();
    assert.ok(elementCount(await snapshot(page), "single") >= 1, "single workspace must be dirty before replacement");

    await page.locator("#backgroundFileInput").setInputFiles({
      name: "single-second.png",
      mimeType: "image/png",
      buffer: pngB,
    });
    await page.locator("#replaceImageDialog[open]").waitFor({ state: "visible" });
    await page.locator(action === "discard" ? "#replaceDiscard" : "#replaceSave").click();
    await page.waitForTimeout(350);
    if (await page.locator("#imageLayoutRestoreDialog[open]").count()) {
      await page.locator("#imageRestoreNew").click();
      await page.waitForTimeout(200);
    }
    await saveLayoutIfAvailable(page);

    const afterSingle = await snapshot(page);
    await page.locator('[data-comic-mode="comic"]').click();
    await page.waitForTimeout(200);
    const afterComic = await snapshot(page);
    const after = comicFingerprint(afterComic);

    const projectPath = path.join(dataRoot, `replacement-${action}.sbeproj`);
    const projectSave = await api("/desktop/project/save", {
      method: "POST",
      body: { path: projectPath, ...afterComic },
    }).catch((error) => ({ ok: false, error: String(error) }));
    const reopened = projectSave.ok
      ? await api("/desktop/project/open", { method: "POST", body: { path: projectPath } })
      : null;

    return {
      before,
      afterSingleWorkspaceElementCount: elementCount(afterSingle, "single"),
      after,
      workspacePreserved: after.elementCount === before.elementCount,
      imageTrayPreserved: after.imageRecords.length === before.imageRecords.length,
      deepContentPreserved: JSON.stringify(after) === JSON.stringify(before),
      projectSaveOk: Boolean(projectSave.ok),
      projectRoundTripPreserved: reopened ? comicFingerprint(reopened).elementCount === before.elementCount : false,
    };
  } finally {
    await context.close();
  }
}

async function runCleanReplacementScenario(browser, errors, consoleErrors) {
  await configureNew();
  const { context, page } = await openFreshPage(browser, errors, consoleErrors);
  try {
    const seeded = await seedComic(page);
    const before = comicFingerprint(seeded);
    await loadSingleBackground(page, "clean-first.png", pngA);
    await saveLayoutIfAvailable(page);
    await page.locator("#backgroundFileInput").setInputFiles({
      name: "clean-second.png",
      mimeType: "image/png",
      buffer: pngB,
    });
    await page.waitForTimeout(350);
    if (await page.locator("#replaceImageDialog[open]").count()) {
      await page.locator("#replaceDiscard").click();
      await page.waitForTimeout(250);
    }
    if (await page.locator("#imageLayoutRestoreDialog[open]").count()) {
      await page.locator("#imageRestoreNew").click();
    }
    await saveLayoutIfAvailable(page);
    await page.locator('[data-comic-mode="comic"]').click();
    const after = comicFingerprint(await snapshot(page));
    return {
      workspacePreserved: after.elementCount === before.elementCount,
      imageTrayPreserved: after.imageRecords.length === before.imageRecords.length,
      deepContentPreserved: JSON.stringify(after) === JSON.stringify(before),
      before,
      after,
    };
  } finally {
    await context.close();
  }
}

async function runProjectAndRecoveryScenario(browser, errors, consoleErrors) {
  await configureNew();
  const { context, page } = await openFreshPage(browser, errors, consoleErrors);
  try {
    await seedComic(page);
    await loadSingleBackground(page, "project-single.png", pngA);
    await page.locator("#addText").click();
    const before = await snapshot(page);
    const projectPath = path.join(dataRoot, "project-roundtrip.sbeproj");
    await page.evaluate((selectedPath) => {
      window.pywebview = { api: { choose_project_save: async () => selectedPath } };
    }, projectPath);
    await page.locator('[data-desktop-action="project-save"]').click();
    await page.waitForFunction(() => document.getElementById("saveState")?.textContent.includes("保存しました"));
    const dirtyAfterSave = await page.evaluate(() => !document.getElementById("discardChanges").disabled);
    const recovery = await api("/desktop/recovery/load");
    const opened = await api("/desktop/project/open", { method: "POST", body: { path: projectPath } });
    const closeResult = await page.evaluate(() => window.SpeechBubbleDesktopEditor.prepareNativeClose({ fromNative: false }));
    return {
      dirtyAfterSave,
      projectRoundTripSingle: elementCount(opened, "single") === elementCount(before, "single"),
      projectRoundTripComic: elementCount(opened, "comic") === elementCount(before, "comic"),
      projectRoundTripImages: (opened.images || []).length === (before.images || []).length,
      recoverySingle: elementCount(recovery, "single") === elementCount(before, "single"),
      recoveryComic: elementCount(recovery, "comic") === elementCount(before, "comic"),
      recoveryProjectPath: recovery?.manifest?.project_path || "",
      nativeCloseCheckpointOk: Boolean(closeResult?.ok),
    };
  } finally {
    await context.close();
  }
}

async function run() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const consoleErrors = [];
  try {
    const discardReplace = await runReplacementScenario(browser, "discard", browserErrors, consoleErrors);
    const saveReplace = await runReplacementScenario(browser, "save", browserErrors, consoleErrors);
    const cleanReplace = await runCleanReplacementScenario(browser, browserErrors, consoleErrors);
    const projectRecovery = await runProjectAndRecoveryScenario(browser, browserErrors, consoleErrors);

    const mainSource = fs.readFileSync(path.join(repoRoot, "desktop_app", "main.py"), "utf8");
    const editorSource = fs.readFileSync(path.join(repoRoot, "web", "speech-bubble-editor.html"), "utf8");
    const shellSource = fs.readFileSync(path.join(repoRoot, "web", "desktop", "desktop-shell.js"), "utf8");
    const projectStoreSource = fs.readFileSync(path.join(repoRoot, "desktop_app", "project_store.py"), "utf8");

    const findings = {
      releaseVersion: "0.1.1",
      discardReplace,
      saveLayoutReplace: saveReplace,
      cleanReplace,
      projectRecovery,
      staticChecks: {
        replacementCallsGlobalCanvasReset:
          /function clearDocumentCanvas\(\)[\s\S]*?loadState\("\{\}"\)/.test(editorSource) &&
          /function performPendingReplacement\([\s\S]*?loadLocalImageFile/.test(editorSource),
        discardReplacementDoesNotCaptureComicWorkspace:
          /replaceDiscard"\)\.onclick=async\(\)=>\{try\{if\(documentId\)removeDraftCache\(\);\}catch\{\}document\.getElementById\("replaceImageDialog"\)\.close\(\);await performPendingReplacement\(\);\}/.test(editorSource),
        projectSaveMarksClean: /markProjectSaved/.test(shellSource) && /layoutDirty=false/.test(editorSource),
        projectOpenRefreshesRecovery: /saveRecoveryCheckpoint/.test(shellSource),
        nativeCloseAwaited: /prepareNativeClose/.test(editorSource) && /native_close_ready/.test(mainSource),
        secondLaunchActivation: /_ACTIVATE_EVENT_NAME/.test(mainSource) && /SetEvent\(event\)/.test(mainSource),
        savedWindowGeometryRestore: /normalized_window_geometry/.test(mainSource),
        missingBlobGuard: /Project image blob is missing/.test(projectStoreSource),
      },
      browserErrors,
      consoleErrors,
    };

    findings.confirmedProblems = [];
    if (!discardReplace.deepContentPreserved) {
      findings.confirmedProblems.push("Discard & Replace followed by Save Layout clears or changes the 4koma workspace.");
    }
    if (!saveReplace.deepContentPreserved) {
      findings.confirmedProblems.push("Save Layout & Replace followed by Save Layout clears or changes the 4koma workspace.");
    }
    if (!cleanReplace.deepContentPreserved) {
      findings.confirmedProblems.push("Replacing a clean single-image background clears or changes the 4koma workspace.");
    }
    if (projectRecovery.dirtyAfterSave) {
      findings.confirmedProblems.push("Project save still leaves the editor dirty.");
    }
    if (!projectRecovery.projectRoundTripSingle || !projectRecovery.projectRoundTripComic || !projectRecovery.projectRoundTripImages) {
      findings.confirmedProblems.push("Project archive round-trip is incomplete.");
    }
    if (!projectRecovery.recoverySingle || !projectRecovery.recoveryComic) {
      findings.confirmedProblems.push("Recovery checkpoint does not preserve both workspaces.");
    }

    fs.writeFileSync(path.join(repoRoot, "audit-v011-results.json"), JSON.stringify(findings, null, 2));
    console.log(JSON.stringify(findings, null, 2));

    assert.deepEqual(browserErrors, [], "browser runtime must not raise page errors");
    assert.equal(projectRecovery.projectRoundTripSingle, true, "single workspace project round-trip must pass");
    assert.equal(projectRecovery.projectRoundTripComic, true, "comic workspace project round-trip must pass");
    assert.equal(projectRecovery.nativeCloseCheckpointOk, true, "native-close checkpoint preparation must pass");
  } finally {
    await browser.close();
    if (server.exitCode === null) server.kill();
    await sleep(250);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

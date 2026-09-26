"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("desktop_browser_smoke: SKIP (playwright unavailable)"); process.exit(0); }
(async () => {
  const server = spawn(process.env.PYTHON || "python", ["-u", "tests/serve_desktop_browser.py"], { cwd: path.resolve(__dirname, "..") });
  let browser;
  let errors = "";
  server.stderr.on("data", data => { errors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("server timeout: " + errors)), 30000);
      server.stdout.on("data", chunk => {
        output += chunk;
        const found = /SBE_TEST_SERVER=(\d+)/.exec(output);
        if (found) { clearTimeout(timer); resolve(Number(found[1])); }
      });
      server.on("exit", code => { clearTimeout(timer); reject(new Error("server exited " + code + ": " + errors)); });
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", error => { pageErrors.push(error.message); console.error("PAGEERROR:", error.stack || error.message); });
    page.on("console", message => { if (message.type() === "error") console.error("BROWSER:", message.text()); });
    page.on("response", async response => {
      if (response.status() < 400) return;
      let body = "";
      try { body = (await response.text()).slice(0, 1000); } catch {}
      console.error("HTTP", response.status(), response.url(), body);
    });
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.SpeechBubbleDesktopEditor && document.querySelector("#canvas"));
    const health = await page.evaluate(async () => { const r = await fetch("/desktop/health"); return { status:r.status, body:await r.json() }; });
    assert.equal(health.status, 200);
    assert.equal(health.body.version, "0.1.10");
    const config = await page.evaluate(async () => { const r = await fetch("/desktop/config"); return { status:r.status, body:await r.json() }; });
    assert.equal(config.status, 200);
    assert.equal(typeof config.body.settings, "object");

    // Page Images are one document-scoped library across both comic workspaces.
    await page.locator('button[data-editor-mode="comic"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.editorMode === "comic");
    assert.equal(await page.evaluate(() => Boolean(window.SpeechBubbleSharedPageImages)), true);

    const sharedPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmBigAAD34BADaOyqcAAAAAElFTkSuQmCC", "base64");
    await page.locator("[data-comic-image-input]").setInputFiles({ name: "shared-page.png", mimeType: "image/png", buffer: sharedPng });
    await page.waitForFunction(() => document.querySelector("[data-comic-image-count]")?.textContent?.includes("1"));

    await page.locator('button[data-editor-mode="comic_layout"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.editorMode === "comic_layout");
    await page.waitForFunction(() => document.querySelector("[data-general-image-count]")?.textContent?.includes("1"));

    await page.locator("[data-comic-converter-open]").click();
    await page.waitForFunction(() => document.querySelector("dialog.comic-converter-dialog")?.open === true);
    const converterDialog = page.locator("dialog.comic-converter-dialog");
    assert.match(await converterDialog.locator(".comic-converter-head > strong").innerText(), /白黒変換|Black & White Conversion/);
    assert.match(await converterDialog.locator("[data-converter-mode]").innerText(), /コミック|Comic/);
    await page.waitForFunction(() => {
      const dialog = document.querySelector("dialog.comic-converter-dialog");
      if (!dialog?.open) return false;
      const apply = dialog.querySelector('[data-converter-action="apply"]');
      return Boolean(apply && !apply.disabled) || Boolean(dialog.querySelector(".comic-converter-candidate"));
    });
    if (await converterDialog.locator(".comic-converter-candidate").count()) await converterDialog.locator(".comic-converter-candidate").first().click();
    await page.waitForFunction(() => {
      const apply = document.querySelector('dialog.comic-converter-dialog [data-converter-action="apply"]');
      return Boolean(apply && !apply.disabled);
    });
    await converterDialog.locator('[data-converter-action="apply"]').click();
    await page.waitForFunction(() => !document.querySelector("dialog.comic-converter-dialog")?.open);
    await page.waitForFunction(() => document.querySelector("[data-general-image-count]")?.textContent?.includes("2"));

    await page.locator('button[data-editor-mode="comic"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.editorMode === "comic");
    await page.waitForFunction(() => document.querySelector("[data-comic-image-count]")?.textContent?.includes("2"));

    await page.locator("[data-comic-converter-open]").click();
    await page.waitForFunction(() => document.querySelector("dialog.comic-converter-dialog")?.open === true);
    assert.match(await converterDialog.locator("[data-converter-mode]").innerText(), /4コマ漫画|4-Panel Manga/);
    await converterDialog.locator('[data-converter-action="cancel"]').click();

    assert.deepEqual(pageErrors, []);
    console.log("desktop_browser_smoke: OK (shared Page Images + Black & White Conversion)");
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

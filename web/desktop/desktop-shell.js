(function (root) {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (params.get("host") !== "desktop") return;
  const token = params.get("token") || "";
  const nativeFetch = root.fetch.bind(root);

  root.fetch = function desktopAuthenticatedFetch(input, options = {}) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    if (
      url.origin === location.origin &&
      (url.pathname.startsWith("/desktop/") ||
        url.pathname.startsWith("/speech_bubble") ||
        url.pathname.startsWith("/speech-bubble-editor/"))
    ) {
      const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("X-SBE-Token", token);
      return nativeFetch(input, { ...options, headers });
    }
    return nativeFetch(input, options);
  };

  async function desktopFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("X-SBE-Token", token);
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await root.fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.detail || `Desktop request failed (${response.status})`);
    return payload;
  }

  function nativeApi() {
    return root.pywebview?.api || null;
  }

  function authenticatedMediaUrl(value) {
    const url = new URL(String(value || ""), location.href);
    if (url.origin === location.origin) url.searchParams.set("token", token);
    return url.href;
  }

  function createSettingsDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "desktopSettingsDialog";
    dialog.className = "document-dialog desktop-settings-dialog";
    dialog.innerHTML = `
      <div class="desktop-settings-head">
        <strong>Speech Bubble 4koma Editor 設定</strong>
        <button type="button" data-desktop-action="settings-close" aria-label="設定を閉じる">×</button>
      </div>
      <div class="desktop-settings-scroll">
        <details open>
          <summary>表示</summary>
          <div class="desktop-settings-grid">
            <label>テーマ
              <select data-desktop-setting="theme">
                <option value="system">システム</option>
                <option value="dark">ダーク</option>
                <option value="light">ライト</option>
              </select>
            </label>
            <label>言語
              <select data-desktop-setting="language">
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </details>
        <details open>
          <summary>Export</summary>
          <label>出力フォルダー
            <span class="desktop-path-row">
              <input data-desktop-setting="export_directory" type="text" placeholder="例: D:\\Pictures\\Speech Bubble 4koma Editor">
              <button type="button" data-desktop-action="export-directory-browse">参照…</button>
            </span>
          </label>
          <div class="desktop-inline-checks">
            <label class="desktop-check"><input data-desktop-setting="auto_export_to_directory" type="checkbox"><span>指定フォルダーへ自動保存する</span></label>
            <label class="desktop-check"><input data-desktop-setting="remember_export_directory" type="checkbox"><span>前回選択したフォルダーを記憶する</span></label>
          </div>
          <p class="hint">ON: 上記フォルダーへ自動保存。OFF: Exportのたびに保存先を選択します。</p>
          <div class="desktop-settings-grid">
            <label>画像形式
              <select data-desktop-setting="output_format">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </label>
            <label>ファイル名
              <select data-desktop-setting="filename_format">
                <option value="source_datetime">元名＋日時</option>
                <option value="source_sequence">元名＋連番</option>
                <option value="source_only">元名</option>
                <option value="speech_bubble_datetime">Speech Bubble＋日時</option>
              </select>
            </label>
            <label>日付サブフォルダー
              <select data-desktop-setting="date_subfolder">
                <option value="none">使用しない</option>
                <option value="year_month">年／月</option>
                <option value="year_month_day">年／月／日</option>
              </select>
            </label>
            <label>PNG圧縮
              <input data-desktop-setting="png_compression" type="number" min="0" max="9" step="1">
            </label>
            <label>JPEG品質
              <input data-desktop-setting="jpeg_quality" type="number" min="1" max="100" step="1">
            </label>
            <label>WebP品質
              <input data-desktop-setting="webp_quality" type="number" min="1" max="100" step="1">
            </label>
          </div>
          <div class="desktop-inline-checks">
            <label class="desktop-check"><input data-desktop-setting="webp_lossless" type="checkbox"><span>WebPをロスレス保存</span></label>
            <label class="desktop-check"><input data-desktop-setting="save_overlay" type="checkbox"><span>Overlay PNGも保存</span></label>
            <label class="desktop-check"><input data-desktop-setting="backup_enabled" type="checkbox"><span>同名ファイルを世代バックアップ</span></label>
          </div>
          <label class="desktop-compact-number">バックアップ世代数
            <input data-desktop-setting="backup_generations" type="number" min="1" max="20" step="1">
          </label>
        </details>
        <details>
          <summary>ユーザープリセット</summary>
          <div class="desktop-user-preset-overview">
            <div class="desktop-user-preset-counts">
              <button type="button" data-user-preset-target="sfx"><strong>Onomatopoeia / SFX</strong><span data-user-preset-count="sfx">0件</span></button>
              <button type="button" data-user-preset-target="stamp"><strong>Comic Stamps / Symbols</strong><span data-user-preset-count="stamp">0件</span></button>
            </div>
            <div class="desktop-preset-target-row"><strong>登録先</strong><div class="desktop-segmented">
              <button type="button" data-user-preset-target="sfx" class="active">SFX</button>
              <button type="button" data-user-preset-target="stamp">Stamp</button>
            </div></div>
            <div class="desktop-user-preset-drop" data-user-preset-drop tabindex="0" role="button">
              <strong>PNG / WebPをここへドロップ</strong><span>または</span>
              <button type="button" data-desktop-action="user-preset-add">ファイルを選択</button>
              <small>Ctrl+Vで貼り付け</small>
            </div>
            <input data-user-preset-file type="file" accept="image/png,image/webp" hidden>
            <button type="button" class="desktop-preset-manage" data-desktop-action="user-presets-open">プリセット管理</button>
          </div>
          <p class="hint">追加・変更・削除は即時保存されます。Apply settingsは不要です。</p>
        </details>
        <details>
          <summary>Editor・復元</summary>
          <label>起動時
            <select data-desktop-setting="startup_behavior">
              <option value="ask">毎回確認する</option>
              <option value="resume">前回の編集を再開</option>
              <option value="new">常に新規作成</option>
            </select>
          </label>
          <div class="desktop-autosave-row">
            <label class="desktop-check"><input data-desktop-setting="auto_save" type="checkbox"><span>自動保存</span></label>
            <label class="desktop-autosave-interval"><span>間隔</span><input data-desktop-setting="auto_save_interval_seconds" type="number" min="5" max="3600" step="5"><span>秒</span></label>
          </div>
        </details>
        <details>
          <summary>編集キャッシュ</summary>
          <div class="desktop-cache-row">
            <output data-desktop-cache-status>確認待ち</output>
            <button type="button" data-desktop-action="cache-refresh">更新</button>
            <button type="button" data-desktop-action="cache-clear">下書きキャッシュを削除</button>
          </div>
          <p class="hint">プロジェクト、ユーザープリセット、設定、書き出し画像は削除しません。</p>
        </details>
      </div>
      <div class="replace-dialog-actions">
        <button type="button" data-desktop-action="settings-close">閉じる</button>
        <button type="button" class="primary" data-desktop-action="settings-save">保存</button>
      </div>
    `;
    document.body.append(dialog);
    return dialog;
  }

  function createUserPresetDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "desktopUserPresetDialog";
    dialog.className = "document-dialog desktop-user-preset-dialog";
    dialog.innerHTML = `
      <div class="desktop-settings-head">
        <strong>ユーザープリセット管理</strong>
        <button type="button" data-desktop-action="user-presets-close" aria-label="閉じる">×</button>
      </div>
      <div class="desktop-user-preset-body">
        <section class="desktop-user-preset-list-pane">
          <div class="desktop-user-preset-toolbar">
            <button type="button" data-desktop-action="user-preset-add">＋ 新規追加</button>
            <button type="button" data-desktop-action="user-preset-organize">旧世代を整理</button>
            <output data-user-preset-summary>読み込み中…</output>
          </div>
          <div class="desktop-user-preset-filter">
            <button type="button" data-user-preset-filter="all" class="active">すべて</button>
            <button type="button" data-user-preset-filter="sfx">SFX</button>
            <button type="button" data-user-preset-filter="stamp">Stamp</button>
          </div>
          <div data-user-preset-list class="desktop-user-preset-list"></div>
        </section>
        <section data-user-preset-editor class="desktop-user-preset-editor" hidden>
          <div class="desktop-user-preset-preview-pane">
            <div class="desktop-user-preset-preview"><canvas data-user-preset-preview aria-label="プリセットプレビュー"></canvas></div>
            <button type="button" data-desktop-action="user-preset-replace-image">画像を差し替える</button>
            <input data-user-preset-replace-file type="file" accept="image/png,image/webp" hidden>
            <p class="hint">プレビューは編集後の初期スタイルです。</p>
          </div>
          <div class="desktop-user-preset-edit-scroll">
            <div class="desktop-settings-grid">
              <label>名前<input data-user-preset-field="name" maxlength="80"></label>
              <label>種類<select data-user-preset-field="category"><option value="sfx">Onomatopoeia / SFX</option><option value="stamp">Comic Stamps / Symbols</option></select></label>
            </div>
            <section class="desktop-user-style-section">
              <strong>初期スタイル</strong>
              <div class="desktop-settings-grid desktop-user-size-grid">
                <label>Size (%)<input data-user-preset-scale type="number" min="10" max="400" step="1" value="100"></label>
                <label>Width<input data-user-preset-style="width" type="number" min="1" max="8192" step="1"></label>
                <label>Height<input data-user-preset-style="height" type="number" min="1" max="8192" step="1"></label>
                <label>Opacity<input data-user-preset-style="opacity" type="number" min="0" max="1" step="0.01"></label>
              </div>
              <label class="desktop-check"><input data-user-preset-style="mask_mode" type="checkbox"><span>Fill Colorを使用</span></label>
              <div class="desktop-settings-grid">
                <label>Fill Color<input data-user-preset-style="fill" type="color"></label>
                <label>Outline Color<input data-user-preset-style="stroke" type="color"></label>
              </div>
              <div data-user-preset-swatches="fill,stroke" class="desktop-user-preset-swatches"></div>
              <label>Outline Width<input data-user-preset-style="stroke_width" type="number" min="0" max="100" step="0.5"></label>
            </section>
            <details open><summary>Drop Shadow</summary>
              <label class="desktop-check"><input data-user-preset-style="shadow_enabled" type="checkbox"><span>有効</span></label>
              <label>Color<input data-user-preset-style="shadow_color" type="color"></label>
              <div data-user-preset-swatches="shadow_color" class="desktop-user-preset-swatches"></div>
              <div class="desktop-user-shadow-directions" aria-label="Shadow direction">
                <button type="button" data-user-shadow-dir="-1,-1">↖</button><button type="button" data-user-shadow-dir="0,-1">↑</button><button type="button" data-user-shadow-dir="1,-1">↗</button>
                <button type="button" data-user-shadow-dir="-1,0">←</button><button type="button" data-user-shadow-dir="0,0">•</button><button type="button" data-user-shadow-dir="1,0">→</button>
                <button type="button" data-user-shadow-dir="-1,1">↙</button><button type="button" data-user-shadow-dir="0,1">↓</button><button type="button" data-user-shadow-dir="1,1">↘</button>
              </div>
              <div class="desktop-settings-grid">
                <label>X<input data-user-preset-style="shadow_x" type="number" min="-500" max="500" step="1"></label>
                <label>Y<input data-user-preset-style="shadow_y" type="number" min="-500" max="500" step="1"></label>
                <label>Blur<input data-user-preset-style="shadow_blur" type="number" min="0" max="200" step="1"></label>
              </div>
            </details>
            <details><summary>Outer Glow</summary>
              <label class="desktop-check"><input data-user-preset-style="glow_enabled" type="checkbox"><span>有効</span></label>
              <label>Color<input data-user-preset-style="glow_color" type="color"></label>
              <div data-user-preset-swatches="glow_color" class="desktop-user-preset-swatches"></div>
              <div class="desktop-settings-grid">
                <label>Opacity<input data-user-preset-style="glow_opacity" type="number" min="0" max="1" step="0.01"></label>
                <label>Blur<input data-user-preset-style="glow_blur" type="number" min="0" max="200" step="1"></label>
                <label>Spread<input data-user-preset-style="glow_spread" type="number" min="0" max="100" step="1"></label>
              </div>
            </details>
            <div class="replace-dialog-actions">
              <button type="button" data-desktop-action="user-preset-edit-cancel">キャンセル</button>
              <button type="button" class="danger" data-desktop-action="user-preset-delete">削除</button>
              <button type="button" data-desktop-action="user-preset-save-as">別名で保存</button>
              <button type="button" class="primary" data-desktop-action="user-preset-save">変更を保存</button>
            </div>
          </div>
        </section>
      </div>
    `;
    document.body.append(dialog);
    installUserPresetEditorUi(dialog);
    return dialog;
  }

  async function userAssetFetch(path = "", options = {}) {
    const response = await root.fetch(`/speech-bubble-editor/user-assets${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const detail = payload.detail && typeof payload.detail === "object" ? payload.detail : payload;
      const error = new Error(detail.message || payload.detail || `User preset request failed (${response.status})`);
      error.code = detail.code || "";
      error.existingId = detail.existing_id || "";
      error.suggestedName = detail.suggested_name || "";
      throw error;
    }
    return payload;
  }

  const USER_PRESET_SWATCHES = [
    "#111111", "#ffffff", "#8b949e", "#e94b50", "#ff7a21", "#ffd32a", "#84cc16", "#45c875",
    "#52c7b8", "#5bc0eb", "#73a9f5", "#4f83ed", "#6c63e8", "#9b51e0", "#c42acb", "#db3f8d",
    "#8c7565", "#fff0cf", "#ffb5b5", "#fff0a6", "#f8e5a0", "#93a93d", "#4d8068", "#3e7f78",
    "#39739d", "#3d5ca8", "#5949a6", "#a584bd", "#e5b7cf",
  ];
  let userPresetCatalog = null;
  let selectedUserPreset = null;
  let userPresetTarget = "sfx";
  let userPresetFilter = "all";
  let userPresetDraftUrl = "";

  function desktopText(japanese, english) {
    return document.documentElement.lang === "en" ? english : japanese;
  }

  function defaultUserPresetStyle(preset = {}) {
    const value = preset.style_defaults || {};
    return {
      width: Number(value.width) || Number(preset.width) || 360,
      height: Number(value.height) || Number(preset.height) || 360,
      mask_mode: value.mask_mode === true,
      fill: value.fill || "#ffffff",
      stroke: value.stroke || "#111111",
      stroke_width: Number(value.stroke_width) || 0,
      opacity: Number.isFinite(Number(value.opacity)) ? Number(value.opacity) : 1,
      shadow_enabled: value.shadow_enabled === true,
      shadow_color: value.shadow_color || "#000000",
      shadow_x: Number.isFinite(Number(value.shadow_x)) ? Number(value.shadow_x) : 6,
      shadow_y: Number.isFinite(Number(value.shadow_y)) ? Number(value.shadow_y) : 6,
      shadow_blur: Number.isFinite(Number(value.shadow_blur)) ? Number(value.shadow_blur) : 4,
      glow_enabled: value.glow_enabled === true,
      glow_color: value.glow_color || "#ffffff",
      glow_opacity: Number.isFinite(Number(value.glow_opacity)) ? Number(value.glow_opacity) : 0.75,
      glow_blur: Number.isFinite(Number(value.glow_blur)) ? Number(value.glow_blur) : 16,
      glow_spread: Number.isFinite(Number(value.glow_spread)) ? Number(value.glow_spread) : 0,
    };
  }

  function releaseUserPresetDraftUrl() {
    if (!userPresetDraftUrl) return;
    URL.revokeObjectURL(userPresetDraftUrl);
    userPresetDraftUrl = "";
  }

  function presetImageUrl(preset) {
    if (preset?.preview_url) return preset.preview_url;
    const value = preset?.thumbnail_url || preset?.asset_url || "";
    return value ? authenticatedMediaUrl(value) : "";
  }

  async function imageDimensions(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth || 360, height: image.naturalHeight || 360 };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function collectUserPresetStyle(dialog) {
    const style = defaultUserPresetStyle(selectedUserPreset || {});
    dialog.querySelectorAll("[data-user-preset-style]").forEach((input) => {
      style[input.dataset.userPresetStyle] =
        input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
    });
    return style;
  }

  function tintedPreview(source, color) {
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function renderUserPresetPreview(dialog) {
    const canvas = dialog.querySelector("[data-user-preset-preview]");
    if (!canvas || !selectedUserPreset) return;
    const preset = selectedUserPreset;
    const source = new Image();
    source.src = presetImageUrl(preset);
    try {
      await source.decode();
    } catch {
      return;
    }
    if (selectedUserPreset !== preset) return;
    const style = collectUserPresetStyle(dialog);
    const width = Math.max(360, Math.min(900, Number(style.width) || source.naturalWidth));
    const height = Math.max(240, Math.min(600, Number(style.height) || source.naturalHeight));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    const inset = Math.max(18, Number(style.stroke_width) + Number(style.glow_blur) + Number(style.glow_spread));
    const ratio = Math.min((width - inset * 2) / source.naturalWidth, (height - inset * 2) / source.naturalHeight);
    const drawWidth = source.naturalWidth * ratio;
    const drawHeight = source.naturalHeight * ratio;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    const fillSource = style.mask_mode ? tintedPreview(source, style.fill) : source;
    context.globalAlpha = Math.max(0, Math.min(1, Number(style.opacity)));
    if (style.glow_enabled) {
      context.save();
      context.shadowColor = style.glow_color;
      context.shadowBlur = Math.max(0, Number(style.glow_blur) + Number(style.glow_spread));
      context.drawImage(fillSource, x, y, drawWidth, drawHeight);
      context.restore();
    }
    if (style.shadow_enabled) {
      context.save();
      context.shadowColor = style.shadow_color;
      context.shadowOffsetX = Number(style.shadow_x) || 0;
      context.shadowOffsetY = Number(style.shadow_y) || 0;
      context.shadowBlur = Math.max(0, Number(style.shadow_blur) || 0);
      context.drawImage(fillSource, x, y, drawWidth, drawHeight);
      context.restore();
    }
    const outline = Math.max(0, Number(style.stroke_width) || 0);
    if (outline > 0) {
      const outlineSource = tintedPreview(source, style.stroke);
      const steps = Math.max(12, Math.ceil(outline * 4));
      for (let index = 0; index < steps; index += 1) {
        const angle = index / steps * Math.PI * 2;
        context.drawImage(outlineSource, x + Math.cos(angle) * outline, y + Math.sin(angle) * outline, drawWidth, drawHeight);
      }
    }
    context.drawImage(fillSource, x, y, drawWidth, drawHeight);
  }

  function editUserPreset(dialog, preset) {
    selectedUserPreset = preset;
    const editor = dialog.querySelector("[data-user-preset-editor]");
    editor.hidden = !preset;
    dialog.querySelector(".desktop-user-preset-body")?.classList.toggle("editing", Boolean(preset));
    if (!preset) return;
    dialog.querySelector('[data-user-preset-field="name"]').value = preset.name || "";
    dialog.querySelector('[data-user-preset-field="category"]').value = preset.category === "stamp" ? "stamp" : "sfx";
    const style = defaultUserPresetStyle(preset);
    editor.querySelectorAll("[data-user-preset-style]").forEach((input) => {
      const value = style[input.dataset.userPresetStyle];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
    });
    const scale = dialog.querySelector("[data-user-preset-scale]");
    if (scale) scale.value = "100";
    const deleteButton = dialog.querySelector('[data-desktop-action="user-preset-delete"]');
    const saveButton = dialog.querySelector('[data-desktop-action="user-preset-save"]');
    const saveAsButton = dialog.querySelector('[data-desktop-action="user-preset-save-as"]');
    if (deleteButton) deleteButton.hidden = preset.__draft === true;
    if (saveAsButton) saveAsButton.hidden = preset.__draft === true;
    if (saveButton) {
      const english = document.documentElement.lang === "en";
      saveButton.textContent = preset.__draft === true
        ? english ? "Register" : "登録する"
        : english ? "Save Changes" : "変更を保存";
    }
    renderUserPresetPreview(dialog);
  }

  function renderUserPresets(dialog) {
    const allPresets = userPresetCatalog?.presets || [];
    const presets = userPresetFilter === "all" ? allPresets : allPresets.filter((preset) => preset.category === userPresetFilter);
    const counts = userPresetCatalog?.counts || {};
    dialog.querySelector("[data-user-preset-summary]").textContent =
      desktopText(
        `SFX ${counts.sfx || 0}件／Stamps ${counts.stamp || 0}件／旧世代 ${userPresetCatalog?.archive?.old_generation_assets || 0}件`,
        `SFX ${counts.sfx || 0} / Stamps ${counts.stamp || 0} / Archived ${userPresetCatalog?.archive?.old_generation_assets || 0}`,
      );
    const list = dialog.querySelector("[data-user-preset-list]");
    list.replaceChildren(
      ...presets.map((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "desktop-user-preset-card";
        button.classList.toggle("active", preset.id === selectedUserPreset?.id);
        button.innerHTML = `<img alt=""><span></span><small></small>`;
        button.querySelector("img").src = authenticatedMediaUrl(preset.thumbnail_url || preset.asset_url);
        button.querySelector("span").textContent = preset.name;
        button.querySelector("small").textContent = preset.category === "stamp" ? "Stamp" : "SFX";
        button.onclick = () => {
          editUserPreset(dialog, preset);
          renderUserPresets(dialog);
        };
        return button;
      }),
    );
    if (!presets.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = desktopText("ユーザープリセットはまだありません。", "No user presets yet.");
      list.append(empty);
    }
  }

  function setUserPresetTarget(value) {
    userPresetTarget = value === "stamp" ? "stamp" : "sfx";
    document.querySelectorAll("[data-user-preset-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.userPresetTarget === userPresetTarget);
    });
  }

  async function refreshUserPresetOverview(dialog) {
    try {
      userPresetCatalog = await userAssetFetch();
      const counts = userPresetCatalog?.counts || {};
      dialog.querySelectorAll("[data-user-preset-count]").forEach((node) => {
        const count = Number(counts[node.dataset.userPresetCount] || 0);
        node.textContent = desktopText(`${count}件`, String(count));
      });
    } catch (error) {
      console.warn("User preset overview could not be loaded", error);
    }
  }

  function installUserPresetEditorUi(dialog) {
    for (const host of dialog.querySelectorAll("[data-user-preset-swatches]")) {
      const keys = host.dataset.userPresetSwatches.split(",");
      let activeKey = keys[0];
      if (keys.length > 1) {
        const tabs = document.createElement("span");
        tabs.className = "desktop-user-preset-swatch-tabs";
        for (const key of keys) {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.textContent = key === "fill" ? "Fill" : "Outline";
          tab.classList.toggle("active", key === activeKey);
          tab.onclick = () => {
            activeKey = key;
            tabs.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button === tab));
          };
          tabs.append(tab);
        }
        host.append(tabs);
      }
      const colors = document.createElement("span");
      colors.className = "desktop-user-preset-swatch-colors";
      for (const color of USER_PRESET_SWATCHES) {
        const button = document.createElement("button");
        button.type = "button";
        button.style.setProperty("--preset-swatch", color);
        button.title = color;
        button.onclick = () => {
          const input = dialog.querySelector(`[data-user-preset-style="${activeKey}"]`);
          if (!input) return;
          input.value = color;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        };
        colors.append(button);
      }
      host.append(colors);
    }
    dialog.addEventListener("input", (event) => {
      if (event.target.matches("[data-user-preset-style]")) renderUserPresetPreview(dialog);
      if (event.target.matches("[data-user-preset-scale]") && selectedUserPreset) {
        const scale = Math.max(10, Math.min(400, Number(event.target.value) || 100)) / 100;
        const baseWidth = Number(selectedUserPreset.width) || 360;
        const baseHeight = Number(selectedUserPreset.height) || 360;
        const width = dialog.querySelector('[data-user-preset-style="width"]');
        const height = dialog.querySelector('[data-user-preset-style="height"]');
        if (width) width.value = String(Math.round(baseWidth * scale));
        if (height) height.value = String(Math.round(baseHeight * scale));
        renderUserPresetPreview(dialog);
      }
    });
    dialog.querySelectorAll("[data-user-shadow-dir]").forEach((button) => {
      button.onclick = () => {
        const [dx, dy] = button.dataset.userShadowDir.split(",").map(Number);
        const x = dialog.querySelector('[data-user-preset-style="shadow_x"]');
        const y = dialog.querySelector('[data-user-preset-style="shadow_y"]');
        const enabled = dialog.querySelector('[data-user-preset-style="shadow_enabled"]');
        const distance = Math.max(6, Math.abs(Number(x?.value) || 0), Math.abs(Number(y?.value) || 0));
        if (x) x.value = String(dx * distance);
        if (y) y.value = String(dy * distance);
        if (enabled) enabled.checked = dx !== 0 || dy !== 0;
        renderUserPresetPreview(dialog);
      };
    });
  }

  async function openUserPresets() {
    const dialog = document.getElementById("desktopUserPresetDialog") || createUserPresetDialog();
    userPresetCatalog = await userAssetFetch();
    const current = selectedUserPreset?.__draft
      ? selectedUserPreset
      : (userPresetCatalog.presets || []).find((preset) => preset.id === selectedUserPreset?.id) || null;
    editUserPreset(dialog, current);
    renderUserPresets(dialog);
    if (!dialog.open) dialog.showModal();
  }

  function fileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("画像を読み込めませんでした。"));
      reader.readAsDataURL(file);
    });
  }

  async function addUserPreset(dialog, file) {
    if (!file) return;
    if (!userPresetCatalog) userPresetCatalog = await userAssetFetch();
    releaseUserPresetDraftUrl();
    const dimensions = await imageDimensions(file);
    userPresetDraftUrl = URL.createObjectURL(file);
    const draft = {
      __draft: true,
      __file: file,
      name: file.name.replace(/\.[^.]+$/, ""),
      category: userPresetTarget,
      width: dimensions.width,
      height: dimensions.height,
      preview_url: userPresetDraftUrl,
      style_defaults: defaultUserPresetStyle(dimensions),
    };
    editUserPreset(dialog, draft);
    renderUserPresets(dialog);
    if (!dialog.open) dialog.showModal();
  }

  async function saveUserPreset(dialog, saveAs = false) {
    if (!selectedUserPreset) return;
    const style = collectUserPresetStyle(dialog);
    let name = dialog.querySelector('[data-user-preset-field="name"]').value.trim();
    const category = dialog.querySelector('[data-user-preset-field="category"]').value;
    if (!name) throw new Error("名前を入力してください。");
    if (saveAs) {
      name = prompt("別名で保存", `${name} copy`)?.trim() || "";
      if (!name) return;
    }
    if (selectedUserPreset.__draft || saveAs) {
      const sourceFile = selectedUserPreset.__draft
        ? selectedUserPreset.__file
        : new File([await (await fetch(selectedUserPreset.asset_url)).blob()], selectedUserPreset.original_name || `${name}.png`);
      const body = {
        category,
        name,
        image_data_url: await fileDataUrl(sourceFile),
        original_name: sourceFile.name,
        resize_oversize: false,
        allow_opaque: true,
        style_defaults: style,
        conflict: "error",
      };
      try {
        await userAssetFetch("", { method: "POST", body: JSON.stringify(body) });
      } catch (error) {
        if (error.code !== "duplicate_name") throw error;
        const existing = (userPresetCatalog?.presets || []).find((preset) => preset.id === error.existingId);
        if (existing && confirm(`同じ名前のプリセットがあります。\n種類: ${existing.category === "stamp" ? "Stamp" : "SFX"}\n名前: ${existing.name}\n\n既存プリセットを編集しますか？`)) {
          editUserPreset(dialog, existing);
          renderUserPresets(dialog);
          return;
        }
        throw new Error("別の名前を入力してください。");
      }
      releaseUserPresetDraftUrl();
      selectedUserPreset = null;
    } else {
      await userAssetFetch(`/${selectedUserPreset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, category, style_defaults: style, conflict: "error" }),
      });
    }
    await root.SpeechBubbleDesktopEditor?.refreshUserAssets?.();
    await openUserPresets();
  }

  async function replaceUserPresetImage(dialog, file) {
    if (!selectedUserPreset || !file) return;
    if (selectedUserPreset.__draft) {
      releaseUserPresetDraftUrl();
      const dimensions = await imageDimensions(file);
      userPresetDraftUrl = URL.createObjectURL(file);
      selectedUserPreset.__file = file;
      selectedUserPreset.preview_url = userPresetDraftUrl;
      selectedUserPreset.width = dimensions.width;
      selectedUserPreset.height = dimensions.height;
      editUserPreset(dialog, selectedUserPreset);
      return;
    }
    await userAssetFetch(`/${selectedUserPreset.id}/image`, {
      method: "PUT",
      body: JSON.stringify({
        image_data_url: await fileDataUrl(file),
        original_name: file.name,
        resize_oversize: false,
        allow_opaque: true,
      }),
    });
    await root.SpeechBubbleDesktopEditor?.refreshUserAssets?.();
    await openUserPresets();
  }

  async function deleteUserPreset(dialog) {
    if (!selectedUserPreset || selectedUserPreset.__draft || !confirm(`「${selectedUserPreset.name}」を削除しますか？`)) return;
    await userAssetFetch(`/${selectedUserPreset.id}`, { method: "DELETE" });
    selectedUserPreset = null;
    await root.SpeechBubbleDesktopEditor?.refreshUserAssets?.();
    await openUserPresets();
  }

  async function organizeUserPresetArchive() {
    const payload = await userAssetFetch("/archive/organize", { method: "POST", body: "{}" });
    root.SpeechBubbleDesktopEditor?.setStatus(
      `旧世代素材を整理しました（移動 ${Number(payload.moved_assets || 0) + Number(payload.moved_thumbnails || 0)}件）`,
      "saved",
    );
    await openUserPresets();
  }

  async function openSettings() {
    const dialog = document.getElementById("desktopSettingsDialog") || createSettingsDialog();
    try {
      const payload = await desktopFetch("/desktop/config");
      dialog.querySelectorAll("[data-desktop-setting]").forEach((input) => {
        const value = payload.settings?.[input.dataset.desktopSetting];
        if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = value ?? input.value;
      });
      applyTheme(payload.settings?.theme);
      applyLanguage(payload.settings?.language);
      await Promise.all([refreshCacheStatus(dialog), refreshUserPresetOverview(dialog)]);
    } catch (error) {
      console.warn("Desktop settings could not be loaded", error);
    }
    if (!dialog.open) dialog.showModal();
  }

  async function saveSettings(dialog) {
    const patch = {};
    dialog.querySelectorAll("[data-desktop-setting]").forEach((input) => {
      patch[input.dataset.desktopSetting] =
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? Number(input.value)
            : input.value;
    });
    if (patch.auto_export_to_directory) {
      patch.export_directory = await validateExportDirectory(String(patch.export_directory || "").trim());
    }
    const payload = await desktopFetch("/desktop/config", { method: "PUT", body: JSON.stringify(patch) });
    const theme = payload.settings?.theme;
    document.documentElement.dataset.theme =
      theme === "light" || theme === "dark"
        ? theme
        : matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    applyLanguage(payload.settings?.language);
    root.SpeechBubbleApplyRuntimeSettings?.(payload.settings);
    dialog.close();
  }

  async function chooseExportDirectory(initialDirectory = "") {
    const api = nativeApi();
    if (api?.choose_export_directory) return (await api.choose_export_directory(initialDirectory)) || "";
    return "";
  }

  async function browseExportDirectory(dialog) {
    const input = dialog.querySelector('[data-desktop-setting="export_directory"]');
    const selected = await chooseExportDirectory(input?.value || "");
    if (selected && input) input.value = selected;
  }

  async function validateExportDirectory(path) {
    const payload = await desktopFetch("/desktop/export-directory/validate", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    return payload.path;
  }

  async function prepareExportTarget() {
    const payload = await desktopFetch("/desktop/config");
    const settings = payload.settings || {};
    let path = String(settings.export_directory || "").trim();
    if (!settings.auto_export_to_directory) {
      path = await chooseExportDirectory(settings.remember_export_directory ? settings.last_export_directory || path : path);
      if (!path) return null;
      if (settings.remember_export_directory) {
        await desktopFetch("/desktop/config", {
          method: "PUT",
          body: JSON.stringify({ last_export_directory: path }),
        });
      }
    } else if (!path) {
      throw new Error("設定の出力フォルダーを指定してください。");
    }
    return { path: await validateExportDirectory(path) };
  }

  async function refreshCacheStatus(dialog) {
    const output = dialog.querySelector("[data-desktop-cache-status]");
    if (!output) return;
    output.textContent = "確認中…";
    try {
      const [payload, browser] = await Promise.all([
        desktopFetch("/desktop/cache/status"),
        root.SpeechBubbleDesktopEditor?.cacheStatus?.() || {},
      ]);
      const draftFiles = Number(payload.draft_files || 0) + Number(browser.draft_files || 0);
      const temporaryFiles = Number(payload.temporary_files || 0) + Number(browser.temporary_files || 0);
      const totalSize = Number(payload.total_size || 0) + Number(browser.total_size || 0);
      output.textContent = `下書き ${draftFiles}件 / 一時画像 ${temporaryFiles}件 / ${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
    } catch (error) {
      output.textContent = error?.message || "取得できませんでした";
    }
  }

  async function clearDraftCache(dialog) {
    if (!confirm("自動保存下書きと一時画像を削除しますか？")) return;
    await Promise.all([
      desktopFetch("/desktop/cache/clear", { method: "POST", body: "{}" }),
      root.SpeechBubbleDesktopEditor?.clearCache?.(),
    ]);
    await refreshCacheStatus(dialog);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme =
      theme === "light" || theme === "dark"
        ? theme
        : matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
  }

  const DESKTOP_EN_TEXT = new Map([
    ["Speech Bubble 4koma Editor 設定", "Speech Bubble 4koma Editor Settings"],
    ["表示", "Appearance"],
    ["テーマ", "Theme"],
    ["システム", "System"],
    ["ダーク", "Dark"],
    ["ライト", "Light"],
    ["言語", "Language"],
    ["出力フォルダー", "Output folder"],
    ["参照…", "Browse…"],
    ["指定フォルダーへ自動保存する", "Save directly to the selected folder"],
    ["前回選択したフォルダーを記憶する", "Remember the last selected folder"],
    ["ON: 上記フォルダーへ自動保存。OFF: Exportのたびに保存先を選択します。", "ON: save to the folder above. OFF: choose a destination for each export."],
    ["画像形式", "Image format"],
    ["ファイル名", "File name"],
    ["日付サブフォルダー", "Date subfolder"],
    ["使用しない", "Disabled"],
    ["元名＋日時", "Source name + date/time"],
    ["元名＋連番", "Source name + sequence"],
    ["元名", "Source name"],
    ["Speech Bubble＋日時", "Speech Bubble + date/time"],
    ["年／月", "Year / month"],
    ["年／月／日", "Year / month / day"],
    ["PNG圧縮", "PNG compression"],
    ["JPEG品質", "JPEG quality"],
    ["WebP品質", "WebP quality"],
    ["WebPをロスレス保存", "Save WebP losslessly"],
    ["Overlay PNGも保存", "Also save Overlay PNG"],
    ["同名ファイルを世代バックアップ", "Create versioned backups for duplicate names"],
    ["バックアップ世代数", "Backup generations"],
    ["ユーザープリセット", "User Presets"],
    ["登録先", "Register as"],
    ["PNG / WebPをここへドロップ", "Drop PNG / WebP here"],
    ["または", "or"],
    ["ファイルを選択", "Choose File"],
    ["Ctrl+Vで貼り付け", "Paste with Ctrl+V"],
    ["プリセット管理", "Preset Manager"],
    ["追加・変更・削除は即時保存されます。Apply settingsは不要です。", "Adds, edits, and deletes are saved immediately. Apply settings is not required."],
    ["Editor・復元", "Editor & Recovery"],
    ["自動保存", "Auto save"],
    ["間隔", "Interval"],
    ["起動時", "On startup"],
    ["毎回確認する", "Ask every time"],
    ["前回の編集を再開", "Resume previous edit"],
    ["常に新規作成", "Always start new"],
    ["編集キャッシュ", "Editor Cache"],
    ["更新", "Refresh"],
    ["下書きキャッシュを削除", "Clear draft cache"],
    ["プロジェクト、ユーザープリセット、設定、書き出し画像は削除しません。", "Projects, user presets, settings, and exported images are not deleted."],
    ["閉じる", "Close"],
    ["保存", "Save"],
    ["ユーザープリセット管理", "User Preset Manager"],
    ["＋ 新規追加", "+ Add New"],
    ["旧世代を整理", "Organize Archive"],
    ["読み込み中…", "Loading…"],
    ["すべて", "All"],
    ["画像を差し替える", "Replace Image"],
    ["プレビューは編集後の初期スタイルです。", "The preview shows the edited initial style."],
    ["名前", "Name"],
    ["種類", "Type"],
    ["初期スタイル", "Initial Style"],
    ["Fill Colorを使用", "Enable Fill Color"],
    ["有効", "Enabled"],
    ["キャンセル", "Cancel"],
    ["削除", "Delete"],
    ["別名で保存", "Save As"],
    ["変更を保存", "Save Changes"],
    ["登録する", "Register"],
    ["背景画像を置き換えますか？", "Replace the background image?"],
    ["現在の画像には未保存の変更があります。", "The current image has unsaved changes."],
    ["この画像の保存済みレイアウトがあります", "A saved layout exists for this image"],
    ["画像側のレイアウトを、この単体編集へコピーして復元しますか？", "Copy the image layout into this single-image edit?"],
    ["新規レイアウト", "New Layout"],
    ["復元する", "Restore"],
    ["前回の単体編集があります", "A previous single-image edit exists"],
    ["前回の背景画像と編集状態を再開しますか？", "Resume the previous background image and edit state?"],
    ["新規で開く", "Open New"],
    ["前回の単体編集を再開", "Resume Previous Edit"],
  ]);

  function translateDesktopDialogs(language) {
    const english = language === "en";
    for (const dialog of document.querySelectorAll(
      "#desktopSettingsDialog, #desktopUserPresetDialog, #replaceImageDialog, #imageLayoutRestoreDialog, #resumeStandaloneDialog",
    )) {
      const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.__desktopOriginalText === undefined) node.__desktopOriginalText = node.nodeValue;
        const original = node.__desktopOriginalText;
        const trimmed = original.trim();
        const translated = english ? DESKTOP_EN_TEXT.get(trimmed) : null;
        node.nodeValue = translated ? original.replace(trimmed, translated) : original;
      }
    }
  }

  function applyLanguage(language) {
    const selected = language === "en" ? "en" : "ja";
    document.documentElement.lang = selected;
    const text = selected === "en"
      ? {
          undo: "Undo",
          redo: "Redo",
          fit: "Fit",
          openBackgroundImage: "Open Image…",
          openEditorSettings: "⚙ Settings",
          closeEditor: "Close",
          discardChanges: "Discard Changes",
          saveLayout: "Save Layout",
          exportImage: "Export Image",
        }
      : {
          undo: "元に戻す",
          redo: "やり直す",
          fit: "全体表示",
          openBackgroundImage: "画像を開く…",
          openEditorSettings: "⚙ 設定",
          closeEditor: "閉じる",
          discardChanges: "変更を破棄",
          saveLayout: "レイアウト保存",
          exportImage: "画像を書き出す",
        };
    Object.entries(text).forEach(([id, label]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = label;
    });
    document.querySelectorAll("[data-comic-mode]").forEach((button) => {
      button.textContent =
        button.dataset.comicMode === "single"
          ? selected === "en"
            ? "Single Image"
            : "一枚画像"
          : selected === "en"
            ? "4-panel Comic"
            : "4コマ漫画";
    });
    document.querySelectorAll("[data-desktop-action='project-open']").forEach((button) => {
      button.textContent = selected === "en" ? "Open Project" : "プロジェクトを開く";
    });
    document.querySelectorAll("[data-desktop-action='project-save']").forEach((button) => {
      button.textContent = selected === "en" ? "Save Project" : "プロジェクトを保存";
    });
    translateDesktopDialogs(selected);
    const presetDialog = document.getElementById("desktopUserPresetDialog");
    if (presetDialog) {
      if (selectedUserPreset) editUserPreset(presetDialog, selectedUserPreset);
      if (userPresetCatalog) renderUserPresets(presetDialog);
    }
  }

  async function saveProject() {
    const api = nativeApi();
    if (!api?.choose_project_save) throw new Error("プロジェクト保存はDesktopウィンドウから実行してください。");
    const path = await api.choose_project_save();
    if (!path) return;
    const snapshot = await root.SpeechBubbleDesktopEditor.snapshot();
    await desktopFetch("/desktop/project/save", {
      method: "POST",
      body: JSON.stringify({ path, ...snapshot }),
    });
    root.SpeechBubbleDesktopEditor.setStatus(`${path} を保存しました`, "saved");
  }

  async function openProject() {
    const api = nativeApi();
    if (!api?.choose_project_open) throw new Error("プロジェクト読込はDesktopウィンドウから実行してください。");
    const path = await api.choose_project_open();
    if (!path) return;
    const payload = await desktopFetch("/desktop/project/open", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    await root.SpeechBubbleDesktopEditor.loadProject(payload);
    root.SpeechBubbleDesktopEditor.setStatus(`${path} を開きました`, "saved");
  }

  function install() {
    document.documentElement.dataset.host = "desktop";
    const header = document.querySelector("body > header");
    const spacer = header?.querySelector(".spacer");
    if (header && spacer) {
      const projectActions = document.createElement("div");
      projectActions.className = "desktop-project-actions";
      projectActions.innerHTML = `
        <button type="button" data-desktop-action="project-open">プロジェクトを開く</button>
        <button type="button" data-desktop-action="project-save">プロジェクトを保存</button>
      `;
      spacer.before(projectActions);
    }
    const settings = createSettingsDialog();
    const userPresets = createUserPresetDialog();
    const presetFileInput = settings.querySelector("[data-user-preset-file]");
    const addPresetFile = async (file) => {
      if (!file) return;
      if (!["image/png", "image/webp"].includes(file.type) && !/\.(png|webp)$/i.test(file.name || "")) {
        throw new Error("PNGまたはWebPを選択してください。");
      }
      if (settings.open) settings.close();
      if (!userPresets.open) userPresets.showModal();
      await addUserPreset(userPresets, file);
    };
    presetFileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      try {
        await addPresetFile(file);
      } catch (error) {
        console.error("User preset add failed", error);
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "ユーザープリセットを追加できませんでした", "error");
      }
    });
    const dropTarget = settings.querySelector("[data-user-preset-drop]");
    for (const type of ["dragenter", "dragover"]) {
      dropTarget.addEventListener(type, (event) => {
        event.preventDefault();
        dropTarget.classList.add("drag-active");
      });
    }
    dropTarget.addEventListener("dragleave", (event) => {
      if (!dropTarget.contains(event.relatedTarget)) dropTarget.classList.remove("drag-active");
    });
    dropTarget.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropTarget.classList.remove("drag-active");
      try {
        await addPresetFile(Array.from(event.dataTransfer?.files || [])[0]);
      } catch (error) {
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "ユーザープリセットを追加できませんでした", "error");
      }
    });
    dropTarget.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        presetFileInput.click();
      }
    });
    userPresets.querySelector("[data-user-preset-replace-file]").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      try {
        await replaceUserPresetImage(userPresets, file);
      } catch (error) {
        console.error("User preset image replace failed", error);
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "プリセット画像を差し替えできませんでした", "error");
      }
    });
    settings.addEventListener("input", (event) => {
      if (event.target.matches('[data-desktop-setting="theme"]')) applyTheme(event.target.value);
      if (event.target.matches('[data-desktop-setting="language"]')) applyLanguage(event.target.value);
    });
    settings.addEventListener("change", async (event) => {
      const key = event.target.dataset.desktopSetting;
      if (!["theme", "language"].includes(key)) return;
      try {
        await desktopFetch("/desktop/config", { method: "PUT", body: JSON.stringify({ [key]: event.target.value }) });
      } catch (error) {
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "表示設定を保存できませんでした", "error");
      }
    });
    document.addEventListener("paste", async (event) => {
      if (!settings.open && !userPresets.open) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.kind === "file" && ["image/png", "image/webp"].includes(entry.type));
      const file = item?.getAsFile?.();
      if (!file) return;
      event.preventDefault();
      try {
        await addPresetFile(file);
      } catch (error) {
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "貼り付け画像を登録できませんでした", "error");
      }
    });
    applyLanguage(params.get("language"));
    document.addEventListener("click", async (event) => {
      const targetCategory = event.target.closest("[data-user-preset-target]")?.dataset.userPresetTarget;
      if (targetCategory) {
        setUserPresetTarget(targetCategory);
        return;
      }
      const filter = event.target.closest("[data-user-preset-filter]")?.dataset.userPresetFilter;
      if (filter) {
        userPresetFilter = ["sfx", "stamp"].includes(filter) ? filter : "all";
        userPresets.querySelectorAll("[data-user-preset-filter]").forEach((button) => button.classList.toggle("active", button.dataset.userPresetFilter === userPresetFilter));
        renderUserPresets(userPresets);
        return;
      }
      const action = event.target.closest("[data-desktop-action]")?.dataset.desktopAction;
      if (!action) return;
      try {
        if (action === "project-open") await openProject();
        else if (action === "project-save") await saveProject();
        else if (action === "settings-close") settings.close();
        else if (action === "settings-save") await saveSettings(settings);
        else if (action === "export-directory-browse") await browseExportDirectory(settings);
        else if (action === "cache-refresh") await refreshCacheStatus(settings);
        else if (action === "cache-clear") await clearDraftCache(settings);
        else if (action === "user-presets-open") {
          settings.close();
          await openUserPresets();
        } else if (action === "user-presets-close") {
          if (selectedUserPreset?.__draft) {
            releaseUserPresetDraftUrl();
            selectedUserPreset = null;
          }
          userPresets.close();
        }
        else if (action === "user-preset-add") presetFileInput.click();
        else if (action === "user-preset-save") await saveUserPreset(userPresets);
        else if (action === "user-preset-save-as") await saveUserPreset(userPresets, true);
        else if (action === "user-preset-delete") await deleteUserPreset(userPresets);
        else if (action === "user-preset-organize") await organizeUserPresetArchive();
        else if (action === "user-preset-replace-image") userPresets.querySelector("[data-user-preset-replace-file]").click();
        else if (action === "user-preset-edit-cancel") {
          if (selectedUserPreset?.__draft) releaseUserPresetDraftUrl();
          selectedUserPreset = null;
          editUserPreset(userPresets, null);
          renderUserPresets(userPresets);
        }
      } catch (error) {
        console.error("Speech Bubble Desktop action failed", error);
        root.SpeechBubbleDesktopEditor?.setStatus(error?.message || "Desktop操作に失敗しました", "error");
      }
    });
  }

  root.SpeechBubbleDesktopShell = { openSettings, prepareExportTarget };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})(globalThis);

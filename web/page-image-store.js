(function (root) {
  "use strict";

  const DB_NAME = "speech-bubble-editor-page-images";
  const DB_STORE = "images";
  const MAX_IMAGE_BYTES = 96 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 100_000_000;
  const MAX_IMAGES = 100;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          request.result.createObjectStore(DB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function sha256(blob) {
    if (!globalThis.crypto?.subtle) return "";
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }

  async function imageSize(blob) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      try { return { width: bitmap.width, height: bitmap.height }; }
      finally { bitmap.close?.(); }
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(size);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The image could not be loaded."));
      };
      image.src = url;
    });
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("The image could not be serialized."));
      reader.readAsDataURL(blob);
    });
  }

  function create(options = {}) {
    const assets = new Map();
    const blobs = new Map();
    const urls = new Map();
    const documentId = () => String(options.documentId?.() || "");

    function key(id, doc = documentId()) {
      return `${doc}:${String(id || "")}`;
    }

    function releaseUrl(id) {
      const url = urls.get(id);
      if (url) URL.revokeObjectURL(url);
      urls.delete(id);
    }

    function clearRuntime() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      assets.clear();
      blobs.clear();
    }

    function setRuntime(asset, blob) {
      const id = String(asset.id);
      assets.set(id, asset);
      blobs.set(id, blob);
      releaseUrl(id);
      urls.set(id, URL.createObjectURL(blob));
    }

    async function readRecord(id) {
      const doc = documentId();
      if (!doc || !id) return null;
      const db = await openDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(key(id, doc));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return record;
    }

    async function put(metadata, blob) {
      if (!(blob instanceof Blob)) throw new TypeError("Page Image must be a Blob");
      if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error("Page Image is empty or larger than 96 MiB.");
      if (!/^image\/(?:png|jpeg|webp)$/i.test(blob.type || metadata?.mime || "")) {
        throw new Error("Page Image must be PNG, JPEG, or WebP.");
      }
      const doc = documentId();
      if (!doc) throw new Error("Page Image document is unavailable.");
      const digest = String(metadata?.sha256 || "") || await sha256(blob);
      const duplicate = digest ? [...assets.values()].find(item => item.sha256 === digest) : null;
      if (duplicate && !metadata?.id) return duplicate;
      const id = String(metadata?.id || (digest ? `page-image:${digest}` : `page-image:${crypto.randomUUID?.() || Date.now().toString(36)}`));
      const existing = assets.get(id);
      const size = existing?.width && existing?.height
        ? { width: existing.width, height: existing.height }
        : await imageSize(blob);
      if (!size.width || !size.height || size.width * size.height > MAX_IMAGE_PIXELS) {
        throw new Error("Page Image dimensions are unsupported.");
      }
      const asset = {
        id,
        name: String(metadata?.name || existing?.name || "page-image").slice(0, 260),
        mime: String(metadata?.mime || blob.type || existing?.mime || "image/png"),
        width: Math.max(1, Number(metadata?.width) || size.width),
        height: Math.max(1, Number(metadata?.height) || size.height),
        sha256: digest,
        source: String(metadata?.source || existing?.source || "page-image"),
      };
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({
          key: key(id, doc),
          documentId: doc,
          imageId: id,
          metadata: asset,
          blob,
          updatedAt: Date.now(),
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      setRuntime(asset, blob);
      return asset;
    }

    async function addFile(file, metadata = {}) {
      if (!(file instanceof Blob)) throw new TypeError("Page Image file is invalid.");
      const digest = await sha256(file);
      const duplicate = digest ? [...assets.values()].find(item => item.sha256 === digest) : null;
      if (duplicate) return duplicate;
      return put({ ...metadata, name: metadata.name || file.name || "page-image", mime: file.type, sha256: digest }, file);
    }

    async function get(id) {
      id = String(id || "");
      if (!id) return null;
      if (blobs.has(id)) return blobs.get(id);
      const record = await readRecord(id);
      if (!record?.blob) return null;
      const asset = { ...(record.metadata || {}), id };
      setRuntime(asset, record.blob);
      return record.blob;
    }

    async function remove(id) {
      id = String(id || "");
      if (!id) return false;
      const doc = documentId();
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key(id, doc));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      releaseUrl(id);
      blobs.delete(id);
      assets.delete(id);
      return true;
    }

    async function clearDocument() {
      const doc = documentId();
      if (!doc) return;
      const db = await openDb();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
      if (records.length) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          const store = tx.objectStore(DB_STORE);
          records.filter(record => record?.documentId === doc).forEach(record => store.delete(record.key));
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      db.close();
      clearRuntime();
    }

    async function list() {
      const doc = documentId();
      if (!doc) return [];
      const db = await openDb();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
      db.close();
      for (const record of records.filter(record => record?.documentId === doc)) {
        if (!record?.imageId || !(record.blob instanceof Blob)) continue;
        setRuntime({ ...(record.metadata || {}), id: String(record.imageId) }, record.blob);
      }
      return [...assets.values()];
    }

    async function restore(records) {
      clearRuntime();
      for (const record of Array.isArray(records) ? records : []) {
        if (!record?.id || !(record.blob instanceof Blob)) continue;
        await put(record, record.blob);
      }
      return [...assets.values()];
    }

    async function exportRecords(ids = null) {
      const selected = ids ? [...new Set(ids.map(String).filter(Boolean))] : [...assets.keys()];
      const records = [];
      for (const id of selected) {
        const asset = assets.get(id);
        const blob = await get(id);
        if (!asset || !blob) continue;
        records.push({
          id,
          name: asset.name || "page-image",
          mime: asset.mime || blob.type || "image/png",
          data_url: await blobDataUrl(blob),
        });
      }
      return records;
    }

    async function status(usedIds = new Set()) {
      const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
      let bytes = 0;
      for (const id of assets.keys()) bytes += Number((await get(id))?.size) || 0;
      return {
        page_images: assets.size,
        page_image_bytes: bytes,
        unused_page_images: [...assets.keys()].filter(id => !used.has(id)).length,
      };
    }

    function asset(id) { return assets.get(String(id || "")) || null; }
    function all() { return [...assets.values()]; }
    function imageUrl(id) { return urls.get(String(id || "")) || ""; }
    function dispose() { clearRuntime(); }

    return Object.freeze({
      MAX_IMAGES,
      MAX_IMAGE_BYTES,
      addFile,
      put,
      get,
      remove,
      clearDocument,
      list,
      restore,
      exportRecords,
      status,
      asset,
      all,
      imageUrl,
      dispose,
    });
  }

  root.SpeechBubblePageImageStore = Object.freeze({ create, MAX_IMAGES, MAX_IMAGE_BYTES });
})(typeof globalThis !== "undefined" ? globalThis : this);

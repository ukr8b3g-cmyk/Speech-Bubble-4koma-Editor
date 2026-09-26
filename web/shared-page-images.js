(function (root) {
  "use strict";

  const DB_NAME = "speech-bubble-editor-shared-page-images";
  const DB_STORE = "images";
  const MAX_IMAGE_BYTES = 96 * 1024 * 1024;

  function uuid() {
    return root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          const store = request.result.createObjectStore(DB_STORE, { keyPath: "key" });
          store.createIndex("documentId", "documentId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const LEGACY_DATABASES = [
    ["speech-bubble-editor-comic-images", "images"],
    ["speech-bubble-editor-general-comic-images", "images"],
  ];

  async function existingDatabaseNames() {
    if (typeof indexedDB.databases !== "function") return new Set();
    try {
      const entries = await indexedDB.databases();
      return new Set(entries.map(entry => String(entry?.name || "")).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async function sha256(blob) {
    if (!(blob instanceof Blob) || !root.crypto?.subtle) return "";
    const digest = await root.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }

  function metadataOf(record) {
    return {
      id: String(record?.id || ""),
      name: String(record?.name || "page-image"),
      mime: String(record?.mime || record?.blob?.type || "image/png"),
      width: Math.max(1, Number(record?.width) || 1),
      height: Math.max(1, Number(record?.height) || 1),
      sha256: String(record?.sha256 || ""),
      source: String(record?.source || "shared"),
    };
  }

  function create(options = {}) {
    const getDocumentId = () => String(options.getDocumentId?.() || "");
    const eventName = options.eventName || "speech-bubble:page-images-changed";

    function notify(detail = {}) {
      root.dispatchEvent?.(new CustomEvent(eventName, {
        detail: { documentId: getDocumentId(), ...detail },
      }));
    }

    async function listRecords() {
      const documentId = getDocumentId();
      if (!documentId) return [];
      const db = await openDb();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const store = tx.objectStore(DB_STORE);
        const request = store.indexNames.contains("documentId")
          ? store.index("documentId").getAll(documentId)
          : store.getAll();
        request.onsuccess = () => resolve(
          (Array.isArray(request.result) ? request.result : []).filter(record => record?.documentId === documentId),
        );
        request.onerror = () => reject(request.error);
      });
      db.close();
      return records.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    }

    async function list() {
      return (await listRecords()).map(metadataOf);
    }

    async function get(imageId) {
      const documentId = getDocumentId();
      if (!documentId || !imageId) return null;
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(`${documentId}:${imageId}`);
        request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    }

    async function put(metadata = {}, blob, control = {}) {
      const documentId = getDocumentId();
      if (!documentId) throw new Error("Page Image document is unavailable");
      if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > MAX_IMAGE_BYTES) {
        throw new Error("Page Image is empty or larger than 96 MiB");
      }
      const id = String(metadata.id || `page-image:${uuid()}`);
      const now = Date.now();
      const normalized = {
        ...metadataOf({ ...metadata, id, blob }),
        id,
        sha256: String(metadata.sha256 || await sha256(blob)),
      };
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({
          key: `${documentId}:${id}`,
          documentId,
          imageId: id,
          ...normalized,
          blob,
          createdAt: Number(metadata.createdAt) || now,
          updatedAt: now,
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      if (control.notify !== false) notify({ reason: "put", imageId: id });
      return normalized;
    }

    async function remove(imageId, control = {}) {
      const documentId = getDocumentId();
      if (!documentId || !imageId) return false;
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(`${documentId}:${imageId}`);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      if (control.notify !== false) notify({ reason: "remove", imageId: String(imageId) });
      return true;
    }

    async function clearDocument(control = {}) {
      const records = await listRecords();
      if (!records.length) return 0;
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const store = tx.objectStore(DB_STORE);
        for (const record of records) store.delete(record.key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      if (control.notify !== false) notify({ reason: "clear" });
      return records.length;
    }

    async function importRecords(records, control = {}) {
      let imported = 0;
      for (const record of Array.isArray(records) ? records : []) {
        let blob = record?.blob;
        if (!(blob instanceof Blob) && String(record?.data_url || "").startsWith("data:image/")) {
          const response = await fetch(record.data_url);
          if (!response.ok) throw new Error(`Page Image load failed: ${record.id || "unknown"}`);
          blob = await response.blob();
        }
        if (!(blob instanceof Blob)) continue;
        await put({
          id: String(record.id || `page-image:${uuid()}`),
          name: String(record.name || "page-image"),
          mime: String(record.mime || blob.type || "image/png"),
          width: Number(record.width) || 1,
          height: Number(record.height) || 1,
          sha256: String(record.sha256 || ""),
          source: String(record.source || "project"),
        }, blob, { notify: false });
        imported += 1;
      }
      if (imported && control.notify !== false) notify({ reason: "import", count: imported });
      return imported;
    }

    async function exportRecords(imageIds = null) {
      const allowed = imageIds ? new Set([...imageIds].map(String)) : null;
      const records = await listRecords();
      const output = [];
      for (const record of records) {
        if (allowed && !allowed.has(String(record.id))) continue;
        const blob = record.blob;
        if (!(blob instanceof Blob)) continue;
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        output.push({
          id: record.id,
          name: record.name,
          mime: record.mime || blob.type || "image/png",
          data_url: dataUrl,
        });
      }
      return output;
    }

    async function migrateLegacy(control = {}) {
      const documentId = getDocumentId();
      if (!documentId) return 0;
      const known = await existingDatabaseNames();
      let migrated = 0;
      for (const [databaseName, storeName] of LEGACY_DATABASES) {
        if (known.size && !known.has(databaseName)) continue;
        let db;
        try {
          db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
              request.transaction?.abort?.();
              reject(new Error("legacy database is unavailable"));
            };
          });
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            continue;
          }
          const records = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error);
          });
          db.close();
          for (const record of records) {
            if (String(record?.documentId || "") !== documentId || !(record?.blob instanceof Blob)) continue;
            await put({ ...(record.metadata || {}), id: record.imageId || record.metadata?.id }, record.blob, { notify: false });
            migrated += 1;
          }
        } catch {
          try { db?.close?.(); } catch {}
        }
      }
      if (migrated && control.notify !== false) notify({ reason: "legacy-migration", count: migrated });
      return migrated;
    }

    async function status(usedIds = new Set()) {
      const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
      const records = await listRecords();
      return {
        page_images: records.length,
        page_image_bytes: records.reduce((total, record) => total + (Number(record?.blob?.size) || 0), 0),
        unused_page_images: records.filter(record => !used.has(String(record.id))).length,
      };
    }

    return Object.freeze({
      MAX_IMAGE_BYTES,
      put,
      get,
      remove,
      list,
      importRecords,
      exportRecords,
      migrateLegacy,
      status,
      clearDocument,
      notify,
    });
  }

  root.SpeechBubbleSharedPageImages = Object.freeze({ create, DB_NAME, MAX_IMAGE_BYTES });
})(typeof globalThis !== "undefined" ? globalThis : this);

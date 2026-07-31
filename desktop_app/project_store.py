from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from PIL import Image

MAX_PROJECT_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 256
MAX_IMAGE_BYTES = 96 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


def _json_bytes(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def _safe_entries(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    entries = archive.infolist()
    if len(entries) > MAX_ENTRIES:
        raise ValueError("Project contains too many files")
    total = 0
    names = set()
    for info in entries:
        path = PurePosixPath(info.filename)
        if info.filename in names or path.is_absolute() or ".." in path.parts or "\\" in info.filename:
            raise ValueError("Project contains an unsafe path")
        names.add(info.filename)
        total += max(0, info.file_size)
        if total > MAX_PROJECT_BYTES:
            raise ValueError("Project is too large")
    return entries


def _decode_project_image(record: dict) -> tuple[str, bytes, dict]:
    raw = str(record.get("data_url", ""))
    if "," not in raw:
        raise ValueError("Project image data is missing")
    encoded = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Project image data is invalid") from error
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Project image is empty or too large")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
            image_format = str(image.format or "").upper()
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
    except Exception as error:
        raise ValueError("Project image cannot be decoded") from error
    if image_format not in ALLOWED_IMAGE_FORMATS or width * height > 100_000_000:
        raise ValueError("Project image format or dimensions are unsupported")
    image_id = str(record.get("id") or uuid.uuid4())
    extension = ALLOWED_IMAGE_FORMATS[image_format]
    digest = hashlib.sha256(data).hexdigest()
    metadata = {
        "id": image_id,
        # The archive blob is content-addressed, while each manifest record
        # keeps its own logical id (panel image, single background, and so on).
        "path": f"images/{digest}.{extension}",
        "original_name": str(record.get("name") or f"{image_id}.{extension}")[:260],
        "mime": f"image/{'jpeg' if extension == 'jpg' else extension}",
        "width": width,
        "height": height,
        "sha256": digest,
    }
    return metadata["path"], data, metadata


_LAYOUT_IMAGE_KEYS = {"image_id", "imageId", "background_image_id", "backgroundImageId"}


def _referenced_image_ids(value, path: str = "layout") -> list[tuple[str, str]]:
    """Return logical image references while retaining a useful layout path."""
    references: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key in _LAYOUT_IMAGE_KEYS and isinstance(child, str) and child and child != "source":
                references.append((child, child_path))
            references.extend(_referenced_image_ids(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            references.extend(_referenced_image_ids(child, f"{path}[{index}]"))
    return references


class ProjectStore:
    def save(self, path: Path, payload: dict) -> dict:
        target = path.with_suffix(".sbeproj")
        target.parent.mkdir(parents=True, exist_ok=True)
        layout = payload.get("layout")
        if isinstance(layout, str):
            layout = json.loads(layout or "{}")
        if not isinstance(layout, dict):
            raise ValueError("Project layout is invalid")
        comic = layout.get("comic") if isinstance(layout.get("comic"), dict) else {}
        images = []
        image_files = {}
        for record in payload.get("images", []) if isinstance(payload.get("images"), list) else []:
            entry_path, data, metadata = _decode_project_image(record)
            images.append(metadata)
            image_files.setdefault(entry_path, data)
        image_ids = {str(item["id"]) for item in images}
        missing = [(image_id, location) for image_id, location in _referenced_image_ids(layout) if image_id not in image_ids]
        if missing:
            details = ", ".join(f"{image_id} ({location})" for image_id, location in missing[:8])
            suffix = "" if len(missing) <= 8 else f" (+{len(missing) - 8} more)"
            raise ValueError(f"Project image blob is missing: {details}{suffix}")
        now = datetime.now(timezone.utc).isoformat()
        manifest = {
            "format": "speech-bubble-editor-project",
            "version": 1,
            "app_version": "0.1.0",
            "created_at": str(payload.get("created_at") or now),
            "updated_at": now,
            "project_id": str(payload.get("project_id") or uuid.uuid4()),
            "title": str(payload.get("title") or target.stem)[:260],
            "page": {
                "width": int(layout.get("canvas", {}).get("width", 1024)),
                "height": int(layout.get("canvas", {}).get("height", 1024)),
            },
            "layout": "layout.json",
            "comic": "comic.json",
            "images": images,
        }
        handle, temporary = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
        os.close(handle)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                archive.writestr("manifest.json", _json_bytes(manifest))
                archive.writestr("layout.json", _json_bytes(layout))
                archive.writestr("comic.json", _json_bytes(comic))
                for entry_path, data in image_files.items():
                    archive.writestr(entry_path, data)
            with zipfile.ZipFile(temporary, "r") as archive:
                _safe_entries(archive)
                json.loads(archive.read("manifest.json"))
                json.loads(archive.read("layout.json"))
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return {"ok": True, "path": str(target), "manifest": manifest}

    def load(self, path: Path) -> dict:
        if not path.is_file() or path.stat().st_size > MAX_PROJECT_BYTES:
            raise ValueError("Project file is missing or too large")
        with zipfile.ZipFile(path, "r") as archive:
            _safe_entries(archive)
            manifest = json.loads(archive.read("manifest.json"))
            if manifest.get("format") != "speech-bubble-editor-project" or manifest.get("version") != 1:
                raise ValueError("Unsupported project version")
            layout = json.loads(archive.read(str(manifest.get("layout", "layout.json"))))
            images = []
            for record in manifest.get("images", []):
                entry = str(record.get("path", ""))
                data = archive.read(entry)
                if hashlib.sha256(data).hexdigest() != record.get("sha256"):
                    raise ValueError("Project image checksum does not match")
                images.append(
                    {
                        "id": record["id"],
                        "name": record.get("original_name", record["id"]),
                        "mime": record.get("mime", "image/png"),
                        "data_url": f"data:{record.get('mime', 'image/png')};base64,{base64.b64encode(data).decode('ascii')}",
                    }
                )
        return {"ok": True, "path": str(path), "manifest": manifest, "layout": layout, "images": images}

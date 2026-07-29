from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


DEFAULTS = {
    "version": 1,
    "window_width": 1440,
    "window_height": 900,
    "theme": "system",
    "language": "ja",
    "last_project_directory": "",
    "export_directory": "",
    "last_export_directory": "",
    "auto_export_to_directory": False,
    "remember_export_directory": True,
    "startup_behavior": "ask",
    "auto_save": True,
    "auto_save_interval_seconds": 30,
    "output_format": "png",
    "png_compression": 6,
    "jpeg_quality": 95,
    "webp_quality": 90,
    "webp_lossless": False,
    "filename_format": "source_datetime",
    "date_subfolder": "none",
    "backup_enabled": True,
    "backup_generations": 5,
    "save_overlay": False,
}


def _atomic_json_write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class SettingsStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            value = {}
        merged = {**DEFAULTS, **(value if isinstance(value, dict) else {})}
        merged["window_width"] = max(900, min(3840, int(merged["window_width"])))
        merged["window_height"] = max(640, min(2160, int(merged["window_height"])))
        merged["theme"] = merged["theme"] if merged["theme"] in {"system", "dark", "light"} else "system"
        merged["language"] = merged["language"] if merged["language"] in {"ja", "en"} else "ja"
        merged["export_directory"] = str(merged.get("export_directory", "") or "").strip()
        merged["last_export_directory"] = str(merged.get("last_export_directory", "") or "").strip()
        merged["auto_export_to_directory"] = bool(merged.get("auto_export_to_directory", False))
        merged["remember_export_directory"] = bool(merged.get("remember_export_directory", True))
        merged["startup_behavior"] = (
            merged["startup_behavior"]
            if merged.get("startup_behavior") in {"ask", "resume", "new"}
            else "ask"
        )
        merged["auto_save"] = bool(merged.get("auto_save", True))
        merged["auto_save_interval_seconds"] = max(
            5,
            min(3600, int(merged.get("auto_save_interval_seconds", 30))),
        )
        merged["output_format"] = (
            merged["output_format"]
            if merged.get("output_format") in {"png", "jpeg", "webp"}
            else "png"
        )
        merged["png_compression"] = max(0, min(9, int(merged.get("png_compression", 6))))
        merged["jpeg_quality"] = max(1, min(100, int(merged.get("jpeg_quality", 95))))
        merged["webp_quality"] = max(1, min(100, int(merged.get("webp_quality", 90))))
        merged["webp_lossless"] = bool(merged.get("webp_lossless", False))
        merged["filename_format"] = (
            merged["filename_format"]
            if merged.get("filename_format")
            in {"source_datetime", "source_sequence", "source_only", "speech_bubble_datetime"}
            else "source_datetime"
        )
        merged["date_subfolder"] = (
            merged["date_subfolder"]
            if merged.get("date_subfolder") in {"none", "year_month", "year_month_day"}
            else "none"
        )
        merged["backup_enabled"] = bool(merged.get("backup_enabled", True))
        merged["backup_generations"] = max(1, min(20, int(merged.get("backup_generations", 5))))
        merged["save_overlay"] = bool(merged.get("save_overlay", False))
        return merged

    def save(self, patch: dict) -> dict:
        current = self.load()
        current.update({key: value for key, value in patch.items() if key in DEFAULTS})
        normalized = {**DEFAULTS, **current}
        _atomic_json_write(self.path, normalized)
        return self.load()

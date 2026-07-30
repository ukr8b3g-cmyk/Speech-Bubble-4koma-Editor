from __future__ import annotations

import base64
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest import mock

from fastapi.testclient import TestClient
from PIL import Image

from desktop_app.paths import DesktopPaths
from desktop_app.main import DesktopBridge
from desktop_app.project_store import ProjectStore
from desktop_app.recent_projects import RecentProjects
from desktop_app.recovery_store import RecoveryStore
from desktop_app.server import create_app
from desktop_app.settings_store import SettingsStore
from speech_bubble_editor.font_catalog import _font_display_names


def make_paths(root: Path) -> DesktopPaths:
    paths = DesktopPaths(
        root=root,
        settings=root / "settings.json",
        recent=root / "recent.json",
        recovery=root / "recovery",
        cache=root / "cache",
        logs=root / "logs",
        temp=root / "temp",
    )
    for directory in (paths.root, paths.recovery, paths.cache, paths.logs, paths.temp):
        directory.mkdir(parents=True, exist_ok=True)
    return paths


def png_data_url() -> str:
    output = io.BytesIO()
    Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


class DesktopCoreTest(unittest.TestCase):
    def test_desktop_bridge_keeps_native_objects_private(self) -> None:
        bridge = DesktopBridge(app_url="http://127.0.0.1/")
        self.assertNotIn("window", bridge.__dict__)
        self.assertNotIn("palette_window", bridge.__dict__)
        self.assertNotIn("webview", bridge.__dict__)
        self.assertIn("_window", bridge.__dict__)
        self.assertIn("_palette_window", bridge.__dict__)
        self.assertIn("_webview", bridge.__dict__)

    def test_recovery_round_trip_generations_and_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = RecoveryStore(Path(temporary) / "recovery")
            for index in range(7):
                result = store.save(
                    {
                        "title": "autosave",
                        "layout": {"canvas": {"width": 720, "height": 2160}, "revision": index},
                        "images": [
                            {
                                "id": "image-1",
                                "name": "panel.png",
                                "mime": "image/png",
                                "data_url": png_data_url(),
                            }
                        ],
                    },
                    checkpoint=True,
                )
                self.assertTrue(result["ok"])
            status = store.status()
            self.assertEqual(status["generations"], 5)
            self.assertEqual(status["assets"], 1)
            self.assertEqual(store.load()["layout"]["revision"], 6)

            store.current.write_text("{broken", encoding="utf-8")
            self.assertTrue(store.status()["available"])
            fallback = store.load()
            self.assertEqual(fallback["fallback_generation"], 1)
            self.assertEqual(fallback["layout"]["revision"], 6)
            self.assertGreater(store.clear(), 0)
            self.assertFalse(store.status()["available"])

    def test_garbled_font_names_fall_back_to_filename(self) -> None:
        with mock.patch(
            "speech_bubble_editor.font_catalog._font_name_table_text",
            side_effect=["EPSON ????????", "????"],
        ):
            family, style = _font_display_names(
                Path("EPSON-readable-file-name.ttf"),
                "EPSON ????????",
                "????",
            )
        self.assertEqual(family, "EPSON-readable-file-name")
        self.assertEqual(style, "Regular")

    def test_settings_recent_and_project_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = make_paths(root / "app")
            settings = SettingsStore(paths.settings)
            self.assertEqual(settings.load()["theme"], "system")
            self.assertEqual(settings.load()["auto_save_interval_seconds"], 30)
            self.assertEqual(settings.save({"theme": "dark"})["theme"], "dark")
            self.assertEqual(
                settings.save({"auto_save_interval_seconds": 90})[
                    "auto_save_interval_seconds"
                ],
                90,
            )
            self.assertEqual(
                settings.save({"auto_save_interval_seconds": 9999})[
                    "auto_save_interval_seconds"
                ],
                3600,
            )

            project_path = root / "sample.sbeproj"
            payload = {
                "title": "sample",
                "layout": {
                    "canvas": {"width": 720, "height": 1600},
                    "comic": {"enabled": True, "template_id": "vertical_four"},
                },
                "images": [
                    {
                        "id": "image-1",
                        "name": "panel.png",
                        "mime": "image/png",
                        "data_url": png_data_url(),
                    }
                ],
            }
            saved = ProjectStore().save(project_path, payload)
            loaded = ProjectStore().load(project_path)
            self.assertTrue(saved["ok"])
            self.assertEqual(loaded["layout"]["canvas"], {"width": 720, "height": 1600})
            self.assertEqual(len(loaded["images"]), 1)

            recent = RecentProjects(paths.recent)
            recent.touch(project_path)
            self.assertEqual(recent.load()[0]["path"], str(project_path.resolve()))

    def test_unsafe_project_path_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            project_path = Path(temporary) / "unsafe.sbeproj"
            with zipfile.ZipFile(project_path, "w") as archive:
                archive.writestr("../outside.txt", b"unsafe")
                archive.writestr(
                    "manifest.json",
                    json.dumps(
                        {
                            "format": "speech-bubble-editor-project",
                            "version": 1,
                            "layout": "layout.json",
                            "images": [],
                        }
                    ),
                )
                archive.writestr("layout.json", "{}")
            with self.assertRaisesRegex(ValueError, "unsafe path"):
                ProjectStore().load(project_path)

    def test_desktop_routes_require_launch_token(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = make_paths(Path(temporary) / "app")
            client = TestClient(create_app(paths, "desktop-test-token"))
            self.assertEqual(client.get("/desktop/health").status_code, 403)
            response = client.get(
                "/desktop/health",
                headers={"X-SBE-Token": "desktop-test-token"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["host"], "desktop")
            self.assertEqual(
                client.get("/speech_bubble/fonts").status_code,
                403,
            )

    def test_desktop_redirect_uses_saved_runtime_settings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = make_paths(Path(temporary) / "app")
            SettingsStore(paths.settings).save(
                {
                    "theme": "light",
                    "language": "en",
                    "auto_save": False,
                    "auto_save_interval_seconds": 90,
                    "startup_behavior": "resume",
                }
            )
            client = TestClient(create_app(paths, "desktop-test-token"))
            response = client.get("/", follow_redirects=False)
            query = parse_qs(urlparse(response.headers["location"]).query)
            self.assertEqual(query["theme"], ["light"])
            self.assertEqual(query["language"], ["en"])
            self.assertEqual(query["autoSave"], ["0"])
            self.assertEqual(query["autoSaveDelay"], ["90000"])
            self.assertEqual(query["startupBehavior"], ["resume"])

    def test_desktop_recovery_routes_survive_app_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = make_paths(Path(temporary) / "app")
            headers = {"X-SBE-Token": "desktop-test-token"}
            payload = {
                "title": "restart",
                "layout": {"canvas": {"width": 720, "height": 2160}, "comic": {"enabled": True}},
                "images": [{"id": "image-1", "name": "panel.png", "mime": "image/png", "data_url": png_data_url()}],
                "checkpoint": True,
            }
            first = TestClient(create_app(paths, "desktop-test-token"))
            saved = first.post("/desktop/recovery/save", headers=headers, json=payload)
            self.assertEqual(saved.status_code, 200, saved.text)

            second = TestClient(create_app(paths, "desktop-test-token"))
            loaded = second.get("/desktop/recovery/load", headers=headers)
            self.assertEqual(loaded.status_code, 200, loaded.text)
            self.assertEqual(loaded.json()["layout"]["canvas"], {"width": 720, "height": 2160})
            self.assertEqual(len(loaded.json()["images"]), 1)

    def test_desktop_export_writes_to_selected_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = make_paths(root / "app")
            output = root / "selected-output"
            output.mkdir()
            SettingsStore(paths.settings).save({"output_format": "png"})
            client = TestClient(create_app(paths, "desktop-test-token"))
            response = client.post(
                "/speech-bubble-editor/export",
                headers={"X-SBE-Token": "desktop-test-token"},
                json={
                    "image_data_url": png_data_url(),
                    "layout_json": "{}",
                    "name": "selected",
                    "desktop_output_dir": str(output),
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertTrue(payload["desktop_output"])
            self.assertIsNone(payload["download_url"])
            self.assertTrue((Path(payload["output_dir"]) / payload["filename"]).is_file())

    def test_user_sfx_preset_can_be_created_and_reedited(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = make_paths(Path(temporary) / "app")
            client = TestClient(create_app(paths, "desktop-test-token"))
            headers = {"X-SBE-Token": "desktop-test-token"}
            created = client.post(
                "/speech-bubble-editor/user-assets",
                headers=headers,
                json={
                    "category": "stamp",
                    "name": "mission",
                    "image_data_url": png_data_url(),
                    "allow_opaque": True,
                    "resize_oversize": False,
                    "conflict": "error",
                    "style_defaults": {
                        "fill": "#ff0000",
                        "stroke": "#ffffff",
                        "stroke_width": 2,
                        "shadow_enabled": True,
                        "glow_enabled": True,
                    },
                },
            )
            self.assertEqual(created.status_code, 200, created.text)
            preset = created.json()["preset"]
            updated = client.patch(
                f"/speech-bubble-editor/user-assets/{preset['id']}",
                headers=headers,
                json={
                    "name": "mission complete",
                    "category": "stamp",
                    "conflict": "error",
                    "style_defaults": {
                        **preset["style_defaults"],
                        "fill": "#00ff00",
                        "glow_spread": 8,
                    },
                },
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(updated.json()["preset"]["name"], "mission complete")
            self.assertEqual(updated.json()["preset"]["style_defaults"]["fill"], "#00ff00")


if __name__ == "__main__":
    unittest.main()

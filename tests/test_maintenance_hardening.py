from __future__ import annotations

import base64
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from PIL import Image

from desktop_app.background_removal import BackgroundRemovalService, MODEL_SIZE
from desktop_app.paths import DesktopPaths
from desktop_app.project_store import _decode_project_image, _read_bounded_archive_entry
from desktop_app.server import create_app
from desktop_app.version import APP_VERSION
from speech_bubble_editor import __version__ as API_VERSION
from speech_bubble_editor.api import _decode_data_url
from speech_bubble_editor.request_limits import read_bounded_body, read_bounded_json
from speech_bubble_editor.user_assets import _decode_image_data_url


class FakeRequest:
    def __init__(self, chunks, headers=None):
        self._chunks = list(chunks)
        self.headers = headers or {}

    async def stream(self):
        for chunk in self._chunks:
            yield chunk


def png_data_url() -> str:
    stream = io.BytesIO()
    Image.new("RGBA", (2, 2), (10, 20, 30, 255)).save(stream, format="PNG")
    encoded = base64.b64encode(stream.getvalue()).decode("ascii")
    return "data:image/png;base64," + "\r\n".join(encoded[i:i+12] for i in range(0, len(encoded), 12))


def make_test_paths(root: Path) -> DesktopPaths:
    paths = DesktopPaths(root, root/"settings.json", root/"recent.json", root/"recovery", root/"cache", root/"logs", root/"temp", root/"models")
    for directory in (paths.root, paths.recovery, paths.cache, paths.logs, paths.temp, paths.models):
        directory.mkdir(parents=True, exist_ok=True)
    return paths


class MaintenanceHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def test_chunked_body_is_bounded_before_accumulation(self):
        with self.assertRaises(Exception) as raised:
            await read_bounded_body(FakeRequest([b"1234", b"56789"]), 8)
        self.assertEqual(getattr(raised.exception, "status_code", None), 413)

    async def test_bounded_json_requires_object(self):
        with self.assertRaises(Exception) as raised:
            await read_bounded_json(FakeRequest([b"[1,2,3]"]), 32)
        self.assertEqual(getattr(raised.exception, "status_code", None), 400)

    async def test_bounded_json_rejects_nonfinite_constants(self):
        with self.assertRaises(Exception) as raised:
            await read_bounded_json(FakeRequest([b'{"x":NaN}']), 32)
        self.assertEqual(getattr(raised.exception, "status_code", None), 400)

    def test_data_url_crlf_is_accepted_strictly(self):
        self.assertEqual(_decode_data_url(png_data_url()).size, (2, 2))
        decoded = _decode_image_data_url(png_data_url())
        self.assertEqual((decoded.original_width, decoded.original_height), (2, 2))

    def test_versions_match_distribution(self):
        import desktop_app
        self.assertEqual(APP_VERSION, "0.1.10")
        self.assertEqual(desktop_app.__version__, APP_VERSION)
        self.assertEqual(API_VERSION, APP_VERSION)

    def test_api_import_does_not_eagerly_import_renderer(self):
        code = "import sys; import speech_bubble_editor.api; print(int('speech_bubble_editor.renderer' in sys.modules))"
        result = subprocess.run([sys.executable, "-c", code], text=True, capture_output=True, check=True)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "0")

    def test_desktop_health_reports_distribution_version(self):
        with tempfile.TemporaryDirectory() as temp:
            client = TestClient(create_app(make_test_paths(Path(temp)), "test-token"))
            response = client.get("/desktop/health", headers={"X-SBE-Token":"test-token"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["version"], APP_VERSION)

    def test_desktop_config_rejects_non_object_json(self):
        with tempfile.TemporaryDirectory() as temp:
            client = TestClient(create_app(make_test_paths(Path(temp)), "test-token"))
            response = client.put("/desktop/config", headers={"X-SBE-Token":"test-token","Content-Type":"application/json"}, content=b"[]")
            self.assertEqual(response.status_code, 400)

    def test_overlap_and_radiant_bubble_decorations_render(self):
        from speech_bubble_editor.renderer import _draw_bubble
        base = {"x":30,"y":30,"w":100,"h":80,"shape":"oval","fill":"#ffffff","stroke":"#000000","stroke_width":4}
        images=[]
        for style in ("", "overlap", "radiant"):
            layer=Image.new("RGBA",(180,150),(0,0,0,0))
            _draw_bubble(layer,{**base,"decoration_style":style},1)
            images.append(layer)
        self.assertNotEqual(images[0].tobytes(), images[1].tobytes())
        self.assertNotEqual(images[0].tobytes(), images[2].tobytes())

    def test_project_base64_size_is_checked_before_decode(self):
        with mock.patch("desktop_app.project_store.MAX_IMAGE_BYTES", 3), mock.patch(
            "desktop_app.project_store.base64.b64decode"
        ) as decode:
            with self.assertRaisesRegex(ValueError, "empty or too large"):
                _decode_project_image(
                    {
                        "id": "image-1",
                        "data_url": "data:image/png;base64,QUJDREVG",
                    }
                )
            decode.assert_not_called()

    def test_project_zip_entry_size_is_checked_before_read(self):
        import zipfile

        with tempfile.TemporaryDirectory() as temp:
            archive_path = Path(temp) / "oversized.sbeproj"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("images/test.png", b"12345")
            with zipfile.ZipFile(archive_path, "r") as archive, mock.patch.object(
                archive, "read", wraps=archive.read
            ) as read:
                with self.assertRaisesRegex(ValueError, "empty or too large"):
                    _read_bounded_archive_entry(
                        archive,
                        "images/test.png",
                        4,
                        label="Project image",
                    )
                read.assert_not_called()

    def test_model_download_rejects_declared_oversize_before_read(self):
        class FakeResponse:
            headers = {"Content-Length": str(MODEL_SIZE + 1)}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, *_args):
                raise AssertionError("oversized response body must not be read")

        with tempfile.TemporaryDirectory() as temp:
            service = BackgroundRemovalService(Path(temp))
            with mock.patch(
                "desktop_app.background_removal.urllib.request.urlopen",
                return_value=FakeResponse(),
            ):
                service._download_model()
            status = service.status()
            self.assertEqual(status["state"], "error")
            self.assertIn("サイズ", status["error"])
            self.assertFalse(service.partial_path.exists())


if __name__ == "__main__":
    unittest.main()

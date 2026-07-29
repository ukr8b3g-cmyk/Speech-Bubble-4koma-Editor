from __future__ import annotations

import argparse
import ctypes
import logging
import secrets
import sys
import webbrowser

from .paths import DesktopPaths
from .runtime import ServerRuntime, free_loopback_port
from .server import create_app

_INSTANCE_MUTEX = None
APP_NAME = "Speech Bubble 4koma Editor"


def acquire_single_instance() -> bool:
    global _INSTANCE_MUTEX
    if sys.platform != "win32":
        return True
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.CreateMutexW(None, False, "Local\\SpeechBubbleEditorDesktop")
    if not handle:
        return True
    _INSTANCE_MUTEX = handle
    return kernel32.GetLastError() != 183


class DesktopBridge:
    def __init__(self, initial_directory: str = "", export_directory: str = ""):
        self.window = None
        self.initial_directory = initial_directory
        self.export_directory = export_directory
        self.open_dialog = 10
        self.folder_dialog = 20
        self.save_dialog = 30

    @staticmethod
    def _first_path(value) -> str:
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else ""
        return str(value or "")

    def choose_project_save(self) -> str:
        if not self.window:
            return ""
        result = self.window.create_file_dialog(
            self.save_dialog,
            directory=self.initial_directory or "",
            save_filename="speech-bubble-4koma-project.sbeproj",
            file_types=("Speech Bubble 4koma Editor Project (*.sbeproj)",),
        )
        return self._first_path(result)

    def choose_project_open(self) -> str:
        if not self.window:
            return ""
        result = self.window.create_file_dialog(
            self.open_dialog,
            directory=self.initial_directory or "",
            allow_multiple=False,
            file_types=("Speech Bubble 4koma Editor Project (*.sbeproj)",),
        )
        return self._first_path(result)

    def choose_export_directory(self, initial_directory: str = "") -> str:
        if not self.window:
            return ""
        directory = str(initial_directory or self.export_directory or self.initial_directory or "")
        result = self.window.create_file_dialog(
            self.folder_dialog,
            directory=directory,
            allow_multiple=False,
        )
        selected = self._first_path(result)
        if selected:
            self.export_directory = selected
        return selected


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--portable", action="store_true", help="Store application data beside the app")
    parser.add_argument("--browser", action="store_true", help="Development fallback: open in the default browser")
    return parser.parse_args()


def run() -> int:
    args = parse_args()
    paths = DesktopPaths.create(portable=args.portable)
    log_path = paths.logs / "desktop-startup.log"
    logging.basicConfig(
        filename=log_path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        force=True,
    )
    if not acquire_single_instance():
        logging.info("A second launch was ignored because the Desktop app is already running")
        if sys.platform == "win32":
            ctypes.windll.user32.MessageBoxW(
                None,
                f"{APP_NAME} はすでに起動しています。",
                APP_NAME,
                0x40,
            )
        return 0
    settings = __import__("desktop_app.settings_store", fromlist=["SettingsStore"]).SettingsStore(paths.settings).load()
    token = secrets.token_urlsafe(32)
    port = free_loopback_port()
    runtime = ServerRuntime(create_app(paths, token), port)
    runtime.start()
    url = f"http://127.0.0.1:{port}/"
    logging.info("Desktop server ready at %s", url)
    try:
        if args.browser:
            webbrowser.open(url)
            input(f"{APP_NAME} is running. Press Enter to stop.\n")
            return 0
        try:
            import webview
        except ImportError as error:
            raise RuntimeError(
                "pywebview is required for the desktop window. "
                "Install requirements-desktop.txt or use --browser for development."
            ) from error
        bridge = DesktopBridge(
            settings.get("last_project_directory", ""),
            settings.get("last_export_directory", "") or settings.get("export_directory", ""),
        )
        bridge.open_dialog = webview.OPEN_DIALOG
        bridge.folder_dialog = webview.FOLDER_DIALOG
        bridge.save_dialog = webview.SAVE_DIALOG
        window = webview.create_window(
            APP_NAME,
            url=url,
            js_api=bridge,
            width=settings["window_width"],
            height=settings["window_height"],
            min_size=(900, 640),
        )
        bridge.window = window
        # Force the WebView2 renderer on Windows. Letting pywebview auto-select
        # a legacy renderer can produce an unusable window on some machines.
        logging.info("Starting pywebview with the Edge Chromium renderer")
        webview.start(
            debug=False,
            gui="edgechromium",
            private_mode=False,
            storage_path=str(paths.root / "webview"),
        )
        return 0
    except Exception:
        logging.exception("%s failed to start", APP_NAME)
        raise
    finally:
        runtime.stop()


if __name__ == "__main__":
    raise SystemExit(run())

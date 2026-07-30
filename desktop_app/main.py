from __future__ import annotations

import argparse
import ctypes
import json
import logging
import secrets
import sys
import threading
import webbrowser

from .paths import DesktopPaths
from .runtime import ServerRuntime, free_loopback_port
from .server import create_app

_INSTANCE_MUTEX = None
APP_NAME = "Speech Bubble 4koma Editor"


def enable_windows_high_dpi() -> None:
    """Use Windows per-monitor DPI scaling without applying a second UI zoom."""
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except (AttributeError, OSError):
        pass


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
    def __init__(
        self,
        initial_directory: str = "",
        export_directory: str = "",
        app_url: str = "",
    ):
        # Native window objects must remain private. pywebview reflects public
        # bridge attributes into JavaScript; exposing WinForms/WebView2 objects
        # here makes that reflection recurse through the native object graph.
        self._window = None
        self._palette_window = None
        self._webview = None
        self.app_url = app_url
        self.initial_directory = initial_directory
        self.export_directory = export_directory
        self.open_dialog = 10
        self.folder_dialog = 20
        self.save_dialog = 30
        self._palette_closing = False
        self._display_change_handler = None

    @staticmethod
    def _first_path(value) -> str:
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else ""
        return str(value or "")

    def choose_project_save(self) -> str:
        if not self._window:
            return ""
        result = self._window.create_file_dialog(
            self.save_dialog,
            directory=self.initial_directory or "",
            save_filename="speech-bubble-4koma-project.sbeproj",
            file_types=("Speech Bubble 4koma Editor Project (*.sbeproj)",),
        )
        return self._first_path(result)

    def choose_project_open(self) -> str:
        if not self._window:
            return ""
        result = self._window.create_file_dialog(
            self.open_dialog,
            directory=self.initial_directory or "",
            allow_multiple=False,
            file_types=("Speech Bubble 4koma Editor Project (*.sbeproj)",),
        )
        return self._first_path(result)

    def choose_export_directory(self, initial_directory: str = "") -> str:
        if not self._window:
            return ""
        directory = str(initial_directory or self.export_directory or self.initial_directory or "")
        result = self._window.create_file_dialog(
            self.folder_dialog,
            directory=directory,
            allow_multiple=False,
        )
        selected = self._first_path(result)
        if selected:
            self.export_directory = selected
        return selected

    @staticmethod
    def _run_async(callback) -> None:
        threading.Thread(target=callback, daemon=True).start()

    @staticmethod
    def _safe_geometry(value) -> dict:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (TypeError, ValueError):
                value = {}
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _apply_snapshot(window, snapshot: str) -> None:
        if not window or not snapshot:
            return
        window.evaluate_js(
            "window.SpeechBubblePaletteSync?.apply("
            + json.dumps(str(snapshot), ensure_ascii=False)
            + ")"
        )

    def _forward_snapshot(self, source, target) -> None:
        def forward():
            try:
                snapshot = source.evaluate_js(
                    "window.SpeechBubblePaletteSync?.snapshot?.() || ''"
                )
                self._apply_snapshot(target, snapshot)
            except Exception:
                logging.exception("Could not synchronize the external palette")

        self._run_async(forward)

    def palette_ready(self) -> bool:
        if not self._window or not self._palette_window:
            return False
        self._forward_snapshot(self._window, self._palette_window)
        return True

    def palette_update(self, snapshot: str) -> bool:
        if not self._window:
            return False
        self._run_async(lambda: self._apply_snapshot(self._window, snapshot))
        return True

    def main_update(self, snapshot: str) -> bool:
        if not self._palette_window:
            return False
        self._run_async(lambda: self._apply_snapshot(self._palette_window, snapshot))
        return True

    def begin_palette_drag(self) -> bool:
        if sys.platform != "win32" or not self._palette_window:
            return False
        try:
            from System import Action

            native = getattr(self._palette_window, "native", None)
            if native is None:
                return False

            def begin_drag():
                handle = int(native.Handle.ToInt64())
                ctypes.windll.user32.ReleaseCapture()
                ctypes.windll.user32.SendMessageW(handle, 0x00A1, 2, 0)

            if native.InvokeRequired:
                native.BeginInvoke(Action(begin_drag))
            else:
                begin_drag()
            return True
        except Exception:
            logging.exception("Could not begin native palette drag")
            return False

    def _notify_palette_attached(self) -> None:
        if not self._window:
            return

        def notify():
            try:
                self._window.evaluate_js(
                    "window.SpeechBubbleWorkspaceLayout?.reattachExternal?.()"
                )
            except Exception:
                logging.exception("Could not restore the in-window palettes")

        self._run_async(notify)

    def _configure_palette_native(self) -> None:
        if sys.platform != "win32" or not self._palette_window:
            return
        try:
            from System import Action
            from Microsoft.Win32 import SystemEvents
            from System.Windows.Forms import FormBorderStyle, Screen

            native = self._palette_window.native

            def configure():
                native.ShowInTaskbar = False
                native.FormBorderStyle = FormBorderStyle.SizableToolWindow
                native.MinimizeBox = False
                native.MaximizeBox = False
                if self._window and getattr(self._window, "native", None):
                    native.Owner = self._window.native

                def on_resize_end(_sender, _event):
                    try:
                        if not self._palette_window or not self._window:
                            return
                        palette_bounds = native.Bounds
                        owner_bounds = self._window.native.Bounds
                        intersection = palette_bounds
                        intersection.Intersect(owner_bounds)
                        overlap = max(0, intersection.Width) * max(0, intersection.Height)
                        palette_area = max(1, palette_bounds.Width * palette_bounds.Height)
                        if overlap >= min(24000, palette_area * 0.18):
                            self._run_async(self.close_palette)
                    except Exception:
                        logging.exception("Could not evaluate palette reattachment")

                def ensure_visible():
                    try:
                        if not self._palette_window:
                            return
                        bounds = native.Bounds
                        visible = False
                        for screen in Screen.AllScreens:
                            intersection = bounds
                            intersection.Intersect(screen.WorkingArea)
                            if max(0, intersection.Width) * max(0, intersection.Height) >= 4000:
                                visible = True
                                break
                        if not visible:
                            self._run_async(self.close_palette)
                    except Exception:
                        logging.exception("Could not restore a disconnected external palette")

                def on_display_settings_changed(_sender, _event):
                    if native.InvokeRequired:
                        native.BeginInvoke(Action(ensure_visible))
                    else:
                        ensure_visible()

                native.ResizeEnd += on_resize_end
                self._display_change_handler = on_display_settings_changed
                SystemEvents.DisplaySettingsChanged += on_display_settings_changed

            if native.InvokeRequired:
                native.Invoke(Action(configure))
            else:
                configure()
        except Exception:
            logging.exception("Could not configure the native tool palette")

    def _palette_closed(self) -> None:
        if self._display_change_handler is not None and sys.platform == "win32":
            try:
                from Microsoft.Win32 import SystemEvents

                SystemEvents.DisplaySettingsChanged -= self._display_change_handler
            except Exception:
                logging.exception("Could not unregister the display change listener")
            self._display_change_handler = None
        self._palette_window = None
        self._palette_closing = False
        self._notify_palette_attached()

    def open_palette(self, geometry=None) -> bool:
        if not self._webview or not self.app_url:
            return False
        requested = self._safe_geometry(geometry)
        width = max(580, min(960, int(requested.get("width") or 640)))
        height = max(420, min(1120, int(requested.get("height") or 760)))
        x = requested.get("x")
        y = requested.get("y")
        try:
            x = int(x) if x is not None else None
            y = int(y) if y is not None else None
        except (TypeError, ValueError):
            x = y = None
        if self._palette_window:
            try:
                self._palette_window.show()
                if x is not None and y is not None:
                    self._palette_window.move(x, y)
                self._palette_window.resize(width, height)
                return True
            except Exception:
                logging.exception("Could not reuse the external palette window")
                self._palette_window = None
        separator = "&" if "?" in self.app_url else "?"
        palette = self._webview.create_window(
            f"{APP_NAME} - Properties / Layers",
            url=f"{self.app_url}{separator}palette=1",
            js_api=self,
            width=width,
            height=height,
            x=x,
            y=y,
            min_size=(580, 420),
            resizable=True,
            on_top=False,
        )
        if not palette:
            return False
        self._palette_window = palette
        palette.events.shown += self._configure_palette_native
        palette.events.closed += self._palette_closed
        return True

    def close_palette(self) -> bool:
        palette = self._palette_window
        if not palette or self._palette_closing:
            return False
        self._palette_closing = True
        self._notify_palette_attached()
        try:
            palette.destroy()
            return True
        except Exception:
            self._palette_closing = False
            logging.exception("Could not close the external palette window")
            return False


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
    enable_windows_high_dpi()
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
            url,
        )
        bridge._webview = webview
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
            maximized=True,
        )
        bridge._window = window
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

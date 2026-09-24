from __future__ import annotations

import socket
import tempfile
from pathlib import Path

import uvicorn

from desktop_app.paths import DesktopPaths
from desktop_app.server import create_app

_temp = tempfile.TemporaryDirectory(prefix="sbe-browser-")
root = Path(_temp.name)
paths = DesktopPaths(root, root/"settings.json", root/"recent.json", root/"recovery", root/"cache", root/"logs", root/"temp", root/"models")
for directory in (paths.root, paths.recovery, paths.cache, paths.logs, paths.temp, paths.models):
    directory.mkdir(parents=True, exist_ok=True)
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as handle:
    handle.bind(("127.0.0.1", 0))
    port = handle.getsockname()[1]
print(f"SBE_TEST_SERVER={port}", flush=True)
uvicorn.run(create_app(paths, "browser-test-token"), host="127.0.0.1", port=port, log_level="warning")

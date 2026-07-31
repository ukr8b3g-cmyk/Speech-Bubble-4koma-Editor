from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import uvicorn

from desktop_app.paths import DesktopPaths
from desktop_app.server import create_app


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


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: audit_server_v011.py DATA_ROOT PORT")
    root = Path(sys.argv[1]).resolve()
    port = int(sys.argv[2])
    app = create_app(make_paths(root), "audit-token")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

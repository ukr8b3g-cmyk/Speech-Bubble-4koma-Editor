from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"


def run(args: list[str]) -> str:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise RuntimeError(f"Failed: {args} (exit {result.returncode})")
    return result.stdout.strip()


def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    py_files = [p for p in ROOT.rglob("*.py") if ".venv" not in p.parts and not any(part.startswith("build") for part in p.parts)]
    run([sys.executable, "-m", "py_compile", *map(str, py_files)])
    js_files = [p for p in (ROOT / "web").rglob("*.js")]
    for path in js_files:
        run(["node", "--check", str(path)])
    html = (ROOT / "web" / "speech-bubble-editor.html").read_text(encoding="utf-8")
    inline = [m.group(1) for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", html, re.I)]
    with tempfile.TemporaryDirectory() as temp:
        for index, source in enumerate(inline):
            path = pathlib.Path(temp) / f"inline-{index}.js"
            path.write_text(source, encoding="utf-8")
            run(["node", "--check", str(path)])
    pytest_out = run([sys.executable, "-m", "pytest", "-q"])
    node_outputs = []
    for path in sorted((ROOT / "tests").glob("*_test.cjs")):
        if "browser_smoke" in path.name:
            continue
        node_outputs.append(run(["node", str(path)]))
    run(["git", "diff", "--check", "HEAD"])
    report = {
        "python_files": len(py_files),
        "javascript_files": len(js_files),
        "inline_scripts": len(inline),
        "pytest": pytest_out.splitlines()[-1] if pytest_out else "",
        "node_tests": len(node_outputs),
    }
    (ARTIFACTS / "validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()

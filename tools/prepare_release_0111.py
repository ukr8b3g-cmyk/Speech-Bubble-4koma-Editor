"""Prepare release-only changes on the pinned, clean standalone commit."""
from pathlib import Path
import re
import subprocess
import sys

BASE = "8b9a3d834405b2f6bf18d43e30663041b98da692"
changed = []

def read(path):
    return Path(path).read_text(encoding="utf-8")

def write(path, value):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(value, encoding="utf-8", newline="\n")
    changed.append(path)

def once(value, old, new):
    if value.count(old) != 1:
        raise RuntimeError(f"Expected one match for {old!r}; got {value.count(old)}")
    return value.replace(old, new, 1)

def edit(path, old, new):
    write(path, once(read(path), old, new))

if subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() != BASE:
    raise RuntimeError("Unexpected base commit")
if subprocess.check_output(["git", "status", "--porcelain"], text=True).strip():
    raise RuntimeError("Working tree is not clean")

edit("desktop_app/version.py", 'APP_VERSION = "0.1.10"', 'APP_VERSION = "0.1.11"')
value = read("packaging/windows_version_info.txt")
value = once(value, "filevers=(0, 1, 10, 0)", "filevers=(0, 1, 11, 0)")
value = once(value, "prodvers=(0, 1, 10, 0)", "prodvers=(0, 1, 11, 0)")
if value.count("0.1.10.0") != 2:
    raise RuntimeError("Unexpected Windows version strings")
write("packaging/windows_version_info.txt", value.replace("0.1.10.0", "0.1.11.0"))
value = once(read("packaging/SpeechBubble4komaEditor.iss"), '#define MyAppVersion "0.1.10"', '#define MyAppVersion "0.1.11"')
write("packaging/SpeechBubble4komaEditor.iss", once(value, '#define MyAppWindowsVersion "0.1.10.0"', '#define MyAppWindowsVersion "0.1.11.0"'))
edit("build_release.ps1", '[string]$Version = "0.1.10"', '[string]$Version = "0.1.11"')
edit("tests/test_maintenance_hardening.py", 'self.assertEqual(APP_VERSION, "0.1.10")', 'self.assertEqual(APP_VERSION, "0.1.11")')
edit("tests/desktop_browser_smoke.cjs", 'assert.equal(health.body.version, "0.1.10");', 'assert.equal(health.body.version, "0.1.11");')
value = once(read("CHANGELOG.md"), "## Unreleased\n", "## v0.1.11 - 2026-09-26\n")
value = once(value, "Published v0.1.10 binaries are unchanged.", "Ship these changes in the v0.1.11 Windows installer; previous releases remain unchanged.")
write("CHANGELOG.md", value)

heading = """## v0.1.11 - 2026-09-26

簡易レタッチ（Quick Retouch 0.7.10）をWindowsインストーラーへ追加しました。ブラシ・消しゴム・各種選択・調整レイヤー・トーンカーブ・内部Undo／Redoを、3つの編集モードから利用できます。

一枚画像では元画像を残して新しい画像レイヤーへ適用します。4コマ漫画／コミックでは共通Page Imagesへ追加し、選択中のコマ画像を自動置換しません。適用結果は元解像度PNGです。レタッチ内部のレイヤー・マスク・履歴は保存せず、確定済み画像を既存のプロジェクト保存・復元経路で扱います。

"""
value = once(read("README.md"), "## v0.1.10 - 2026-09-26\n", heading + "## v0.1.10 - 2026-09-26\n")
for old, new in [
    ("Windows x64 / v0.1.10", "Windows x64 / v0.1.11"),
    ("releases/download/v0.1.10/SpeechBubble4komaEditor-v0.1.10-win-x64-setup.exe", "releases/download/v0.1.11/SpeechBubble4komaEditor-v0.1.11-win-x64-setup.exe"),
    ("releases/download/v0.1.10/SHA256SUMS.txt", "releases/download/v0.1.11/SHA256SUMS.txt"),
    ("現行リリース（v0.1.10）", "現行リリース（v0.1.11）"),
    ("> この機能はソース版の追加です。公開済みv0.1.10インストーラーは変更していません。", "> 簡易レタッチはv0.1.11以降のWindowsインストーラーに含まれます。v0.1.10以前の配布物は変更していません。"),
]:
    value = once(value, old, new)
write("README.md", value)
value, count = re.subn(r"- Distribution version is 0\.1\.\d+\.", "- Distribution version is 0.1.11.", read("docs/ARCHITECTURE.md"))
if count != 1:
    raise RuntimeError("Distribution declaration missing")
write("docs/ARCHITECTURE.md", value)

notes = """# Speech Bubble 4koma Editor v0.1.11

## 日本語

簡易レタッチを追加したWindowsスタンドアロン版です。

- Forge Neo版Quick Retouch 0.7.10を一枚画像・4コマ漫画・コミックへ統合。
- ブラシ、消しゴム、スポイト、投げ縄、長方形／楕円、自動選択、色から選択、クイックマスクに対応。
- 色相・彩度、明るさ・コントラスト・ガンマ、RGB別トーンカーブ、調整レイヤー、内部Undo／Redo、開始時に戻すを搭載。
- 一枚画像では元画像を残し、位置・サイズ・回転・不透明度・ロックを継承した新規レイヤーとして適用。
- 外部画像には無関係な選択レイヤーの変形を継承しません。
- 4コマ／コミックの結果は共通Page Imagesへ追加し、選択中の既存コマ画像を置換しません。
- プレビューは長辺920px、確定時は元解像度PNG。背景削除・白黒変換・既存プロジェクトの経路は維持。
- レタッチ中のショートカットを背後のEditorから分離し、古い非同期処理の誤適用を防止。

`.sbeproj`へ保存するのは適用済みPNGと通常のレイヤー配置です。レタッチ内部の調整レイヤー・選択範囲・マスク・履歴は保存しません。新規必須依存パッケージ・AIモデルは追加していません。

## English

- Port Quick Retouch 0.7.10 into all three standalone workspaces.
- Preserve paint, selection, masked adjustments, curves and session-only undo/redo.
- Apply non-destructively to Single Image with explicit source context.
- Add results to shared Page Images without replacing an occupied Comic panel.
- Keep full-resolution PNG output and the existing project/recovery pipeline.
- Isolate modal shortcuts and reject stale asynchronous apply operations.

## Windows x64 assets

- `SpeechBubble4komaEditor-v0.1.11-win-x64-setup.exe`
- `SHA256SUMS.txt`

The release workflow checks Windows FileVersion `0.1.11.0`, the installer checksum, and installed Quick Retouch asset hashes. Publication requires the same commit's Windows/Ubuntu core and Chromium validation to succeed. Silent installation and installed-file checks do not substitute for an interactive Windows/WebView2 visual test. Previous releases are not overwritten.
"""
write("docs/releases/v0.1.11.md", notes)
workflow = read(sys.argv[1])
if "RELEASE_VERSION: '0.1.11'" not in workflow or "Require same-commit repository validation" not in workflow:
    raise RuntimeError("Release workflow template is invalid")
write(".github/workflows/release.yml", workflow)

subprocess.run(["git", "add", "--", *changed], check=True)
staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], text=True).splitlines()
if set(staged) != set(changed) or len(staged) != 11:
    raise RuntimeError(f"Unexpected staged set: {staged}")
subprocess.run(["git", "diff", "--cached", "--check"], check=True)
print("RELEASE_CHANGED_FILES=" + ",".join(sorted(changed)))

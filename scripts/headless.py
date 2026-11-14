"""Shared helper: find a headless Chromium-family browser (Edge/Chrome on Windows, chromium under Linux/WSL).
It runs in the background with its own throw-away profile; it never drives the user's desktop."""
import os, shutil, subprocess, tempfile, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CANDIDATES = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
              shutil.which("chromium") or "", shutil.which("chromium-browser") or "", shutil.which("google-chrome") or ""]
BROWSER = next((c for c in CANDIDATES if c and os.path.exists(c)), None)


def page_url(query):
    p = ROOT / "index.html"
    if BROWSER and BROWSER.startswith("/mnt/c/"):  # Windows browser driven from WSL needs a Windows path
        p = subprocess.run(["wslpath", "-w", str(p)], capture_output=True, text=True).stdout.strip()
        return "file:///" + p.replace("\\", "/") + "?" + query
    return p.as_uri() + "?" + query


def run(args, query, size=(1600, 1000), budget=8000):
    if not BROWSER:
        raise SystemExit("No headless Chromium/Edge/Chrome found.")
    with tempfile.TemporaryDirectory() as prof:
        return subprocess.run([BROWSER, "--headless=new", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars",
                               "--allow-file-access-from-files", f"--window-size={size[0]},{size[1]}", f"--user-data-dir={prof}",
                               f"--virtual-time-budget={budget}", *args, page_url(query)],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)

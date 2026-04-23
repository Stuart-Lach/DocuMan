"""
run.py — ZIP Heading Editor launcher
Installs all requirements automatically, then starts Flask.
Usage:  python run.py
        (or double-click run.bat on Windows)
"""

import sys
import subprocess
import os

# ── Colours (work on Windows 10+ terminals) ──────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

HERE = os.path.dirname(os.path.abspath(__file__))


def banner():
    print(f"""
{CYAN}{BOLD}  ZIP Heading Editor
  Local File Processing Tool{RESET}
""")


def check_python():
    major, minor = sys.version_info[:2]
    if (major, minor) < (3, 9):
        print(f"{RED}[ERROR] Python 3.9+ is required.  "
              f"You are running Python {major}.{minor}.{RESET}")
        print(f"        Download the latest Python from https://python.org/downloads/")
        sys.exit(1)
    print(f"{GREEN}[OK]  Python {major}.{minor}{RESET}")


def install_requirements():
    req = os.path.join(HERE, "requirements.txt")
    if not os.path.exists(req):
        print(f"{YELLOW}[WARN] requirements.txt not found — skipping dependency install.{RESET}")
        return

    print(f"{CYAN}[..]  Installing / verifying dependencies...{RESET}")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", req, "--quiet", "--disable-pip-version-check"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print(f"{GREEN}[OK]  All dependencies are up to date.{RESET}")
    else:
        print(f"{YELLOW}[WARN] pip reported issues:{RESET}")
        for line in (result.stderr or result.stdout or "").strip().splitlines():
            print(f"       {line}")
        print(f"{YELLOW}       Attempting to start anyway...{RESET}")


def launch():
    app_path = os.path.join(HERE, "app.py")
    if not os.path.exists(app_path):
        print(f"{RED}[ERROR] app.py not found in {HERE}{RESET}")
        sys.exit(1)

    print(f"\n{GREEN}{BOLD}[OK]  Launching ZIP Heading Editor{RESET}")
    print(f"      {CYAN}http://127.0.0.1:5000{RESET}")
    print(f"      Press Ctrl+C to stop.\n")

    try:
        subprocess.run([sys.executable, app_path], cwd=HERE)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Server stopped.{RESET}")


if __name__ == "__main__":
    # Enable ANSI colour codes on Windows
    if sys.platform == "win32":
        os.system("color")

    banner()
    check_python()
    install_requirements()
    launch()



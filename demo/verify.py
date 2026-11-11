"""
Checks that every demo page behaves as demo/index.html declares.

    python3 demo/verify.py            same as: node tools/local-stack.mjs --auto

It used to drive Chromium from Python against the production server, with
selectors of an older version of the warning (and test/smoke.py, which is now
test/smoke.mjs). The check now lives in tools/local-stack.mjs: it starts
antefirma-server locally (a stand-in model without ANTHROPIC_API_KEY, the real
one with it), loads the extension pointed at it, presses each demo page's
button and prints, for each scenario, whether it blocked as declared, the
risks found, the cost, the deadline and the quotes the server dropped.
This file stays as a short entry point for whoever is used to it.

Extra arguments are passed on, e.g. `python3 demo/verify.py --json report.json`.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    cmd = ["node", str(ROOT / "tools" / "local-stack.mjs"), "--auto", *sys.argv[1:]]
    return subprocess.call(cmd, cwd=ROOT, env=os.environ.copy())


if __name__ == "__main__":
    sys.exit(main())

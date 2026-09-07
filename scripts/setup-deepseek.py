#!/usr/bin/env python3
"""Store AgentPay's DeepSeek key in a git-ignored, owner-only dotenv file."""

from __future__ import annotations

from getpass import getpass
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
KEY_NAME = "DEEPSEEK_API_KEY"


def main() -> None:
    key = getpass("DeepSeek API key (input hidden): ").strip()
    if not key or any(character.isspace() for character in key):
        raise SystemExit("A non-empty DeepSeek API key without whitespace is required.")

    existing = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    retained = [line for line in existing if not line.startswith(f"{KEY_NAME}=")]
    content = "\n".join([*retained, f"{KEY_NAME}={key}"]).strip() + "\n"

    descriptor, temporary_name = tempfile.mkstemp(prefix=".env.local.", dir=ROOT, text=True)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, ENV_FILE)
        os.chmod(ENV_FILE, 0o600)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    print("Saved AgentPay's DeepSeek key to .env.local with owner-only permissions.")
    print("The file is excluded from Git and the key was not printed.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Prompt for Binance read-only credentials without echoing or logging them."""

from __future__ import annotations

import getpass
import json
import os
from pathlib import Path
import tempfile


def main() -> int:
    default_path = Path.home() / ".local" / "share" / "agentpay" / "binance-readonly.json"
    config_path = Path(os.environ.get("AGENTPAY_BINANCE_READONLY_CONFIG", default_path)).expanduser()
    config_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(config_path.parent, 0o700)

    if config_path.exists():
        answer = input(f"A Binance read-only configuration already exists at {config_path}. Replace it? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Configuration unchanged.")
            return 0

    api_key = getpass.getpass("Binance read-only API key (hidden): ").strip()
    api_secret = getpass.getpass("Binance read-only API secret (hidden): ").strip()
    if not api_key or not api_secret:
        print("Both values are required. Nothing was saved.")
        return 1
    if any(character.isspace() for character in api_key + api_secret):
        print("Credentials cannot contain whitespace. Nothing was saved.")
        return 1

    payload = json.dumps({"apiKey": api_key, "apiSecret": api_secret}, separators=(",", ":")) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(prefix=".binance-readonly-", dir=config_path.parent, text=True)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, config_path)
        os.chmod(config_path, 0o600)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    finally:
        api_key = ""
        api_secret = ""
        payload = ""

    print(f"Binance read-only credentials saved with mode 0600 at {config_path}.")
    print("Restart AgentPay, then open Binance and select Refresh balances.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

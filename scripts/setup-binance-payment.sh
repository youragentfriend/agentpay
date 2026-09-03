#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r vendor/binance/payment/requirements.txt qrcode

echo "Binance Payment skill Python environment is ready."

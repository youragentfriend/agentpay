#!/usr/bin/env bash
set -euo pipefail

VENV_DIR="${AGENTPAY_PAYMENT_VENV:-$HOME/.local/share/agentpay/payment-venv}"
mkdir -p "$(dirname "$VENV_DIR")"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/pip" install -r vendor/binance/payment/requirements.txt qrcode

echo "Binance Payment skill Python environment is ready at $VENV_DIR."

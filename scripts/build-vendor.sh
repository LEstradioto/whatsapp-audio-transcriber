#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor/transformers"
TMP_DIR="$(mktemp -d)"

HF_VERSION="3.8.1"
ORT_VERSION="1.22.0"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$VENDOR_DIR"

# Transformers.js
(
  cd "$TMP_DIR"
  npm pack "@huggingface/transformers@$HF_VERSION" >/dev/null
  tar -xzf huggingface-transformers-*.tgz
  cp package/dist/transformers.min.js "$VENDOR_DIR/transformers.min.js"
  if [ -f package/LICENSE ]; then
    cp package/LICENSE "$VENDOR_DIR/LICENSE"
  fi
)

# Patch import.meta usage for non-module contexts
python - <<'PY'
from pathlib import Path
path = Path("$VENDOR_DIR/transformers.min.js")
text = path.read_text()
fallback = "(typeof document!=='undefined'&&document.currentScript?document.currentScript.src:location.href)"
text = text.replace('import.meta.url', fallback)
text = text.replace('Object(import.meta).url', fallback)
path.write_text(text)
PY

# ONNX Runtime Web
(
  cd "$TMP_DIR"
  npm pack "onnxruntime-web@$ORT_VERSION" >/dev/null
  tar -xzf onnxruntime-web-*.tgz
  cp package/dist/ort.bundle.min.mjs "$VENDOR_DIR/ort.bundle.min.mjs"
  cp package/dist/ort-wasm-simd-threaded.jsep.mjs "$VENDOR_DIR/ort-wasm-simd-threaded.jsep.mjs"
  cp package/dist/ort-wasm-simd-threaded.jsep.wasm "$VENDOR_DIR/ort-wasm-simd-threaded.jsep.wasm"
  if [ -f package/LICENSE ]; then
    cp package/LICENSE "$VENDOR_DIR/ONNXRUNTIME_LICENSE"
  fi
)

echo "Vendor files ready in $VENDOR_DIR"

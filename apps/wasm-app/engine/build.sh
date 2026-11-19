#!/bin/sh
# Build the tiny-voca C engine as a WASM module for the browser app.
# Requires Emscripten (emcc) on PATH.
#
# Output: ../frontend/public/engine/tv_engine.js + tv_engine.wasm
set -e
cd "$(dirname "$0")"
mkdir -p ../frontend/public/engine
emcc -O3 \
  tv_wasm.c vendor/tv.c vendor/tv_dsp.c vendor/tv_kernels_ref.c \
  -Ivendor \
  -msimd128 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS='["_tvw_init","_tvw_synth","_tvw_free","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAP32","HEAPF32","HEAPU8"]' \
  -o ../frontend/public/engine/tv_engine.js
echo "built ../frontend/public/engine/tv_engine.js (+ .wasm)"

#!/bin/sh
# Optional one-off Mathlib bootstrap (never receives the NVIDIA key).
# Mathlib and Lean must use the same release; avoid floating upstream master.
set -eu
VERSION=v4.24.0
DIR=/workspace/proofs/mathlib
mkdir -p /workspace/proofs
if [ ! -d "$DIR" ]; then
  mkdir "$DIR"
  printf 'leanprover/lean4:%s\n' "$VERSION" > "$DIR/lean-toolchain"
  cat > "$DIR/lakefile.toml" <<'LAKE'
name = "nhs_proofs"
version = "0.1.0"
defaultTargets = ["NhsProofs"]

[[require]]
name = "mathlib"
scope = "leanprover-community"
rev = "v4.24.0"

[[lean_lib]]
name = "NhsProofs"
LAKE
  printf 'import Mathlib\n' > "$DIR/NhsProofs.lean"
fi
cd "$DIR"
if [ ! -f lean-toolchain ]; then echo 'lean-toolchain ausente; instalação cancelada' >&2; exit 1; fi
if ! grep -q "leanprover/lean4:$VERSION" lean-toolchain; then
 echo 'Toolchain Lean incompatível; migre a versão conscientemente antes de executar.' >&2; exit 1
fi
lake update
lake exe cache get
lake build
printf '\nMathlib pronta: Lean e Mathlib fixados em %s.\n' "$VERSION"

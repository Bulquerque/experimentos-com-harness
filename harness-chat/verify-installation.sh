#!/usr/bin/env sh
# Smoke test after Docker Compose is running. No NVIDIA tokens are spent.
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Docker not found' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl not found' >&2; exit 1; }
echo '[1/5] Docker services'
docker compose ps --status running
echo '[2/5] HTTP API and runner'
curl --fail --silent --show-error http://127.0.0.1:8787/api/health | docker compose exec -T app node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{const r=JSON.parse(s);if(!r.ok||!r.runner?.available){console.error(r.runner);process.exitCode=1;}else console.log("Backend and runner ready")})'
echo '[3/5] Real Lean compiler'
curl --fail --silent --show-error -X POST -H 'Content-Type: application/json' -d '{"source":"theorem test_identity (p : Prop) : p -> p := by\n  intro h\n  exact h"}' http://127.0.0.1:8787/api/lean/check | docker compose exec -T app node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{const r=JSON.parse(s);if(!r.passed){console.error(r);process.exitCode=1;}else console.log("Lean theorem compiled")})'
echo '[4/5] Refusal of axiom'
curl --fail --silent --show-error -X POST -H 'Content-Type: application/json' -d '{"source":"axiom bad : False"}' http://127.0.0.1:8787/api/lean/check | docker compose exec -T app node -e 'let s="";process.stdin.on("data",b=>s+=b).on("end",()=>{const r=JSON.parse(s);if(r.passed){console.error("Axiom incorrectly accepted");process.exitCode=1;}else console.log("Axiom blocked")})'
echo '[5/5] Python regression suite in isolated runner'
docker compose exec -T runner sh -lc 'cd /workspace && python3 -m unittest discover -v'
echo 'PASS: Docker, API, runner, Lean, axiom policy, Python.'
echo 'Test NVIDIA separately with the connection test button in Configuração.'

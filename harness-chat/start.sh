#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo 'Criei .env: informe NVIDIA_API_KEY para usar um modelo real.'
fi
if ! grep -Eq '^RUNNER_TOKEN=[0-9a-fA-F]{64}$' .env; then
  TOKEN=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  if grep -q '^RUNNER_TOKEN=' .env; then
    sed "s/^RUNNER_TOKEN=.*/RUNNER_TOKEN=$TOKEN/" .env > .env.tmp && mv .env.tmp .env
  else
    printf '\nRUNNER_TOKEN=%s\n' "$TOKEN" >> .env
  fi
  echo 'Gerei um token interno seguro para o runner.'
fi
chmod 600 .env
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose up --build -d
elif command -v podman-compose >/dev/null 2>&1; then
  podman-compose -f compose.yaml -f compose.podman.yaml up --build -d
else
  echo "Instale Docker Compose ou podman-compose para iniciar os serviços." >&2
  exit 1
fi
echo 'Abra http://127.0.0.1:8787'

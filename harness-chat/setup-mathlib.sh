#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" docker compose --profile mathlib run --rm --build mathlib-setup
elif command -v podman-compose >/dev/null 2>&1; then
  LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" podman-compose -f compose.yaml -f compose.podman.yaml --profile mathlib run --rm --build mathlib-setup
else
  echo "Instale Docker Compose ou podman-compose para preparar Mathlib." >&2
  exit 1
fi

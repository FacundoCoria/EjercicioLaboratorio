#!/usr/bin/env bash
# Abre Jenkins en http://localhost:8081 usando port-forward.
# Uso: ./scripts/abrir-jenkins.sh [ruta/al/team1.kubeconfig]
DIR="$(cd "$(dirname "$0")" && pwd)"
SVC=jenkins SVC_PORT=8080 PORT="${PORT:-8081}" exec "$DIR/abrir-app.sh" "$@"

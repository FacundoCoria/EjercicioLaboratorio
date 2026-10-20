#!/usr/bin/env bash
# Abre la app del cluster en http://localhost:8080 usando port-forward.
# Uso: ./scripts/abrir-app.sh [ruta/al/team1.kubeconfig]
# Por defecto busca: el argumento, la variable KUBECONFIG, ./team1.kubeconfig o ~/.kube/team1.kubeconfig.
set -euo pipefail

KC="${1:-${KUBECONFIG:-}}"
if [ -z "$KC" ]; then
  for c in ./team1.kubeconfig "$HOME/.kube/team1.kubeconfig"; do
    [ -f "$c" ] && KC="$c" && break
  done
fi

if [ -z "$KC" ] || [ ! -f "$KC" ]; then
  echo "No encuentro el kubeconfig. Pasalo como argumento:" >&2
  echo "  ./scripts/abrir-app.sh ruta/al/team1.kubeconfig" >&2
  exit 1
fi
command -v kubectl >/dev/null || { echo "Falta kubectl: https://kubernetes.io/docs/tasks/tools/" >&2; exit 1; }

NS="${NAMESPACE:-$(kubectl --kubeconfig "$KC" config view --minify -o jsonpath='{.contexts[0].context.namespace}')}"
NS="${NS:-alumno-team1}"
PORT="${PORT:-8080}"

echo "Namespace: $NS"
echo "App en:    http://localhost:$PORT   (Ctrl+C para cerrar)"
exec kubectl --kubeconfig "$KC" port-forward -n "$NS" "svc/${SVC:-front}" "$PORT:${SVC_PORT:-80}"

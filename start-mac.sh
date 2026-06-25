#!/usr/bin/env bash
# macOS-compatible startup script for DigiBank (replaces start-all.sh which uses setsid).
set -uo pipefail

export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:$PATH"

SERVICES_NAMES=(api-gateway auth-service application-service affordability-service product-service document-service notification-service)
SERVICES_PORTS=(8080 8081 8082 8083 8084 8085 8086)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/pids.txt"
SERVICE_TIMEOUT=180
POLL_INTERVAL=2

mkdir -p "$LOG_DIR"
: > "$PID_FILE"

wait_for_port() {
  local port=$1 elapsed=0
  while [ $elapsed -lt $SERVICE_TIMEOUT ]; do
    if nc -z localhost "$port" 2>/dev/null; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  return 1
}

start_backend_service() {
  local name=$1 path=$2
  local log="$LOG_DIR/$name.log"
  : > "$log"
  (cd "$path" && exec mvn -q spring-boot:run) >>"$log" 2>&1 &
  echo "$name=$!" >> "$PID_FILE"
}

echo "Starting DigiBank stack (sequential, port-gated)..."
echo "Logs: $LOG_DIR"
echo ""

failed=()

for i in "${!SERVICES_NAMES[@]}"; do
  name="${SERVICES_NAMES[$i]}"
  port="${SERVICES_PORTS[$i]}"
  svc_path="$BACKEND_DIR/$name"

  echo "Starting $name on port $port..."
  start_backend_service "$name" "$svc_path"

  if wait_for_port "$port"; then
    echo "  $name is up on $port."
    continue
  fi

  echo "  $name did not bind $port within ${SERVICE_TIMEOUT}s — retrying once..."
  start_backend_service "$name" "$svc_path"

  if wait_for_port "$port"; then
    echo "  $name is up on $port after retry."
  else
    echo "  $name FAILED — check $LOG_DIR/$name.log"
    failed+=("$name")
  fi
done

echo ""
echo "Starting Angular dev server on 0.0.0.0:4200..."
fe_log="$LOG_DIR/frontend.log"
: > "$fe_log"
(cd "$FRONTEND_DIR" && exec npx ng serve --host 0.0.0.0 --port 4200) >>"$fe_log" 2>&1 &
echo "frontend=$!" >> "$PID_FILE"

if wait_for_port 4200; then
  echo "  Angular dev server is up on 4200."
else
  echo "  Angular dev server did not bind 4200 within ${SERVICE_TIMEOUT}s — check $fe_log"
  failed+=("frontend")
fi

echo ""
if [ ${#failed[@]} -eq 0 ]; then
  echo "All services up!"
  echo "  Frontend: http://localhost:4200"
  echo "  API Gateway: http://localhost:8080"
else
  echo "Started with failures: ${failed[*]}"
fi
echo "Stop everything with: ./stop-mac.sh"

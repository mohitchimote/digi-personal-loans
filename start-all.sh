#!/usr/bin/env bash
# DigiBank full-stack startup script for Linux (Codespaces / any devcontainer).
# Mirrors start-all.ps1's sequential, port-gated approach: launch all 7 backend
# microservices + the Angular dev server with ONE command, no extra terminals:
#   ./start-all.sh
#
# Each service runs in the background (own process group via setsid) with output
# redirected to logs/<service>.log, then this script BLOCKS until that service's
# port is actually listening before launching the next one - launching all 7
# `mvn spring-boot:run` builds at once makes them fight over the same first-time
# dependency downloads/lock files in ~/.m2, so strictly sequential startup avoids
# that race instead of gambling on a fixed delay (see PROJECT_DOCUMENTATION.md §4
# for the Windows/mvnd version of this same problem).
#
# If a service fails to bind its port within SERVICE_TIMEOUT, this script retries
# it once before giving up and moving on. Tail a log with:
#   tail -f logs/<service>.log
#
# To stop everything started by this script: ./stop-all.sh

set -uo pipefail

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
    if (exec 3<>/dev/tcp/localhost/"$port") 2>/dev/null; then
      exec 3>&- 2>/dev/null
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
  setsid bash -c "cd '$path' && exec mvn -q spring-boot:run" >>"$log" 2>&1 &
  echo "$name=$!" >> "$PID_FILE"
}

if ! (exec 3<>/dev/tcp/localhost/3306) 2>/dev/null; then
  echo "Starting MySQL..."
  sudo service mysql start
else
  exec 3>&- 2>/dev/null
fi

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

  echo "  $name did not bind $port within ${SERVICE_TIMEOUT}s - retrying once..."
  start_backend_service "$name" "$svc_path"

  if wait_for_port "$port"; then
    echo "  $name is up on $port after retry."
  else
    echo "  $name FAILED twice - check $LOG_DIR/$name.log for the error."
    failed+=("$name")
  fi
done

echo ""
echo "Starting Angular dev server (bound to 0.0.0.0:4200)..."
fe_log="$LOG_DIR/frontend.log"
: > "$fe_log"
setsid bash -c "cd '$FRONTEND_DIR' && exec npx ng serve --host 0.0.0.0 --port 4200" >>"$fe_log" 2>&1 &
echo "frontend=$!" >> "$PID_FILE"

if wait_for_port 4200; then
  echo "  Angular dev server is up on 4200."
else
  echo "  Angular dev server did not bind 4200 within ${SERVICE_TIMEOUT}s - check $fe_log."
  failed+=("frontend")
fi

echo ""
if [ ${#failed[@]} -eq 0 ]; then
  echo "All services up. In Codespaces, use the Ports tab (or 'gh codespace ports') to get the public URLs for 4200 and 8080."
else
  echo "Started with failures: ${failed[*]}"
fi
echo "Everything is running in the background. Stop it all with: ./stop-all.sh"

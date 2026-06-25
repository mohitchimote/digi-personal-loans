#!/usr/bin/env bash
# Stop all DigiBank services started by start-mac.sh
LOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/logs"
PID_FILE="$LOG_DIR/pids.txt"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found at $PID_FILE"
  exit 0
fi

while IFS='=' read -r name pid; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (PID $pid)..."
    kill "$pid" 2>/dev/null
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "Done."

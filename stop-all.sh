#!/usr/bin/env bash
# Stops everything started by start-all.sh (reads PIDs from logs/pids.txt).
# Each process was started via setsid, making it its own process group leader,
# so killing the negative PID (the group) takes down the mvn/node child it
# spawned too - not just the immediate wrapper process.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/logs/pids.txt"

if [ ! -f "$PID_FILE" ]; then
  echo "No $PID_FILE found - nothing recorded to stop. (Were services started with start-all.sh?)"
  exit 0
fi

while IFS='=' read -r name pid; do
  [ -z "$pid" ] && continue
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (PID $pid)..."
    kill -- "-$pid" 2>/dev/null
  else
    echo "$name (PID $pid) already gone."
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "Done."

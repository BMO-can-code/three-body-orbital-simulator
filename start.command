#!/bin/bash
cd "$(dirname "$0")" || exit 1

PORT=8000
while lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

printf '\nThree-Body Problem — local server\n\n  http://localhost:%s\n\nPress Ctrl+C to stop.\n\n' "$PORT"
(sleep 1; open "http://localhost:$PORT") &
exec python3 -m http.server "$PORT"

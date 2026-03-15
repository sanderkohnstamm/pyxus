#!/bin/bash
# Start mock MAVLink vehicle(s)
#
# Usage:
#   ./tools/run_mock.sh                           # 1 ardu quad on port 14550
#   ./tools/run_mock.sh 3                          # 3 ardu quads on ports 14550-14552
#   ./tools/run_mock.sh 2 14560                    # 2 ardu quads on ports 14560-14561
#   ./tools/run_mock.sh 2 14550 plane px4          # 2 PX4 planes on ports 14550-14551
#   ./tools/run_mock.sh 1 14550 mixed ardu         # one of each type (5 vehicles)

DIR="$(cd "$(dirname "$0")/.." && pwd)"
COUNT="${1:-1}"
PORT="${2:-14550}"
TYPE="${3:-quad}"
AUTOPILOT="${4:-ardu}"
VENV="$DIR/desktop/backend/venv/bin/python3"

if [ -f "$VENV" ]; then
  PYTHON="$VENV"
else
  PYTHON=python3
fi

exec $PYTHON "$DIR/tools/mock_drone.py" --count "$COUNT" --base-port "$PORT" --type "$TYPE" --autopilot "$AUTOPILOT"

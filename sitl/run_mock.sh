#!/bin/bash
# Start mock MAVLink drone(s)
#
# Usage:
#   ./sitl/run_mock.sh          # 1 drone on port 14550
#   ./sitl/run_mock.sh 3        # 3 drones on ports 14550-14552
#   ./sitl/run_mock.sh 2 14560  # 2 drones on ports 14560-14561

DIR="$(cd "$(dirname "$0")/.." && pwd)"
COUNT="${1:-1}"
PORT="${2:-14550}"
VENV="$DIR/backend/venv/bin/python3"

if [ -f "$VENV" ]; then
  PYTHON="$VENV"
else
  PYTHON=python3
fi

exec $PYTHON "$DIR/sitl/mock_drone.py" --count "$COUNT" --base-port "$PORT"

# Pyxus Tools

Development and testing utilities.

## Mock Drone

Simulates MAVLink vehicles for testing without hardware.

```bash
# 1 ArduPilot quad on port 14550
./run_mock.sh

# 3 quads on ports 14550-14552
./run_mock.sh 3

# 2 PX4 planes on ports 14550-14551
./run_mock.sh 2 14550 plane px4
```

Requires pymavlink — uses the desktop backend venv automatically if available.

## MAVLink Swift Code Generator

Generates Swift MAVLink message definitions from XML dialect files.

```bash
python3 mavgen_swift.py
```

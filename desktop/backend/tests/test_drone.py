"""Tests for drone.py — telemetry parsing, mode decode, and sanitization."""

import math
import time

from drone import (
    TelemetryState,
    ardupilot_modes_for_type,
    sanitize_for_json,
    ARDUPILOT_COPTER_MODES,
    ARDUPILOT_PLANE_MODES,
    ARDUPILOT_ROVER_MODES,
    ARDUPILOT_SUB_MODES,
    HEARTBEAT_TIMEOUT,
)


# ---------------------------------------------------------------------------
# Mode mapping tests
# ---------------------------------------------------------------------------

class TestArdupilotModesForType:
    """Tests for ardupilot_modes_for_type() vehicle-type dispatch."""

    def test_quadrotor_returns_copter_modes(self):
        assert ardupilot_modes_for_type(2) is ARDUPILOT_COPTER_MODES

    def test_fixed_wing_returns_plane_modes(self):
        assert ardupilot_modes_for_type(1) is ARDUPILOT_PLANE_MODES

    def test_rover_returns_rover_modes(self):
        assert ardupilot_modes_for_type(10) is ARDUPILOT_ROVER_MODES

    def test_submarine_returns_sub_modes(self):
        assert ardupilot_modes_for_type(12) is ARDUPILOT_SUB_MODES

    def test_unknown_type_falls_back_to_copter_modes(self):
        assert ardupilot_modes_for_type(99) is ARDUPILOT_COPTER_MODES

    def test_boat_returns_rover_modes(self):
        assert ardupilot_modes_for_type(11) is ARDUPILOT_ROVER_MODES

    def test_vtol_types_return_plane_modes(self):
        for mav_type in (19, 20, 21, 22, 23, 24, 25):
            assert ardupilot_modes_for_type(mav_type) is ARDUPILOT_PLANE_MODES, (
                f"MAV_TYPE {mav_type} should map to plane modes"
            )

    def test_multirotor_types_return_copter_modes(self):
        for mav_type in (2, 3, 4, 13, 14, 15, 29, 35):
            assert ardupilot_modes_for_type(mav_type) is ARDUPILOT_COPTER_MODES, (
                f"MAV_TYPE {mav_type} should map to copter modes"
            )


class TestModeKeys:
    """Verify expected entries exist in each mode dictionary."""

    def test_copter_auto_mode(self):
        assert ARDUPILOT_COPTER_MODES[3] == "AUTO"

    def test_copter_rtl_mode(self):
        assert ARDUPILOT_COPTER_MODES[6] == "RTL"

    def test_copter_loiter_mode(self):
        assert ARDUPILOT_COPTER_MODES[5] == "LOITER"

    def test_copter_land_mode(self):
        assert ARDUPILOT_COPTER_MODES[9] == "LAND"

    def test_plane_auto_mode(self):
        assert ARDUPILOT_PLANE_MODES[10] == "AUTO"

    def test_plane_rtl_mode(self):
        assert ARDUPILOT_PLANE_MODES[11] == "RTL"

    def test_plane_manual_mode(self):
        assert ARDUPILOT_PLANE_MODES[0] == "MANUAL"

    def test_rover_auto_mode(self):
        assert ARDUPILOT_ROVER_MODES[10] == "AUTO"

    def test_rover_hold_mode(self):
        assert ARDUPILOT_ROVER_MODES[3] == "HOLD"

    def test_sub_stabilize_mode(self):
        assert ARDUPILOT_SUB_MODES[0] == "STABILIZE"

    def test_sub_manual_mode(self):
        assert ARDUPILOT_SUB_MODES[19] == "MANUAL"


# ---------------------------------------------------------------------------
# TelemetryState tests
# ---------------------------------------------------------------------------

class TestTelemetryStateDefaults:
    """Verify default values for a fresh TelemetryState."""

    def test_lat_lon_default_to_zero(self):
        ts = TelemetryState()
        assert ts.lat == 0.0
        assert ts.lon == 0.0

    def test_battery_remaining_default_is_minus_one(self):
        ts = TelemetryState()
        assert ts.remaining == -1

    def test_armed_default_is_false(self):
        ts = TelemetryState()
        assert ts.armed is False

    def test_mode_default_is_empty(self):
        ts = TelemetryState()
        assert ts.mode == ""

    def test_hdop_default_is_high(self):
        ts = TelemetryState()
        assert ts.hdop == 99.99

    def test_link_lost_default_is_false(self):
        ts = TelemetryState()
        assert ts.link_lost is False

    def test_mission_seq_default_is_minus_one(self):
        ts = TelemetryState()
        assert ts.mission_seq == -1

    def test_autopilot_default_is_unknown(self):
        ts = TelemetryState()
        assert ts.autopilot == "unknown"


class TestTelemetryStateToDict:
    """Tests for TelemetryState.to_dict() serialization."""

    EXPECTED_KEYS = {
        "roll", "pitch", "yaw", "rollspeed", "pitchspeed", "yawspeed",
        "lat", "lon", "alt", "alt_msl",
        "airspeed", "groundspeed", "climb", "heading",
        "voltage", "current", "remaining",
        "fix_type", "satellites", "hdop",
        "armed", "mode", "system_status", "autopilot",
        "mission_seq",
        "home_lat", "home_lon", "home_alt",
        "platform_type", "heartbeat_age", "link_lost",
    }

    def test_to_dict_returns_all_expected_keys(self):
        d = TelemetryState().to_dict()
        assert set(d.keys()) == self.EXPECTED_KEYS

    def test_to_dict_preserves_set_values(self):
        ts = TelemetryState(lat=51.5074, lon=-0.1278, alt=100.0, mode="AUTO", armed=True)
        d = ts.to_dict()
        assert d["lat"] == 51.5074
        assert d["lon"] == -0.1278
        assert d["alt"] == 100.0
        assert d["mode"] == "AUTO"
        assert d["armed"] is True

    def test_to_dict_rounds_floats(self):
        ts = TelemetryState(roll=0.123456789, pitch=0.987654321, alt=12.345678)
        d = ts.to_dict()
        assert d["roll"] == 0.1235  # rounded to 4 dp
        assert d["pitch"] == 0.9877
        assert d["alt"] == 12.35  # rounded to 2 dp

    def test_heartbeat_age_is_minus_one_when_no_heartbeat(self):
        ts = TelemetryState(last_heartbeat=0.0)
        d = ts.to_dict()
        assert d["heartbeat_age"] == -1

    def test_heartbeat_age_is_positive_after_heartbeat(self):
        ts = TelemetryState(last_heartbeat=time.time() - 2.5)
        d = ts.to_dict()
        assert 2.0 <= d["heartbeat_age"] <= 3.5

    def test_to_dict_is_json_serializable(self):
        """Ensure all values are basic Python types (no dataclass, no NaN)."""
        import json
        ts = TelemetryState(last_heartbeat=time.time())
        json_str = json.dumps(ts.to_dict())
        assert isinstance(json_str, str)


# ---------------------------------------------------------------------------
# sanitize_for_json tests
# ---------------------------------------------------------------------------

class TestSanitizeForJson:
    """Tests for sanitize_for_json() NaN/Inf handling."""

    def test_nan_becomes_none(self):
        assert sanitize_for_json(float("nan")) is None

    def test_positive_inf_becomes_none(self):
        assert sanitize_for_json(float("inf")) is None

    def test_negative_inf_becomes_none(self):
        assert sanitize_for_json(float("-inf")) is None

    def test_normal_float_passes_through(self):
        assert sanitize_for_json(3.14) == 3.14

    def test_zero_passes_through(self):
        assert sanitize_for_json(0.0) == 0.0

    def test_integer_passes_through(self):
        assert sanitize_for_json(42) == 42

    def test_string_passes_through(self):
        assert sanitize_for_json("hello") == "hello"

    def test_none_passes_through(self):
        assert sanitize_for_json(None) is None

    def test_dict_with_nan_values(self):
        result = sanitize_for_json({"a": 1.0, "b": float("nan"), "c": "ok"})
        assert result == {"a": 1.0, "b": None, "c": "ok"}

    def test_list_with_inf_values(self):
        result = sanitize_for_json([1.0, float("inf"), float("-inf"), 2.0])
        assert result == [1.0, None, None, 2.0]

    def test_nested_dict(self):
        result = sanitize_for_json({"outer": {"inner": float("nan")}})
        assert result == {"outer": {"inner": None}}

    def test_tuple_returns_list(self):
        result = sanitize_for_json((1.0, float("nan")))
        assert result == [1.0, None]


# ---------------------------------------------------------------------------
# Link loss detection logic
# ---------------------------------------------------------------------------

class TestLinkLossDetection:
    """Test link loss detection based on heartbeat age vs threshold."""

    def test_heartbeat_age_exceeds_timeout_indicates_link_loss(self):
        ts = TelemetryState(
            last_heartbeat=time.time() - HEARTBEAT_TIMEOUT - 1.0,
            link_lost=True,
        )
        d = ts.to_dict()
        assert d["heartbeat_age"] > HEARTBEAT_TIMEOUT
        assert d["link_lost"] is True

    def test_recent_heartbeat_no_link_loss(self):
        ts = TelemetryState(
            last_heartbeat=time.time() - 0.5,
            link_lost=False,
        )
        d = ts.to_dict()
        assert d["heartbeat_age"] < HEARTBEAT_TIMEOUT
        assert d["link_lost"] is False

    def test_heartbeat_timeout_constant_is_positive(self):
        assert HEARTBEAT_TIMEOUT > 0

    def test_telemetry_fields_settable_and_round_trip(self):
        """Verify fields can be set programmatically and serialized."""
        ts = TelemetryState()
        ts.lat = 52.3676
        ts.lon = 4.9041
        ts.alt = 50.5
        ts.mode = "GUIDED"
        ts.armed = True
        ts.voltage = 12.6
        ts.satellites = 12
        ts.fix_type = 3

        d = ts.to_dict()
        assert d["lat"] == 52.3676
        assert d["lon"] == 4.9041
        assert d["alt"] == 50.5
        assert d["mode"] == "GUIDED"
        assert d["armed"] is True
        assert d["voltage"] == 12.6
        assert d["satellites"] == 12
        assert d["fix_type"] == 3

"""Tests for mission protocol logic in mission.py (MissionManager)."""

import queue
import time
from dataclasses import dataclass
from unittest.mock import MagicMock

from pymavlink import mavutil

from mission import MissionManager, Waypoint, ITEM_TYPE_COMMANDS


# ---------------------------------------------------------------------------
# Mock drone connection
# ---------------------------------------------------------------------------

class MockMavMsg:
    """Lightweight stand-in for a MAVLink message object."""

    def __init__(self, msg_type: str, **fields):
        self._type = msg_type
        for k, v in fields.items():
            setattr(self, k, v)

    def get_type(self) -> str:
        return self._type


class MockDroneConnection:
    """Simulates the drone connection interface used by MissionManager.

    Provides send_mission_cmd, recv_mission_msg, drain_mission_queue,
    connected, is_ardupilot, set_mode — the full surface MissionManager
    touches.
    """

    def __init__(self, *, connected: bool = True, is_ardupilot: bool = True,
                 drain_enabled: bool = False):
        self._connected = connected
        self._is_ardupilot = is_ardupilot
        self._drain_enabled = drain_enabled
        self._mission_queue: list[MockMavMsg] = []
        self.sent_commands: list[tuple[str, dict]] = []

    # -- properties ----------------------------------------------------------

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def is_ardupilot(self) -> bool:
        return self._is_ardupilot

    # -- mission protocol methods -------------------------------------------

    def send_mission_cmd(self, cmd_type: str, **kwargs):
        self.sent_commands.append((cmd_type, kwargs))

    def drain_mission_queue(self):
        if self._drain_enabled:
            self._mission_queue.clear()

    def recv_mission_msg(self, timeout: float = 5.0):
        if self._mission_queue:
            return self._mission_queue.pop(0)
        return None

    def set_mode(self, mode: str):
        self.sent_commands.append(("set_mode", {"mode": mode}))

    # -- helpers for test setup ---------------------------------------------

    def enqueue(self, *msgs: MockMavMsg):
        """Queue messages that recv_mission_msg will return in order."""
        self._mission_queue.extend(msgs)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_waypoints(n: int = 2) -> list[Waypoint]:
    """Create *n* simple test waypoints."""
    return [
        Waypoint(lat=52.0 + i * 0.001, lon=4.0 + i * 0.001, alt=50 + i * 10)
        for i in range(n)
    ]


def _request_int(seq: int) -> MockMavMsg:
    return MockMavMsg("MISSION_REQUEST_INT", seq=seq)


def _request(seq: int) -> MockMavMsg:
    return MockMavMsg("MISSION_REQUEST", seq=seq)


def _ack(accepted: bool = True) -> MockMavMsg:
    ack_type = (
        mavutil.mavlink.MAV_MISSION_ACCEPTED if accepted
        else mavutil.mavlink.MAV_MISSION_ERROR
    )
    return MockMavMsg("MISSION_ACK", type=ack_type)


def _mission_count(count: int) -> MockMavMsg:
    return MockMavMsg("MISSION_COUNT", count=count)


def _mission_item_int(seq: int, *, lat: float = 52.0, lon: float = 4.0,
                       alt: float = 50, command: int = 16,
                       param1: float = 0, param2: float = 2,
                       param3: float = 0, param4: float = 0) -> MockMavMsg:
    return MockMavMsg(
        "MISSION_ITEM_INT",
        seq=seq,
        x=int(lat * 1e7),
        y=int(lon * 1e7),
        z=alt,
        command=command,
        param1=param1,
        param2=param2,
        param3=param3,
        param4=param4,
    )


# ===========================================================================
# Upload Tests
# ===========================================================================

class TestUpload:
    """Tests for MissionManager.upload()."""

    def test_normal_upload_flow(self):
        """Count -> request_int for each seq -> ACK accepted."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(2)

        # AP will request seq 0 (home), 1, 2, then ACK
        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _request_int(2),
            _ack(accepted=True),
        )

        result = mgr.upload(wps)

        assert result is True
        assert mgr.status == "uploaded"

        # First sent command should be mission_count with total = len(wps) + 1
        assert drone.sent_commands[0] == ("mission_count", {"count": 3})

        # Should have sent 3 mission_item_int commands (seq 0, 1, 2)
        item_cmds = [c for c in drone.sent_commands if c[0] == "mission_item_int"]
        assert len(item_cmds) == 3
        assert item_cmds[0][1]["seq"] == 0  # home
        assert item_cmds[1][1]["seq"] == 1
        assert item_cmds[2][1]["seq"] == 2

    def test_upload_handles_legacy_mission_request(self):
        """AP may send MISSION_REQUEST instead of MISSION_REQUEST_INT."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)

        drone.enqueue(
            _request(0),
            _request(1),
            _ack(accepted=True),
        )

        assert mgr.upload(wps) is True
        assert mgr.status == "uploaded"

    def test_upload_with_duplicate_seq_request(self):
        """AP retry: requesting the same seq number twice should succeed."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)

        # AP requests seq 0, then seq 0 again (retry), then seq 1, ACK
        drone.enqueue(
            _request_int(0),
            _request_int(0),  # duplicate retry
            _request_int(1),
            _ack(accepted=True),
        )

        assert mgr.upload(wps) is True
        assert mgr.status == "uploaded"

        # Should have sent mission_item_int for seq 0 twice
        item_cmds = [c for c in drone.sent_commands if c[0] == "mission_item_int"]
        assert len(item_cmds) == 3
        assert item_cmds[0][1]["seq"] == 0
        assert item_cmds[1][1]["seq"] == 0  # retry response
        assert item_cmds[2][1]["seq"] == 1

    def test_upload_timeout_returns_false(self):
        """No response at all -> upload fails."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)
        # Empty queue — recv_mission_msg returns None immediately

        result = mgr.upload(wps)

        assert result is False
        assert mgr.status == "upload_failed"

    def test_upload_rejected_ack(self):
        """ACK with type != ACCEPTED -> upload fails."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)

        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _ack(accepted=False),
        )

        result = mgr.upload(wps)

        assert result is False
        assert mgr.status == "upload_failed"

    def test_upload_empty_waypoint_list(self):
        """Empty waypoint list returns False immediately."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        result = mgr.upload([])

        assert result is False

    def test_upload_not_connected(self):
        """Disconnected drone returns False immediately."""
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)

        result = mgr.upload(_make_waypoints(1))

        assert result is False

    def test_home_position_auto_added_at_seq_zero(self):
        """Seq 0 should be home position using first waypoint's lat/lon at alt=0."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)

        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _ack(accepted=True),
        )

        mgr.upload(wps)

        # Find the mission_item_int for seq 0
        home_cmd = [c for c in drone.sent_commands
                    if c[0] == "mission_item_int" and c[1].get("seq") == 0][0]
        kw = home_cmd[1]

        assert kw["frame"] == mavutil.mavlink.MAV_FRAME_GLOBAL_INT
        assert kw["command"] == mavutil.mavlink.MAV_CMD_NAV_WAYPOINT
        assert kw["x"] == int(wps[0].lat * 1e7)
        assert kw["y"] == int(wps[0].lon * 1e7)
        assert kw["z"] == 0  # home is ground level

    def test_upload_invalid_seq_request_fails(self):
        """Request for seq >= total_count should fail the upload."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)  # total_count = 2

        drone.enqueue(
            _request_int(99),  # invalid seq
        )

        result = mgr.upload(wps)

        assert result is False
        assert mgr.status == "upload_failed"

    def test_upload_drains_queue_first(self):
        """Upload should drain stale messages before starting."""
        drone = MockDroneConnection(drain_enabled=True)
        mgr = MissionManager(drone)
        wps = _make_waypoints(1)

        # Pre-load stale message that drain should remove
        drone.enqueue(MockMavMsg("MISSION_ACK", type=0))

        # Override drain to clear stale msgs then enqueue the real protocol flow
        original_drain = drone.drain_mission_queue

        def drain_and_enqueue():
            original_drain()
            drone.enqueue(
                _request_int(0),
                _request_int(1),
                _ack(accepted=True),
            )

        drone.drain_mission_queue = drain_and_enqueue

        result = mgr.upload(wps)
        assert result is True

    def test_upload_non_nav_item_uses_mission_frame(self):
        """DO_JUMP and other non-nav types should use MAV_FRAME_MISSION with zeroed coords."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        wps = [Waypoint(lat=0, lon=0, alt=0, item_type="do_jump", param1=3, param2=2)]

        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _ack(accepted=True),
        )

        mgr.upload(wps)

        # Find the mission_item_int for seq 1 (the do_jump)
        item_cmd = [c for c in drone.sent_commands
                    if c[0] == "mission_item_int" and c[1].get("seq") == 1][0]
        kw = item_cmd[1]

        assert kw["frame"] == mavutil.mavlink.MAV_FRAME_MISSION
        assert kw["command"] == ITEM_TYPE_COMMANDS["do_jump"]
        assert kw["x"] == 0
        assert kw["y"] == 0
        assert kw["z"] == 0
        assert kw["param1"] == 3
        assert kw["param2"] == 2


# ===========================================================================
# Download Tests
# ===========================================================================

class TestDownload:
    """Tests for MissionManager.download()."""

    def test_normal_download_ardupilot(self):
        """ArduPilot: request_list -> count -> request items (skip seq 0) -> ACK."""
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        # count=3 means seq 0 (home), 1, 2
        drone.enqueue(
            _mission_count(3),
            _mission_item_int(1, lat=52.001, lon=4.001, alt=50),
            _mission_item_int(2, lat=52.002, lon=4.002, alt=60),
        )

        items = mgr.download()

        assert len(items) == 2
        assert items[0]["lat"] == 52.001
        assert items[0]["lon"] == 4.001
        assert items[0]["alt"] == 50
        assert items[1]["lat"] == 52.002
        assert items[1]["alt"] == 60

        # Should have sent mission_request_list, then mission_request_int for seq 1 and 2, then ack
        cmd_types = [c[0] for c in drone.sent_commands]
        assert "mission_request_list" in cmd_types
        assert "mission_ack" in cmd_types

        req_cmds = [c for c in drone.sent_commands if c[0] == "mission_request_int"]
        assert req_cmds[0][1]["seq"] == 1  # skip home
        assert req_cmds[1][1]["seq"] == 2

    def test_normal_download_px4(self):
        """PX4: no home skip, items start at seq 0."""
        drone = MockDroneConnection(is_ardupilot=False)
        mgr = MissionManager(drone)

        drone.enqueue(
            _mission_count(2),
            _mission_item_int(0, lat=52.001, lon=4.001, alt=50),
            _mission_item_int(1, lat=52.002, lon=4.002, alt=60),
        )

        items = mgr.download()

        assert len(items) == 2
        req_cmds = [c for c in drone.sent_commands if c[0] == "mission_request_int"]
        assert req_cmds[0][1]["seq"] == 0

    def test_download_empty_mission_ardupilot(self):
        """ArduPilot: count <= 1 means no user waypoints."""
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        drone.enqueue(_mission_count(1))  # only home

        items = mgr.download()
        assert items == []

    def test_download_empty_mission_px4(self):
        """PX4: count == 0 means empty mission."""
        drone = MockDroneConnection(is_ardupilot=False)
        mgr = MissionManager(drone)

        drone.enqueue(_mission_count(0))

        items = mgr.download()
        assert items == []

    def test_download_timeout_no_count(self):
        """No MISSION_COUNT response -> empty list."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)
        # Empty queue

        items = mgr.download()
        assert items == []

    def test_download_timeout_missing_item(self):
        """MISSION_COUNT received but item fetch times out -> empty list."""
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        drone.enqueue(_mission_count(3))
        # No items queued — recv returns None for item requests

        items = mgr.download()
        assert items == []

    def test_download_not_connected(self):
        """Disconnected drone returns empty list."""
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)

        assert mgr.download() == []

    def test_download_recognizes_item_types(self):
        """Downloaded items should have correct item_type from command mapping."""
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        drone.enqueue(
            _mission_count(2),
            _mission_item_int(1, command=mavutil.mavlink.MAV_CMD_NAV_TAKEOFF),
        )

        items = mgr.download()
        assert len(items) == 1
        assert items[0]["item_type"] == "takeoff"

    def test_download_wrong_message_type_for_count(self):
        """If first message is not MISSION_COUNT, return empty."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(_ack(accepted=True))  # wrong message type

        items = mgr.download()
        assert items == []


# ===========================================================================
# Fence Upload Tests
# ===========================================================================

class TestFenceUpload:
    """Tests for MissionManager.upload_fence() (circle) and upload_polygon_fence()."""

    def test_circle_fence_upload(self):
        """Normal circle fence upload flow."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(
            _request_int(0),
            _ack(accepted=True),
        )

        result = mgr.upload_fence(lat=52.0, lon=4.0, radius=200.0)

        assert result is True

        # Should send mission_count with count=1 and fence mission_type
        count_cmd = drone.sent_commands[0]
        assert count_cmd[0] == "mission_count"
        assert count_cmd[1]["count"] == 1
        assert count_cmd[1]["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        # Should send fence circle item
        item_cmd = [c for c in drone.sent_commands if c[0] == "mission_item_int"][0]
        kw = item_cmd[1]
        assert kw["command"] == 5003  # MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION
        assert kw["param1"] == 200.0
        assert kw["x"] == int(52.0 * 1e7)
        assert kw["y"] == int(4.0 * 1e7)
        assert kw["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        # Should enable fence after ACK
        fence_enable = [c for c in drone.sent_commands if c[0] == "fence_enable"]
        assert len(fence_enable) == 1
        assert fence_enable[0][1]["enable"] == 1

    def test_circle_fence_rejected(self):
        """Fence ACK with error returns False."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(
            _request_int(0),
            _ack(accepted=False),
        )

        result = mgr.upload_fence(lat=52.0, lon=4.0, radius=200.0)
        assert result is False

    def test_circle_fence_timeout(self):
        """No response -> returns False."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        result = mgr.upload_fence(lat=52.0, lon=4.0, radius=200.0)
        assert result is False

    def test_circle_fence_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)

        result = mgr.upload_fence(lat=52.0, lon=4.0, radius=200.0)
        assert result is False

    def test_polygon_fence_upload(self):
        """Normal polygon fence with 4 vertices."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        vertices = [
            {"lat": 52.0, "lon": 4.0},
            {"lat": 52.001, "lon": 4.0},
            {"lat": 52.001, "lon": 4.001},
            {"lat": 52.0, "lon": 4.001},
        ]

        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _request_int(2),
            _request_int(3),
            _ack(accepted=True),
        )

        result = mgr.upload_polygon_fence(vertices)

        assert result is True

        count_cmd = drone.sent_commands[0]
        assert count_cmd[0] == "mission_count"
        assert count_cmd[1]["count"] == 4
        assert count_cmd[1]["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        item_cmds = [c for c in drone.sent_commands if c[0] == "mission_item_int"]
        assert len(item_cmds) == 4

        # Each vertex should have command 5001 and param1 = vertex count
        for i, cmd in enumerate(item_cmds):
            kw = cmd[1]
            assert kw["command"] == 5001  # MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION
            assert kw["param1"] == 4  # total vertex count
            assert kw["x"] == int(vertices[i]["lat"] * 1e7)
            assert kw["y"] == int(vertices[i]["lon"] * 1e7)
            assert kw["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        # Should enable fence after ACK
        fence_enable = [c for c in drone.sent_commands if c[0] == "fence_enable"]
        assert len(fence_enable) == 1

    def test_polygon_fence_too_few_vertices(self):
        """Fewer than 3 vertices returns False."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        result = mgr.upload_polygon_fence([{"lat": 52.0, "lon": 4.0}, {"lat": 52.1, "lon": 4.1}])
        assert result is False

    def test_polygon_fence_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)

        vertices = [{"lat": 52.0 + i * 0.001, "lon": 4.0} for i in range(3)]
        result = mgr.upload_polygon_fence(vertices)
        assert result is False

    def test_polygon_fence_rejected(self):
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        vertices = [{"lat": 52.0 + i * 0.001, "lon": 4.0} for i in range(3)]
        drone.enqueue(
            _request_int(0),
            _request_int(1),
            _request_int(2),
            _ack(accepted=False),
        )

        result = mgr.upload_polygon_fence(vertices)
        assert result is False


# ===========================================================================
# Fence Download Tests
# ===========================================================================

class TestFenceDownload:
    """Tests for MissionManager.download_fence()."""

    def test_download_circle_fence(self):
        """Download a single circle fence item."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(
            _mission_count(1),
            _mission_item_int(0, lat=52.0, lon=4.0, alt=0,
                              command=5003, param1=200.0),
        )

        items = mgr.download_fence()

        assert len(items) == 1
        assert items[0]["command"] == 5003
        assert items[0]["lat"] == 52.0
        assert items[0]["lon"] == 4.0
        assert items[0]["param1"] == 200.0

        # Should request with fence mission_type
        req_cmd = [c for c in drone.sent_commands if c[0] == "mission_request_int"][0]
        assert req_cmd[1]["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        # Should send ACK with fence mission_type
        ack_cmd = [c for c in drone.sent_commands if c[0] == "mission_ack"][0]
        assert ack_cmd[1]["mission_type"] == mavutil.mavlink.MAV_MISSION_TYPE_FENCE

    def test_download_polygon_fence(self):
        """Download polygon fence with 3 vertices."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(
            _mission_count(3),
            _mission_item_int(0, lat=52.0, lon=4.0, command=5001, param1=3),
            _mission_item_int(1, lat=52.001, lon=4.001, command=5001, param1=3),
            _mission_item_int(2, lat=52.002, lon=4.002, command=5001, param1=3),
        )

        items = mgr.download_fence()

        assert len(items) == 3
        for item in items:
            assert item["command"] == 5001
            assert item["param1"] == 3

    def test_download_empty_fence(self):
        """count == 0 -> empty list."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        drone.enqueue(_mission_count(0))

        items = mgr.download_fence()
        assert items == []

    def test_download_fence_timeout(self):
        """No response -> empty list."""
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        items = mgr.download_fence()
        assert items == []

    def test_download_fence_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)

        assert mgr.download_fence() == []


# ===========================================================================
# Clear / Start / Pause / Resume
# ===========================================================================

class TestMissionControl:
    """Tests for start, pause, resume, clear."""

    def test_clear_sends_mission_clear(self):
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        assert mgr.clear() is True
        assert drone.sent_commands[0] == ("mission_clear", {})
        assert mgr.status == "idle"

    def test_clear_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)
        assert mgr.clear() is False

    def test_start_switches_to_auto(self):
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        assert mgr.start() is True
        assert mgr.status == "running"
        mode_cmds = [c for c in drone.sent_commands if c[0] == "set_mode"]
        assert mode_cmds[0][1]["mode"] == "AUTO"

    def test_start_px4_switches_to_mission(self):
        drone = MockDroneConnection(is_ardupilot=False)
        mgr = MissionManager(drone)

        assert mgr.start() is True
        mode_cmds = [c for c in drone.sent_commands if c[0] == "set_mode"]
        assert mode_cmds[0][1]["mode"] == "MISSION"

    def test_pause_switches_to_loiter(self):
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        assert mgr.pause() is True
        assert mgr.status == "paused"
        mode_cmds = [c for c in drone.sent_commands if c[0] == "set_mode"]
        assert mode_cmds[0][1]["mode"] == "LOITER"

    def test_resume_switches_back_to_auto(self):
        drone = MockDroneConnection(is_ardupilot=True)
        mgr = MissionManager(drone)

        assert mgr.resume() is True
        assert mgr.status == "running"

    def test_clear_fence(self):
        drone = MockDroneConnection()
        mgr = MissionManager(drone)

        assert mgr.clear_fence() is True
        cmd_types = [c[0] for c in drone.sent_commands]
        assert "fence_enable" in cmd_types
        assert "mission_clear" in cmd_types

    def test_start_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)
        assert mgr.start() is False

    def test_pause_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)
        assert mgr.pause() is False

    def test_resume_not_connected(self):
        drone = MockDroneConnection(connected=False)
        mgr = MissionManager(drone)
        assert mgr.resume() is False

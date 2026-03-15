"""Tests for vehicle_profiles.py — vehicle capability profile lookup."""

from vehicle_profiles import get_profile, VEHICLE_PROFILES, _MAV_TYPE_TO_PROFILE


# ---------------------------------------------------------------------------
# Required keys that every profile must contain
# ---------------------------------------------------------------------------
REQUIRED_KEYS = {
    "mav_types",
    "category",
    "commands",
    "has_altitude",
    "has_depth",
    "supports_takeoff",
    "supports_vtol",
    "default_speed",
    "profile_name",
}


class TestGetProfile:
    """Tests for the get_profile() lookup function."""

    # --- Known MAV_TYPE mappings ---

    def test_quadrotor_returns_copter(self):
        profile = get_profile(2)
        assert profile["profile_name"] == "copter"

    def test_hexarotor_returns_copter(self):
        profile = get_profile(13)
        assert profile["profile_name"] == "copter"

    def test_octorotor_returns_copter(self):
        profile = get_profile(14)
        assert profile["profile_name"] == "copter"

    def test_tricopter_returns_copter(self):
        profile = get_profile(15)
        assert profile["profile_name"] == "copter"

    def test_coaxial_returns_copter(self):
        profile = get_profile(3)
        assert profile["profile_name"] == "copter"

    def test_helicopter_returns_copter(self):
        profile = get_profile(4)
        assert profile["profile_name"] == "copter"

    def test_dodecarotor_returns_copter(self):
        profile = get_profile(29)
        assert profile["profile_name"] == "copter"

    def test_decarotor_returns_copter(self):
        profile = get_profile(35)
        assert profile["profile_name"] == "copter"

    def test_fixed_wing_returns_plane(self):
        profile = get_profile(1)
        assert profile["profile_name"] == "plane"

    def test_vtol_tiltrotor_returns_vtol(self):
        profile = get_profile(19)
        assert profile["profile_name"] == "vtol"

    def test_vtol_quad_returns_vtol(self):
        profile = get_profile(21)
        assert profile["profile_name"] == "vtol"

    def test_vtol_tailsitter_returns_vtol(self):
        profile = get_profile(22)
        assert profile["profile_name"] == "vtol"

    def test_rover_returns_rover(self):
        profile = get_profile(10)
        assert profile["profile_name"] == "rover"

    def test_boat_returns_boat(self):
        profile = get_profile(11)
        assert profile["profile_name"] == "boat"

    def test_submarine_returns_sub(self):
        profile = get_profile(12)
        assert profile["profile_name"] == "sub"

    # --- Fallback behaviour ---

    def test_unknown_type_falls_back_to_copter(self):
        profile = get_profile(999)
        assert profile["profile_name"] == "copter"

    def test_unknown_type_zero_falls_back_to_copter(self):
        # MAV_TYPE 0 = Generic; not explicitly in any profile
        profile = get_profile(0)
        assert profile["profile_name"] == "copter"

    def test_negative_type_falls_back_to_copter(self):
        profile = get_profile(-1)
        assert profile["profile_name"] == "copter"


class TestProfileStructure:
    """Every profile must have the required keys and sensible values."""

    def test_all_profiles_have_required_keys(self):
        for name, raw_profile in VEHICLE_PROFILES.items():
            # The stored profile won't have profile_name, but the lookup result will
            result = get_profile(raw_profile["mav_types"][0])
            missing = REQUIRED_KEYS - set(result.keys())
            assert missing == set(), f"Profile '{name}' is missing keys: {missing}"

    def test_commands_is_non_empty_list(self):
        for name, raw_profile in VEHICLE_PROFILES.items():
            result = get_profile(raw_profile["mav_types"][0])
            assert isinstance(result["commands"], list)
            assert len(result["commands"]) > 0, f"Profile '{name}' has no commands"

    def test_category_is_valid_string(self):
        valid_categories = {"air", "ground", "surface", "underwater"}
        for name, raw_profile in VEHICLE_PROFILES.items():
            result = get_profile(raw_profile["mav_types"][0])
            assert result["category"] in valid_categories, (
                f"Profile '{name}' has invalid category: {result['category']}"
            )

    def test_default_speed_is_positive(self):
        for name, raw_profile in VEHICLE_PROFILES.items():
            result = get_profile(raw_profile["mav_types"][0])
            assert result["default_speed"] > 0, (
                f"Profile '{name}' has non-positive default_speed"
            )


class TestProfileCapabilities:
    """Test specific capability flags per vehicle type."""

    def test_copter_supports_takeoff(self):
        profile = get_profile(2)  # quadrotor
        assert profile["supports_takeoff"] is True

    def test_copter_supports_vtol(self):
        profile = get_profile(2)
        assert profile["supports_vtol"] is True

    def test_copter_has_altitude(self):
        profile = get_profile(2)
        assert profile["has_altitude"] is True

    def test_copter_has_no_depth(self):
        profile = get_profile(2)
        assert profile["has_depth"] is False

    def test_plane_supports_takeoff(self):
        profile = get_profile(1)
        assert profile["supports_takeoff"] is True

    def test_plane_does_not_support_vtol(self):
        profile = get_profile(1)
        assert profile["supports_vtol"] is False

    def test_rover_does_not_support_takeoff(self):
        profile = get_profile(10)
        assert profile["supports_takeoff"] is False

    def test_rover_has_no_altitude(self):
        profile = get_profile(10)
        assert profile["has_altitude"] is False

    def test_rover_does_not_have_land_command(self):
        profile = get_profile(10)
        assert "takeoff" not in profile["commands"]
        assert "land" not in profile["commands"]

    def test_boat_does_not_support_takeoff(self):
        profile = get_profile(11)
        assert profile["supports_takeoff"] is False

    def test_sub_has_depth(self):
        profile = get_profile(12)
        assert profile["has_depth"] is True

    def test_sub_has_no_altitude(self):
        profile = get_profile(12)
        assert profile["has_altitude"] is False

    def test_sub_does_not_support_takeoff(self):
        profile = get_profile(12)
        assert profile["supports_takeoff"] is False

    def test_sub_does_not_have_rtl(self):
        profile = get_profile(12)
        assert "rtl" not in profile["commands"]

    def test_vtol_supports_vtol(self):
        profile = get_profile(19)
        assert profile["supports_vtol"] is True

    def test_vtol_has_altitude(self):
        profile = get_profile(19)
        assert profile["has_altitude"] is True

    def test_all_air_profiles_have_arm_disarm(self):
        for mav_type in [1, 2, 19]:
            profile = get_profile(mav_type)
            assert "arm" in profile["commands"], f"MAV_TYPE {mav_type} missing 'arm'"
            assert "disarm" in profile["commands"], f"MAV_TYPE {mav_type} missing 'disarm'"


class TestReverseMapping:
    """Verify the _MAV_TYPE_TO_PROFILE reverse mapping is consistent."""

    def test_all_mav_types_in_profiles_are_in_reverse_map(self):
        for name, profile in VEHICLE_PROFILES.items():
            for mav_type in profile["mav_types"]:
                assert mav_type in _MAV_TYPE_TO_PROFILE, (
                    f"MAV_TYPE {mav_type} from profile '{name}' not in reverse map"
                )

    def test_reverse_map_points_back_to_correct_profile(self):
        for name, profile in VEHICLE_PROFILES.items():
            for mav_type in profile["mav_types"]:
                looked_up = _MAV_TYPE_TO_PROFILE[mav_type]
                assert looked_up["profile_name"] == name, (
                    f"MAV_TYPE {mav_type} maps to '{looked_up['profile_name']}' "
                    f"but expected '{name}'"
                )

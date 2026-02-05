from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import httpx
import asyncio
from functools import lru_cache
import time

# ============================================================================
# PLATFORM PERFORMANCE ENVELOPES
# ============================================================================

@dataclass
class PlatformEnvelope:
    """Defines operational limits for a platform type"""
    name: str
    platform_type: str  # "multirotor", "fixed_wing", "vtol"

    # Wind limits (m/s)
    max_wind_speed: float
    wind_caution_threshold: float  # Yellow warning

    # Temperature limits (°C)
    temp_min: float
    temp_max: float
    temp_caution_min: float
    temp_caution_max: float

    # Precipitation tolerance (mm/h)
    max_precipitation: float  # 0 = no tolerance

    # ISR performance degradation factors
    isr_visibility_min: int  # meters - below this, ISR severely degraded
    isr_cloud_ceiling_min: int  # meters - minimum cloud height for effective ISR

    # Energy penalty coefficients
    wind_energy_factor: float  # % battery loss per m/s headwind
    temp_energy_factor: float  # % battery loss per °C below optimal (20°C)

    # Link budget margins
    rain_link_degradation_db: float  # dB loss per mm/h precipitation


# Predefined platform profiles
PLATFORM_PROFILES = {
    "multirotor_small": PlatformEnvelope(
        name="Small Multirotor (< 5kg)",
        platform_type="multirotor",
        max_wind_speed=12.0,
        wind_caution_threshold=8.0,
        temp_min=-10.0,
        temp_max=45.0,
        temp_caution_min=0.0,
        temp_caution_max=35.0,
        max_precipitation=0.0,  # No rain tolerance
        isr_visibility_min=1000,
        isr_cloud_ceiling_min=50,
        wind_energy_factor=2.5,
        temp_energy_factor=1.2,
        rain_link_degradation_db=2.0,
    ),
    "multirotor_medium": PlatformEnvelope(
        name="Medium Multirotor (5-25kg)",
        platform_type="multirotor",
        max_wind_speed=15.0,
        wind_caution_threshold=10.0,
        temp_min=-15.0,
        temp_max=50.0,
        temp_caution_min=-5.0,
        temp_caution_max=40.0,
        max_precipitation=1.0,
        isr_visibility_min=800,
        isr_cloud_ceiling_min=40,
        wind_energy_factor=2.0,
        temp_energy_factor=1.0,
        rain_link_degradation_db=1.5,
    ),
    "fixed_wing": PlatformEnvelope(
        name="Fixed Wing",
        platform_type="fixed_wing",
        max_wind_speed=20.0,
        wind_caution_threshold=12.0,
        temp_min=-20.0,
        temp_max=55.0,
        temp_caution_min=-10.0,
        temp_caution_max=45.0,
        max_precipitation=2.0,
        isr_visibility_min=1500,
        isr_cloud_ceiling_min=100,
        wind_energy_factor=1.5,
        temp_energy_factor=0.8,
        rain_link_degradation_db=1.0,
    ),
    "vtol": PlatformEnvelope(
        name="VTOL",
        platform_type="vtol",
        max_wind_speed=18.0,
        wind_caution_threshold=11.0,
        temp_min=-15.0,
        temp_max=50.0,
        temp_caution_min=-5.0,
        temp_caution_max=40.0,
        max_precipitation=1.5,
        isr_visibility_min=1200,
        isr_cloud_ceiling_min=80,
        wind_energy_factor=1.8,
        temp_energy_factor=0.9,
        rain_link_degradation_db=1.2,
    ),
}


# ============================================================================
# WEATHER DATA MODELS
# ============================================================================

@dataclass
class WeatherPoint:
    """Weather data at a specific point and time"""
    lat: float
    lon: float
    time: datetime

    # Raw weather data
    temperature: float  # °C
    wind_speed: float  # m/s
    wind_direction: float  # degrees
    wind_gusts: Optional[float]  # m/s
    precipitation: float  # mm/h
    visibility: int  # meters
    cloud_cover: int  # percentage
    cloud_ceiling: Optional[int]  # meters
    pressure: float  # hPa
    humidity: int  # percentage


@dataclass
class MissionImpact:
    """Calculated impact of weather on mission"""
    risk_level: str  # "safe", "caution", "warning", "abort"
    risk_score: float  # 0-100

    # Specific impacts
    stability_margin: float  # % of max wind limit
    energy_penalty: float  # % extra battery consumption
    isr_degradation: float  # % ISR quality loss
    link_margin_db: float  # dB link budget margin

    # Constraint violations
    violations: List[str]
    warnings: List[str]

    # Weather summary
    weather: WeatherPoint


@dataclass
class RouteWeather:
    """Weather analysis along entire route"""
    waypoint_weather: List[MissionImpact]
    route_risk_level: str
    route_risk_score: float
    total_energy_penalty: float
    critical_segments: List[Dict]  # Segments with warnings


# ============================================================================
# WEATHER API CLIENT
# ============================================================================

class WeatherCache:
    """Simple time-based cache for weather data"""
    def __init__(self, ttl_seconds: int = 300):  # 5 min default
        self.cache: Dict = {}
        self.ttl = ttl_seconds

    def get(self, key: str) -> Optional[Dict]:
        if key in self.cache:
            data, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return data
            else:
                del self.cache[key]
        return None

    def set(self, key: str, data: Dict):
        self.cache[key] = (data, time.time())


class OpenMeteoClient:
    """Client for Open-Meteo API"""

    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    def __init__(self, cache: WeatherCache):
        self.cache = cache
        self.client = httpx.AsyncClient(timeout=10.0)

    async def fetch_weather(
        self,
        lat: float,
        lon: float,
        forecast_time: Optional[datetime] = None
    ) -> WeatherPoint:
        """Fetch weather for a specific point and time"""

        # Cache key
        time_str = forecast_time.isoformat() if forecast_time else "now"
        cache_key = f"weather:{lat:.4f}:{lon:.4f}:{time_str}"

        cached = self.cache.get(cache_key)
        if cached:
            return self._parse_weather_point(cached, lat, lon, forecast_time)

        # API parameters - separate current vs forecast requests
        params = {
            "latitude": lat,
            "longitude": lon,
            "wind_speed_unit": "ms",
            "precipitation_unit": "mm",
        }

        if forecast_time:
            # Request hourly forecast data only
            params["hourly"] = "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,visibility,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,relative_humidity_2m"

            # Set date range for forecast
            start = forecast_time.replace(minute=0, second=0, microsecond=0)
            end = start + timedelta(hours=24)  # Request 24 hours to ensure we get the target time
            params["start_date"] = start.date().isoformat()
            params["end_date"] = end.date().isoformat()
        else:
            # Request current weather data only
            params["current"] = "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,weather_code,cloud_cover,pressure_msl,relative_humidity_2m"

        try:
            response = await self.client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # Debug logging
            print(f"[Weather] API request successful for {lat:.4f}, {lon:.4f}")

            self.cache.set(cache_key, data)
            return self._parse_weather_point(data, lat, lon, forecast_time)
        except httpx.HTTPError as e:
            print(f"[Weather] HTTP error: {e}")
            raise ValueError(f"Failed to fetch weather data: {e}")
        except Exception as e:
            print(f"[Weather] Unexpected error: {e}")
            raise

    def _parse_weather_point(
        self,
        data: Dict,
        lat: float,
        lon: float,
        forecast_time: Optional[datetime]
    ) -> WeatherPoint:
        """Parse Open-Meteo response into WeatherPoint"""

        # Check for API error response
        if "error" in data:
            raise ValueError(f"Open-Meteo API error: {data.get('reason', 'Unknown error')}")

        try:
            if forecast_time:
                # Find closest hourly forecast
                hourly = data.get("hourly", {})
                if not hourly:
                    raise ValueError(f"No hourly data in API response. Response keys: {list(data.keys())}")

                times = hourly.get("time", [])
                target_str = forecast_time.replace(minute=0, second=0).isoformat()

                try:
                    idx = times.index(target_str)
                except ValueError:
                    idx = 0

                return WeatherPoint(
                    lat=lat,
                    lon=lon,
                    time=forecast_time,
                    temperature=hourly["temperature_2m"][idx],
                    wind_speed=hourly["wind_speed_10m"][idx],
                    wind_direction=hourly["wind_direction_10m"][idx],
                    wind_gusts=hourly.get("wind_gusts_10m", [None])[idx],
                    precipitation=hourly["precipitation"][idx],
                    visibility=hourly.get("visibility", [10000])[idx],
                    cloud_cover=hourly["cloud_cover"][idx],
                    cloud_ceiling=self._estimate_cloud_ceiling(
                        hourly.get("cloud_cover_low", [0])[idx],
                        hourly.get("cloud_cover_mid", [0])[idx],
                        hourly.get("cloud_cover_high", [0])[idx],
                    ),
                    pressure=hourly["pressure_msl"][idx],
                    humidity=hourly["relative_humidity_2m"][idx],
                )
            else:
                # Use current weather
                current = data.get("current", {})
                if not current:
                    raise ValueError(f"No current data in API response. Response keys: {list(data.keys())}")

                return WeatherPoint(
                    lat=lat,
                    lon=lon,
                    time=datetime.now(),
                    temperature=current["temperature_2m"],
                    wind_speed=current["wind_speed_10m"],
                    wind_direction=current["wind_direction_10m"],
                    wind_gusts=current.get("wind_gusts_10m"),
                    precipitation=current["precipitation"],
                    visibility=10000,  # Not in current API
                    cloud_cover=current["cloud_cover"],
                    cloud_ceiling=None,
                    pressure=current["pressure_msl"],
                    humidity=current["relative_humidity_2m"],
                )
        except KeyError as e:
            # Log the actual response for debugging
            field_name = str(e).strip("'\"")
            print(f"[Weather] KeyError: Missing field '{field_name}' in API response")
            print(f"[Weather] Available keys in response: {list(data.keys())}")
            if "current" in data:
                print(f"[Weather] Current weather keys: {list(data['current'].keys())}")
            if "hourly" in data:
                print(f"[Weather] Hourly forecast keys: {list(data['hourly'].keys())}")
            raise ValueError(f"Missing field '{field_name}' in Open-Meteo API response. Check backend console for details.")

    def _estimate_cloud_ceiling(self, low: int, mid: int, high: int) -> Optional[int]:
        """Estimate cloud ceiling from cloud cover layers"""
        if low > 50:
            return 500  # Low clouds ~500m
        elif mid > 50:
            return 2000  # Mid clouds ~2000m
        elif high > 50:
            return 5000  # High clouds ~5000m
        return None


# ============================================================================
# MISSION IMPACT CALCULATOR
# ============================================================================

class MissionAnalyzer:
    """Analyzes weather impact on missions"""

    def __init__(self, platform: PlatformEnvelope):
        self.platform = platform

    def calculate_impact(self, weather: WeatherPoint) -> MissionImpact:
        """Calculate mission impact from weather data"""

        violations = []
        warnings = []
        risk_factors = []

        # Wind analysis
        stability_margin = ((self.platform.max_wind_speed - weather.wind_speed)
                           / self.platform.max_wind_speed * 100)

        if weather.wind_speed > self.platform.max_wind_speed:
            violations.append(f"Wind speed {weather.wind_speed:.1f} m/s exceeds limit {self.platform.max_wind_speed:.1f} m/s")
            risk_factors.append(100)
        elif weather.wind_speed > self.platform.wind_caution_threshold:
            warnings.append(f"Wind speed {weather.wind_speed:.1f} m/s approaching limit")
            risk_factors.append(60)
        else:
            risk_factors.append(stability_margin / 100 * 30)

        # Temperature analysis
        if weather.temperature < self.platform.temp_min or weather.temperature > self.platform.temp_max:
            violations.append(f"Temperature {weather.temperature:.1f}°C outside limits [{self.platform.temp_min}, {self.platform.temp_max}]")
            risk_factors.append(100)
        elif weather.temperature < self.platform.temp_caution_min or weather.temperature > self.platform.temp_caution_max:
            warnings.append(f"Temperature {weather.temperature:.1f}°C in caution range")
            risk_factors.append(50)
        else:
            risk_factors.append(10)

        # Precipitation analysis
        if weather.precipitation > self.platform.max_precipitation:
            violations.append(f"Precipitation {weather.precipitation:.1f} mm/h exceeds limit {self.platform.max_precipitation:.1f} mm/h")
            risk_factors.append(100)
        elif weather.precipitation > 0:
            warnings.append(f"Precipitation detected: {weather.precipitation:.1f} mm/h")
            risk_factors.append(40)
        else:
            risk_factors.append(0)

        # Calculate derived metrics
        energy_penalty = self._calculate_energy_penalty(weather)
        isr_degradation = self._calculate_isr_degradation(weather)
        link_margin = self._calculate_link_margin(weather)

        # Overall risk score
        risk_score = min(100, max(risk_factors))

        if violations:
            risk_level = "abort"
        elif risk_score >= 60:
            risk_level = "warning"
        elif risk_score >= 30 or warnings:
            risk_level = "caution"
        else:
            risk_level = "safe"

        return MissionImpact(
            risk_level=risk_level,
            risk_score=risk_score,
            stability_margin=stability_margin,
            energy_penalty=energy_penalty,
            isr_degradation=isr_degradation,
            link_margin_db=link_margin,
            violations=violations,
            warnings=warnings,
            weather=weather,
        )

    def _calculate_energy_penalty(self, weather: WeatherPoint) -> float:
        """Calculate extra battery consumption percentage"""
        wind_penalty = weather.wind_speed * self.platform.wind_energy_factor

        temp_penalty = 0.0
        if weather.temperature < 20:
            temp_penalty = (20 - weather.temperature) * self.platform.temp_energy_factor

        return wind_penalty + temp_penalty

    def _calculate_isr_degradation(self, weather: WeatherPoint) -> float:
        """Calculate ISR quality degradation percentage"""
        degradation = 0.0

        # Visibility impact
        if weather.visibility < self.platform.isr_visibility_min:
            degradation += (1 - weather.visibility / self.platform.isr_visibility_min) * 50

        # Cloud cover impact
        degradation += weather.cloud_cover * 0.3

        # Precipitation impact
        if weather.precipitation > 0:
            degradation += min(weather.precipitation * 10, 30)

        return min(100, degradation)

    def _calculate_link_margin(self, weather: WeatherPoint) -> float:
        """Calculate link budget margin in dB (simplified)"""
        # Start with nominal margin
        margin_db = 20.0  # Assume 20dB nominal margin

        # Rain fade
        margin_db -= weather.precipitation * self.platform.rain_link_degradation_db

        # Humidity/fog
        if weather.humidity > 90:
            margin_db -= 2.0

        return margin_db


# ============================================================================
# ROUTE ANALYZER
# ============================================================================

class RouteAnalyzer:
    """Analyzes weather impact along a route"""

    def __init__(
        self,
        platform: PlatformEnvelope,
        weather_client: OpenMeteoClient
    ):
        self.platform = platform
        self.weather_client = weather_client
        self.analyzer = MissionAnalyzer(platform)

    async def analyze_route(
        self,
        waypoints: List[Dict],
        mission_start_time: Optional[datetime] = None,
    ) -> RouteWeather:
        """Analyze weather impact along route"""

        if mission_start_time is None:
            mission_start_time = datetime.now()

        # Estimate time at each waypoint (simplified - assumes 5 m/s cruise)
        cruise_speed = 5.0  # m/s
        waypoint_times = [mission_start_time]

        for i in range(1, len(waypoints)):
            prev_wp = waypoints[i - 1]
            curr_wp = waypoints[i]

            # Haversine distance
            from math import radians, sin, cos, sqrt, atan2
            lat1, lon1 = radians(prev_wp["lat"]), radians(prev_wp["lon"])
            lat2, lon2 = radians(curr_wp["lat"]), radians(curr_wp["lon"])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
            distance = 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a))

            time_to_waypoint = distance / cruise_speed
            waypoint_times.append(waypoint_times[-1] + timedelta(seconds=time_to_waypoint))

        # Fetch weather for each waypoint
        weather_tasks = [
            self.weather_client.fetch_weather(
                wp["lat"],
                wp["lon"],
                waypoint_times[i]
            )
            for i, wp in enumerate(waypoints)
        ]

        weather_points = await asyncio.gather(*weather_tasks)

        # Calculate impact for each waypoint
        waypoint_impacts = [
            self.analyzer.calculate_impact(wp)
            for wp in weather_points
        ]

        # Overall route analysis
        max_risk_score = max(impact.risk_score for impact in waypoint_impacts)
        total_energy_penalty = sum(impact.energy_penalty for impact in waypoint_impacts) / len(waypoint_impacts)

        route_risk_level = "safe"
        if any(impact.risk_level == "abort" for impact in waypoint_impacts):
            route_risk_level = "abort"
        elif any(impact.risk_level == "warning" for impact in waypoint_impacts):
            route_risk_level = "warning"
        elif any(impact.risk_level == "caution" for impact in waypoint_impacts):
            route_risk_level = "caution"

        # Identify critical segments
        critical_segments = []
        for i, impact in enumerate(waypoint_impacts):
            if impact.risk_level in ("warning", "abort") or impact.violations:
                critical_segments.append({
                    "waypoint_index": i,
                    "risk_level": impact.risk_level,
                    "violations": impact.violations,
                    "warnings": impact.warnings,
                })

        return RouteWeather(
            waypoint_weather=waypoint_impacts,
            route_risk_level=route_risk_level,
            route_risk_score=max_risk_score,
            total_energy_penalty=total_energy_penalty,
            critical_segments=critical_segments,
        )


# ============================================================================
# GLOBAL INSTANCES
# ============================================================================

weather_cache = WeatherCache(ttl_seconds=300)
weather_client = OpenMeteoClient(weather_cache)

# Default to medium multirotor
current_platform = PLATFORM_PROFILES["multirotor_medium"]
route_analyzer = RouteAnalyzer(current_platform, weather_client)


def set_platform(platform_id: str):
    """Change active platform"""
    global current_platform, route_analyzer
    if platform_id in PLATFORM_PROFILES:
        current_platform = PLATFORM_PROFILES[platform_id]
        route_analyzer = RouteAnalyzer(current_platform, weather_client)

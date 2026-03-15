"""
Geoparsing layer: resolving place names to coordinates.

Production recommendation: Mordecai 3 (pip install mordecai3)
chains spaCy NER → GeoNames lookup via Elasticsearch → neural
toponym disambiguation.

This module provides a fallback using geopy's Nominatim geocoder
for development/prototyping. For historical names (e.g. "Bombay" → Mumbai),
check GeoNames alternate names or Wikidata P1448 qualifiers.
"""

import logging
from dataclasses import dataclass

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

logger = logging.getLogger(__name__)

HISTORICAL_NAMES: dict[str, str] = {
    "bombay": "Mumbai",
    "madras": "Chennai",
    "calcutta": "Kolkata",
    "poona": "Pune",
    "benares": "Varanasi",
    "cawnpore": "Kanpur",
    "pondicherry": "Puducherry",
    "baroda": "Vadodara",
    "trivandrum": "Thiruvananthapuram",
    "cochin": "Kochi",
    "ceylon": "Sri Lanka",
    "burma": "Myanmar",
    "siam": "Thailand",
    "persia": "Iran",
    "peking": "Beijing",
    "canton": "Guangzhou",
    "saigon": "Ho Chi Minh City",
    "constantinople": "Istanbul",
    "leningrad": "Saint Petersburg",
    "stalingrad": "Volgograd",
    "rhodesia": "Zimbabwe",
    "zaire": "Democratic Republic of the Congo",
    "east pakistan": "Bangladesh",
}


@dataclass
class GeoResult:
    latitude: float
    longitude: float
    display_name: str
    country: str | None = None
    confidence: float = 0.5
    is_historical: bool = False
    modern_name: str | None = None


_geocoder: Nominatim | None = None


def _get_geocoder() -> Nominatim:
    global _geocoder
    if _geocoder is None:
        _geocoder = Nominatim(
            user_agent="akhand-literary-geography/0.1",
            timeout=5,
        )
    return _geocoder


def geocode_place(
    place_name: str,
    timeout: float = 5.0,
) -> GeoResult | None:
    """
    Resolve a place name to coordinates.

    Checks historical name mappings first, then falls back to Nominatim.
    In production, replace with Mordecai 3 or a local GeoNames Elasticsearch
    instance for better disambiguation and speed.
    """
    normalized = place_name.strip().lower()

    is_historical = normalized in HISTORICAL_NAMES
    search_name = HISTORICAL_NAMES.get(normalized, place_name)

    try:
        geocoder = _get_geocoder()
        location = geocoder.geocode(search_name, timeout=timeout, language="en")

        if location is None:
            location = geocoder.geocode(place_name, timeout=timeout, language="en")
            if location is None:
                logger.debug(f"Could not geocode: {place_name}")
                return None

        country = None
        if hasattr(location, "raw") and "display_name" in location.raw:
            parts = location.raw["display_name"].split(", ")
            if parts:
                country = parts[-1]

        return GeoResult(
            latitude=location.latitude,
            longitude=location.longitude,
            display_name=location.address,
            country=country,
            confidence=0.7 if is_historical else 0.8,
            is_historical=is_historical,
            modern_name=search_name if is_historical else None,
        )

    except GeocoderTimedOut:
        logger.warning(f"Geocoding timed out for: {place_name}")
        return None
    except GeocoderServiceError as e:
        logger.error(f"Geocoder service error for {place_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected geocoding error for {place_name}: {e}")
        return None

from pydantic import BaseModel, Field
from enum import Enum


class PlaceType(str, Enum):
    real = "real"
    fictional_based_on_real = "fictional_based_on_real"
    purely_fictional = "purely_fictional"


class SettingType(str, Enum):
    primary = "primary"
    secondary = "secondary"
    mentioned = "mentioned"


class SentimentData(BaseModel):
    polarity: float = Field(ge=-1.0, le=1.0)
    dominant_emotions: list[str] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)


class ExtractedEntity(BaseModel):
    text: str
    label: str
    start_char: int
    end_char: int
    confidence: float = 1.0


class GeocodedPlace(BaseModel):
    name: str
    latitude: float
    longitude: float
    geonames_id: str | None = None
    wikidata_id: str | None = None
    country: str | None = None
    admin1: str | None = None
    feature_class: str | None = None
    confidence: float = 0.0
    is_historical_name: bool = False
    modern_name: str | None = None


class LiteraryPlaceCreate(BaseModel):
    book_title: str
    author: str
    publish_year: int
    place_name: str
    coordinates: tuple[float, float]
    place_type: PlaceType = PlaceType.real
    real_anchor: str | None = None
    setting_type: SettingType = SettingType.primary
    narrative_era: str | None = None
    passage: str
    sentiment: SentimentData
    language: str = "English"
    genres: list[str] = Field(default_factory=list)
    region: str | None = None
    wikidata_book_id: str | None = None
    wikidata_place_id: str | None = None


class LiteraryPlaceResponse(LiteraryPlaceCreate):
    id: str

    class Config:
        from_attributes = True


class ExtractionRequest(BaseModel):
    text: str
    title: str | None = None
    author: str | None = None
    language: str = "en"


class ExtractionResult(BaseModel):
    entities: list[ExtractedEntity]
    geocoded_places: list[GeocodedPlace]
    literary_places: list[LiteraryPlaceCreate]
    processing_time_ms: float


class PassageAnalysis(BaseModel):
    passage: str
    place_name: str
    sentiment: SentimentData
    setting_type: SettingType
    narrative_era: str | None = None
    themes: list[str] = Field(default_factory=list)


class BatchExtractionRequest(BaseModel):
    texts: list[ExtractionRequest]
    use_llm_fallback: bool = False


class HealthResponse(BaseModel):
    status: str = "healthy"
    spacy_model: str | None = None
    version: str = "0.1.0"

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gov IT Prep Portal API"
    environment: str = "development"
    mongodb_uri: str
    mongodb_db_name: str = "gov_it_prep"
    cors_origins: str = "http://localhost:5173"

    # Authentication
    jwt_secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    # PDF source materials
    max_upload_mb: int = Field(default=20, ge=1, le=100)
    max_pdf_pages: int = Field(default=300, ge=1, le=2000)

    # AI provider. Question generation stays disabled until the key and model are set.
    ai_provider: str = "gemini"  # gemini | openai | openai_compatible
    ai_api_key: str = ""
    ai_model: str = ""
    ai_base_url: str = ""  # only needed for openai_compatible (or to override the default address)
    ai_timeout_seconds: int = Field(default=90, ge=10, le=600)
    ai_max_requests_per_minute: int = Field(default=10, ge=1, le=600)
    ai_max_requests_per_day: int = Field(default=200, ge=1, le=100000)

    # Previous-year PDFs: queue them for question extraction automatically after upload
    pyq_auto_extract: bool = True

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
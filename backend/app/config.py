from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR.parent / ".env", BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Draftsmith API"
    environment: str = "development"

    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-haiku-5-5"

    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b,openai/gpt-oss-20b"

    provider_order: str = "openai,anthropic,groq"
    llm_timeout: float = 45.0
    llm_temperature: float = 0.4

    tavily_api_key: str | None = None

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str | None = r"https://[a-z0-9-]+\.vercel\.app|http://(localhost|127\.0\.0\.1)(:\d+)?"

    max_parallel_sections: int = 4
    max_concurrent_generations: int = 1
    generation_wait_budget: float = 120.0

    rate_limit_generate: int = 10
    rate_limit_requests: int = 120
    rate_limit_window: int = 600

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def provider_sequence(self) -> list[str]:
        return [p.strip().lower() for p in self.provider_order.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

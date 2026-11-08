import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Base directory for backend
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    APP_NAME: str = "AskMate"
    API_PREFIX: str = "/api"
    GEMINI_API_KEY: str = ""
    CHROMA_PERSIST_DIR: str = str(BASE_DIR / "data" / "chroma")
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'askmate.db'}"
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    DEFAULT_GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    MAX_FILE_SIZE_MB: int = 25
    ALLOWED_EXTENSIONS: list[str] = [".pdf"]

    model_config = {
        "env_file": str(BASE_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

settings = Settings()

# Ensure data directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
os.makedirs(Path(settings.DATABASE_URL.replace("sqlite:///", "")).parent, exist_ok=True)

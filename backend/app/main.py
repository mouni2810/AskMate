import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine
import app.models
from app.routes.health import router as health_router
from app.routes.documents import router as documents_router
from app.routes.chat import router as chat_router
from app.routes.summary import router as summary_router
from app.routes.voice import router as voice_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("askmate")

# Ensure tables are created immediately
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info(f"AskMate backend started. Data dir: {settings.UPLOAD_DIR}")
    yield
    # Shutdown
    logger.info("AskMate backend shutting down...")

app = FastAPI(
    title=settings.APP_NAME,
    description="AskMate AI Knowledge Assistant API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for Angular frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(documents_router, prefix=settings.API_PREFIX)
app.include_router(chat_router, prefix=settings.API_PREFIX)
app.include_router(summary_router, prefix=settings.API_PREFIX)
app.include_router(voice_router, prefix=settings.API_PREFIX)

@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "online",
        "docs": "/docs",
        "health": f"{settings.API_PREFIX}/health"
    }

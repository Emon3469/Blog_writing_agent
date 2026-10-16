from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .llm import is_configured, provider_status, providers
from .routers.writing import router as writing_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()
STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI):
    names = [p.name for p in providers()]
    logging.getLogger("draftsmith").info("providers ready: %s", ", ".join(names) or "none")
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    return JSONResponse(status_code=422, content={"detail": f"{field}: {first.get('msg', 'invalid value')}"})


@app.get("/")
async def root():
    return {"name": settings.app_name, "status": "ok", "docs": "/docs"}


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    status = provider_status()
    return {
        "status": "ok" if status else "degraded",
        "uptime_seconds": int(time.time() - STARTED_AT),
        "providers": status,
        "research": is_configured(settings.tavily_api_key),
    }


app.include_router(writing_router)

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import close_db_connection, connect_to_db
from app.routers.scan import router as scan_router
from app.utils.exceptions import RateLimitError, ScanError, build_error_payload

logger = logging.getLogger(__name__)
SCAN_TIMEOUT_SECONDS = 60
SCAN_RATE_LIMIT_WINDOW_SECONDS = 60
SCAN_RATE_LIMIT_MAX_REQUESTS = 10

app = FastAPI(
    title="ShadowAudit Backend",
    version="1.0.0",
)
app.state.scan_timeout_seconds = SCAN_TIMEOUT_SECONDS
app.state.scan_rate_limit_window_seconds = SCAN_RATE_LIMIT_WINDOW_SECONDS
app.state.scan_rate_limit_max_requests = SCAN_RATE_LIMIT_MAX_REQUESTS
app.state.scan_rate_limit_store = defaultdict(deque)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def build_api_router(prefix: str) -> APIRouter:
    router = APIRouter(prefix=prefix)

    @router.get("")
    async def api_root() -> dict[str, str]:
        return {"message": "ShadowAudit API v1"}

    router.include_router(scan_router)
    return router


@app.on_event("startup")
async def startup_event() -> None:
    try:
        app.state.supabase = connect_to_db()
        app.state.db_connected = True
    except Exception as exc:
        logger.exception("Failed to initialize Supabase client on startup: %s", exc)
        app.state.supabase = None
        app.state.db_connected = False
    reset_scan_rate_limit_store()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    close_db_connection()
    app.state.supabase = None
    app.state.db_connected = False
    reset_scan_rate_limit_store()


@app.get("/health")
async def health_check() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "shadowaudit-backend",
        "database_connected": getattr(app.state, "db_connected", False),
    }


app.include_router(build_api_router("/api/v1"))
app.include_router(build_api_router("/v1"))


@app.middleware("http")
async def scan_guard_middleware(request: Request, call_next):
    if request.method == "POST" and request.url.path in {"/api/v1/scan", "/v1/scan"}:
        try:
            enforce_scan_rate_limit(request)
            timeout_seconds = float(
                getattr(request.app.state, "scan_timeout_seconds", SCAN_TIMEOUT_SECONDS)
            )
            return await asyncio.wait_for(call_next(request), timeout=timeout_seconds)
        except RateLimitError as exc:
            return JSONResponse(status_code=exc.status_code, content=exc.to_payload())
        except asyncio.TimeoutError:
            logger.warning("Scan request from %s exceeded timeout.", get_client_ip(request))
            return JSONResponse(
                status_code=504,
                content=build_error_payload(
                    "timeout_error",
                    "The scan exceeded the 60 second time limit.",
                    {"timeout_seconds": timeout_seconds},
                ),
            )

    return await call_next(request)


@app.exception_handler(ScanError)
async def scan_error_handler(_request: Request, exc: ScanError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


@app.exception_handler(RequestValidationError)
async def request_validation_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=build_error_payload(
            "validation_error",
            "The request payload is invalid.",
            {"errors": exc.errors()},
        ),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_payload(
            "http_error",
            str(exc.detail),
            {},
        ),
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content=build_error_payload(
            "internal_error",
            "ShadowAudit encountered an unexpected server error.",
            {},
        ),
    )


def reset_scan_rate_limit_store() -> None:
    app.state.scan_rate_limit_store = defaultdict(deque)


def enforce_scan_rate_limit(request: Request) -> None:
    ip_address = get_client_ip(request)
    rate_limit_store: dict[str, Deque[float]] = getattr(
        request.app.state,
        "scan_rate_limit_store",
        defaultdict(deque),
    )
    window_seconds = int(
        getattr(
            request.app.state,
            "scan_rate_limit_window_seconds",
            SCAN_RATE_LIMIT_WINDOW_SECONDS,
        )
    )
    max_requests = int(
        getattr(
            request.app.state,
            "scan_rate_limit_max_requests",
            SCAN_RATE_LIMIT_MAX_REQUESTS,
        )
    )
    now = time.monotonic()
    request_timestamps = rate_limit_store.setdefault(ip_address, deque())

    while request_timestamps and now - request_timestamps[0] >= window_seconds:
        request_timestamps.popleft()

    if len(request_timestamps) >= max_requests:
        raise RateLimitError(
            "You have reached the scan limit of 10 requests per minute.",
            {
                "ip": ip_address,
                "limit": max_requests,
                "window_seconds": window_seconds,
            },
        )

    request_timestamps.append(now)
    request.app.state.scan_rate_limit_store = rate_limit_store


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    if request.client and request.client.host:
        return request.client.host

    return "unknown"

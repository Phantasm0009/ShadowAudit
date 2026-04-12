from __future__ import annotations

import asyncio
import json
import time

from httpx import ASGITransport, AsyncClient


def _set_backend_env(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/query")

    from app.config import get_settings

    get_settings.cache_clear()


def _stub_fast_scan_pipeline(monkeypatch, scan_module) -> None:
    monkeypatch.setattr(
        scan_module,
        "resolve_dependency_tree",
        lambda packages: {
            package.name: {
                "name": package.name,
                "version": package.version,
                "metadata": {"last_publish_date": "2026-04-01T00:00:00Z"},
                "dependencies": {},
            }
            for package in packages
        },
    )
    monkeypatch.setattr(scan_module, "scan_all_packages", lambda packages: [])
    monkeypatch.setattr(scan_module, "check_all_maintainers", lambda packages: [])
    monkeypatch.setattr(scan_module, "detect_all_typosquats", lambda packages: [])
    monkeypatch.setattr(scan_module, "analyze_all_packages", lambda *args, **kwargs: [])
    monkeypatch.setattr(scan_module, "calculate_vuln_risk_score", lambda vulns: 0.0)
    monkeypatch.setattr(scan_module, "insert_scan", lambda **kwargs: {"id": "fake-scan"})


async def _send_request(main_module, method: str, url: str, **kwargs):
    await main_module.startup_event()
    main_module.app.state.scan_timeout_seconds = 60
    main_module.app.state.scan_rate_limit_max_requests = 10
    main_module.app.state.scan_rate_limit_window_seconds = 60
    transport = ASGITransport(app=main_module.app)

    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, url, **kwargs)
    finally:
        await main_module.shutdown_event()


def test_custom_exception_handlers_return_structured_json(monkeypatch):
    _set_backend_env(monkeypatch)

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)

    payload = {
        "file_content": '{"dependencies":{"next":"^15.1.0"}',
        "file_type": "package.json",
    }

    response = asyncio.run(
        _send_request(main_module, "POST", "/api/v1/scan", json=payload),
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "parsing_error",
        "message": "Invalid package.json content.",
        "details": {"file_type": "package.json"},
    }


def test_rate_limiting_returns_429_on_eleventh_request(monkeypatch):
    _set_backend_env(monkeypatch)

    import app.main as main_module
    import app.routers.scan as scan_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    _stub_fast_scan_pipeline(monkeypatch, scan_module)

    payload = {
        "file_content": json.dumps({"dependencies": {"lodash": "4.17.20"}}),
        "file_type": "package.json",
    }

    async def exercise_rate_limit():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)
        main_module.app.state.scan_timeout_seconds = 60
        main_module.app.state.scan_rate_limit_max_requests = 10
        main_module.app.state.scan_rate_limit_window_seconds = 60

        try:
            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                responses = []
                for _ in range(11):
                    responses.append(
                        await client.post(
                            "/api/v1/scan",
                            json=payload,
                            headers={"x-forwarded-for": "203.0.113.10"},
                        )
                    )
                return responses
        finally:
            await main_module.shutdown_event()

    responses = asyncio.run(exercise_rate_limit())

    assert all(response.status_code == 200 for response in responses[:10])
    assert responses[10].status_code == 429
    assert responses[10].json()["error"] == "rate_limit_error"


def test_timeout_middleware_returns_504(monkeypatch):
    _set_backend_env(monkeypatch)

    import app.main as main_module
    import app.routers.scan as scan_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    monkeypatch.setattr(scan_module, "scan_all_packages", lambda packages: [])
    monkeypatch.setattr(scan_module, "check_all_maintainers", lambda packages: [])
    monkeypatch.setattr(scan_module, "detect_all_typosquats", lambda packages: [])
    monkeypatch.setattr(scan_module, "analyze_all_packages", lambda *args, **kwargs: [])
    monkeypatch.setattr(scan_module, "calculate_vuln_risk_score", lambda vulns: 0.0)
    monkeypatch.setattr(scan_module, "insert_scan", lambda **kwargs: {"id": "fake-scan"})

    def slow_tree(packages):
        time.sleep(0.05)
        return {}

    monkeypatch.setattr(scan_module, "resolve_dependency_tree", slow_tree)

    payload = {
        "file_content": json.dumps({"dependencies": {"lodash": "4.17.20"}}),
        "file_type": "package.json",
    }

    async def exercise_timeout():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)
        main_module.app.state.scan_timeout_seconds = 0.01

        try:
            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.post("/api/v1/scan", json=payload)
        finally:
            await main_module.shutdown_event()

    response = asyncio.run(exercise_timeout())

    assert response.status_code == 504
    assert response.json()["error"] == "timeout_error"


def test_openai_failure_gracefully_skips_behavior_analysis(monkeypatch):
    _set_backend_env(monkeypatch)

    import app.main as main_module
    import app.routers.scan as scan_module
    from app.utils.exceptions import ExternalAPIError

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    _stub_fast_scan_pipeline(monkeypatch, scan_module)
    monkeypatch.setattr(
        scan_module,
        "analyze_all_packages",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            ExternalAPIError("OpenAI behavior analysis is unavailable.")
        ),
    )

    payload = {
        "file_content": json.dumps({"dependencies": {"lodash": "4.17.20"}}),
        "file_type": "package.json",
    }

    response = asyncio.run(
        _send_request(main_module, "POST", "/api/v1/scan", json=payload),
    )

    assert response.status_code == 200
    assert response.json()["behavior_analyses"] == []


def test_manifest_with_more_than_500_packages_returns_400(monkeypatch):
    _set_backend_env(monkeypatch)

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)

    dependencies = {f"pkg-{index}": "1.0.0" for index in range(501)}
    payload = {
        "file_content": json.dumps({"dependencies": dependencies}),
        "file_type": "package.json",
    }

    response = asyncio.run(
        _send_request(main_module, "POST", "/api/v1/scan", json=payload),
    )

    assert response.status_code == 400
    assert response.json()["error"] == "scan_error"
    assert response.json()["details"]["package_count"] == 501

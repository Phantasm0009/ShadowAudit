import asyncio
import json

from httpx import ASGITransport, AsyncClient


def test_post_scan_with_valid_package_json_returns_packages(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module
    import app.routers.scan as scan_module
    from app.models.schemas import MaintainerRisk, VulnerabilityResult

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    monkeypatch.setattr(
        scan_module,
        "resolve_dependency_tree",
        lambda packages: {"next": {"name": "next", "dependencies": {}}},
    )
    monkeypatch.setattr(
        scan_module,
        "scan_all_packages",
        lambda packages: [
            VulnerabilityResult(
                package_name="next",
                cve_id="CVE-2026-0001",
                severity="HIGH",
                summary="Example vulnerability",
                affected_versions=["introduced:15.0.0 -> fixed:15.1.2"],
            )
        ],
    )
    monkeypatch.setattr(
        scan_module,
        "check_all_maintainers",
        lambda packages: [
            MaintainerRisk(
                package_name="next",
                risk_level="medium",
                reason="Maintainer ownership appears to have changed 45 days ago and should be reviewed.",
                last_owner_change="2026-02-24T00:00:00Z",
            )
        ],
    )
    monkeypatch.setattr(scan_module, "analyze_all_packages", lambda *args, **kwargs: [])
    monkeypatch.setattr(scan_module, "calculate_vuln_risk_score", lambda vulns: 2.0)
    monkeypatch.setattr(scan_module, "insert_scan", lambda **kwargs: {"id": "fake-scan"})

    payload = {
        "file_content": json.dumps(
            {
                "dependencies": {"next": "^15.1.0", "react": "^19.0.0"},
                "devDependencies": {"typescript": "~5.6.3"},
            }
        ),
        "file_type": "package.json",
        "project_name": "shadowaudit-frontend",
    }

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post("/api/v1/scan", json=payload)

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())
    data = response.json()

    assert response.status_code == 200
    assert [package["name"] for package in data["packages"]] == ["next", "react", "typescript"]
    assert data["vulnerabilities"][0]["cve_id"] == "CVE-2026-0001"
    assert data["maintainer_risks"][0]["package_name"] == "next"
    assert data["overall_risk_score"] == 2.0
    assert data["dependency_graph"]["next"]["name"] == "next"


def test_post_scan_with_invalid_file_type_returns_422(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)

    payload = {
        "file_content": "{}",
        "file_type": "poetry.lock",
    }

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post("/api/v1/scan", json=payload)

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())

    assert response.status_code == 422


def test_post_scan_with_empty_content_returns_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)

    payload = {
        "file_content": "",
        "file_type": "requirements.txt",
    }

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post("/api/v1/scan", json=payload)

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"] == "validation_error"
    assert "file_content" in response.text


def test_post_scan_with_trimmed_api_prefix_returns_packages(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module
    import app.routers.scan as scan_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    monkeypatch.setattr(scan_module, "resolve_dependency_tree", lambda packages: {})
    monkeypatch.setattr(scan_module, "scan_all_packages", lambda packages: [])
    monkeypatch.setattr(scan_module, "check_all_maintainers", lambda packages: [])
    monkeypatch.setattr(scan_module, "detect_all_typosquats", lambda packages: [])
    monkeypatch.setattr(scan_module, "analyze_all_packages", lambda *args, **kwargs: [])
    monkeypatch.setattr(scan_module, "calculate_vuln_risk_score", lambda vulns: 0.0)
    monkeypatch.setattr(scan_module, "insert_scan", lambda **kwargs: {"id": "fake-scan"})

    payload = {
        "file_content": json.dumps({"dependencies": {"lodash": "4.17.20"}}),
        "file_type": "package.json",
        "project_name": "shadowaudit-demo",
    }

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post("/v1/scan", json=payload)

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())

    assert response.status_code == 200
    assert response.json()["project_name"] == "shadowaudit-demo"

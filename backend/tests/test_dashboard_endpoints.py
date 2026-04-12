import asyncio

from httpx import ASGITransport, AsyncClient


def test_get_scans_returns_recent_scan_summaries(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/query")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module
    import app.routers.scan as scan_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    monkeypatch.setattr(
        scan_module,
        "get_recent_scan_summaries",
        lambda limit=50: [
            {
                "scan_id": "00000000-0000-0000-0000-000000000001",
                "project_name": "alpha",
                "overall_risk_score": 8.1,
                "package_count": 4,
                "vulnerability_count": 2,
                "created_at": "2026-04-10T14:00:00Z",
            },
            {
                "scan_id": "00000000-0000-0000-0000-000000000002",
                "project_name": "beta",
                "overall_risk_score": 5.6,
                "package_count": 3,
                "vulnerability_count": 1,
                "created_at": "2026-04-09T14:00:00Z",
            },
            {
                "scan_id": "00000000-0000-0000-0000-000000000003",
                "project_name": "gamma",
                "overall_risk_score": 2.4,
                "package_count": 8,
                "vulnerability_count": 0,
                "created_at": "2026-04-08T14:00:00Z",
            },
        ],
    )

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/api/v1/scans")

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())
    payload = response.json()

    assert response.status_code == 200
    assert len(payload) == 3
    assert payload[0]["project_name"] == "alpha"
    assert payload[0]["package_count"] == 4
    assert payload[0]["vulnerability_count"] == 2
    assert payload[0]["scan_id"] == "00000000-0000-0000-0000-000000000001"


def test_get_stats_returns_required_dashboard_fields(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/query")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module
    import app.routers.scan as scan_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)
    monkeypatch.setattr(
        scan_module,
        "get_dashboard_stats",
        lambda: {
            "total_scans": 3,
            "avg_risk_score": 5.37,
            "critical_findings_count": 4,
            "packages_analyzed": 15,
            "most_common_vulns": [
                {"cve_id": "CVE-2026-0001", "count": 2},
                {"cve_id": "CVE-2026-0002", "count": 1},
            ],
            "most_risky_packages": [
                {"package_name": "axios", "scan_count": 2, "avg_risk_score": 8.15},
                {"package_name": "lodash", "scan_count": 2, "avg_risk_score": 7.4},
            ],
        },
    )

    async def send_request():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/api/v1/stats")

        await main_module.shutdown_event()
        return response

    response = asyncio.run(send_request())
    payload = response.json()

    assert response.status_code == 200
    assert payload["total_scans"] == 3
    assert payload["avg_risk_score"] == 5.37
    assert payload["critical_findings_count"] == 4
    assert payload["packages_analyzed"] == 15
    assert payload["most_common_vulns"][0]["cve_id"] == "CVE-2026-0001"
    assert payload["most_risky_packages"][0]["package_name"] == "axios"

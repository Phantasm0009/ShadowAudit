import asyncio

from httpx import ASGITransport, AsyncClient


def test_health_endpoint_returns_200(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    from app.config import get_settings

    get_settings.cache_clear()

    import app.main as main_module

    monkeypatch.setattr(main_module, "connect_to_db", lambda: object())
    monkeypatch.setattr(main_module, "close_db_connection", lambda: None)

    async def exercise_health_endpoint():
        await main_module.startup_event()
        transport = ASGITransport(app=main_module.app)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/health")

        await main_module.shutdown_event()
        return response

    response = asyncio.run(exercise_health_endpoint())

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from app.models.schemas import (
    BehaviorAnalysis,
    MaintainerRisk,
    PackageInfo,
    ScanResult,
    TyposquatResult,
    VulnerabilityResult,
)


def _build_scan_result() -> ScanResult:
    return ScanResult(
        scan_id=uuid4(),
        project_name="shadowaudit-api",
        timestamp="2026-04-10T13:00:00Z",
        packages=[PackageInfo(name="fastapi", version="0.104.1", ecosystem="pypi")],
        vulnerabilities=[
            VulnerabilityResult(
                package_name="requests",
                cve_id="CVE-2025-11111",
                severity="medium",
                summary="Example advisory",
                affected_versions=["<2.32.0"],
            )
        ],
        maintainer_risks=[
            MaintainerRisk(
                package_name="left-pad",
                risk_level="low",
                reason="Stable ownership history",
                last_owner_change="2025-12-12T08:00:00Z",
            )
        ],
        typosquat_results=[
            TyposquatResult(
                package_name="reqeusts",
                similar_to="requests",
                similarity_score=0.91,
                is_suspicious=True,
            )
        ],
        behavior_analyses=[
            BehaviorAnalysis(
                package_name="mystery-package",
                risk_score=34.0,
                flags=["network_access"],
                ai_summary="Shows limited suspicious behavior.",
            )
        ],
        overall_risk_score=45.3,
        dependency_graph={"fastapi": ["starlette"]},
    )


def test_supabase_connection_can_be_established_with_singleton(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OSV_API_URL", "https://api.osv.dev/v1/querybatch")

    import app.config as config_module
    import app.db as db_module

    config_module.get_settings.cache_clear()
    db_module.close_db_connection()

    sentinel_client = object()
    create_client_mock = MagicMock(return_value=sentinel_client)
    monkeypatch.setattr(db_module, "create_client", create_client_mock)

    client_one = db_module.connect_to_db()
    client_two = db_module.get_supabase_client()

    assert client_one is sentinel_client
    assert client_two is sentinel_client
    create_client_mock.assert_called_once_with(
        "https://example.supabase.co",
        "test-supabase-key",
    )


def test_insert_and_read_helpers_use_expected_supabase_tables(monkeypatch):
    import app.db as db_module

    scan_result = _build_scan_result()
    scan_id = str(scan_result.scan_id)

    table_mocks = {name: MagicMock(name=name) for name in [
        "scans",
        "scan_packages",
        "vulnerabilities",
        "maintainer_risks",
        "typosquat_results",
        "behavior_analyses",
    ]}
    mock_client = MagicMock()
    mock_client.table.side_effect = lambda name: table_mocks[name]

    table_mocks["scans"].insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": scan_id}]
    )
    table_mocks["scan_packages"].insert.return_value.execute.return_value = SimpleNamespace(data=[])
    table_mocks["vulnerabilities"].insert.return_value.execute.return_value = SimpleNamespace(data=[])
    table_mocks["maintainer_risks"].insert.return_value.execute.return_value = SimpleNamespace(data=[])
    table_mocks["typosquat_results"].insert.return_value.execute.return_value = SimpleNamespace(data=[])
    table_mocks["behavior_analyses"].insert.return_value.execute.return_value = SimpleNamespace(data=[])

    table_mocks["scans"].select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        SimpleNamespace(
            data={
                "id": scan_id,
                "project_name": "shadowaudit-api",
                "file_type": "requirements.txt",
                "file_content": "fastapi==0.104.1",
                "created_at": "2026-04-10T13:00:00Z",
                "overall_risk_score": 45.3,
                "dependency_graph": {"fastapi": ["starlette"]},
            }
        )
    )
    table_mocks["scan_packages"].select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"name": "fastapi", "version": "0.104.1", "ecosystem": "pypi"}])
    )
    table_mocks["vulnerabilities"].select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"package_name": "requests", "cve_id": "CVE-2025-11111"}])
    )
    table_mocks["maintainer_risks"].select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"package_name": "left-pad", "risk_level": "low"}])
    )
    table_mocks["typosquat_results"].select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"package_name": "reqeusts", "similar_to": "requests"}])
    )
    table_mocks["behavior_analyses"].select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"package_name": "mystery-package", "risk_score": 34.0}])
    )
    table_mocks["scans"].select.return_value.order.return_value.limit.return_value.execute.return_value = (
        SimpleNamespace(data=[{"id": scan_id, "project_name": "shadowaudit-api"}])
    )

    monkeypatch.setattr(db_module, "get_supabase_client", lambda force_refresh=False: mock_client)

    inserted = db_module.insert_scan(
        scan_result=scan_result,
        file_type="requirements.txt",
        file_content="fastapi==0.104.1",
    )
    fetched = db_module.get_scan_by_id(scan_result.scan_id)
    recent = db_module.get_recent_scans(limit=5)

    assert inserted == {"id": scan_id}
    assert fetched is not None
    assert fetched["scan_id"] == scan_id
    assert fetched["packages"][0]["name"] == "fastapi"
    assert recent == [{"id": scan_id, "project_name": "shadowaudit-api"}]
    table_mocks["scans"].insert.assert_called_once()
    table_mocks["scan_packages"].insert.assert_called_once()
    table_mocks["vulnerabilities"].insert.assert_called_once()


def test_dashboard_helpers_aggregate_recent_scan_summaries_and_stats(monkeypatch):
    import app.db as db_module

    table_mocks = {
        name: MagicMock(name=name)
        for name in [
            "scans",
            "scan_packages",
            "vulnerabilities",
            "maintainer_risks",
            "typosquat_results",
            "behavior_analyses",
        ]
    }
    mock_client = MagicMock()
    mock_client.table.side_effect = lambda name: table_mocks[name]

    scan_rows = [
        {
            "id": "00000000-0000-0000-0000-000000000003",
            "project_name": "third-project",
            "overall_risk_score": 8.2,
            "created_at": "2026-04-10T15:00:00Z",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "project_name": "second-project",
            "overall_risk_score": 6.1,
            "created_at": "2026-04-09T15:00:00Z",
        },
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "project_name": "first-project",
            "overall_risk_score": 3.5,
            "created_at": "2026-04-08T15:00:00Z",
        },
    ]

    table_mocks["scans"].select.return_value.order.return_value.limit.return_value.execute.return_value = (
        SimpleNamespace(data=scan_rows)
    )
    table_mocks["scans"].select.return_value.execute.return_value = SimpleNamespace(data=scan_rows)

    package_summary_by_scan = {
        "00000000-0000-0000-0000-000000000003": [{"name": "axios"}, {"name": "lodash"}, {"name": "react"}],
        "00000000-0000-0000-0000-000000000002": [{"name": "axios"}, {"name": "requests"}],
        "00000000-0000-0000-0000-000000000001": [{"name": "lodash"}],
    }
    vulnerability_summary_by_scan = {
        "00000000-0000-0000-0000-000000000003": [{"cve_id": "CVE-2026-0002"}, {"cve_id": "CVE-2026-0003"}],
        "00000000-0000-0000-0000-000000000002": [{"cve_id": "CVE-2026-0001"}],
        "00000000-0000-0000-0000-000000000001": [],
    }

    table_mocks["scan_packages"].select.return_value.eq.side_effect = (
        lambda _column, scan_id: MagicMock(
            execute=MagicMock(return_value=SimpleNamespace(data=package_summary_by_scan[scan_id]))
        )
    )
    table_mocks["vulnerabilities"].select.return_value.eq.side_effect = (
        lambda _column, scan_id: MagicMock(
            execute=MagicMock(return_value=SimpleNamespace(data=vulnerability_summary_by_scan[scan_id]))
        )
    )

    table_mocks["scan_packages"].select.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"scan_id": "00000000-0000-0000-0000-000000000003", "name": "axios"},
            {"scan_id": "00000000-0000-0000-0000-000000000003", "name": "lodash"},
            {"scan_id": "00000000-0000-0000-0000-000000000003", "name": "react"},
            {"scan_id": "00000000-0000-0000-0000-000000000002", "name": "axios"},
            {"scan_id": "00000000-0000-0000-0000-000000000002", "name": "requests"},
            {"scan_id": "00000000-0000-0000-0000-000000000001", "name": "lodash"},
        ]
    )
    table_mocks["vulnerabilities"].select.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"scan_id": "00000000-0000-0000-0000-000000000003", "package_name": "axios", "cve_id": "CVE-2026-0002", "severity": "CRITICAL"},
            {"scan_id": "00000000-0000-0000-0000-000000000003", "package_name": "lodash", "cve_id": "CVE-2026-0003", "severity": "HIGH"},
            {"scan_id": "00000000-0000-0000-0000-000000000002", "package_name": "requests", "cve_id": "CVE-2026-0001", "severity": "MEDIUM"},
            {"scan_id": "00000000-0000-0000-0000-000000000001", "package_name": "lodash", "cve_id": "CVE-2026-0001", "severity": "LOW"},
        ]
    )
    table_mocks["maintainer_risks"].select.return_value.execute.return_value = SimpleNamespace(
        data=[{"scan_id": "00000000-0000-0000-0000-000000000002", "risk_level": "critical"}]
    )
    table_mocks["typosquat_results"].select.return_value.execute.return_value = SimpleNamespace(
        data=[{"scan_id": "00000000-0000-0000-0000-000000000003", "is_suspicious": True}]
    )
    table_mocks["behavior_analyses"].select.return_value.execute.return_value = SimpleNamespace(
        data=[{"scan_id": "00000000-0000-0000-0000-000000000003", "risk_score": 9.4}]
    )

    monkeypatch.setattr(db_module, "get_supabase_client", lambda force_refresh=False: mock_client)

    summaries = db_module.get_recent_scan_summaries(limit=50)
    stats = db_module.get_dashboard_stats()

    assert len(summaries) == 3
    assert summaries[0]["scan_id"] == "00000000-0000-0000-0000-000000000003"
    assert summaries[0]["package_count"] == 3
    assert summaries[0]["vulnerability_count"] == 2

    assert stats["total_scans"] == 3
    assert stats["avg_risk_score"] == 5.93
    assert stats["critical_findings_count"] == 4
    assert stats["packages_analyzed"] == 6
    assert stats["most_common_vulns"][0] == {"cve_id": "CVE-2026-0001", "count": 2}
    assert stats["most_risky_packages"][0]["package_name"] == "axios"

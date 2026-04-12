from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.schemas import Ecosystem, PackageInfo, RiskLevel
from app.services import maintainer_checker as checker


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")


def test_check_npm_maintainer_with_stable_package_returns_low():
    async def fake_fetch_json(client, url):
        if "downloads" in url:
            return 200, {"downloads": 2500000}

        return (
            200,
            {
                "dist-tags": {"latest": "5.2.1"},
                "time": {
                    "5.0.0": _iso(400),
                    "5.1.0": _iso(200),
                    "5.2.1": _iso(30),
                },
                "versions": {
                    "5.0.0": {"maintainers": [{"name": "express-team", "email": "team@example.com"}]},
                    "5.1.0": {"maintainers": [{"name": "express-team", "email": "team@example.com"}]},
                    "5.2.1": {"maintainers": [{"name": "express-team", "email": "team@example.com"}]},
                },
            },
        )

    checker_fetch = checker._fetch_json
    try:
        checker._fetch_json = fake_fetch_json
        result = checker.check_npm_maintainer("express")
    finally:
        checker._fetch_json = checker_fetch

    assert result.package_name == "express"
    assert result.risk_level == RiskLevel.LOW


def test_npm_risk_assignment_logic_high_and_critical_and_low(monkeypatch):
    async def fake_fetch_json(client, url):
        if "high-risk-package" in url and "downloads" not in url:
            return (
                200,
                {
                    "dist-tags": {"latest": "2.1.0"},
                    "time": {
                        "1.0.0": _iso(365),
                        "1.5.0": _iso(120),
                        "2.0.0": _iso(30),
                        "2.1.0": _iso(20),
                    },
                    "versions": {
                        "1.0.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                        "1.5.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                        "2.0.0": {"maintainers": [{"name": "bob", "email": "bob@example.com"}]},
                        "2.1.0": {"maintainers": [{"name": "bob", "email": "bob@example.com"}]},
                    },
                },
            )
        if "high-risk-package" in url and "downloads" in url:
            return 200, {"downloads": 50001}

        if "critical-risk-package" in url and "downloads" not in url:
            return (
                200,
                {
                    "dist-tags": {"latest": "3.0.0"},
                    "time": {
                        "2.0.0": _iso(40),
                        "2.5.0": _iso(5),
                        "3.0.0": _iso(3),
                    },
                    "versions": {
                        "2.0.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                        "2.5.0": {"maintainers": [{"name": "carol", "email": "carol@example.com"}]},
                        "3.0.0": {"maintainers": [{"name": "carol", "email": "carol@example.com"}]},
                    },
                },
            )
        if "critical-risk-package" in url and "downloads" in url:
            return 200, {"downloads": 1200}

        if "stable-package" in url and "downloads" not in url:
            return (
                200,
                {
                    "dist-tags": {"latest": "1.2.0"},
                    "time": {
                        "1.0.0": _iso(730),
                        "1.1.0": _iso(500),
                        "1.2.0": _iso(365),
                    },
                    "versions": {
                        "1.0.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                        "1.1.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                        "1.2.0": {"maintainers": [{"name": "alice", "email": "alice@example.com"}]},
                    },
                },
            )
        if "stable-package" in url and "downloads" in url:
            return 200, {"downloads": 2000}

        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(checker, "_fetch_json", fake_fetch_json)

    high_risk = checker.check_npm_maintainer("high-risk-package")
    critical_risk = checker.check_npm_maintainer("critical-risk-package")
    low_risk = checker.check_npm_maintainer("stable-package")

    assert high_risk.risk_level == RiskLevel.HIGH
    assert "30 days ago" in high_risk.reason
    assert critical_risk.risk_level == RiskLevel.CRITICAL
    assert "within 2 days" in critical_risk.reason
    assert low_risk.risk_level == RiskLevel.LOW


def test_check_pypi_maintainer_with_stable_package_returns_low():
    async def fake_fetch_json(client, url):
        if url.endswith("/pypi/requests/json"):
            return (
                200,
                {
                    "releases": {
                        "2.31.0": [{"upload_time_iso_8601": _iso(400)}],
                        "2.32.0": [{"upload_time_iso_8601": _iso(200)}],
                        "2.33.1": [{"upload_time_iso_8601": _iso(30)}],
                    }
                },
            )

        if "/pypi/requests/" in url and url.endswith("/json"):
            return (
                200,
                {
                    "info": {
                        "author": "Kenneth Reitz",
                        "maintainer": "",
                    }
                },
            )

        raise AssertionError(f"Unexpected URL: {url}")

    checker_fetch = checker._fetch_json
    try:
        checker._fetch_json = fake_fetch_json
        result = checker.check_pypi_maintainer("requests")
    finally:
        checker._fetch_json = checker_fetch

    assert result.package_name == "requests"
    assert result.risk_level == RiskLevel.LOW


def test_check_all_maintainers_filters_out_low_risk(monkeypatch):
    packages = [
        PackageInfo(name="pkg-low", version="1.0.0", ecosystem=Ecosystem.NPM),
        PackageInfo(name="pkg-med", version="1.0.0", ecosystem=Ecosystem.PYPI),
    ]

    async def fake_npm(package_name, client):
        return checker.MaintainerRisk(
            package_name=package_name,
            risk_level=RiskLevel.LOW,
            reason="No suspicious recent maintainer changes detected on npm.",
            last_owner_change="2024-01-01T00:00:00Z",
        )

    async def fake_pypi(package_name, client):
        return checker.MaintainerRisk(
            package_name=package_name,
            risk_level=RiskLevel.MEDIUM,
            reason="Maintainer ownership appears to have changed 120 days ago and should be reviewed.",
            last_owner_change="2025-12-11T00:00:00Z",
        )

    monkeypatch.setattr(checker, "_check_npm_maintainer_with_client", fake_npm)
    monkeypatch.setattr(checker, "_check_pypi_maintainer_with_client", fake_pypi)

    results = checker.check_all_maintainers(packages)

    assert len(results) == 1
    assert results[0].package_name == "pkg-med"
    assert results[0].risk_level == RiskLevel.MEDIUM


def test_maintainer_checker_handles_404_gracefully(monkeypatch):
    async def fake_fetch_json(client, url):
        return 404, None

    monkeypatch.setattr(checker, "_fetch_json", fake_fetch_json)

    npm_result = checker.check_npm_maintainer("missing-npm-package")
    pypi_result = checker.check_pypi_maintainer("missing-pypi-package")

    assert npm_result.risk_level == RiskLevel.LOW
    assert pypi_result.risk_level == RiskLevel.LOW
    assert "could not be found" in npm_result.reason
    assert "could not be found" in pypi_result.reason


def test_npm_shared_maintainer_churn_is_treated_as_low_signal(monkeypatch):
    async def fake_fetch_json(client, url):
        if "downloads" in url:
            return 200, {"downloads": 900000}

        return (
            200,
            {
                "dist-tags": {"latest": "2.1.0"},
                "time": {
                    "1.0.0": _iso(200),
                    "2.0.0": _iso(20),
                    "2.1.0": _iso(5),
                },
                "versions": {
                    "1.0.0": {
                        "maintainers": [
                            {"name": "alice", "email": "alice@example.com"},
                            {"name": "bob", "email": "bob@example.com"},
                        ]
                    },
                    "2.0.0": {
                        "maintainers": [
                            {"name": "bob", "email": "bob@example.com"},
                            {"name": "carol", "email": "carol@example.com"},
                        ]
                    },
                    "2.1.0": {
                        "maintainers": [
                            {"name": "bob", "email": "bob@example.com"},
                            {"name": "carol", "email": "carol@example.com"},
                        ]
                    },
                },
            },
        )

    monkeypatch.setattr(checker, "_fetch_json", fake_fetch_json)

    result = checker.check_npm_maintainer("overlap-package")

    assert result.risk_level == RiskLevel.LOW
    assert "low-signal churn" in result.reason

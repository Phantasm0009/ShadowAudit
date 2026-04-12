from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    BehaviorAnalysis,
    Ecosystem,
    FileType,
    MaintainerRisk,
    PackageInfo,
    RiskLevel,
    ScanRequest,
    ScanResult,
    TyposquatResult,
    VulnerabilityResult,
)


def test_all_schema_models_validate_sample_data():
    scan_request = ScanRequest(
        file_content='{"dependencies": {"fastapi": "^0.104.1"}}',
        file_type="package.json",
        project_name="shadowaudit-web",
    )
    package = PackageInfo(name="fastapi", version="0.104.1", ecosystem="pypi")
    vulnerability = VulnerabilityResult(
        package_name="requests",
        cve_id="CVE-2024-12345",
        severity="high",
        summary="Example vulnerability",
        affected_versions=["<2.32.0"],
    )
    maintainer_risk = MaintainerRisk(
        package_name="left-pad",
        risk_level="medium",
        reason="Ownership changed recently",
        last_owner_change="2026-04-01T10:00:00Z",
    )
    typosquat_result = TyposquatResult(
        package_name="reqeusts",
        similar_to="requests",
        similarity_score=0.92,
        is_suspicious=True,
    )
    behavior_analysis = BehaviorAnalysis(
        package_name="mystery-package",
        risk_score=73.5,
        flags=["network_access", "obfuscated_code"],
        ai_summary="Package shows behavior consistent with a potentially risky dependency.",
    )

    scan_result = ScanResult(
        scan_id=uuid4(),
        project_name="shadowaudit-web",
        timestamp="2026-04-10T12:00:00Z",
        packages=[package],
        vulnerabilities=[vulnerability],
        maintainer_risks=[maintainer_risk],
        typosquat_results=[typosquat_result],
        behavior_analyses=[behavior_analysis],
        overall_risk_score=81.2,
        dependency_graph={"fastapi": ["starlette", "pydantic"]},
    )

    assert scan_request.file_type == FileType.PACKAGE_JSON
    assert package.ecosystem == Ecosystem.PYPI
    assert maintainer_risk.risk_level == RiskLevel.MEDIUM
    assert scan_result.packages[0].name == "fastapi"
    assert scan_result.typosquat_results[0].is_suspicious is True


@pytest.mark.parametrize(
    ("payload", "expected_message"),
    [
        (
            {"file_content": "{}", "file_type": "poetry.lock"},
            "package.json",
        ),
        (
            {"version": "1.0.0", "ecosystem": "npm"},
            "name",
        ),
        (
            {
                "name": "urllib3",
                "version": "2.0.0",
                "ecosystem": "cargo",
            },
            "npm",
        ),
        (
            {
                "package_name": "left-pad",
                "risk_level": "severe",
                "reason": "Unrecognized ownership pattern",
                "last_owner_change": "2026-04-01T10:00:00Z",
            },
            "critical",
        ),
    ],
)
def test_schema_models_reject_invalid_data(payload, expected_message):
    with pytest.raises(ValidationError) as exc_info:
        if "file_type" in payload:
            ScanRequest(**payload)
        elif "risk_level" in payload:
            MaintainerRisk(**payload)
        else:
            PackageInfo(**payload)

    assert expected_message in str(exc_info.value)

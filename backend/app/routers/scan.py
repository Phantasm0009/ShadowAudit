from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Query

from app.db import get_dashboard_stats, get_recent_scan_summaries, get_scan_by_id, insert_scan
from app.models.schemas import (
    DashboardStats,
    Ecosystem,
    FileType,
    PackageInfo,
    RecentScanSummary,
    ScanRequest,
    ScanResult,
    VulnerabilityResult,
)
from app.services.behavior_analyzer import analyze_all_packages
from app.services.parser import (
    parse_package_json,
    parse_requirements_txt,
    resolve_dependency_tree,
)
from app.services.maintainer_checker import check_all_maintainers
from app.services.vulnerability_scanner import (
    calculate_vuln_risk_score,
    scan_all_packages,
    scan_package_osv,
)
from app.services.typosquat_detector import detect_all_typosquats
from app.utils.exceptions import ExternalAPIError, ParsingError, ScanError

router = APIRouter(tags=["scan"])
logger = logging.getLogger(__name__)
MAX_SCAN_PACKAGES = 500


@router.post("/scan", response_model=ScanResult)
def create_scan(scan_request: ScanRequest) -> ScanResult:
    packages = _parse_packages(scan_request)

    dependency_tree = resolve_dependency_tree(packages)
    vulnerabilities = scan_all_packages(packages)
    maintainer_risks = check_all_maintainers(packages)
    typosquat_results = detect_all_typosquats(packages)

    try:
        behavior_analyses = analyze_all_packages(
            packages,
            dependency_tree=dependency_tree,
            vulnerabilities=vulnerabilities,
            maintainer_risks=maintainer_risks,
            typosquat_results=typosquat_results,
        )
    except ExternalAPIError as exc:
        logger.warning("Behavior analysis skipped because %s", exc.message)
        behavior_analyses = []
    except Exception as exc:
        logger.warning("Behavior analysis skipped due to unexpected error: %s", exc)
        behavior_analyses = []

    overall_risk_score = calculate_vuln_risk_score(vulnerabilities)
    scan_result = ScanResult(
        scan_id=uuid4(),
        project_name=scan_request.project_name,
        timestamp=datetime.now(timezone.utc),
        packages=packages,
        vulnerabilities=vulnerabilities,
        maintainer_risks=maintainer_risks,
        typosquat_results=typosquat_results,
        behavior_analyses=behavior_analyses,
        overall_risk_score=overall_risk_score,
        dependency_graph=dependency_tree,
    )
    try:
        insert_scan(
            scan_result=scan_result,
            file_type=scan_request.file_type,
            file_content=scan_request.file_content,
        )
    except Exception as exc:
        raise ScanError(
            "The scan completed, but the result could not be stored.",
            {"cause": str(exc)},
            status_code=500,
            error_type="database_error",
        ) from exc
    return scan_result


@router.get("/scan/{scan_id}")
def read_scan(scan_id: UUID) -> dict[str, Any]:
    stored_scan = get_scan_by_id(scan_id)
    if stored_scan is None:
        raise ScanError(
            "Scan not found.",
            {"scan_id": str(scan_id)},
            status_code=404,
            error_type="not_found",
        )

    return stored_scan


@router.get("/scans", response_model=list[RecentScanSummary])
def list_scans() -> list[dict[str, Any]]:
    return get_recent_scan_summaries(limit=50)


@router.get("/stats", response_model=DashboardStats)
def read_dashboard_stats() -> dict[str, Any]:
    return get_dashboard_stats()


@router.get("/vulnerabilities/{package_name}", response_model=list[VulnerabilityResult])
def lookup_package_vulnerabilities(
    package_name: str,
    version: str = Query(..., min_length=1),
    ecosystem: Ecosystem = Query(...),
) -> list[VulnerabilityResult]:
    package = PackageInfo(
        name=package_name,
        version=version,
        ecosystem=ecosystem,
    )
    return scan_package_osv(package)


def _parse_packages(scan_request: ScanRequest) -> list[PackageInfo]:
    try:
        if scan_request.file_type == FileType.PACKAGE_JSON:
            packages = parse_package_json(scan_request.file_content)
        else:
            packages = parse_requirements_txt(scan_request.file_content)
    except json.JSONDecodeError as exc:
        raise ParsingError(
            "Invalid package.json content.",
            {"file_type": scan_request.file_type.value},
        ) from exc
    except ValueError as exc:
        raise ParsingError(
            str(exc),
            {"file_type": scan_request.file_type.value},
        ) from exc

    if not packages:
        raise ParsingError(
            "No packages were found in the provided dependency file.",
            {"file_type": scan_request.file_type.value},
        )

    if len(packages) > MAX_SCAN_PACKAGES:
        raise ScanError(
            f"Manifest contains {len(packages)} packages; the maximum supported is {MAX_SCAN_PACKAGES}.",
            {
                "package_count": len(packages),
                "max_packages": MAX_SCAN_PACKAGES,
            },
        )

    return packages

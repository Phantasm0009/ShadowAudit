from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any
from uuid import UUID

from supabase import Client, create_client

from app.config import get_settings
from app.models.schemas import DashboardStats, FileType, RecentScanSummary, RiskyPackageStat, ScanResult

_supabase_client: Client | None = None


def get_supabase_client(force_refresh: bool = False) -> Client:
    global _supabase_client

    if force_refresh or _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    return _supabase_client


def connect_to_db() -> Client:
    return get_supabase_client()


def close_db_connection() -> None:
    global _supabase_client
    _supabase_client = None


def _response_data(response: Any) -> Any:
    return getattr(response, "data", None)


def insert_scan(
    scan_result: ScanResult,
    file_type: FileType | str,
    file_content: str,
) -> dict[str, Any]:
    client = get_supabase_client()
    scan_data = scan_result.model_dump(mode="json")
    scan_id = scan_data["scan_id"]

    scan_payload = {
        "id": scan_id,
        "project_name": scan_data.get("project_name"),
        "file_type": file_type.value if isinstance(file_type, FileType) else str(file_type),
        "file_content": file_content,
        "overall_risk_score": scan_data["overall_risk_score"],
        "created_at": scan_data["timestamp"],
        "dependency_graph": scan_data["dependency_graph"],
    }

    root_response = client.table("scans").insert(scan_payload).execute()

    child_payloads = {
        "scan_packages": [{**package, "scan_id": scan_id} for package in scan_data["packages"]],
        "vulnerabilities": [
            {**vulnerability, "scan_id": scan_id}
            for vulnerability in scan_data["vulnerabilities"]
        ],
        "maintainer_risks": [
            {**risk, "scan_id": scan_id} for risk in scan_data["maintainer_risks"]
        ],
        "typosquat_results": [
            {**result, "scan_id": scan_id} for result in scan_data["typosquat_results"]
        ],
        "behavior_analyses": [
            {**analysis, "scan_id": scan_id}
            for analysis in scan_data["behavior_analyses"]
        ],
    }

    for table_name, payload in child_payloads.items():
        if payload:
            client.table(table_name).insert(payload).execute()

    root_data = _response_data(root_response)
    if isinstance(root_data, list) and root_data:
        return root_data[0]

    return scan_payload


def get_scan_by_id(scan_id: UUID | str) -> dict[str, Any] | None:
    client = get_supabase_client()
    scan_id_str = str(scan_id)

    scan_response = (
        client.table("scans")
        .select("*")
        .eq("id", scan_id_str)
        .maybe_single()
        .execute()
    )
    scan_data = _response_data(scan_response)

    if not scan_data:
        return None

    related_tables = {
        "packages": "scan_packages",
        "vulnerabilities": "vulnerabilities",
        "maintainer_risks": "maintainer_risks",
        "typosquat_results": "typosquat_results",
        "behavior_analyses": "behavior_analyses",
    }

    assembled_scan = {
        "scan_id": scan_data["id"],
        "project_name": scan_data.get("project_name"),
        "file_type": scan_data.get("file_type"),
        "file_content": scan_data.get("file_content"),
        "timestamp": scan_data.get("created_at"),
        "overall_risk_score": scan_data.get("overall_risk_score"),
        "dependency_graph": scan_data.get("dependency_graph") or {},
    }

    for result_key, table_name in related_tables.items():
        related_response = client.table(table_name).select("*").eq("scan_id", scan_id_str).execute()
        related_rows = _response_data(related_response) or []
        assembled_scan[result_key] = [
            {key: value for key, value in row.items() if key not in {"id", "scan_id"}}
            for row in related_rows
        ]

    return assembled_scan


def get_recent_scans(limit: int = 10) -> list[dict[str, Any]]:
    client = get_supabase_client()
    response = (
        client.table("scans")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    data = _response_data(response)
    return data or []


def get_recent_scan_summaries(limit: int = 50) -> list[dict[str, Any]]:
    client = get_supabase_client()
    response = (
        client.table("scans")
        .select("id, project_name, overall_risk_score, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    scans = _response_data(response) or []

    summaries: list[dict[str, Any]] = []
    for scan in scans:
        scan_id = scan["id"]
        package_rows = (
            client.table("scan_packages").select("name").eq("scan_id", scan_id).execute()
        )
        vulnerability_rows = (
            client.table("vulnerabilities").select("cve_id").eq("scan_id", scan_id).execute()
        )
        summary = RecentScanSummary(
            scan_id=scan_id,
            project_name=scan.get("project_name"),
            overall_risk_score=scan.get("overall_risk_score") or 0.0,
            package_count=len(_response_data(package_rows) or []),
            vulnerability_count=len(_response_data(vulnerability_rows) or []),
            created_at=scan.get("created_at"),
        )
        summaries.append(summary.model_dump(mode="json"))

    return summaries


def get_dashboard_stats() -> dict[str, Any]:
    client = get_supabase_client()

    scans_response = client.table("scans").select("id, overall_risk_score").execute()
    scan_rows = _response_data(scans_response) or []
    scan_risk_scores = {
        row["id"]: float(row.get("overall_risk_score") or 0.0)
        for row in scan_rows
    }

    packages_response = client.table("scan_packages").select("scan_id, name").execute()
    package_rows = _response_data(packages_response) or []

    vulnerabilities_response = (
        client.table("vulnerabilities").select("scan_id, package_name, cve_id, severity").execute()
    )
    vulnerability_rows = _response_data(vulnerabilities_response) or []

    maintainer_response = (
        client.table("maintainer_risks").select("scan_id, risk_level").execute()
    )
    maintainer_rows = _response_data(maintainer_response) or []

    typosquat_response = (
        client.table("typosquat_results").select("scan_id, is_suspicious").execute()
    )
    typosquat_rows = _response_data(typosquat_response) or []

    behavior_response = (
        client.table("behavior_analyses").select("scan_id, risk_score").execute()
    )
    behavior_rows = _response_data(behavior_response) or []

    total_scans = len(scan_rows)
    avg_risk_score = round(
        sum(scan_risk_scores.values()) / total_scans,
        2,
    ) if total_scans else 0.0

    critical_vulnerability_count = sum(
        1 for row in vulnerability_rows if str(row.get("severity", "")).upper() == "CRITICAL"
    )
    critical_maintainer_count = sum(
        1 for row in maintainer_rows if str(row.get("risk_level", "")).lower() == "critical"
    )
    critical_typosquat_count = sum(
        1 for row in typosquat_rows if bool(row.get("is_suspicious"))
    )
    critical_behavior_count = sum(
        1 for row in behavior_rows if float(row.get("risk_score") or 0.0) >= 9.0
    )

    cve_counter = Counter(
        row["cve_id"]
        for row in vulnerability_rows
        if row.get("cve_id")
    )

    package_risk_totals: dict[str, float] = defaultdict(float)
    package_scan_counts: dict[str, int] = defaultdict(int)
    for package_row in package_rows:
        package_name = package_row.get("name")
        scan_id = package_row.get("scan_id")
        if not package_name or not scan_id:
            continue

        package_risk_totals[package_name] += scan_risk_scores.get(scan_id, 0.0)
        package_scan_counts[package_name] += 1

    most_risky_packages = sorted(
        [
            {
                **RiskyPackageStat(
                    package_name=package_name,
                    scan_count=scan_count,
                    avg_risk_score=round(package_risk_totals[package_name] / scan_count, 2),
                ).model_dump(mode="json"),
                "_total_risk": package_risk_totals[package_name],
            }
            for package_name, scan_count in package_scan_counts.items()
        ],
        key=lambda row: (-row["_total_risk"], -row["avg_risk_score"], -row["scan_count"], row["package_name"]),
    )[:5]

    most_risky_packages = [
        {key: value for key, value in package.items() if key != "_total_risk"}
        for package in most_risky_packages
    ]

    stats = DashboardStats(
        total_scans=total_scans,
        avg_risk_score=avg_risk_score,
        critical_findings_count=(
            critical_vulnerability_count
            + critical_maintainer_count
            + critical_typosquat_count
            + critical_behavior_count
        ),
        packages_analyzed=len(package_rows),
        most_common_vulns=[
            {"cve_id": cve_id, "count": count}
            for cve_id, count in cve_counter.most_common(5)
        ],
        most_risky_packages=most_risky_packages,
    )

    return stats.model_dump(mode="json")

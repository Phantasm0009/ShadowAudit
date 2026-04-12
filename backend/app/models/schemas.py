from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.security import sanitize_manifest_content, sanitize_project_name, sanitize_string_list, sanitize_text


class ShadowAuditBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FileType(str, Enum):
    PACKAGE_JSON = "package.json"
    REQUIREMENTS_TXT = "requirements.txt"


class Ecosystem(str, Enum):
    NPM = "npm"
    PYPI = "pypi"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ScanRequest(ShadowAuditBaseModel):
    file_content: str = Field(..., min_length=1)
    file_type: FileType
    project_name: str | None = None

    @field_validator("file_content", mode="before")
    @classmethod
    def validate_file_content(cls, value: object) -> str:
        return sanitize_manifest_content(str(value or ""))

    @field_validator("project_name", mode="before")
    @classmethod
    def validate_project_name(cls, value: object) -> str | None:
        if value is None:
            return None

        return sanitize_project_name(str(value))


class PackageInfo(ShadowAuditBaseModel):
    name: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
    ecosystem: Ecosystem

    @field_validator("name", "version", mode="before")
    @classmethod
    def validate_string_fields(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=255)


class VulnerabilityResult(ShadowAuditBaseModel):
    package_name: str = Field(..., min_length=1)
    cve_id: str = Field(..., min_length=1)
    severity: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    affected_versions: list[str]

    @field_validator("package_name", "cve_id", "severity", "summary", mode="before")
    @classmethod
    def validate_string_fields(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=500)

    @field_validator("affected_versions", mode="before")
    @classmethod
    def validate_affected_versions(cls, value: object) -> list[str]:
        return sanitize_string_list(list(value or []))


class MaintainerRisk(ShadowAuditBaseModel):
    package_name: str = Field(..., min_length=1)
    risk_level: RiskLevel
    reason: str = Field(..., min_length=1)
    last_owner_change: datetime

    @field_validator("package_name", "reason", mode="before")
    @classmethod
    def validate_string_fields(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=500)


class TyposquatResult(ShadowAuditBaseModel):
    package_name: str = Field(..., min_length=1)
    similar_to: str = Field(..., min_length=1)
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    is_suspicious: bool

    @field_validator("package_name", "similar_to", mode="before")
    @classmethod
    def validate_string_fields(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=255)


class BehaviorAnalysis(ShadowAuditBaseModel):
    package_name: str = Field(..., min_length=1)
    risk_score: float
    flags: list[str]
    ai_summary: str = Field(..., min_length=1)

    @field_validator("package_name", "ai_summary", mode="before")
    @classmethod
    def validate_string_fields(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=2000)

    @field_validator("flags", mode="before")
    @classmethod
    def validate_flags(cls, value: object) -> list[str]:
        return sanitize_string_list(list(value or []))


class ScanResult(ShadowAuditBaseModel):
    scan_id: UUID
    project_name: str | None = None
    timestamp: datetime
    packages: list[PackageInfo]
    vulnerabilities: list[VulnerabilityResult]
    maintainer_risks: list[MaintainerRisk]
    typosquat_results: list[TyposquatResult]
    behavior_analyses: list[BehaviorAnalysis]
    overall_risk_score: float
    dependency_graph: dict[str, Any]


class RecentScanSummary(ShadowAuditBaseModel):
    scan_id: UUID
    project_name: str | None = None
    overall_risk_score: float
    package_count: int = Field(..., ge=0)
    vulnerability_count: int = Field(..., ge=0)
    created_at: datetime


class CommonVulnerabilityStat(ShadowAuditBaseModel):
    cve_id: str = Field(..., min_length=1)
    count: int = Field(..., ge=0)

    @field_validator("cve_id", mode="before")
    @classmethod
    def validate_cve_id(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=255)


class RiskyPackageStat(ShadowAuditBaseModel):
    package_name: str = Field(..., min_length=1)
    scan_count: int = Field(..., ge=0)
    avg_risk_score: float

    @field_validator("package_name", mode="before")
    @classmethod
    def validate_package_name(cls, value: object) -> str:
        return sanitize_text(str(value or ""), max_length=255)


class DashboardStats(ShadowAuditBaseModel):
    total_scans: int = Field(..., ge=0)
    avg_risk_score: float
    critical_findings_count: int = Field(..., ge=0)
    packages_analyzed: int = Field(..., ge=0)
    most_common_vulns: list[CommonVulnerabilityStat]
    most_risky_packages: list[RiskyPackageStat]

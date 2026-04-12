from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
from packaging.version import InvalidVersion, Version

from app.config import get_settings
from app.models.schemas import BehaviorAnalysis, MaintainerRisk, PackageInfo, RiskLevel, TyposquatResult, VulnerabilityResult
from app.utils.exceptions import ExternalAPIError

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o"
AI_REQUEST_TIMEOUT_SECONDS = 30.0
MAX_DIFF_SUMMARY_CHARS = 4000
SYSTEM_PROMPT = (
    "You are a cybersecurity expert analyzing npm/PyPI package changes for supply chain "
    "attacks. Analyze the following diff and install scripts. Flag: obfuscated code, "
    "data exfiltration (network calls to unknown domains), environment variable harvesting, "
    "crypto mining indicators, reverse shells, encoded payloads, suspicious postinstall "
    "scripts. Respond in JSON: { risk_score: 0-10, flags: [string], summary: string }"
)
JSON_BLOCK_PATTERN = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
logger = logging.getLogger(__name__)
FALLBACK_AI_SUMMARY = "Behavior analysis was unavailable for this package."


def fetch_package_diff(package: PackageInfo) -> str | None:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(fetch_package_diff_async(package))

    raise RuntimeError(
        "fetch_package_diff cannot run inside an active event loop; "
        "use fetch_package_diff_async instead."
    )


async def fetch_package_diff_async(package: PackageInfo) -> str | None:
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            if package.ecosystem.value == "npm":
                return await _fetch_npm_diff_summary(client, package)

            return await _fetch_pypi_diff_summary(client, package)
        except ExternalAPIError as exc:
            logger.warning("Skipping diff fetch for %s: %s", package.name, exc.message)
            return None


def analyze_with_ai(package_name: str, diff_summary: str, install_scripts: str) -> BehaviorAnalysis:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(analyze_with_ai_async(package_name, diff_summary, install_scripts))

    raise RuntimeError(
        "analyze_with_ai cannot run inside an active event loop; "
        "use analyze_with_ai_async instead."
    )


async def analyze_with_ai_async(
    package_name: str,
    diff_summary: str,
    install_scripts: str,
) -> BehaviorAnalysis:
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        return _fallback_analysis(package_name)

    payload = {
        "model": OPENAI_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Package: {package_name}\n\n"
                    f"Diff summary:\n{diff_summary[:MAX_DIFF_SUMMARY_CHARS]}\n\n"
                    f"Install scripts:\n{install_scripts[:1500]}"
                ),
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(AI_REQUEST_TIMEOUT_SECONDS, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(OPENAI_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            body = response.json()
            content = (
                body.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed = _extract_ai_json(content)
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            logger.warning(
                "Behavior analysis failed for %s because the OpenAI API request did not complete: %s",
                package_name,
                exc,
            )
            return _fallback_analysis(package_name)

    return BehaviorAnalysis(
        package_name=package_name,
        risk_score=min(max(float(parsed.get("risk_score", 0.0)), 0.0), 10.0),
        flags=[str(flag) for flag in parsed.get("flags", []) if str(flag).strip()],
        ai_summary=str(parsed.get("summary") or "No suspicious behavior identified."),
    )


def analyze_all_packages(
    packages: list[PackageInfo],
    *,
    dependency_tree: dict[str, Any] | None = None,
    vulnerabilities: list[VulnerabilityResult] | None = None,
    maintainer_risks: list[MaintainerRisk] | None = None,
    typosquat_results: list[TyposquatResult] | None = None,
) -> list[BehaviorAnalysis]:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            analyze_all_packages_async(
                packages,
                dependency_tree=dependency_tree,
                vulnerabilities=vulnerabilities,
                maintainer_risks=maintainer_risks,
                typosquat_results=typosquat_results,
            )
        )

    raise RuntimeError(
        "analyze_all_packages cannot run inside an active event loop; "
        "use analyze_all_packages_async instead."
    )


async def analyze_all_packages_async(
    packages: list[PackageInfo],
    *,
    dependency_tree: dict[str, Any] | None = None,
    vulnerabilities: list[VulnerabilityResult] | None = None,
    maintainer_risks: list[MaintainerRisk] | None = None,
    typosquat_results: list[TyposquatResult] | None = None,
) -> list[BehaviorAnalysis]:
    candidates = _select_analysis_candidates(
        packages,
        dependency_tree=dependency_tree or {},
        vulnerabilities=vulnerabilities or [],
        maintainer_risks=maintainer_risks or [],
        typosquat_results=typosquat_results or [],
    )
    if not candidates:
        return []

    analyses: list[BehaviorAnalysis] = []
    for package in candidates:
        diff_summary = await fetch_package_diff_async(package)
        if not diff_summary:
            await asyncio.sleep(1)
            continue

        install_scripts = _extract_install_scripts_from_diff(diff_summary)
        analysis = await analyze_with_ai_async(package.name, diff_summary, install_scripts)
        if (
            analysis.risk_score > 0
            or analysis.flags
            or analysis.ai_summary == FALLBACK_AI_SUMMARY
        ):
            analyses.append(analysis)
        await asyncio.sleep(1)

    return analyses


async def _fetch_npm_diff_summary(client: httpx.AsyncClient, package: PackageInfo) -> str | None:
    package_name = quote(package.name, safe="@")
    registry_url = f"https://registry.npmjs.org/{package_name}"
    registry_payload = await _fetch_json(client, registry_url, "the npm registry")

    versions = registry_payload.get("versions") or {}
    current_version = package.version
    if current_version == "latest":
        current_version = str((registry_payload.get("dist-tags") or {}).get("latest") or "")
    if not current_version or current_version not in versions:
        return None

    previous_version = _get_previous_version(list(versions.keys()), current_version)
    if not previous_version or previous_version not in versions:
        return None

    current_payload = versions[current_version] or {}
    previous_payload = versions[previous_version] or {}
    current_scripts = (current_payload.get("scripts") or {})
    previous_scripts = (previous_payload.get("scripts") or {})
    summary = (
        f"npm package {package.name} changed from {previous_version} to {current_version}. "
        f"Current scripts: {json.dumps(current_scripts, sort_keys=True)}. "
        f"Previous scripts: {json.dumps(previous_scripts, sort_keys=True)}. "
        f"Current dependencies: {json.dumps(current_payload.get('dependencies') or {}, sort_keys=True)}. "
        f"Previous dependencies: {json.dumps(previous_payload.get('dependencies') or {}, sort_keys=True)}."
    )
    return summary[:MAX_DIFF_SUMMARY_CHARS]


async def _fetch_pypi_diff_summary(client: httpx.AsyncClient, package: PackageInfo) -> str | None:
    package_name = quote(package.name, safe="")
    registry_url = f"https://pypi.org/pypi/{package_name}/json"
    registry_payload = await _fetch_json(client, registry_url, "the PyPI API")

    releases = registry_payload.get("releases") or {}
    available_versions = list(releases.keys())
    current_version = package.version
    if current_version == "latest":
        current_version = str((registry_payload.get("info") or {}).get("version") or "")
    if not current_version or current_version not in releases:
        return None

    previous_version = _get_previous_version(available_versions, current_version)
    if not previous_version:
        return None

    current_release_payload = await _fetch_json(
        client,
        f"https://pypi.org/pypi/{package_name}/{quote(current_version, safe='')}/json",
        "the PyPI API",
    )
    previous_release_payload = await _fetch_json(
        client,
        f"https://pypi.org/pypi/{package_name}/{quote(previous_version, safe='')}/json",
        "the PyPI API",
    )

    current_info = current_release_payload.get("info") or {}
    previous_info = previous_release_payload.get("info") or {}
    summary = (
        f"PyPI package {package.name} changed from {previous_version} to {current_version}. "
        f"Current setup metadata: author={current_info.get('author')}, maintainer={current_info.get('maintainer')}, "
        f"requires_dist={json.dumps(current_info.get('requires_dist') or [], sort_keys=True)}. "
        f"Previous setup metadata: author={previous_info.get('author')}, maintainer={previous_info.get('maintainer')}, "
        f"requires_dist={json.dumps(previous_info.get('requires_dist') or [], sort_keys=True)}."
    )
    return summary[:MAX_DIFF_SUMMARY_CHARS]


async def _fetch_json(client: httpx.AsyncClient, url: str, service_name: str) -> dict[str, Any]:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException as exc:
        raise ExternalAPIError(
            f"Timed out while contacting {service_name}.",
            {"service": service_name, "url": url},
        ) from exc
    except httpx.HTTPError as exc:
        raise ExternalAPIError(
            f"Failed to contact {service_name}.",
            {"service": service_name, "url": url},
        ) from exc
    except ValueError as exc:
        raise ExternalAPIError(
            f"{service_name} returned malformed JSON.",
            {"service": service_name, "url": url},
        ) from exc


def _extract_ai_json(content: str) -> dict[str, Any]:
    if not content.strip():
        return {}

    match = JSON_BLOCK_PATTERN.search(content)
    json_blob = match.group(1) if match else content.strip()
    return json.loads(json_blob)


def _select_analysis_candidates(
    packages: list[PackageInfo],
    *,
    dependency_tree: dict[str, Any],
    vulnerabilities: list[VulnerabilityResult],
    maintainer_risks: list[MaintainerRisk],
    typosquat_results: list[TyposquatResult],
) -> list[PackageInfo]:
    flagged_names = {
        vuln.package_name
        for vuln in vulnerabilities
        if vuln.severity.upper() in {"MEDIUM", "HIGH", "CRITICAL"}
    }
    flagged_names.update(
        risk.package_name
        for risk in maintainer_risks
        if risk.risk_level in {RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL}
    )
    flagged_names.update(
        result.package_name
        for result in typosquat_results
        if result.is_suspicious
    )

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_packages = {
        package.name
        for package in packages
        if _extract_publish_date(dependency_tree, package.name) and _extract_publish_date(dependency_tree, package.name) >= recent_cutoff
    }

    selected_names = flagged_names | recent_packages
    return [package for package in packages if package.name in selected_names]


def _extract_publish_date(dependency_tree: dict[str, Any], package_name: str) -> datetime | None:
    node = dependency_tree.get(package_name)
    if not isinstance(node, dict):
        return None

    metadata = node.get("metadata") or {}
    raw_value = metadata.get("last_publish_date")
    if not raw_value:
        return None

    try:
        return datetime.fromisoformat(str(raw_value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _get_previous_version(versions: list[str], current_version: str) -> str | None:
    normalized_versions: list[tuple[Version, str]] = []
    for version in versions:
        try:
            normalized_versions.append((Version(version), version))
        except InvalidVersion:
            continue

    normalized_versions.sort()
    for index, (_, original_version) in enumerate(normalized_versions):
        if original_version != current_version:
            continue
        if index == 0:
            return None
        return normalized_versions[index - 1][1]

    return None


def _extract_install_scripts_from_diff(diff_summary: str) -> str:
    markers = ["install", "postinstall", "preinstall", "setup.py", "setup.cfg"]
    extracted = [line for line in diff_summary.splitlines() if any(marker in line.lower() for marker in markers)]
    return "\n".join(extracted)[:1500]


def _fallback_analysis(package_name: str) -> BehaviorAnalysis:
    return BehaviorAnalysis(
        package_name=package_name,
        risk_score=0.0,
        flags=[],
        ai_summary=FALLBACK_AI_SUMMARY,
    )

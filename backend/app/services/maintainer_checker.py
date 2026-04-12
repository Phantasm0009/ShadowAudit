from __future__ import annotations

import asyncio
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.models.schemas import Ecosystem, MaintainerRisk, PackageInfo, RiskLevel

MAX_CONCURRENT_CHECKS = 5
DOWNLOAD_THRESHOLD = 10_000
LOW_SIGNAL_DATE = datetime(1970, 1, 1, tzinfo=timezone.utc)
logger = logging.getLogger(__name__)


def check_npm_maintainer(package_name: str) -> MaintainerRisk:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(check_npm_maintainer_async(package_name))

    raise RuntimeError(
        "check_npm_maintainer cannot run inside an active event loop; "
        "use check_npm_maintainer_async instead."
    )


async def check_npm_maintainer_async(package_name: str) -> MaintainerRisk:
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        return await _check_npm_maintainer_with_client(package_name, client)


def check_pypi_maintainer(package_name: str) -> MaintainerRisk:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(check_pypi_maintainer_async(package_name))

    raise RuntimeError(
        "check_pypi_maintainer cannot run inside an active event loop; "
        "use check_pypi_maintainer_async instead."
    )


async def check_pypi_maintainer_async(package_name: str) -> MaintainerRisk:
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        return await _check_pypi_maintainer_with_client(package_name, client)


def check_all_maintainers(packages: list[PackageInfo]) -> list[MaintainerRisk]:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(check_all_maintainers_async(packages))

    raise RuntimeError(
        "check_all_maintainers cannot run inside an active event loop; "
        "use check_all_maintainers_async instead."
    )


async def check_all_maintainers_async(packages: list[PackageInfo]) -> list[MaintainerRisk]:
    if not packages:
        return []

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        tasks = [
            _bounded_check(package, client, semaphore)
            for package in packages
        ]
        results = await asyncio.gather(*tasks)

    return [risk for risk in results if risk.risk_level in {RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL}]


async def _bounded_check(
    package: PackageInfo,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
) -> MaintainerRisk:
    async with semaphore:
        if package.ecosystem == Ecosystem.NPM:
            return await _check_npm_maintainer_with_client(package.name, client)

        return await _check_pypi_maintainer_with_client(package.name, client)


async def _check_npm_maintainer_with_client(
    package_name: str,
    client: httpx.AsyncClient,
) -> MaintainerRisk:
    encoded_name = quote(package_name, safe="@")
    registry_url = f"https://registry.npmjs.org/{encoded_name}"
    downloads_url = f"https://api.npmjs.org/downloads/point/last-week/{encoded_name}"

    (registry_status, registry_payload), (_, downloads_payload) = await asyncio.gather(
        _fetch_json(client, registry_url),
        _fetch_json(client, downloads_url),
    )

    if registry_status is None and isinstance(registry_payload, dict) and registry_payload.get("_error"):
        return _low_risk(package_name, LOW_SIGNAL_DATE, registry_payload["_error"])

    if registry_status == 404 or registry_payload is None:
        return _not_found_risk(package_name)

    time_map = registry_payload.get("time") or {}
    versions = registry_payload.get("versions") or {}
    dist_tags = registry_payload.get("dist-tags") or {}
    latest_version = dist_tags.get("latest")
    if not latest_version or latest_version not in versions:
        return _low_risk(package_name, LOW_SIGNAL_DATE, "Package metadata is missing version history.")

    version_history = _build_npm_version_history(versions, time_map)
    current_snapshot = _latest_non_empty_snapshot(version_history)
    if current_snapshot is None:
        return _low_risk(package_name, LOW_SIGNAL_DATE, "No maintainer history was available from npm.")

    change_date, previous_identity = _find_change_signal(version_history, current_snapshot["identity"])
    weekly_downloads = _extract_weekly_downloads(downloads_payload)
    latest_publish_date = _parse_datetime(time_map.get(latest_version)) or current_snapshot["published_at"]

    risk_level, reason = _evaluate_risk(
        package_name=package_name,
        change_date=change_date,
        latest_publish_date=latest_publish_date,
        weekly_downloads=weekly_downloads,
        current_identity=current_snapshot["identity"],
        previous_identity=previous_identity,
        source_name="npm",
    )

    return MaintainerRisk(
        package_name=package_name,
        risk_level=risk_level,
        reason=reason,
        last_owner_change=change_date or current_snapshot["published_at"] or LOW_SIGNAL_DATE,
    )


async def _check_pypi_maintainer_with_client(
    package_name: str,
    client: httpx.AsyncClient,
) -> MaintainerRisk:
    encoded_name = quote(package_name, safe="")
    package_url = f"https://pypi.org/pypi/{encoded_name}/json"
    status_code, package_payload = await _fetch_json(client, package_url)

    if status_code is None and isinstance(package_payload, dict) and package_payload.get("_error"):
        return _low_risk(package_name, LOW_SIGNAL_DATE, package_payload["_error"])

    if status_code == 404 or package_payload is None:
        return _not_found_risk(package_name)

    releases = package_payload.get("releases") or {}
    recent_versions = _select_recent_pypi_versions(releases)
    if not recent_versions:
        return _low_risk(package_name, LOW_SIGNAL_DATE, "Package metadata is missing release history.")

    version_tasks = [
        _fetch_json(client, f"https://pypi.org/pypi/{encoded_name}/{quote(version, safe='')}/json")
        for version in recent_versions
    ]
    version_responses = await asyncio.gather(*version_tasks)

    version_history = []
    for (status, version_payload), version in zip(version_responses, recent_versions):
        if status == 404 or version_payload is None:
            continue

        info = version_payload.get("info") or {}
        published_at = _latest_release_time(releases.get(version) or [])
        version_history.append(
            {
                "version": version,
                "published_at": published_at,
                "identity": _normalize_pypi_identity(info.get("author"), info.get("maintainer")),
            }
        )

    version_history.sort(key=lambda item: item["published_at"] or LOW_SIGNAL_DATE, reverse=True)
    current_snapshot = _latest_non_empty_snapshot(version_history)
    if current_snapshot is None:
        return _low_risk(package_name, LOW_SIGNAL_DATE, "No author or maintainer history was available from PyPI.")

    change_date, previous_identity = _find_change_signal(version_history, current_snapshot["identity"])
    latest_publish_date = version_history[0]["published_at"] or current_snapshot["published_at"] or LOW_SIGNAL_DATE

    risk_level, reason = _evaluate_risk(
        package_name=package_name,
        change_date=change_date,
        latest_publish_date=latest_publish_date,
        weekly_downloads=None,
        current_identity=current_snapshot["identity"],
        previous_identity=previous_identity,
        source_name="PyPI",
    )

    return MaintainerRisk(
        package_name=package_name,
        risk_level=risk_level,
        reason=reason,
        last_owner_change=change_date or current_snapshot["published_at"] or LOW_SIGNAL_DATE,
    )


async def _fetch_json(
    client: httpx.AsyncClient,
    url: str,
) -> tuple[int | None, dict[str, Any] | None]:
    try:
        response = await client.get(url)
    except httpx.TimeoutException as exc:
        message = f"Timed out while contacting {_service_name_for_url(url)}."
        logger.warning("%s Error: %s", message, exc)
        return None, {"_error": message}
    except httpx.HTTPError as exc:
        message = f"Failed to contact {_service_name_for_url(url)}."
        logger.warning("%s Error: %s", message, exc)
        return None, {"_error": message}

    if response.status_code == 404:
        return 404, None

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        message = f"{_service_name_for_url(url)} returned status {response.status_code}."
        logger.warning("%s Error: %s", message, exc)
        return response.status_code, {"_error": message}

    return response.status_code, response.json()


def _service_name_for_url(url: str) -> str:
    if "registry.npmjs.org" in url:
        return "the npm registry"
    if "api.npmjs.org" in url:
        return "the npm downloads API"
    if "pypi.org" in url:
        return "the PyPI API"
    return "the package registry"


def _build_npm_version_history(
    versions: dict[str, Any],
    time_map: dict[str, str],
) -> list[dict[str, Any]]:
    history = []
    for version, payload in versions.items():
        published_at = _parse_datetime(time_map.get(version))
        if published_at is None:
            continue

        history.append(
            {
                "version": version,
                "published_at": published_at,
                "identity": _normalize_npm_maintainers(payload.get("maintainers") or []),
            }
        )

    history.sort(key=lambda item: item["published_at"], reverse=True)
    return history[:6]


def _select_recent_pypi_versions(releases: dict[str, list[dict[str, Any]]], limit: int = 6) -> list[str]:
    version_stamps = []
    for version, files in releases.items():
        published_at = _latest_release_time(files)
        if published_at is None:
            continue
        version_stamps.append((published_at, version))

    version_stamps.sort(reverse=True)
    return [version for _, version in version_stamps[:limit]]


def _latest_release_time(files: list[dict[str, Any]]) -> datetime | None:
    timestamps = [
        _parse_datetime(file_info.get("upload_time_iso_8601") or file_info.get("upload_time"))
        for file_info in files
    ]
    timestamps = [stamp for stamp in timestamps if stamp is not None]
    return max(timestamps) if timestamps else None


def _latest_non_empty_snapshot(version_history: list[dict[str, Any]]) -> dict[str, Any] | None:
    for snapshot in version_history:
        if snapshot["identity"]:
            return snapshot
    return None


def _find_change_signal(
    version_history: list[dict[str, Any]],
    current_identity: tuple[str, ...],
) -> tuple[datetime | None, tuple[str, ...]]:
    oldest_current_streak_date: datetime | None = None
    seen_current_identity = False

    for snapshot in version_history:
        identity = snapshot["identity"]
        if not identity:
            continue

        if identity == current_identity:
            seen_current_identity = True
            oldest_current_streak_date = snapshot["published_at"] or oldest_current_streak_date
            continue

        if seen_current_identity:
            return oldest_current_streak_date, identity

    return None, ()


def _evaluate_risk(
    package_name: str,
    change_date: datetime | None,
    latest_publish_date: datetime,
    weekly_downloads: int | None,
    current_identity: tuple[str, ...],
    previous_identity: tuple[str, ...],
    source_name: str,
) -> tuple[RiskLevel, str]:
    if change_date is None:
        identity_description = ", ".join(current_identity) if current_identity else "unknown maintainers"
        return (
            RiskLevel.LOW,
            f"No suspicious recent maintainer changes detected on {source_name}; current owners: {identity_description}.",
        )

    if _has_identity_overlap(current_identity, previous_identity):
        identity_description = ", ".join(current_identity) if current_identity else "unknown maintainers"
        return (
            RiskLevel.LOW,
            f"{source_name} maintainer metadata changed, but existing owners remained in place; treating this as low-signal churn. Current owners: {identity_description}.",
        )

    now = datetime.now(timezone.utc)
    days_since_change = (now - change_date).days
    days_between_change_and_latest = abs((latest_publish_date - change_date).days)

    if days_since_change <= 30 and days_between_change_and_latest <= 7:
        return (
            RiskLevel.CRITICAL,
            f"Maintainer ownership appears to have changed {days_since_change} days ago, and the latest release followed within {days_between_change_and_latest} days.",
        )

    if days_since_change <= 90 and (weekly_downloads or 0) > DOWNLOAD_THRESHOLD:
        return (
            RiskLevel.HIGH,
            f"Maintainer ownership appears to have changed {days_since_change} days ago on a package with {(weekly_downloads or 0):,} weekly downloads.",
        )

    if days_since_change <= 180:
        return (
            RiskLevel.MEDIUM,
            f"Maintainer ownership appears to have changed {days_since_change} days ago and should be reviewed.",
        )

    return (
        RiskLevel.LOW,
        f"The last detected maintainer change for {package_name} was {days_since_change} days ago, outside the alert window.",
    )


def _has_identity_overlap(current_identity: tuple[str, ...], previous_identity: tuple[str, ...]) -> bool:
    if not current_identity or not previous_identity:
        return False

    return bool(set(current_identity) & set(previous_identity))


def _extract_weekly_downloads(download_payload: dict[str, Any] | None) -> int | None:
    if not isinstance(download_payload, dict):
        return None

    downloads = download_payload.get("downloads")
    if isinstance(downloads, int):
        return downloads

    return None


def _normalize_npm_maintainers(maintainers: Iterable[dict[str, Any]]) -> tuple[str, ...]:
    normalized = []
    for maintainer in maintainers:
        name = str(maintainer.get("name") or "").strip().lower()
        email = str(maintainer.get("email") or "").strip().lower()
        identity = "|".join(part for part in (name, email) if part)
        if identity:
            normalized.append(identity)

    return tuple(sorted(set(normalized)))


def _normalize_pypi_identity(author: str | None, maintainer: str | None) -> tuple[str, ...]:
    normalized = {
        value.strip().lower()
        for value in (author, maintainer)
        if isinstance(value, str) and value.strip()
    }
    return tuple(sorted(normalized))


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _low_risk(package_name: str, last_owner_change: datetime, reason: str) -> MaintainerRisk:
    return MaintainerRisk(
        package_name=package_name,
        risk_level=RiskLevel.LOW,
        reason=reason,
        last_owner_change=last_owner_change,
    )


def _not_found_risk(package_name: str) -> MaintainerRisk:
    return _low_risk(
        package_name,
        LOW_SIGNAL_DATE,
        "Package could not be found on the registry, so maintainer history is unavailable.",
    )

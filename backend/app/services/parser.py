from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import quote

import httpx
from packaging.requirements import InvalidRequirement, Requirement

from app.models.schemas import Ecosystem, PackageInfo
from app.utils.exceptions import ExternalAPIError

MAX_RESOLUTION_DEPTH = 3
MAX_CONCURRENT_REQUESTS = 10
DEFAULT_VERSION = "latest"
_VERSION_PREFIX_PATTERN = re.compile(r"^[\^~<>=! ]+")
_VERSION_NUMBER_PATTERN = re.compile(r"v?(\d+(?:\.\d+)*(?:[-._a-zA-Z0-9]+)?)")
logger = logging.getLogger(__name__)


def normalize_version(version: str | None) -> str:
    if version is None:
        return DEFAULT_VERSION

    cleaned = version.strip()
    if not cleaned or cleaned == "*":
        return DEFAULT_VERSION

    if "#" in cleaned:
        cleaned = cleaned.split("#", 1)[0].strip()

    if cleaned.startswith("workspace:"):
        cleaned = cleaned.split(":", 1)[1].strip()

    if cleaned.startswith(("file:", "git+", "http://", "https://")):
        return DEFAULT_VERSION

    for separator in ("||", ",", " "):
        if separator in cleaned:
            cleaned = cleaned.split(separator, 1)[0].strip()

    cleaned = _VERSION_PREFIX_PATTERN.sub("", cleaned).strip()
    if not cleaned or cleaned == "*":
        return DEFAULT_VERSION

    match = _VERSION_NUMBER_PATTERN.search(cleaned)
    if match:
        return match.group(1).lstrip("v")

    return cleaned


def parse_package_json(content: str) -> list[PackageInfo]:
    payload = json.loads(content)
    package_sections = (
        payload.get("dependencies") or {},
        payload.get("devDependencies") or {},
    )

    packages_by_name: dict[str, PackageInfo] = {}
    for section in package_sections:
        if not isinstance(section, dict):
            raise ValueError("dependencies and devDependencies must be objects")

        for name, version in section.items():
            packages_by_name.setdefault(
                name,
                PackageInfo(
                    name=name,
                    version=normalize_version(str(version)),
                    ecosystem=Ecosystem.NPM,
                ),
            )

    return list(packages_by_name.values())


def parse_requirements_txt(content: str) -> list[PackageInfo]:
    if not content.strip():
        return []

    packages: list[PackageInfo] = []
    seen: set[str] = set()

    for raw_line in content.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or line.startswith(("-r", "--requirement")):
            continue

        try:
            requirement = Requirement(line)
        except InvalidRequirement:
            continue

        package_key = requirement.name.lower()
        if package_key in seen:
            continue

        version = normalize_version(str(requirement.specifier)) if requirement.specifier else DEFAULT_VERSION
        packages.append(
            PackageInfo(
                name=requirement.name,
                version=version,
                ecosystem=Ecosystem.PYPI,
            )
        )
        seen.add(package_key)

    return packages


def resolve_dependency_tree(packages: list[PackageInfo]) -> dict[str, Any]:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(resolve_dependency_tree_async(packages))

    raise RuntimeError(
        "resolve_dependency_tree cannot run inside an active event loop; "
        "use resolve_dependency_tree_async instead."
    )


async def resolve_dependency_tree_async(packages: list[PackageInfo]) -> dict[str, Any]:
    if not packages:
        return {}

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    timeout = httpx.Timeout(10.0, connect=5.0)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        tasks = [
            _resolve_package_node(
                client=client,
                semaphore=semaphore,
                package=package,
                depth=0,
                trail=set(),
            )
            for package in packages
        ]
        resolved_nodes = await asyncio.gather(*tasks)

    return {node["name"]: node for node in resolved_nodes}


async def _resolve_package_node(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    package: PackageInfo,
    depth: int,
    trail: set[tuple[str, str, str]],
) -> dict[str, Any]:
    node = _build_base_node(package)
    package_key = (package.ecosystem.value, package.name.lower(), package.version)

    if package_key in trail:
        node["status"] = "cycle_detected"
        return node

    if package.ecosystem == Ecosystem.NPM:
        try:
            resolved_package = await _fetch_npm_package(client, semaphore, package, depth)
        except ExternalAPIError as exc:
            node["status"] = "error"
            node["metadata"]["error"] = exc.message
            return node
    else:
        try:
            resolved_package = await _fetch_pypi_package(client, semaphore, package)
        except ExternalAPIError as exc:
            node["status"] = "error"
            node["metadata"]["error"] = exc.message
            return node

    if resolved_package is None:
        node["status"] = "not_found"
        return node

    node["status"] = "resolved"
    node["version"] = resolved_package["version"]
    node["metadata"] = resolved_package["metadata"]

    if depth >= MAX_RESOLUTION_DEPTH:
        return node

    dependencies = resolved_package["dependencies"]
    next_trail = trail | {package_key}
    child_tasks = [
        _resolve_package_node(
            client=client,
            semaphore=semaphore,
            package=child_package,
            depth=depth + 1,
            trail=next_trail,
        )
        for child_package in dependencies
    ]
    child_nodes = await asyncio.gather(*child_tasks)
    node["dependencies"] = {child["name"]: child for child in child_nodes}
    return node


def _build_base_node(package: PackageInfo) -> dict[str, Any]:
    return {
        "name": package.name,
        "version": package.version,
        "ecosystem": package.ecosystem.value,
        "status": "pending",
        "metadata": {
            "download_count": None,
            "last_publish_date": None,
        },
        "dependencies": {},
    }


async def _fetch_npm_package(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    package: PackageInfo,
    depth: int,
) -> dict[str, Any] | None:
    encoded_name = quote(package.name, safe="@")
    version_segment = quote(package.version, safe="") if package.version else DEFAULT_VERSION
    package_url = f"https://registry.npmjs.org/{encoded_name}/{version_segment or DEFAULT_VERSION}"

    version_status, version_payload = await _fetch_json(client, semaphore, package_url)
    if version_status is None and isinstance(version_payload, dict) and version_payload.get("_error"):
        raise ExternalAPIError(
            version_payload["_error"],
            {"package_name": package.name, "ecosystem": package.ecosystem.value},
        )
    if version_status == 404 or version_payload is None:
        return None

    registry_url = f"https://registry.npmjs.org/{encoded_name}"
    downloads_payload: dict[str, Any] | None = None
    if depth == 0:
        downloads_url = f"https://api.npmjs.org/downloads/point/last-week/{encoded_name}"
        (registry_status, registry_payload), (_, downloads_payload) = await asyncio.gather(
            _fetch_json(client, semaphore, registry_url),
            _fetch_json(client, semaphore, downloads_url),
        )
    else:
        registry_status, registry_payload = await _fetch_json(client, semaphore, registry_url)

    dependency_map = version_payload.get("dependencies") or {}
    resolved_version = version_payload.get("version", package.version)
    last_publish_date = None
    if registry_status and registry_payload and isinstance(registry_payload.get("time"), dict):
        last_publish_date = registry_payload["time"].get(resolved_version)

    download_count = None
    if isinstance(downloads_payload, dict):
        download_count = downloads_payload.get("downloads")

    dependencies = [
        PackageInfo(
            name=dependency_name,
            version=normalize_version(str(dependency_version)),
            ecosystem=Ecosystem.NPM,
        )
        for dependency_name, dependency_version in dependency_map.items()
    ]

    return {
        "version": resolved_version,
        "dependencies": dependencies,
        "metadata": {
            "download_count": download_count,
            "last_publish_date": last_publish_date,
        },
    }


async def _fetch_pypi_package(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    package: PackageInfo,
) -> dict[str, Any] | None:
    encoded_name = quote(package.name, safe="")
    if package.version == DEFAULT_VERSION:
        package_url = f"https://pypi.org/pypi/{encoded_name}/json"
    else:
        package_url = f"https://pypi.org/pypi/{encoded_name}/{quote(package.version, safe='')}/json"

    response_status, payload = await _fetch_json(client, semaphore, package_url)
    if response_status is None and isinstance(payload, dict) and payload.get("_error"):
        raise ExternalAPIError(
            payload["_error"],
            {"package_name": package.name, "ecosystem": package.ecosystem.value},
        )
    if response_status == 404 or payload is None:
        return None

    info = payload.get("info") or {}
    urls = payload.get("urls") or []
    last_publish_date = max(
        (item.get("upload_time_iso_8601") for item in urls if item.get("upload_time_iso_8601")),
        default=None,
    )

    download_count = None
    downloads_metadata = info.get("downloads")
    if isinstance(downloads_metadata, dict):
        download_count = (
            downloads_metadata.get("last_month")
            or downloads_metadata.get("last_week")
            or downloads_metadata.get("last_day")
        )

    dependencies = _parse_pypi_requirements(info.get("requires_dist") or [])
    return {
        "version": info.get("version", package.version),
        "dependencies": dependencies,
        "metadata": {
            "download_count": download_count,
            "last_publish_date": last_publish_date,
        },
    }


def _parse_pypi_requirements(requirements: list[str]) -> list[PackageInfo]:
    packages: list[PackageInfo] = []
    seen: set[str] = set()

    for requirement_line in requirements:
        try:
            requirement = Requirement(requirement_line)
        except InvalidRequirement:
            continue

        package_key = requirement.name.lower()
        if package_key in seen:
            continue

        version = normalize_version(str(requirement.specifier)) if requirement.specifier else DEFAULT_VERSION
        packages.append(
            PackageInfo(
                name=requirement.name,
                version=version,
                ecosystem=Ecosystem.PYPI,
            )
        )
        seen.add(package_key)

    return packages


async def _fetch_json(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    url: str,
) -> tuple[int | None, dict[str, Any] | None]:
    async with semaphore:
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
        message = (
            f"{_service_name_for_url(url)} returned status {response.status_code} "
            f"for {url}."
        )
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
    return "the external package service"

import json

import pytest

from app.models.schemas import Ecosystem, PackageInfo
from app.services.parser import (
    normalize_version,
    parse_package_json,
    parse_requirements_txt,
    resolve_dependency_tree,
)


def test_parse_package_json_with_minimal_nextjs_dependencies():
    package_json = json.dumps(
        {
            "name": "shadowaudit-frontend",
            "private": True,
            "dependencies": {
                "next": "^15.1.0",
                "react": "^19.0.0",
                "react-dom": "^19.0.0",
            },
            "devDependencies": {
                "typescript": "~5.6.3",
                "eslint": ">=9.0.0",
            },
        }
    )

    packages = parse_package_json(package_json)

    assert [package.name for package in packages] == [
        "next",
        "react",
        "react-dom",
        "typescript",
        "eslint",
    ]
    assert [package.version for package in packages] == [
        "15.1.0",
        "19.0.0",
        "19.0.0",
        "5.6.3",
        "9.0.0",
    ]
    assert all(package.ecosystem.value == "npm" for package in packages)


def test_parse_requirements_txt_handles_multiple_formats():
    requirements = """
    # core packages
    fastapi==0.104.1
    uvicorn>=0.24.0
    requests

    -r base.txt
    pytest==7.4.3  # test dependency
    """

    packages = parse_requirements_txt(requirements)

    assert [package.name for package in packages] == [
        "fastapi",
        "uvicorn",
        "requests",
        "pytest",
    ]
    assert [package.version for package in packages] == [
        "0.104.1",
        "0.24.0",
        "latest",
        "7.4.3",
    ]
    assert all(package.ecosystem.value == "pypi" for package in packages)


def test_parse_package_json_raises_on_malformed_json():
    with pytest.raises(json.JSONDecodeError):
        parse_package_json('{"dependencies": {"next": "^15.0.0"')


def test_parse_requirements_txt_with_empty_string_returns_empty_list():
    assert parse_requirements_txt("") == []


@pytest.mark.parametrize(
    ("raw_version", "expected"),
    [
        ("^1.2.3", "1.2.3"),
        (">=2.0", "2.0"),
        ("~3.1", "3.1"),
    ],
)
def test_version_normalization(raw_version, expected):
    assert normalize_version(raw_version) == expected


def test_resolve_dependency_tree_only_fetches_npm_downloads_for_top_level(monkeypatch):
    calls: list[str] = []

    async def fake_fetch_json(client, semaphore, url):
        calls.append(url)

        if url.endswith("/downloads/point/last-week/rootpkg"):
            return 200, {"downloads": 123456}
        if url.endswith("/rootpkg/1.0.0"):
            return 200, {"version": "1.0.0", "dependencies": {"childpkg": "^2.0.0"}}
        if url.endswith("/rootpkg"):
            return 200, {"time": {"1.0.0": "2026-04-01T00:00:00Z"}}

        if url.endswith("/childpkg/2.0.0"):
            return 200, {"version": "2.0.0", "dependencies": {}}
        if url.endswith("/childpkg"):
            return 200, {"time": {"2.0.0": "2026-04-02T00:00:00Z"}}
        if url.endswith("/downloads/point/last-week/childpkg"):
            raise AssertionError("Nested dependencies should not trigger npm downloads lookups.")

        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr("app.services.parser._fetch_json", fake_fetch_json)

    tree = resolve_dependency_tree(
        [PackageInfo(name="rootpkg", version="1.0.0", ecosystem=Ecosystem.NPM)]
    )

    assert tree["rootpkg"]["metadata"]["download_count"] == 123456
    assert tree["rootpkg"]["dependencies"]["childpkg"]["metadata"]["download_count"] is None
    assert not any("downloads/point/last-week/childpkg" in url for url in calls)

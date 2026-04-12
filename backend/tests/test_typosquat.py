from app.models.schemas import Ecosystem, PackageInfo
from app.services.typosquat_detector import (
    calculate_similarity,
    detect_all_typosquats,
    detect_typosquat,
)


def test_calculate_similarity_identical_names_is_one():
    assert calculate_similarity("requests", "requests") == 1.0


def test_calculate_similarity_transposition_is_high():
    assert calculate_similarity("reqeusts", "requests") > 0.85


def test_calculate_similarity_for_different_names_is_low():
    assert calculate_similarity("completely-different", "requests") < 0.5


def test_detect_typosquat_flags_expresss_against_express():
    results = detect_typosquat(
        PackageInfo(name="expresss", version="1.0.0", ecosystem=Ecosystem.NPM)
    )

    assert any(result.similar_to == "express" and result.is_suspicious for result in results)


def test_detect_typosquat_does_not_flag_popular_package_itself():
    results = detect_typosquat(
        PackageInfo(name="express", version="5.0.0", ecosystem=Ecosystem.NPM)
    )

    assert results == []


def test_hyphen_underscore_variation_is_detected():
    results = detect_typosquat(
        PackageInfo(name="python_dateutil", version="2.9.0", ecosystem=Ecosystem.PYPI)
    )

    assert any(result.similar_to == "python-dateutil" for result in results)


def test_homoglyph_typosquat_is_detected():
    results = detect_typosquat(
        PackageInfo(name="req0ests", version="1.0.0", ecosystem=Ecosystem.PYPI)
    )

    assert any(result.similar_to == "requests" and result.is_suspicious for result in results)


def test_detect_all_typosquats_returns_only_suspicious_results():
    packages = [
        PackageInfo(name="expresss", version="1.0.0", ecosystem=Ecosystem.NPM),
        PackageInfo(name="axios", version="1.7.0", ecosystem=Ecosystem.NPM),
    ]

    results = detect_all_typosquats(packages)

    assert all(result.is_suspicious for result in results)
    assert any(result.package_name == "expresss" for result in results)
    assert all(result.package_name != "axios" for result in results)


def test_real_package_name_that_is_not_typosquat_returns_empty():
    results = detect_typosquat(
        PackageInfo(name="axios", version="1.7.0", ecosystem=Ecosystem.NPM)
    )

    assert results == []


def test_legitimate_compound_package_name_is_not_flagged():
    results = detect_typosquat(
        PackageInfo(name="event-stream", version="4.0.1", ecosystem=Ecosystem.NPM)
    )

    assert all(result.similar_to != "stream" for result in results)

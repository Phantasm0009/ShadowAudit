from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from app.models.schemas import Ecosystem, PackageInfo, TyposquatResult

POPULAR_PACKAGES_PATH = Path(__file__).resolve().parents[1] / "data" / "popular_packages.json"
HOMOGLYPH_TRANSLATION = str.maketrans(
    {
        "0": "o",
        "1": "l",
        "3": "e",
        "5": "s",
        "7": "t",
        "@": "a",
    }
)
SUSPICIOUS_THRESHOLD = 0.85
SUSPICIOUS_AFFIX_TOKENS = {
    "cli",
    "core",
    "dev",
    "js",
    "lib",
    "node",
    "npm",
    "official",
    "package",
    "pkg",
    "pro",
    "py",
    "python",
    "sdk",
    "secure",
    "tool",
    "tools",
}


@lru_cache
def load_popular_packages() -> dict[str, set[str]]:
    payload = json.loads(POPULAR_PACKAGES_PATH.read_text(encoding="utf-8"))
    return {
        "npm": set(payload.get("npm") or []),
        "pypi": set(payload.get("pypi") or []),
    }


def calculate_similarity(name1: str, name2: str) -> float:
    left = name1.strip().lower()
    right = name2.strip().lower()

    if left == right:
        return 1.0

    candidate_pairs = [
        (left, right),
        (_strip_scope(left), _strip_scope(right)),
        (_normalize_delimiters(left), _normalize_delimiters(right)),
        (_normalize_homoglyphs(left), _normalize_homoglyphs(right)),
        (_normalize_for_distance(left), _normalize_for_distance(right)),
    ]

    similarity = max(_levenshtein_similarity(first, second) for first, second in candidate_pairs)

    if _normalize_delimiters(left) == _normalize_delimiters(right):
        similarity = max(similarity, 0.97)

    if _normalize_homoglyphs(_strip_scope(left)) == _normalize_homoglyphs(_strip_scope(right)):
        similarity = max(similarity, 0.96)

    if _is_single_transposition(_normalize_for_distance(left), _normalize_for_distance(right)):
        similarity = max(similarity, 0.94)

    if _is_prefix_suffix_variation(left, right):
        similarity = max(similarity, 0.9)

    if _is_scope_impersonation(left, right):
        similarity = max(similarity, 0.98)

    return round(min(similarity, 1.0), 4)


def detect_typosquat(package: PackageInfo) -> list[TyposquatResult]:
    popular_packages = load_popular_packages()[package.ecosystem.value]
    package_name = package.name.strip()
    package_name_lower = package_name.lower()
    popular_packages_lower = {popular_package.lower() for popular_package in popular_packages}

    if package_name_lower in popular_packages_lower:
        return []

    matches: list[TyposquatResult] = []
    for popular_package in popular_packages:
        similarity = calculate_similarity(package_name, popular_package)
        is_suspicious = similarity > SUSPICIOUS_THRESHOLD
        if not is_suspicious:
            continue

        matches.append(
            TyposquatResult(
                package_name=package_name,
                similar_to=popular_package,
                similarity_score=similarity,
                is_suspicious=True,
            )
        )

    matches.sort(key=lambda result: (-result.similarity_score, result.similar_to))
    return matches


def detect_all_typosquats(packages: list[PackageInfo]) -> list[TyposquatResult]:
    suspicious_matches: list[TyposquatResult] = []
    for package in packages:
        suspicious_matches.extend(
            result for result in detect_typosquat(package) if result.is_suspicious
        )

    return suspicious_matches


def _normalize_homoglyphs(name: str) -> str:
    return name.translate(HOMOGLYPH_TRANSLATION)


def _normalize_delimiters(name: str) -> str:
    return name.replace("_", "-")


def _strip_scope(name: str) -> str:
    if name.startswith("@") and "/" in name:
        return name.split("/", 1)[1]
    return name


def _normalize_for_distance(name: str) -> str:
    normalized = _normalize_homoglyphs(_normalize_delimiters(_strip_scope(name)))
    return "".join(character for character in normalized if character.isalnum())


def _levenshtein_similarity(left: str, right: str) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0

    distance = _levenshtein_distance(left, right)
    return 1 - (distance / max(len(left), len(right)))


def _levenshtein_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left

    previous_row = list(range(len(right) + 1))
    for index, left_character in enumerate(left, start=1):
        current_row = [index]
        for inner_index, right_character in enumerate(right, start=1):
            insertions = previous_row[inner_index] + 1
            deletions = current_row[inner_index - 1] + 1
            substitutions = previous_row[inner_index - 1] + (left_character != right_character)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def _is_single_transposition(left: str, right: str) -> bool:
    if len(left) != len(right) or len(left) < 2:
        return False

    differences = [index for index, (a_char, b_char) in enumerate(zip(left, right)) if a_char != b_char]
    if len(differences) != 2:
        return False

    first, second = differences
    return second == first + 1 and left[first] == right[second] and left[second] == right[first]


def _is_prefix_suffix_variation(left: str, right: str) -> bool:
    normalized_left = _strip_scope(_normalize_homoglyphs(left))
    normalized_right = _strip_scope(_normalize_homoglyphs(right))

    shorter, longer = sorted((normalized_left, normalized_right), key=len)
    if len(longer) - len(shorter) > 8 or len(shorter) < 4:
        return False

    if longer.startswith(shorter):
        extra = longer[len(shorter):]
        return _is_suspicious_affix(extra)

    if longer.endswith(shorter):
        extra = longer[:-len(shorter)]
        return _is_suspicious_affix(extra)

    return False


def _is_scope_impersonation(left: str, right: str) -> bool:
    left_is_scoped = left.startswith("@") and "/" in left
    right_is_scoped = right.startswith("@") and "/" in right
    return (left_is_scoped or right_is_scoped) and _strip_scope(left) == _strip_scope(right)


def _is_suspicious_affix(extra: str) -> bool:
    stripped = extra.strip("-_")
    if not stripped:
        return True

    if stripped[0].isdigit() or stripped[-1].isdigit():
        return True

    tokens = [token for token in re.split(r"[-_]+", stripped.lower()) if token]
    if not tokens:
        return False

    return any(token in SUSPICIOUS_AFFIX_TOKENS for token in tokens)

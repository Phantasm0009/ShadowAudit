from __future__ import annotations

import re

CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
PROJECT_NAME_PATTERN = re.compile(r"[^A-Za-z0-9 ._/@-]+")


def sanitize_text(
    value: str,
    *,
    max_length: int | None = None,
    collapse_whitespace: bool = True,
) -> str:
    cleaned = CONTROL_CHAR_PATTERN.sub("", value or "")
    if collapse_whitespace:
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if max_length is not None:
        cleaned = cleaned[:max_length]

    return cleaned


def sanitize_manifest_content(value: str) -> str:
    cleaned = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = CONTROL_CHAR_PATTERN.sub("", cleaned)
    return cleaned


def sanitize_project_name(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = sanitize_text(value, max_length=120)
    cleaned = PROJECT_NAME_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def sanitize_string_list(values: list[str]) -> list[str]:
    sanitized_values: list[str] = []
    for value in values:
        cleaned = sanitize_text(str(value), max_length=120)
        if cleaned:
            sanitized_values.append(cleaned)

    return sanitized_values

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def build_error_payload(
    error_type: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "error": error_type,
        "message": message,
        "details": details or {},
    }


@dataclass(slots=True)
class ScanError(Exception):
    message: str = "The scan could not be completed."
    details: dict[str, Any] = field(default_factory=dict)
    status_code: int = 400
    error_type: str = "scan_error"

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)

    def to_payload(self) -> dict[str, Any]:
        return build_error_payload(self.error_type, self.message, self.details)


class ParsingError(ScanError):
    def __init__(
        self,
        message: str = "The dependency file could not be parsed.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            details=details or {},
            status_code=400,
            error_type="parsing_error",
        )


class ExternalAPIError(ScanError):
    def __init__(
        self,
        message: str = "An external dependency service could not be reached.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            details=details or {},
            status_code=502,
            error_type="external_api_error",
        )


class RateLimitError(ScanError):
    def __init__(
        self,
        message: str = "Too many scan requests were received from this IP address.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            details=details or {},
            status_code=429,
            error_type="rate_limit_error",
        )

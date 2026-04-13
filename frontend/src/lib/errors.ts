"use client";

import axios from "axios";

import { ApiErrorResponse } from "@/lib/types";

export interface AppError extends Error {
  status?: number;
  type?: string;
  details?: Record<string, unknown>;
}

export function normalizeError(
  error: unknown,
  fallbackMessage = "Something went wrong.",
): AppError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiPayload = error.response?.data;
    const normalized = new Error(
      apiPayload?.message || error.message || fallbackMessage,
    ) as AppError;
    normalized.status = error.response?.status;
    normalized.type = apiPayload?.error;
    normalized.details = apiPayload?.details;

    if (!error.response) {
      const browserOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      normalized.type = browserOffline ? "network_offline" : "network_error";
      normalized.message = browserOffline
        ? "You appear to be offline. Reconnect before trying again."
        : error.message || fallbackMessage;
    }

    return normalized;
  }

  if (error instanceof Error) {
    return error as AppError;
  }

  return new Error(fallbackMessage) as AppError;
}

export function isNotFoundError(error: unknown): boolean {
  const normalized = normalizeError(error, "Not found.");
  return normalized.status === 404 || normalized.type === "not_found";
}

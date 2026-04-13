"use client";

import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { ScanRequest, ScanResult } from "@/lib/types";

export function useScan() {
  const mutation = useMutation<ScanResult, Error, ScanRequest>({
    mutationFn: async (payload) => {
      const response = await api.post<ScanResult>("/api/v1/scan", payload);
      return response.data;
    },
  });

  return {
    mutate: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error ? normalizeError(mutation.error, "Scan failed.") : null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

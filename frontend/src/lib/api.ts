import axios from "axios";

const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const normalizedApiBaseUrl =
  rawApiBaseUrl.replace(/\/$/, "").endsWith("/api")
    ? rawApiBaseUrl.replace(/\/$/, "").slice(0, -4)
    : rawApiBaseUrl.replace(/\/$/, "");

function buildRequestUrl(requestPath: string): string {
  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }

  const path = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const origin =
    normalizedApiBaseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  return `${origin}${path}`;
}

export const api = axios.create({
  timeout: 65000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (config.url) {
    config.url = buildRequestUrl(config.url);
  }

  return config;
});

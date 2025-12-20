import { hc } from "hono/client";
import type { AppType } from "@amigo/api";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // Client-side: use relative URL
    return "";
  }
  // Server-side: use environment variable
  return process.env["API_URL"] ?? "http://192.168.15.32:3001";
};

export const client = hc<AppType>(getBaseUrl());

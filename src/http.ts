/**
 * HTTP glue shared by the router and the handlers: building JSON responses and
 * parsing/validating a JSON request body. Kept apart so both sides format
 * responses the same way and request-shape checks have one home.
 */

import { ApiError } from "./types.ts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
} as const;

/** A JSON `Response`. `extraHeaders` is merged after the content-type. */
export function json(
  data: unknown,
  status = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/** Render an {@link ApiError} as `{ "error": message }` with its status. */
export function errorResponse(err: ApiError): Response {
  return new Response(JSON.stringify({ error: err.message }), {
    status: err.status,
    headers: JSON_HEADERS,
  });
}

/** Parse the request body as a JSON object. Throws {@link ApiError} 400 otherwise. */
export async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ApiError(400, "request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(400, "request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Require `key` to be a non-empty string; returns it trimmed. */
export function requireString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(
      400,
      `"${key}" is required and must be a non-empty string`,
    );
  }
  return value.trim();
}

/** `key` may be absent (→ `undefined`) but if present must be a string. */
export function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `"${key}" must be a string`);
  }
  return value;
}

/** `key` may be absent (→ `undefined`) but if present must be a string array. */
export function optionalStringArray(
  input: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ApiError(400, `"${key}" must be an array of strings`);
  }
  return value as string[];
}

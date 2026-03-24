/**
 * Shared error utilities for consistent error creation and formatting
 * across the Paperclip codebase (server, adapters, CLI, UI).
 *
 * These complement the existing `errorMessage()` in type-guards.ts
 * and mirror the server's error patterns so every package speaks the
 * same error dialect without depending on the server module.
 */

// ---------------------------------------------------------------------------
// HttpError — portable version of the server-side class
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Factory functions — one thing each, named after intent
// ---------------------------------------------------------------------------

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "Forbidden"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, message, details);
}

export function unprocessable(message: string, details?: unknown): HttpError {
  return new HttpError(422, message, details);
}

export function internalError(message = "Internal server error", details?: unknown): HttpError {
  return new HttpError(500, message, details);
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown caught value to an HttpError.
 *
 * Works with both this shared class and the server's own HttpError
 * (structural check on `status` + `message`, not an `instanceof` check)
 * so callers never need to care which module threw.
 */
export function isHttpError(value: unknown): value is HttpError {
  if (value instanceof HttpError) return true;
  return value instanceof Error && typeof (value as unknown as Record<string, unknown>).status === "number";
}

// ---------------------------------------------------------------------------
// API error response shape — the wire format every client should expect
// ---------------------------------------------------------------------------

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Builds a standard `ApiErrorResponse` from an HttpError.
 * Keeps the `details` key out of the payload when it is absent,
 * matching the server's error-handler behavior.
 */
export function toApiErrorResponse(err: HttpError): ApiErrorResponse {
  return {
    error: err.message,
    ...(err.details !== undefined ? { details: err.details } : {}),
  };
}

/**
 * Wraps an unknown thrown value into an HttpError.
 *
 * - If it is already an HttpError, returns it as-is.
 * - If it is a plain Error, wraps it as a 500 with the original message.
 * - Anything else becomes a 500 with `String(value)` as the message.
 *
 * Useful in catch blocks where the thrown type is `unknown`.
 */
export function asHttpError(value: unknown): HttpError {
  if (value instanceof HttpError) return value;
  if (isHttpError(value)) {
    return new HttpError((value as HttpError).status, value.message, (value as HttpError).details);
  }
  if (value instanceof Error) return new HttpError(500, value.message);
  return new HttpError(500, String(value));
}

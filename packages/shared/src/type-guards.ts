import type { EnvBinding, EnvPlainBinding, EnvSecretRefBinding } from "./types/index.js";

/**
 * Narrows an unknown value to a plain object (not an array, not null).
 *
 * Replaces 7+ duplicate implementations scattered across the codebase.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Discriminated-union guard for `EnvPlainBinding` (`{ type: "plain", value: string }`).
 */
export function isEnvPlainBinding(binding: EnvBinding): binding is EnvPlainBinding {
  return typeof binding === "object" && binding !== null && binding.type === "plain";
}

/**
 * Discriminated-union guard for `EnvSecretRefBinding` (`{ type: "secret_ref", secretId: string }`).
 */
export function isEnvSecretRefBinding(binding: EnvBinding): binding is EnvSecretRefBinding {
  return typeof binding === "object" && binding !== null && binding.type === "secret_ref";
}

/**
 * Guard for legacy plaintext string bindings in the `EnvBinding` union.
 */
export function isEnvStringBinding(binding: EnvBinding): binding is string {
  return typeof binding === "string";
}

/**
 * Safely extracts a human-readable message from an unknown caught value.
 *
 * Replaces 103 occurrences of `err instanceof Error ? err.message : String(err)`.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Type-narrowing predicate that filters out `null` and `undefined`.
 *
 * Usage: `items.filter(isNonNullable)` instead of `items.filter(Boolean)`.
 * Unlike `Boolean`, this properly narrows the type.
 */
export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

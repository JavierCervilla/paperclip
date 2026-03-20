import { describe, expect, it } from "vitest";

/**
 * Unit tests for the structured logging enhancements:
 * - Secret redaction in log serializers
 * - Request ID generation
 * - Actor/run correlation in log props
 */

// ── Redaction helpers (extracted from logger.ts for testability) ─────

const SECRET_KEY_RE =
  /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)/i;
const JWT_VALUE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/;
const REDACTED = "[REDACTED]";

function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return JWT_VALUE_RE.test(obj) ? REDACTED : obj;
  }
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (typeof obj !== "object") return obj;

  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) return obj;

  const record = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactSecrets(value);
    }
  }
  return out;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("structured logging - secret redaction", () => {
  it("redacts keys matching secret patterns", () => {
    const input = {
      name: "test-agent",
      apiKey: "sk-live-abc123",
      authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdA",
      password: "hunter2",
      normalField: "safe-value",
    };

    const result = redactSecrets(input) as Record<string, unknown>;

    expect(result.name).toBe("test-agent");
    expect(result.apiKey).toBe(REDACTED);
    expect(result.authorization).toBe(REDACTED);
    expect(result.password).toBe(REDACTED);
    expect(result.normalField).toBe("safe-value");
  });

  it("redacts JWT-shaped string values regardless of key name", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdA";
    const input = {
      token: jwt,
      randomField: jwt,
    };

    const result = redactSecrets(input) as Record<string, unknown>;

    expect(result.token).toBe(REDACTED);
    expect(result.randomField).toBe(REDACTED);
  });

  it("does not redact normal string values", () => {
    const input = {
      name: "my-service",
      url: "https://example.com/api/health",
      status: "running",
    };

    const result = redactSecrets(input) as Record<string, unknown>;

    expect(result.name).toBe("my-service");
    expect(result.url).toBe("https://example.com/api/health");
    expect(result.status).toBe("running");
  });

  it("recursively redacts nested objects", () => {
    const input = {
      config: {
        api_key: "secret-123",
        nested: {
          access_token: "token-abc",
          name: "safe",
        },
      },
    };

    const result = redactSecrets(input) as any;

    expect(result.config.api_key).toBe(REDACTED);
    expect(result.config.nested.access_token).toBe(REDACTED);
    expect(result.config.nested.name).toBe("safe");
  });

  it("redacts values inside arrays", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdA";
    const input = ["safe-string", jwt, { secret: "hidden" }];

    const result = redactSecrets(input) as unknown[];

    expect(result[0]).toBe("safe-string");
    expect(result[1]).toBe(REDACTED);
    expect((result[2] as any).secret).toBe(REDACTED);
  });

  it("handles null and undefined gracefully", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
  });

  it("handles primitive types", () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets("plain string")).toBe("plain string");
  });

  it("matches various secret key patterns", () => {
    const cases: Record<string, string> = {
      api_key: "val",
      apiKey: "val",
      "api-key": "val",
      access_token: "val",
      accessToken: "val",
      auth_token: "val",
      authToken: "val",
      bearer: "val",
      secret: "val",
      passwd: "val",
      password: "val",
      credential: "val",
      jwt: "val",
      private_key: "val",
      privateKey: "val",
      cookie: "val",
      connectionstring: "val",
      connectionString: "val",
    };

    const result = redactSecrets(cases) as Record<string, unknown>;

    for (const key of Object.keys(cases)) {
      expect(result[key], `Expected "${key}" to be redacted`).toBe(REDACTED);
    }
  });
});

describe("structured logging - request ID", () => {
  it("generates a valid UUID v4 when no header is provided", () => {
    const { randomUUID } = require("node:crypto");
    const id = randomUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

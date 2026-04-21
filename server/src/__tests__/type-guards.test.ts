import { describe, expect, it } from "vitest";
import {
  isPlainObject,
  isEnvPlainBinding,
  isEnvSecretRefBinding,
  isEnvStringBinding,
  errorMessage,
  isNonNullable,
} from "@paperclipai/shared";

describe("isPlainObject", () => {
  it("accepts a plain object literal", () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("accepts Object.create(null)", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("rejects null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isPlainObject([1, 2])).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isPlainObject("hello")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });

  it("rejects class instances", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});

describe("EnvBinding guards", () => {
  const plain = { type: "plain" as const, value: "hello" };
  const secretRef = { type: "secret_ref" as const, secretId: "abc-123" };
  const legacy = "raw-string-value";

  describe("isEnvPlainBinding", () => {
    it("matches plain bindings", () => {
      expect(isEnvPlainBinding(plain)).toBe(true);
    });
    it("rejects secret ref bindings", () => {
      expect(isEnvPlainBinding(secretRef)).toBe(false);
    });
    it("rejects string bindings", () => {
      expect(isEnvPlainBinding(legacy)).toBe(false);
    });
  });

  describe("isEnvSecretRefBinding", () => {
    it("matches secret ref bindings", () => {
      expect(isEnvSecretRefBinding(secretRef)).toBe(true);
    });
    it("rejects plain bindings", () => {
      expect(isEnvSecretRefBinding(plain)).toBe(false);
    });
    it("rejects string bindings", () => {
      expect(isEnvSecretRefBinding(legacy)).toBe(false);
    });
  });

  describe("isEnvStringBinding", () => {
    it("matches legacy string bindings", () => {
      expect(isEnvStringBinding(legacy)).toBe(true);
    });
    it("rejects object bindings", () => {
      expect(isEnvStringBinding(plain)).toBe(false);
      expect(isEnvStringBinding(secretRef)).toBe(false);
    });
  });
});

describe("errorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns strings as-is", () => {
    expect(errorMessage("something broke")).toBe("something broke");
  });

  it("stringifies other values", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });

  it("extracts message from subclassed errors", () => {
    class AppError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "AppError";
      }
    }
    expect(errorMessage(new AppError("custom"))).toBe("custom");
  });
});

describe("isNonNullable", () => {
  it("passes through defined values", () => {
    expect(isNonNullable(0)).toBe(true);
    expect(isNonNullable("")).toBe(true);
    expect(isNonNullable(false)).toBe(true);
    expect(isNonNullable({})).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isNonNullable(null)).toBe(false);
    expect(isNonNullable(undefined)).toBe(false);
  });

  it("narrows types in filter", () => {
    const items: (string | null | undefined)[] = ["a", null, "b", undefined, "c"];
    const result: string[] = items.filter(isNonNullable);
    expect(result).toEqual(["a", "b", "c"]);
  });
});

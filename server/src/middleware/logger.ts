import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pino from "pino";
import { pinoHttp } from "pino-http";
import type { IncomingMessage } from "node:http";
import { readConfigFile } from "../config-file.js";
import { resolveDefaultLogsDir, resolveHomeAwarePath } from "../home-paths.js";

function resolveServerLogDir(): string {
  const envOverride = process.env.PAPERCLIP_LOG_DIR?.trim();
  if (envOverride) return resolveHomeAwarePath(envOverride);

  const fileLogDir = readConfigFile()?.logging.logDir?.trim();
  if (fileLogDir) return resolveHomeAwarePath(fileLogDir);

  return resolveDefaultLogsDir();
}

const logDir = resolveServerLogDir();
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "server.log");

const sharedOpts = {
  translateTime: "HH:MM:ss",
  ignore: "pid,hostname",
  singleLine: true,
};

/**
 * Regex matching header/body keys that likely hold sensitive values.
 * Kept in sync with server/src/redaction.ts SECRET_PAYLOAD_KEY_RE.
 */
const SECRET_KEY_RE =
  /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)/i;

/** Matches compact JWTs (3 or 4 dot-separated base64url segments). */
const JWT_VALUE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/;

const REDACTED = "[REDACTED]";

/**
 * Recursively redact values whose keys match secret patterns or whose
 * values look like JWTs.  Applied via Pino serializers so the raw
 * objects are never written to any transport.
 */
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

export const logger = pino(
  {
    level: "debug",
    serializers: {
      // Redact sensitive fields from arbitrary structured data attached to logs
      reqBody: (val: unknown) => redactSecrets(val),
      reqQuery: (val: unknown) => redactSecrets(val),
      errorContext: (val: unknown) => redactSecrets(val),
    },
  },
  pino.transport({
    targets: [
      {
        target: "pino-pretty",
        options: { ...sharedOpts, ignore: "pid,hostname,req,res,responseTime", colorize: true, destination: 1 },
        level: "info",
      },
      {
        target: "pino-pretty",
        options: {
          ...sharedOpts,
          ignore: "pid,hostname,req,res,responseTime",
          colorize: false,
          destination: logFile,
          mkdir: true,
        },
        level: "debug",
      },
    ],
  }),
);

export const httpLogger = pinoHttp({
  logger,

  // Generate a unique request ID for every incoming request.
  // Respects an existing X-Request-Id header (e.g. from a reverse proxy),
  // otherwise mints a new UUID v4.
  genReqId(req: IncomingMessage) {
    return (req.headers["x-request-id"] as string) || randomUUID();
  },

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    const ctx = (res as any).__errorContext;
    const errMsg = ctx?.error?.message || err?.message || (res as any).err?.message || "unknown error";
    return `${req.method} ${req.url} ${res.statusCode} — ${errMsg}`;
  },

  customProps(req, res) {
    const props: Record<string, unknown> = {};

    // ── Actor & run correlation ──────────────────────────────────
    const actor = (req as any).actor as
      | { type?: string; agentId?: string; userId?: string; runId?: string }
      | undefined;
    if (actor) {
      if (actor.type && actor.type !== "none") props.actorType = actor.type;
      if (actor.agentId) props.agentId = actor.agentId;
      if (actor.userId) props.userId = actor.userId;
      if (actor.runId) props.runId = actor.runId;
    }

    // ── Error context on 4xx/5xx ─────────────────────────────────
    if (res.statusCode >= 400) {
      const ctx = (res as any).__errorContext;
      if (ctx) {
        return {
          ...props,
          errorContext: ctx.error,
          reqBody: ctx.reqBody,
          reqParams: ctx.reqParams,
          reqQuery: ctx.reqQuery,
        };
      }
      const { body, params, query } = req as any;
      if (body && typeof body === "object" && Object.keys(body).length > 0) {
        props.reqBody = body;
      }
      if (params && typeof params === "object" && Object.keys(params).length > 0) {
        props.reqParams = params;
      }
      if (query && typeof query === "object" && Object.keys(query).length > 0) {
        props.reqQuery = query;
      }
      if ((req as any).route?.path) {
        props.routePath = (req as any).route.path;
      }
    }

    return props;
  },
});

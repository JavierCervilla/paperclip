import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { instanceUserRoles, invites } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { serverVersion } from "../version.js";
import { Sentry, sentryEnabled } from "../sentry.js";

const startedAt = Date.now();

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
  } = {
    deploymentMode: "local_trusted",
    deploymentExposure: "private",
    authReady: true,
    companyDeletionEnabled: true,
  },
) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const requestStart = Date.now();

    if (!db) {
      res.json({
        status: "ok",
        version: serverVersion,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      });
      return;
    }

    let dbStatus: "connected" | "disconnected" = "disconnected";
    let dbLatencyMs: number | null = null;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }

    const healthy = dbStatus === "connected";

    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    let bootstrapInviteActive = false;
    if (healthy && opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";

      if (bootstrapStatus === "bootstrap_pending") {
        const now = new Date();
        const inviteCount = await db
          .select({ count: count() })
          .from(invites)
          .where(
            and(
              eq(invites.inviteType, "bootstrap_ceo"),
              isNull(invites.revokedAt),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, now),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0));
        bootstrapInviteActive = inviteCount > 0;
      }
    }

    const responseTimeMs = Date.now() - requestStart;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      version: serverVersion,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      responseTimeMs,
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      bootstrapStatus,
      bootstrapInviteActive,
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
    });
  });

  router.get("/sentry", (_req, res) => {
    res.json({ sentryEnabled });
  });

  router.post("/debug-sentry", (_req, res) => {
    if (!sentryEnabled) {
      res.status(400).json({ error: "Sentry is not enabled (SENTRY_DSN not set)" });
      return;
    }
    const eventId = Sentry.captureMessage("Paperclip test error — verifying Sentry integration");
    res.json({ ok: true, eventId });
  });

  return router;
}

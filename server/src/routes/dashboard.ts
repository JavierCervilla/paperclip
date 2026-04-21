import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { dashboardService } from "../services/dashboard.js";
import { heartbeatStatsService } from "../services/heartbeat-stats.js";
import { assertCompanyAccess } from "./authz.js";

export function dashboardRoutes(db: Db) {
  const router = Router();
  const svc = dashboardService(db);
  const hbStats = heartbeatStatsService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  router.get("/companies/:companyId/heartbeat-stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const periodDays = Math.max(1, Math.min(90, parseInt(req.query.periodDays as string, 10) || 14));
    const stats = await hbStats.getStats(companyId, periodDays);
    res.json(stats);
  });

  return router;
}

import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { createWebhookSchema, updateWebhookSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { webhookService, dispatchWebhookEvent } from "../services/webhooks.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/** Redact the webhook secret in API responses. */
function redactSecret<T extends { secret: string | null }>(webhook: T): T {
  return {
    ...webhook,
    secret: webhook.secret ? "••••••••" : null,
  };
}

export function webhookRoutes(db: Db) {
  const router = Router();
  const svc = webhookService(db);

  // List webhooks for a company
  router.get("/companies/:companyId/webhooks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result.map(redactSecret));
  });

  // Create a webhook
  router.post("/companies/:companyId/webhooks", validate(createWebhookSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const webhook = await svc.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "webhook.created",
      entityType: "webhook",
      entityId: webhook.id,
      details: { url: webhook.url, eventTypes: webhook.eventTypes },
    });

    res.status(201).json(redactSecret(webhook));
  });

  // Get a webhook by ID
  router.get("/webhooks/:id", async (req, res) => {
    const webhook = await svc.getById(req.params.id as string);
    assertCompanyAccess(req, webhook.companyId);
    res.json(redactSecret(webhook));
  });

  // Update a webhook
  router.patch("/webhooks/:id", validate(updateWebhookSchema), async (req, res) => {
    const existing = await svc.getById(req.params.id as string);
    assertCompanyAccess(req, existing.companyId);
    assertBoard(req);

    const updated = await svc.update(req.params.id as string, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "webhook.updated",
      entityType: "webhook",
      entityId: updated.id,
      details: { url: updated.url, active: updated.active },
    });

    res.json(redactSecret(updated));
  });

  // Delete a webhook
  router.delete("/webhooks/:id", async (req, res) => {
    const existing = await svc.getById(req.params.id as string);
    assertCompanyAccess(req, existing.companyId);
    assertBoard(req);

    await svc.delete(req.params.id as string);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "webhook.deleted",
      entityType: "webhook",
      entityId: existing.id,
      details: { url: existing.url },
    });

    res.status(204).end();
  });

  // List deliveries for a webhook
  router.get("/webhooks/:id/deliveries", async (req, res) => {
    const existing = await svc.getById(req.params.id as string);
    assertCompanyAccess(req, existing.companyId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const deliveries = await svc.listDeliveries(req.params.id as string, { limit, offset });
    res.json(deliveries);
  });

  // Get a specific delivery
  router.get("/webhook-deliveries/:id", async (req, res) => {
    const delivery = await svc.getDeliveryById(req.params.id as string);
    const webhook = await svc.getById(delivery.webhookId);
    assertCompanyAccess(req, webhook.companyId);
    res.json(delivery);
  });

  // Send a test event to a webhook
  router.post("/webhooks/:id/test", async (req, res) => {
    const webhook = await svc.getById(req.params.id as string);
    assertCompanyAccess(req, webhook.companyId);
    assertBoard(req);

    const testEvent = {
      eventId: randomUUID(),
      eventType: "webhook.test",
      companyId: webhook.companyId,
      entityType: "webhook",
      entityId: webhook.id,
      actorType: "user" as const,
      actorId: getActorInfo(req).actorId,
      occurredAt: new Date().toISOString(),
      payload: { test: true, message: "This is a test webhook delivery." },
    };

    await dispatchWebhookEvent(db, testEvent);
    res.json({ ok: true, message: "Test event dispatched." });
  });

  // Event log / audit trail: list all deliveries across all webhooks for a company
  router.get("/companies/:companyId/webhook-deliveries", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Get all webhooks for company, then get their deliveries
    const companyWebhooks = await svc.list(companyId);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.eventType as string | undefined;

    // Collect deliveries from all webhooks
    const allDeliveries = [];
    for (const webhook of companyWebhooks) {
      const deliveries = await svc.listDeliveries(webhook.id, { limit: limit + offset });
      for (const d of deliveries) {
        if (eventType && d.eventType !== eventType) continue;
        allDeliveries.push({ ...d, webhookUrl: webhook.url });
      }
    }

    // Sort by createdAt desc and paginate
    allDeliveries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(allDeliveries.slice(offset, offset + limit));
  });

  return router;
}

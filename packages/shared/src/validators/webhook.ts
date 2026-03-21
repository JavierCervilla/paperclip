import { z } from "zod";
import { WEBHOOK_EVENT_TYPES, WEBHOOK_DELIVERY_STATUSES } from "../constants.js";

export const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).max(256).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional().default(true),
});

export type CreateWebhook = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(16).max(256).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

export type UpdateWebhook = z.infer<typeof updateWebhookSchema>;

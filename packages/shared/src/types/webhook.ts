export interface Webhook {
  id: string;
  companyId: string;
  url: string;
  secret: string | null;
  description: string | null;
  eventTypes: string[] | null;
  projectId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  statusCode: number | null;
  responseBody: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";

export interface CollectorResult {
  serviceId: string;
  serviceName: string;
  type: "http" | "docker" | "database" | "blockchain" | "dokploy";
  status: ServiceStatus;
  latencyMs?: number;
  metadata: Record<string, unknown>;
  checkedAt: string;
  error?: string;
}

export interface Collector {
  collect(): Promise<CollectorResult[]>;
}

export async function runAllCollectors(collectors: Collector[]): Promise<CollectorResult[]> {
  const results = await Promise.allSettled(collectors.map((c) => c.collect()));
  const all: CollectorResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      all.push(...r.value);
    }
    // rejected: skip silently (each collector should not throw)
  }
  return all;
}

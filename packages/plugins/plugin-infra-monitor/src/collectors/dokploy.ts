import type { Collector, CollectorResult, ServiceStatus } from "./index.js";

interface DokployCollectorOptions {
  baseUrl: string;
  apiKey: string;
}

type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface DokployApplication {
  applicationId?: string;
  name?: string;
  appStatus?: string;
  [key: string]: unknown;
}

function mapDokployStatus(appStatus: string | undefined): ServiceStatus {
  switch (appStatus) {
    case "running":
      return "healthy";
    case "idle":
    case "error":
      return "down";
    case "building":
    case "deploying":
      return "degraded";
    default:
      return "unknown";
  }
}

export class DokployCollector implements Collector {
  private options: DokployCollectorOptions;
  private fetcher: HttpFetcher;

  constructor(options: DokployCollectorOptions, fetcher: HttpFetcher) {
    this.options = options;
    this.fetcher = fetcher;
  }

  async collect(): Promise<CollectorResult[]> {
    const { baseUrl, apiKey } = this.options;
    const checkedAt = new Date().toISOString();

    if (!baseUrl) {
      return [];
    }

    try {
      const response = await this.fetcher(`${baseUrl}/api/applications.all`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        return [
          {
            serviceId: "dokploy-api",
            serviceName: "Dokploy API",
            type: "dokploy",
            status: "unknown",
            metadata: { baseUrl, statusCode: response.status },
            checkedAt,
            error: `Dokploy API ${response.status}: ${body.slice(0, 200)}`,
          },
        ];
      }

      const apps = (await response.json()) as DokployApplication[];

      return apps.map((app) => ({
        serviceId: `dokploy-${app.applicationId ?? app.name ?? "unknown"}`,
        serviceName: app.name ?? app.applicationId ?? "Unknown App",
        type: "dokploy" as const,
        status: mapDokployStatus(typeof app.appStatus === "string" ? app.appStatus : undefined),
        metadata: { appStatus: app.appStatus, applicationId: app.applicationId },
        checkedAt,
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return [
        {
          serviceId: "dokploy-api",
          serviceName: "Dokploy API",
          type: "dokploy",
          status: "unknown",
          metadata: { baseUrl },
          checkedAt,
          error: errorMsg,
        },
      ];
    }
  }
}

import type { Collector, CollectorResult, ServiceStatus } from "./index.js";

interface HttpCollectorOptions {
  serviceId: string;
  serviceName: string;
  url: string;
  timeoutMs?: number;
}

type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpCollector implements Collector {
  private options: HttpCollectorOptions;
  private fetcher: HttpFetcher;

  constructor(options: HttpCollectorOptions, fetcher: HttpFetcher) {
    this.options = options;
    this.fetcher = fetcher;
  }

  async collect(): Promise<CollectorResult[]> {
    const { serviceId, serviceName, url, timeoutMs = 10000 } = this.options;
    const checkedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "GET",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = Date.now() - start;
      const statusCode = response.status;

      let status: ServiceStatus;
      if (statusCode >= 200 && statusCode < 300) {
        status = "healthy";
      } else if (statusCode >= 500) {
        status = "down";
      } else {
        status = "degraded";
      }

      return [
        {
          serviceId,
          serviceName,
          type: "http",
          status,
          latencyMs,
          metadata: { statusCode, url },
          checkedAt,
        },
      ];
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return [
        {
          serviceId,
          serviceName,
          type: "http",
          status: "down",
          latencyMs,
          metadata: { url },
          checkedAt,
          error: errorMsg,
        },
      ];
    }
  }
}

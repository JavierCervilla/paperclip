import type { Collector, CollectorResult } from "./index.js";

interface DatabaseCollectorOptions {
  serviceId: string;
  serviceName: string;
  type: "postgres" | "redis" | "mysql";
  connectionString: string;
}

type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class DatabaseCollector implements Collector {
  private options: DatabaseCollectorOptions;
  // fetcher kept for future Phase 3 implementation
  private _fetcher: HttpFetcher;

  constructor(options: DatabaseCollectorOptions, fetcher: HttpFetcher) {
    this.options = options;
    this._fetcher = fetcher;
  }

  async collect(): Promise<CollectorResult[]> {
    const { serviceId, serviceName, type } = this.options;
    const checkedAt = new Date().toISOString();

    // Phase 3 stub: direct DB connectivity requires native client libraries
    // which cannot be imported in the plugin worker (http-only environment).
    // For now, we return unknown with an informational message.
    return [
      {
        serviceId,
        serviceName,
        type: "database",
        status: "unknown",
        metadata: { dbType: type },
        checkedAt,
        error: "Database connectivity check requires direct access (Phase 3 implementation).",
      },
    ];
  }
}

import type { Collector, CollectorResult, ServiceStatus } from "./index.js";

interface DockerCollectorOptions {
  dockerHost?: string;
  filterLabel?: string;
}

type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface DockerContainer {
  Id?: string;
  Names?: string[];
  State?: string;
  Status?: string;
  Labels?: Record<string, string>;
  [key: string]: unknown;
}

function mapDockerState(state: string | undefined): ServiceStatus {
  switch (state) {
    case "running":
      return "healthy";
    case "exited":
    case "dead":
    case "removing":
      return "down";
    case "restarting":
    case "paused":
      return "degraded";
    default:
      return "unknown";
  }
}

export class DockerCollector implements Collector {
  private options: DockerCollectorOptions;
  private fetcher: HttpFetcher;

  constructor(options: DockerCollectorOptions, fetcher: HttpFetcher) {
    this.options = options;
    this.fetcher = fetcher;
  }

  async collect(): Promise<CollectorResult[]> {
    const { dockerHost = "http://localhost:2375", filterLabel } = this.options;
    const checkedAt = new Date().toISOString();

    try {
      const url = `${dockerHost}/containers/json?all=true`;
      const response = await this.fetcher(url, { method: "GET" });

      if (!response.ok) {
        const body = await response.text();
        return [
          {
            serviceId: "docker-engine",
            serviceName: "Docker Engine",
            type: "docker",
            status: "unknown",
            metadata: { dockerHost, statusCode: response.status },
            checkedAt,
            error: `Docker API ${response.status}: ${body.slice(0, 200)}`,
          },
        ];
      }

      const containers = (await response.json()) as DockerContainer[];

      const filtered = filterLabel
        ? containers.filter((c) => {
            const labels = c.Labels ?? {};
            return Object.keys(labels).some((k) => k === filterLabel || `${k}=${labels[k]}` === filterLabel);
          })
        : containers;

      return filtered.map((container) => {
        const name = container.Names?.[0]?.replace(/^\//, "") ?? container.Id ?? "unknown";
        const id = container.Id?.slice(0, 12) ?? name;
        return {
          serviceId: `docker-${id}`,
          serviceName: name,
          type: "docker" as const,
          status: mapDockerState(typeof container.State === "string" ? container.State : undefined),
          metadata: {
            containerId: container.Id,
            state: container.State,
            status: container.Status,
          },
          checkedAt,
        };
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return [
        {
          serviceId: "docker-engine",
          serviceName: "Docker Engine",
          type: "docker",
          status: "unknown",
          metadata: { dockerHost },
          checkedAt,
          error: errorMsg,
        },
      ];
    }
  }
}

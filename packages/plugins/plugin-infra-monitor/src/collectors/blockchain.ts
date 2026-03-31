import type { Collector, CollectorResult } from "./index.js";

interface BlockchainCollectorOptions {
  serviceId: string;
  serviceName: string;
  rpcUrl: string;
  lagThreshold?: number;
}

type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: { code: number; message: string };
}

export class BlockchainCollector implements Collector {
  private options: BlockchainCollectorOptions;
  private fetcher: HttpFetcher;

  constructor(options: BlockchainCollectorOptions, fetcher: HttpFetcher) {
    this.options = options;
    this.fetcher = fetcher;
  }

  async collect(): Promise<CollectorResult[]> {
    const { serviceId, serviceName, rpcUrl } = this.options;
    const checkedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const response = await this.fetcher(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        }),
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const body = await response.text();
        return [
          {
            serviceId,
            serviceName,
            type: "blockchain",
            status: "down",
            latencyMs,
            metadata: { rpcUrl, statusCode: response.status },
            checkedAt,
            error: `RPC ${response.status}: ${body.slice(0, 200)}`,
          },
        ];
      }

      const data = (await response.json()) as JsonRpcResponse;

      if (data.error) {
        return [
          {
            serviceId,
            serviceName,
            type: "blockchain",
            status: "down",
            latencyMs,
            metadata: { rpcUrl },
            checkedAt,
            error: `JSON-RPC error ${data.error.code}: ${data.error.message}`,
          },
        ];
      }

      const blockNumberHex = data.result ?? "0x0";
      const blockNumber = parseInt(blockNumberHex, 16);

      return [
        {
          serviceId,
          serviceName,
          type: "blockchain",
          status: "healthy",
          latencyMs,
          metadata: { rpcUrl, blockNumber, blockNumberHex },
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
          type: "blockchain",
          status: "down",
          latencyMs,
          metadata: { rpcUrl },
          checkedAt,
          error: errorMsg,
        },
      ];
    }
  }
}

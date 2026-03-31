type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmApiResponse {
  message: { content: string };
}

interface LlmClientOptions {
  url: string;
  model: string;
  timeoutMs?: number;
}

export class LlmClient {
  private options: LlmClientOptions;
  private fetcher: HttpFetcher;

  constructor(options: LlmClientOptions, fetcher: HttpFetcher) {
    this.options = options;
    this.fetcher = fetcher;
  }

  async chat(messages: LlmMessage[]): Promise<string> {
    const { url, model, timeoutMs = 60000 } = this.options;
    const endpoint = `${url}/api/chat`;

    const body = JSON.stringify({ model, messages, stream: false });

    const doRequest = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.fetcher(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let response = await doRequest();

    // Retry once on 503
    if (response.status === 503) {
      response = await doRequest();
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API ${response.status}: ${errorBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as LlmApiResponse;
    return data.message.content;
  }
}

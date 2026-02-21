export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

export class HttpClient implements MCPClient {
  private url: string;
  private headers: Record<string, string>;
  private requestId = 0;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as JSONRPCResponse;

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result;
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    return this.call("tools/call", {
      name,
      arguments: args,
    });
  }

  close() {
    // HTTP client doesn't need explicit cleanup
  }
}

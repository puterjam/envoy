import { spawn, ChildProcess } from "child_process";

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

export class StdioClient implements MCPClient {
  private process: ChildProcess;
  private requestId = 0;
  private pending: Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = new Map();
  private buffer = "";
  private readyPromise: Promise<void>;

  constructor(
    command: string,
    args: string[] = [],
    env: Record<string, string> = {}
  ) {
    this.process = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Only output stderr if MCP_DEBUG is set
    const debug = process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true";
    if (debug) {
      this.process.stderr?.on("data", (data: Buffer) => {
        console.error("[envoy stderr]", data.toString());
      });
    }

    this.process.on("error", (error) => {
      console.error("[envoy process error]", error);
    });

    this.process.on("exit", (code) => {
      console.log("[envoy process exited]", code);
    });

    this.readyPromise = this.doInitialize();
  }

  private async doInitialize(): Promise<void> {
    await this.callRaw("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "envoy", version: "0.0.1" },
    });
    this.process.stdin?.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
    );
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as JSONRPCResponse;
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (error) {
        console.error("[envoy parse error]", error, line);
      }
    }
  }

  private callRaw(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const message = JSON.stringify(request) + "\n";
      this.process.stdin?.write(message, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    await this.readyPromise;
    return this.callRaw(method, params);
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    return this.call("tools/call", {
      name,
      arguments: args,
    });
  }

  close() {
    // Properly close stdin to signal the process to exit
    this.process.stdin?.end();

    // Kill the process if it's still running
    this.process.kill("SIGTERM");

    // Close all streams
    this.process.stdout?.destroy();
    this.process.stderr?.destroy();
  }
}

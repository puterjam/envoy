import { resolveEnv } from "./config.js";
import type { MCPServer, MCPConfig } from "./config.js";
import { StdioClient } from "./client/stdio.js";
import { HttpClient } from "./client/http.js";
import type { MCPClient } from "./client/stdio.js";

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class ClientPool {
  private clients: Map<string, MCPClient> = new Map();
  private toolCache: Map<string, Promise<Tool[]>> = new Map();
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
  }

  getClient(name: string): MCPClient | null {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    const server = this.config.mcpServers[name];
    if (!server) {
      return null;
    }

    const client = this.createClient(server);
    this.clients.set(name, client);
    return client;
  }

  discoverTools(name: string): Promise<Tool[]> {
    if (this.toolCache.has(name)) {
      return this.toolCache.get(name)!;
    }

    const client = this.getClient(name);
    if (!client) {
      return Promise.resolve([]);
    }

    const promise = client
      .call("tools/list")
      .then((result) => {
        const r = result as { tools?: Tool[] };
        return r?.tools ?? [];
      })
      .catch(() => []);

    this.toolCache.set(name, promise);
    return promise;
  }

  private createClient(server: MCPServer): MCPClient {
    if (server.url) {
      return new HttpClient(server.url, server.headers);
    }

    if (server.command) {
      const env = resolveEnv(server.env);
      return new StdioClient(server.command, server.args, env);
    }

    throw new Error(`Invalid server config for ${server}`);
  }

  listServers(): string[] {
    return Object.keys(this.config.mcpServers);
  }

  getServerInfo(name: string): MCPServer | null {
    return this.config.mcpServers[name] || null;
  }

  close(name?: string) {
    if (name) {
      const client = this.clients.get(name);
      if (client) {
        client.close();
        this.clients.delete(name);
        this.toolCache.delete(name);
      }
    } else {
      for (const client of this.clients.values()) {
        client.close();
      }
      this.clients.clear();
      this.toolCache.clear();
    }
  }
}

export { loadConfig } from "./config.js";
export type { MCPServer, MCPConfig } from "./config.js";
export { StdioClient, HttpClient } from "./client/index.js";

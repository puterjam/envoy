import { loadConfig, ClientPool } from "@envoy/core";

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let configPath: string | undefined;
let pool: ClientPool;

function sendResponse(response: JSONRPCResponse) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function handleRequest(request: JSONRPCRequest): Promise<void> {
  const { method, id } = request;

  try {
    switch (method) {
      case "initialize": {
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {
                listChanged: true,
              },
            },
            serverInfo: {
              name: "envoy",
              version: "0.0.1",
            },
          },
        });
        break;
      }

      case "tools/list": {
        const servers = pool.listServers();

        const toolEntries = await Promise.all(
          servers.map(async (serverName) => {
            const serverInfo = pool.getServerInfo(serverName);
            const source = serverInfo?.command ?? serverInfo?.url ?? serverName;

            const tools = await pool.discoverTools(serverName);
            const toolNames = tools.map(t => t.name);
            const toolDetails = tools.length > 0
              ? tools.map(t => {
                  const params = t.inputSchema?.properties
                    ? Object.keys(t.inputSchema.properties).map(p =>
                        (t.inputSchema?.required?.includes(p) ? "(required)" : "").trim()
                          ? `${p} (required)` : p
                      ).join(", ")
                    : "";
                  return params ? `${t.name}: ${params}` : t.name;
                }).join("\n  - ")
              : "";

            const toolsHint = toolNames.length > 0
              ? `\nAvailable tools:\n  - ${toolDetails}`
              : "";

            return {
              name: serverName,
              description: `MCP server proxy for "${serverName}" (${source}).\nTo call a tool: method="tools/call", params={"name":"<tool>","arguments":{...}}\nTo list tools: method="tools/list"${toolsHint}`,
              inputSchema: {
                type: "object",
                properties: {
                  method: { type: "string", description: 'MCP method to call, e.g. "tools/call" or "tools/list"' },
                  params: { type: "object", description: "Method parameters" },
                },
                required: ["method"],
              },
            };
          })
        );

        sendResponse({
          jsonrpc: "2.0",
          id,
          result: { tools: toolEntries },
        });
        break;
      }

      case "tools/call": {
        const serverName = request.params?.name;
        const methodName = request.params?.arguments?.method as string | undefined;
        const methodParams = request.params?.arguments?.params as Record<string, unknown> | undefined;

        if (!serverName) {
          sendResponse({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Server name is required",
            },
          });
          return;
        }

        if (!methodName) {
          sendResponse({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Method name is required",
            },
          });
          return;
        }

        const client = pool.getClient(serverName);

        if (!client) {
          sendResponse({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: `Server "${serverName}" not found`,
            },
          });
          return;
        }

        try {
          const result = await client.call(methodName, methodParams);
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result),
                },
              ],
            },
          });
        } catch (error) {
          sendResponse({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
        break;
      }

      default: {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
      }
    }
  } catch (error) {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

let buffer = "";

function processBuffer() {
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as JSONRPCRequest;
      handleRequest(request);
    } catch (error) {
      console.error("[envoy parse error]", error, line);
    }
  }
}

export function startServer(args: string[]) {
  // Parse config path from args
  const configIndex = args.indexOf("--config");
  if (configIndex !== -1 && args[configIndex + 1]) {
    configPath = args[configIndex + 1];
  }

  // Load config
  const config = loadConfig(configPath);
  pool = new ClientPool(config);

  // Handle stdin
  process.stdin.on("data", (data: Buffer) => {
    buffer += data.toString();
    processBuffer();
  });

  process.stdin.on("end", () => {
    pool.close();
  });

  // Send initial notification that server is ready
  console.error("[envoy] Server started");
}

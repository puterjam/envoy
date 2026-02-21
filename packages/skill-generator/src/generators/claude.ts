import type { ServerInfo, Tool } from "../discovery.js";

function formatToolParams(tool: Tool): string {
  const schema = tool.inputSchema;
  if (!schema || !schema.properties) {
    return "";
  }

  const props = schema.properties as Record<string, { description?: string; type?: string }>;
  const required = schema.required as string[] | undefined;

  const params = Object.entries(props)
    .map(([name, info]) => {
      const requiredFlag = required?.includes(name) ? " (required)" : "";
      return `    - ${name}${requiredFlag}: ${info.description || info.type || "any"}`;
    })
    .join("\n");

  return params ? `\n  Parameters:\n${params}` : "";
}

export function generateClaudeSkill(serverInfo: ServerInfo): string {
  const toolList = serverInfo.tools
    .map((t) => {
      const params = formatToolParams(t);
      return `  - ${t.name}: ${t.description || "No description"}${params}`;
    })
    .join("\n");

  return `# ${serverInfo.name}

${serverInfo.description || `MCP server: ${serverInfo.name}`}

## Available Tools

${toolList}

## Usage

Use these tools when you need to:
- ${serverInfo.description || `Interact with ${serverInfo.name} services`}

## Examples

\`\`\`bash
# List available tools (CLI)
envoy list ${serverInfo.name}

# Call a specific tool (CLI)
envoy call ${serverInfo.name}/<tool-name> '{"param": "value"}'
\`\`\`

## MCP Server Mode

When used as an MCP server tool, call with:
- \`method\`: \`"tools/call"\`, \`params\`: \`{"name": "<tool-name>", "arguments": {...}}\`
- \`method\`: \`"tools/list"\` — list all available tools
`;
}

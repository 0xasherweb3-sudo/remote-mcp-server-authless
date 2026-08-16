import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";

function createServer() {
	const server = new McpServer({
		name: "Football Data MCP",
		version: "1.0.0",
	});

	server.registerTool(
		"api_status",
		{
			description: "Check that the API-Football connection is working",
			inputSchema: z.object({}),
		},
		async () => {
			const response = await fetch(
				"https://v3.football.api-sports.io/status",
				{
					headers: {
						"x-apisports-key": env.API_FOOTBALL_KEY as string,
					},
				},
			);

			const data = await response.json();

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(data, null, 2),
					},
				],
			};
		},
	);

	return server;
}

export default {
	fetch(request, env, ctx) {
		return createMcpHandler(createServer)(request, env, ctx);
	},
} satisfies ExportedHandler;

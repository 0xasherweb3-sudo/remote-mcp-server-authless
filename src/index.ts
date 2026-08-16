import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";

async function apiFootball(
	path: string,
	params: Record<string, string | number | undefined> = {},
) {
	const url = new URL(`https://v3.football.api-sports.io${path}`);

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url.toString(), {
		headers: {
			"x-apisports-key": env.API_FOOTBALL_KEY as string,
		},
	});

	const data = await response.json();

	return data;
}

function textResult(data: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

function createServer() {
	const server = new McpServer({
		name: "Football Data MCP",
		version: "1.1.0",
	});

	server.registerTool(
		"api_status",
		{
			description: "Check API-Football connection and quota",
			inputSchema: {},
		},
		async () => {
			return textResult(await apiFootball("/status"));
		},
	);

	server.registerTool(
		"search_player",
		{
			description:
				"Search for a football player by name and optionally season. Use this first to find the player's API-Football ID.",
			inputSchema: {
				name: z.string().min(3).describe("Player name, for example Mikautadze"),
				season: z
					.number()
					.int()
					.optional()
					.describe("Season starting year, for example 2025 for 2025/26"),
			},
		},
		async ({ name, season }) => {
			return textResult(
				await apiFootball("/players", {
					search: name,
					season,
				}),
			);
		},
	);

	server.registerTool(
		"player_stats",
		{
			description:
				"Get detailed season statistics for a player using their API-Football player ID.",
			inputSchema: {
				player_id: z.number().int().describe("API-Football player ID"),
				season: z
					.number()
					.int()
					.describe("Season starting year, for example 2025 for 2025/26"),
			},
		},
		async ({ player_id, season }) => {
			return textResult(
				await apiFootball("/players", {
					id: player_id,
					season,
				}),
			);
		},
	);

	server.registerTool(
		"player_transfers",
		{
			description:
				"Get the transfer history of a player using their API-Football player ID.",
			inputSchema: {
				player_id: z.number().int().describe("API-Football player ID"),
			},
		},
		async ({ player_id }) => {
			return textResult(
				await apiFootball("/transfers", {
					player: player_id,
				}),
			);
		},
	);

	server.registerTool(
		"fixture_player_stats",
		{
			description:
				"Get individual player statistics for a specific fixture.",
			inputSchema: {
				fixture_id: z.number().int().describe("API-Football fixture ID"),
			},
		},
		async ({ fixture_id }) => {
			return textResult(
				await apiFootball("/fixtures/players", {
					fixture: fixture_id,
				}),
			);
		},
	);

	return server;
}

export default {
	fetch(request, env, ctx) {
		return createMcpHandler(createServer)(request, env, ctx);
	},
} satisfies ExportedHandler;

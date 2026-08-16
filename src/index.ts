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

		server.registerTool(
		"fotmob_search",
		{
			description:
				"Search FotMob for players, teams and competitions. Use this to find FotMob IDs.",
			inputSchema: {
				query: z.string().min(2).describe("Search term, for example Mikautadze"),
			},
		},
		async ({ query }) => {
			const url = new URL("https://www.fotmob.com/api/searchData");
			url.searchParams.set("term", query);

			const response = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Mozilla/5.0",
					Accept: "application/json",
				},
			});

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"fotmob_player",
		{
			description:
				"Get current FotMob player profile, recent matches, career information and available player statistics.",
			inputSchema: {
				player_id: z.number().int().describe("FotMob player ID"),
			},
		},
		async ({ player_id }) => {
			const url = new URL("https://www.fotmob.com/api/playerData");
			url.searchParams.set("id", String(player_id));

			const response = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Mozilla/5.0",
					Accept: "application/json",
				},
			});

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"fotmob_match",
		{
			description:
				"Get detailed FotMob match data including lineups, events, statistics, player ratings, xG and shotmap when available.",
			inputSchema: {
				match_id: z.number().int().describe("FotMob match ID"),
			},
		},
		async ({ match_id }) => {
			const url = new URL("https://www.fotmob.com/api/matchDetails");
			url.searchParams.set("matchId", String(match_id));

			const response = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Mozilla/5.0",
					Accept: "application/json",
				},
			});

			const data = await response.json();
			return textResult(data);
		},
	);
	
		server.registerTool(
		"sofascore_search",
		{
			description:
				"Search SofaScore for players, teams and competitions.",
			inputSchema: {
				query: z.string().min(2).describe("Search term, for example Mikautadze"),
			},
		},
		async ({ query }) => {
			const url = new URL("https://api.sofascore.com/api/v1/search/all");
			url.searchParams.set("q", query);

			const response = await fetch(url.toString(), {
				headers: {
					Accept: "application/json",
					Referer: "https://www.sofascore.com/",
				},
			});

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"sofascore_player",
		{
			description:
				"Get current SofaScore player profile using a SofaScore player ID.",
			inputSchema: {
				player_id: z.number().int().describe("SofaScore player ID"),
			},
		},
		async ({ player_id }) => {
			const response = await fetch(
				`https://api.sofascore.com/api/v1/player/${player_id}`,
				{
					headers: {
						Accept: "application/json",
						Referer: "https://www.sofascore.com/",
					},
				},
			);

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"sofascore_player_seasons",
		{
			description:
				"Get available SofaScore seasons and competitions for a player.",
			inputSchema: {
				player_id: z.number().int().describe("SofaScore player ID"),
			},
		},
		async ({ player_id }) => {
			const response = await fetch(
				`https://api.sofascore.com/api/v1/player/${player_id}/statistics/seasons`,
				{
					headers: {
						Accept: "application/json",
						Referer: "https://www.sofascore.com/",
					},
				},
			);

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"sofascore_match_player_stats",
		{
			description:
				"Get detailed statistics for a player in a specific SofaScore match.",
			inputSchema: {
				event_id: z.number().int().describe("SofaScore event ID"),
				player_id: z.number().int().describe("SofaScore player ID"),
			},
		},
		async ({ event_id, player_id }) => {
			const response = await fetch(
				`https://api.sofascore.com/api/v1/event/${event_id}/player/${player_id}/statistics`,
				{
					headers: {
						Accept: "application/json",
						Referer: "https://www.sofascore.com/",
					},
				},
			);

			const data = await response.json();
			return textResult(data);
		},
	);
	server.registerTool(
		"statsbomb_competitions",
		{
			description:
				"List all competitions and seasons available in StatsBomb Open Data.",
			inputSchema: {},
		},
		async () => {
			const response = await fetch(
				"https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json",
			);

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"statsbomb_matches",
		{
			description:
				"Get all matches for a StatsBomb competition and season.",
			inputSchema: {
				competition_id: z.number().int(),
				season_id: z.number().int(),
			},
		},
		async ({ competition_id, season_id }) => {
			const response = await fetch(
				`https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/${competition_id}/${season_id}.json`,
			);

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"statsbomb_events",
		{
			description:
				"Get detailed StatsBomb event data for a match including passes, shots, pressures, recoveries, duels and carries.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const response = await fetch(
				`https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/${match_id}.json`,
			);

			const data = await response.json();
			return textResult(data);
		},
	);

	server.registerTool(
		"statsbomb_lineups",
		{
			description:
				"Get StatsBomb lineups and player IDs for a specific match.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const response = await fetch(
				`https://raw.githubusercontent.com/statsbomb/open-data/master/data/lineups/${match_id}.json`,
			);

			const data = await response.json();
			return textResult(data);
		},
	);
		server.registerTool(
		"understat_player",
		{
			description:
				"Get Understat player data including xG, xA, shots, key passes, xGChain and xGBuildup.",
			inputSchema: {
				player_id: z.number().int().describe("Understat player ID"),
			},
		},
		async ({ player_id }) => {
			const response = await fetch(
				`https://understat.com/player/${player_id}`,
				{
					headers: {
						"User-Agent": "Mozilla/5.0",
						Accept: "text/html",
					},
				},
			);

			const html = await response.text();

			return textResult({
				status: response.status,
				html,
			});
		},
	);

	server.registerTool(
		"understat_match",
		{
			description:
				"Get raw Understat match page data used for xG and shot analysis.",
			inputSchema: {
				match_id: z.number().int().describe("Understat match ID"),
			},
		},
		async ({ match_id }) => {
			const response = await fetch(
				`https://understat.com/match/${match_id}`,
				{
					headers: {
						"User-Agent": "Mozilla/5.0",
						Accept: "text/html",
					},
				},
			);

			const html = await response.text();

			return textResult({
				status: response.status,
				html,
			});
		},
	);

	server.registerTool(
		"understat_league",
		{
			description:
				"Get an Understat league page for a specific season.",
			inputSchema: {
				league: z
					.enum(["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1", "RFPL"])
					.describe("Understat league name"),
				season: z.number().int().describe("Season starting year"),
			},
		},
		async ({ league, season }) => {
			const response = await fetch(
				`https://understat.com/league/${league}/${season}`,
				{
					headers: {
						"User-Agent": "Mozilla/5.0",
						Accept: "text/html",
					},
				},
			);

			const html = await response.text();

			return textResult({
				status: response.status,
				html,
			});
		},
	);
	
	return server;
}

export default {
	fetch(request, env, ctx) {
		return createMcpHandler(createServer)(request, env, ctx);
	},
} satisfies ExportedHandler;

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";

/* =========================================================
   HELPERS
========================================================= */

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
			Accept: "application/json",
		},
	});

	return await response.json();
}

async function fetchJson(url: string) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "Mozilla/5.0",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} while fetching ${url}`);
	}

	return await response.json();
}

async function fetchUnderstatPage(url: string) {
	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			Referer: "https://understat.com/",
		},
	});

	if (!response.ok) {
		throw new Error(`Understat returned HTTP ${response.status}`);
	}

	return await response.text();
}

function extractUnderstatJson(html: string, variableName: string) {
	const queryIndex = html.indexOf(variableName);

	if (queryIndex === -1) {
		throw new Error(
			`Understat variable "${variableName}" was not found`,
		);
	}

	const jsonParseIndex = html.indexOf("JSON.parse(", queryIndex);

	if (jsonParseIndex === -1) {
		throw new Error(
			`JSON.parse block not found for "${variableName}"`,
		);
	}

	let start = jsonParseIndex + "JSON.parse(".length;

	while (
		start < html.length &&
		html[start] !== "'" &&
		html[start] !== '"'
	) {
		start++;
	}

	if (start >= html.length) {
		throw new Error(
			`Opening quote not found for "${variableName}"`,
		);
	}

	const quote = html[start];
	start++;

	let end = start;
	let escaped = false;

	while (end < html.length) {
		const char = html[end];

		if (escaped) {
			escaped = false;
			end++;
			continue;
		}

		if (char === "\\") {
			escaped = true;
			end++;
			continue;
		}

		if (char === quote) {
			break;
		}

		end++;
	}

	if (end >= html.length) {
		throw new Error(
			`Closing quote not found for "${variableName}"`,
		);
	}

	const encoded = html.slice(start, end);

	const decoded = encoded
		.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
			String.fromCharCode(parseInt(hex, 16)),
		)
		.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
			String.fromCharCode(parseInt(hex, 16)),
		)
		.replace(/\\'/g, "'")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");

	return JSON.parse(decoded);
}

function normalizeUnderstatPlayer(player: any) {
	const minutes = Number(player.time ?? player.minutes ?? 0);

	const per90 = (value: unknown) => {
		const number = Number(value ?? 0);

		if (!minutes) return null;

		return Number(((number * 90) / minutes).toFixed(3));
	};

	return {
		id: Number(player.id),
		name: player.player_name,
		team: player.team_title,
		position: player.position,
		games: Number(player.games ?? 0),
		starts: Number(player.starts ?? 0),
		minutes,

		goals: Number(player.goals ?? 0),
		assists: Number(player.assists ?? 0),

		xG: Number(player.xG ?? 0),
		npxG: Number(player.npxG ?? 0),
		xA: Number(player.xA ?? 0),

		shots: Number(player.shots ?? 0),
		keyPasses: Number(player.key_passes ?? 0),

		xGChain: Number(player.xGChain ?? 0),
		xGBuildup: Number(player.xGBuildup ?? 0),

		per90: {
			goals: per90(player.goals),
			assists: per90(player.assists),
			xG: per90(player.xG),
			npxG: per90(player.npxG),
			xA: per90(player.xA),
			shots: per90(player.shots),
			keyPasses: per90(player.key_passes),
			xGChain: per90(player.xGChain),
			xGBuildup: per90(player.xGBuildup),
		},
	};
}

/* =========================================================
   SERVER
========================================================= */

function createServer() {
	const server = new McpServer({
		name: "Football Analytics MCP",
		version: "2.1.0",
	});

	/* =====================================================
	   API-FOOTBALL
	===================================================== */

	server.registerTool(
		"api_status",
		{
			description:
				"Check API-Football connection and current subscription status.",
			inputSchema: {},
		},
		async () => {
			return textResult(await apiFootball("/status"));
		},
	);

	server.registerTool(
		"api_search_player",
		{
			description:
				"Search API-Football for a player. Useful for historical seasons and player IDs.",
			inputSchema: {
				name: z.string().min(3).describe("Player name"),
				season: z
					.number()
					.int()
					.optional()
					.describe("Season starting year, e.g. 2024"),
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
		"api_player_stats",
		{
			description:
				"Get API-Football player statistics for a season.",
			inputSchema: {
				player_id: z.number().int(),
				season: z.number().int(),
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
		"api_player_transfers",
		{
			description:
				"Get API-Football transfer history for a player.",
			inputSchema: {
				player_id: z.number().int(),
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
		"api_fixture_player_stats",
		{
			description:
				"Get individual API-Football statistics for all players in a fixture.",
			inputSchema: {
				fixture_id: z.number().int(),
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

	/* =====================================================
	   STATSBOMB OPEN DATA
	===================================================== */

	server.registerTool(
		"statsbomb_competitions",
		{
			description:
				"List all StatsBomb Open Data competitions and seasons.",
			inputSchema: {},
		},
		async () => {
			return textResult(
				await fetchJson(
					"https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json",
				),
			);
		},
	);

	server.registerTool(
		"statsbomb_matches",
		{
			description:
				"Get matches for a StatsBomb Open Data competition and season.",
			inputSchema: {
				competition_id: z.number().int(),
				season_id: z.number().int(),
			},
		},
		async ({ competition_id, season_id }) => {
			return textResult(
				await fetchJson(
					`https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/${competition_id}/${season_id}.json`,
				),
			);
		},
	);

	server.registerTool(
		"statsbomb_events",
		{
			description:
				"Get full StatsBomb event data for a match including passes, pressures, recoveries, shots, duels and carries.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			return textResult(
				await fetchJson(
					`https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/${match_id}.json`,
				),
			);
		},
	);

	server.registerTool(
		"statsbomb_lineups",
		{
			description:
				"Get StatsBomb lineups and player IDs for a match.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			return textResult(
				await fetchJson(
					`https://raw.githubusercontent.com/statsbomb/open-data/master/data/lineups/${match_id}.json`,
				),
			);
		},
	);

	server.registerTool(
		"statsbomb_360",
		{
			description:
				"Get StatsBomb 360 freeze-frame data for a match when available.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			return textResult(
				await fetchJson(
					`https://raw.githubusercontent.com/statsbomb/open-data/master/data/three-sixty/${match_id}.json`,
				),
			);
		},
	);

	/* =====================================================
	   UNDERSTAT
	===================================================== */

	const understatLeagueSchema = z.enum([
		"EPL",
		"La_liga",
		"Bundesliga",
		"Serie_A",
		"Ligue_1",
		"RFPL",
	]);

	server.registerTool(
		"understat_league_players",
		{
			description:
				"Get structured Understat player statistics for a league and season including xG, npxG, xA, shots, key passes, xGChain and xGBuildup.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z
					.number()
					.int()
					.describe("Season starting year, e.g. 2025 for 2025/26"),
			},
		},
		async ({ league, season }) => {
			const html = await fetchUnderstatPage(
				`https://understat.com/league/${league}/${season}`,
			);

			const players = extractUnderstatJson(
				html,
				"playersData",
			);

			return textResult(
				players.map(normalizeUnderstatPlayer),
			);
		},
	);

	server.registerTool(
		"understat_search_player",
		{
			description:
				"Search for a player inside an Understat league season and return structured advanced statistics.",
			inputSchema: {
				query: z
					.string()
					.min(2)
					.describe("Player name, e.g. Mikautadze"),
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ query, league, season }) => {
			const html = await fetchUnderstatPage(
				`https://understat.com/league/${league}/${season}`,
			);

			const players = extractUnderstatJson(
				html,
				"playersData",
			);

			const normalized = players.map(
				normalizeUnderstatPlayer,
			);

			const search = query.toLowerCase();

			const results = normalized.filter(
				(player: any) =>
					String(player.name)
						.toLowerCase()
						.includes(search),
			);

			return textResult(results);
		},
	);

	server.registerTool(
		"understat_player",
		{
			description:
				"Get structured Understat player match history and available player datasets using an Understat player ID.",
			inputSchema: {
				player_id: z.number().int(),
			},
		},
		async ({ player_id }) => {
			const html = await fetchUnderstatPage(
				`https://understat.com/player/${player_id}`,
			);

			const result: Record<string, unknown> = {};

			for (const variable of [
				"matchesData",
				"shotsData",
				"groupsData",
			]) {
				try {
					result[variable] =
						extractUnderstatJson(
							html,
							variable,
						);
				} catch {
					// Dataset not present on every page.
				}
			}

			return textResult(result);
		},
	);

	server.registerTool(
		"understat_match",
		{
			description:
				"Get structured Understat match shot and match information.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const html = await fetchUnderstatPage(
				`https://understat.com/match/${match_id}`,
			);

			const result: Record<string, unknown> = {};

			for (const variable of [
				"shotsData",
				"match_info",
				"rostersData",
			]) {
				try {
					result[variable] =
						extractUnderstatJson(
							html,
							variable,
						);
				} catch {
					// Some datasets differ by page.
				}
			}

			return textResult(result);
		},
	);

	server.registerTool(
		"understat_league_teams",
		{
			description:
				"Get structured Understat team data for a league and season including xG, xGA, PPDA and expected points data when available.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ league, season }) => {
			const html = await fetchUnderstatPage(
				`https://understat.com/league/${league}/${season}`,
			);

			const teams = extractUnderstatJson(
				html,
				"teamsData",
			);

			return textResult(teams);
		},
	);

	return server;
}

/* =========================================================
   CLOUDFLARE WORKER
========================================================= */

export default {
	fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	) {
		return createMcpHandler(createServer)(
			request,
			env,
			ctx,
		);
	},
} satisfies ExportedHandler<Env>;

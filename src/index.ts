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

/* =========================================================
   API-FOOTBALL
========================================================= */

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

/* =========================================================
   GENERIC JSON
========================================================= */

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

/* =========================================================
   UNDERSTAT AJAX API
========================================================= */

async function understatAjax(path: string) {
	const url = `https://understat.com/${path}`;

	const response = await fetch(url, {
		headers: {
			"X-Requested-With": "XMLHttpRequest",
			Accept: "application/json",
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36",
			Referer: "https://understat.com/",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Understat AJAX returned HTTP ${response.status} for ${path}`,
		);
	}

	const contentType = response.headers.get("content-type") ?? "";

	if (!contentType.includes("application/json")) {
		const body = await response.text();

		throw new Error(
			`Understat returned non-JSON response for ${path}: ${body.slice(
				0,
				200,
			)}`,
		);
	}

	return await response.json();
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
   MCP SERVER
========================================================= */

function createServer() {
	const server = new McpServer({
		name: "Football Analytics MCP",
		version: "3.0.0",
	});

	/* =====================================================
	   API-FOOTBALL
	===================================================== */

	server.registerTool(
		"api_status",
		{
			description:
				"Check API-Football connection and subscription status.",
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
				"Search API-Football for a player.",
			inputSchema: {
				name: z.string().min(3),
				season: z.number().int().optional(),
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
				"Get API-Football statistics for a player and season.",
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
				"Get transfer history from API-Football.",
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
				"Get individual player statistics for an API-Football fixture.",
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
				"List StatsBomb Open Data competitions and seasons.",
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
				"Get StatsBomb matches for a competition and season.",
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
				"Get full StatsBomb event data for a match.",
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
				"Get StatsBomb lineups for a match.",
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
				"Get StatsBomb 360 data when available.",
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

	/* ---------- FULL LEAGUE DATA ---------- */

	server.registerTool(
		"understat_league",
		{
			description:
				"Get complete current Understat league JSON using the AJAX endpoint. Returns teams, players and fixtures.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ league, season }) => {
			const data = await understatAjax(
				`getLeagueData/${league}/${season}`,
			);

			return textResult(data);
		},
	);

	/* ---------- LEAGUE PLAYERS ---------- */

	server.registerTool(
		"understat_league_players",
		{
			description:
				"Get all Understat players for a league season with xG, xA, npxG, shots, key passes, xGChain and xGBuildup.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ league, season }) => {
			const data: any = await understatAjax(
				`getLeagueData/${league}/${season}`,
			);

			const players = Array.isArray(data.players)
				? data.players
				: [];

			return textResult(
				players.map(normalizeUnderstatPlayer),
			);
		},
	);

	/* ---------- SEARCH PLAYER ---------- */

	server.registerTool(
		"understat_search_player",
		{
			description:
				"Search a player inside an Understat league season and return structured advanced statistics.",
			inputSchema: {
				query: z.string().min(2),
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ query, league, season }) => {
			const data: any = await understatAjax(
				`getLeagueData/${league}/${season}`,
			);

			const players = Array.isArray(data.players)
				? data.players
				: [];

			const normalized = players.map(
				normalizeUnderstatPlayer,
			);

			const search = query
				.toLowerCase()
				.trim();

			const results = normalized.filter(
				(player: any) =>
					String(player.name ?? "")
						.toLowerCase()
						.includes(search),
			);

			return textResult(results);
		},
	);

	/* ---------- LEAGUE TEAMS ---------- */

	server.registerTool(
		"understat_league_teams",
		{
			description:
				"Get Understat team data including xG, xGA, PPDA and xPTS for a league season.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ league, season }) => {
			const data: any = await understatAjax(
				`getLeagueData/${league}/${season}`,
			);

			return textResult(data.teams ?? {});
		},
	);

	/* ---------- LEAGUE FIXTURES ---------- */

	server.registerTool(
		"understat_league_matches",
		{
			description:
				"Get Understat fixtures and match results for a league season.",
			inputSchema: {
				league: understatLeagueSchema,
				season: z.number().int(),
			},
		},
		async ({ league, season }) => {
			const data: any = await understatAjax(
				`getLeagueData/${league}/${season}`,
			);

			return textResult(data.dates ?? []);
		},
	);

	/* ---------- PLAYER ---------- */

	server.registerTool(
		"understat_player",
		{
			description:
				"Get complete Understat player data using a player ID, including matches, shots and season groups.",
			inputSchema: {
				player_id: z.number().int(),
			},
		},
		async ({ player_id }) => {
			const data = await understatAjax(
				`getPlayerData/${player_id}`,
			);

			return textResult(data);
		},
	);

	/* ---------- PLAYER MATCHES ---------- */

	server.registerTool(
		"understat_player_matches",
		{
			description:
				"Get match-by-match Understat data for a player.",
			inputSchema: {
				player_id: z.number().int(),
			},
		},
		async ({ player_id }) => {
			const data: any = await understatAjax(
				`getPlayerData/${player_id}`,
			);

			return textResult(data.matches ?? []);
		},
	);

	/* ---------- PLAYER SHOTS ---------- */

	server.registerTool(
		"understat_player_shots",
		{
			description:
				"Get every Understat shot recorded for a player.",
			inputSchema: {
				player_id: z.number().int(),
			},
		},
		async ({ player_id }) => {
			const data: any = await understatAjax(
				`getPlayerData/${player_id}`,
			);

			return textResult(data.shots ?? []);
		},
	);

	/* ---------- PLAYER SEASONS ---------- */

	server.registerTool(
		"understat_player_seasons",
		{
			description:
				"Get season-level Understat statistics for a player.",
			inputSchema: {
				player_id: z.number().int(),
			},
		},
		async ({ player_id }) => {
			const data: any = await understatAjax(
				`getPlayerData/${player_id}`,
			);

			return textResult(data.groups ?? []);
		},
	);

	/* ---------- MATCH ---------- */

	server.registerTool(
		"understat_match",
		{
			description:
				"Get Understat match data including rosters and shots.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const data = await understatAjax(
				`getMatchData/${match_id}`,
			);

			return textResult(data);
		},
	);

	/* ---------- MATCH SHOTS ---------- */

	server.registerTool(
		"understat_match_shots",
		{
			description:
				"Get Understat shot-level xG data for a match.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const data: any = await understatAjax(
				`getMatchData/${match_id}`,
			);

			return textResult(data.shots ?? {});
		},
	);

	/* ---------- MATCH ROSTERS ---------- */

	server.registerTool(
		"understat_match_rosters",
		{
			description:
				"Get Understat player rosters and individual match stats.",
			inputSchema: {
				match_id: z.number().int(),
			},
		},
		async ({ match_id }) => {
			const data: any = await understatAjax(
				`getMatchData/${match_id}`,
			);

			return textResult(data.rosters ?? {});
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

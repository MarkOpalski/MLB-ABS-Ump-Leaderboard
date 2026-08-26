import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MLB_API = "https://statsapi.mlb.com/api/v1";
// Season start date for week number calculation
const SEASON_START = new Date("2026-03-26");
// Only dates inside this window may be synced
const SEASON_WINDOW_START = "2026-03-01";
const SEASON_WINDOW_END = "2026-12-31";
// Maximum number of days a single sync run may cover
const MAX_RANGE_DAYS = 7;
// Minimum gap between sync runs
const SYNC_COOLDOWN_MS = 10 * 60 * 1000;
// A "running" log older than this is considered abandoned
const STALE_RUNNING_MS = 30 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time string comparison. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Strict YYYY-MM-DD validation that also rejects impossible calendar dates. */
function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().split("T")[0] !== value) return null;
  return value;
}

function clampToWindow(value: string): string {
  if (value < SEASON_WINDOW_START) return SEASON_WINDOW_START;
  if (value > SEASON_WINDOW_END) return SEASON_WINDOW_END;
  return value;
}

function addDays(value: string, days: number): string {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Resolve the date range for this run. Anything the caller supplies is validated,
 * clamped to the season window and capped at MAX_RANGE_DAYS; invalid input falls
 * back to the default two-day window rather than being trusted.
 */
function resolveDateRange(body: Record<string, unknown>): { startDate: string; endDate: string } {
  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(defaultStartDate.getDate() - 1);
  const defaultStart = defaultStartDate.toISOString().split("T")[0];

  const requestedStart = parseIsoDate(body.startDate);
  const requestedEnd = parseIsoDate(body.endDate);

  if (!requestedStart || !requestedEnd) {
    return { startDate: defaultStart, endDate: defaultEnd };
  }

  let startDate = clampToWindow(requestedStart);
  let endDate = clampToWindow(requestedEnd);

  if (endDate < startDate) endDate = startDate;

  const maxEnd = addDays(startDate, MAX_RANGE_DAYS - 1);
  if (endDate > maxEnd) endDate = maxEnd;

  return { startDate, endDate };
}

function getWeekNumber(dateStr: string): { weekNumber: number; weekYear: number } {
  const date = new Date(dateStr + "T12:00:00Z");
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((date.getTime() - SEASON_START.getTime()) / msPerDay);
  return {
    weekNumber: Math.max(1, Math.floor(daysSinceStart / 7) + 1),
    weekYear: date.getFullYear(),
  };
}

/** Canonical form for umpire name matching: lowercase, no diacritics, single spaces. */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // This function writes with the service role key, which bypasses RLS, so it must
  // only ever run for a trusted caller. The public anon key is NOT sufficient.
  const authHeader = req.headers.get("Authorization") ?? "";
  const presentedToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!presentedToken || !secretsMatch(presentedToken, supabaseServiceKey)) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let syncLogId: string | null = null;

  try {
    // Parse optional date range from request body; validated and bounded below
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch { /* no body */ }

    const { startDate, endDate } = resolveDateRange(body);

    const { data: dataSource } = await supabase
      .from("data_sources")
      .select("id")
      .eq("name", "MLB Stats API")
      .maybeSingle();

    if (!dataSource) throw new Error("MLB Stats API data source not found in database");

    // Throttle: refuse to start a second run while one is in flight or if one
    // finished very recently. Without this, every request starts a full crawl.
    const { data: recentLog } = await supabase
      .from("sync_logs")
      .select("id, status, sync_started_at")
      .order("sync_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentLog?.sync_started_at) {
      const startedAt = new Date(recentLog.sync_started_at).getTime();
      const age = Date.now() - startedAt;
      const inFlight = recentLog.status === "running" && age < STALE_RUNNING_MS;
      if (inFlight || age < SYNC_COOLDOWN_MS) {
        return jsonResponse({
          success: true,
          skipped: true,
          message: inFlight
            ? "A sync is already running. Try again shortly."
            : "Data was refreshed recently. Try again shortly.",
        });
      }
    }

    const { data: syncLog, error: syncLogError } = await supabase
      .from("sync_logs")
      .insert({
        data_source_id: dataSource.id,
        sync_started_at: new Date().toISOString(),
        status: "running",
        metadata: { startDate, endDate },
      })
      .select()
      .single();

    if (syncLogError) throw syncLogError;
    syncLogId = syncLog.id;

    // Step 1: get all games in the date range with umpire assignments
    const scheduleUrl =
      `${MLB_API}/schedule?sportId=1&startDate=${encodeURIComponent(startDate)}` +
      `&endDate=${encodeURIComponent(endDate)}&hydrate=officials&gameType=R`;

    const scheduleRes = await fetch(scheduleUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!scheduleRes.ok) throw new Error(`Schedule fetch failed: ${scheduleRes.status}`);

    const scheduleData = await scheduleRes.json();

    // Collect all games with their home plate umpire
    const games: Array<{
      gamePk: number;
      gameDate: string;
      homeTeamId: number;
      homeTeamName: string;
      awayTeamId: number;
      awayTeamName: string;
      hpUmpireMlbId: number | null;
      hpUmpireName: string | null;
    }> = [];

    for (const dateEntry of scheduleData.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        if (game.status?.abstractGameState !== "Final") continue;

        // Upstream values are untrusted: this one ends up in a request path.
        const gamePk = Number(game.gamePk);
        if (!Number.isInteger(gamePk) || gamePk <= 0) continue;

        let hpUmpireMlbId: number | null = null;
        let hpUmpireName: string | null = null;

        for (const official of game.officials ?? []) {
          if (official.officialType === "Home Plate") {
            const officialId = Number(official.official?.id);
            hpUmpireMlbId = Number.isInteger(officialId) && officialId > 0 ? officialId : null;
            hpUmpireName =
              typeof official.official?.fullName === "string" ? official.official.fullName : null;
            break;
          }
        }

        games.push({
          gamePk,
          gameDate: dateEntry.date,
          homeTeamId: game.teams?.home?.team?.id,
          homeTeamName: game.teams?.home?.team?.name,
          awayTeamId: game.teams?.away?.team?.id,
          awayTeamName: game.teams?.away?.team?.name,
          hpUmpireMlbId,
          hpUmpireName,
        });
      }
    }

    // Load all known umpires from DB indexed by mlb_id and name for matching
    const { data: dbUmpires } = await supabase
      .from("umpires")
      .select("id, name, mlb_id");
    const umpireByMlbId = new Map<number, string>();
    const umpireByName = new Map<string, string>();
    for (const u of dbUmpires ?? []) {
      if (u.mlb_id) umpireByMlbId.set(u.mlb_id, u.id);
      umpireByName.set(normalizeName(u.name), u.id);
    }

    // Load all known teams indexed by MLB numeric ID and name
    const { data: dbTeams } = await supabase.from("teams").select("id, name, abbreviation, mlb_id");
    const teamByMlbId = new Map<number, string>();
    const teamByName = new Map<string, string>();
    for (const t of dbTeams ?? []) {
      if (t.mlb_id) teamByMlbId.set(t.mlb_id, t.id);
      teamByName.set(t.name.toLowerCase(), t.id);
    }

    let recordsAdded = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    // Caller-visible failure summaries only: never raw driver or database text.
    const errors: string[] = [];

    // Step 2: for each game, fetch play-by-play and find ABS challenges
    for (const game of games) {
      try {
        // Ensure we have a DB record for this game's umpire
        let dbUmpireId: string | null = null;

        if (game.hpUmpireMlbId && umpireByMlbId.has(game.hpUmpireMlbId)) {
          dbUmpireId = umpireByMlbId.get(game.hpUmpireMlbId)!;
        } else if (game.hpUmpireName) {
          const nameKey = normalizeName(game.hpUmpireName);
          dbUmpireId = umpireByName.get(nameKey) ?? null;

          // Fall back to a last-name match, but only when it is unambiguous:
          // crediting challenges to the wrong umpire is worse than skipping.
          if (!dbUmpireId) {
            const lastName = nameKey.split(" ").pop() ?? "";
            const candidates: string[] = [];
            if (lastName.length >= 3) {
              for (const [key, id] of umpireByName) {
                if (key.split(" ").pop() === lastName) candidates.push(id);
              }
            }
            if (candidates.length === 1) {
              dbUmpireId = candidates[0];
            } else if (candidates.length > 1) {
              recordsSkipped++;
              continue;
            }
          }

          // Create a new umpire record if not found
          if (!dbUmpireId) {
            const { data: newUmpire, error: uErr } = await supabase
              .from("umpires")
              .insert({
                name: game.hpUmpireName,
                mlb_id: game.hpUmpireMlbId,
                age: 0,
                years_of_experience: 0,
                is_retired: false,
                data_source: "MLB Stats API",
                last_synced_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (uErr) {
              console.error("Failed to create umpire record", uErr);
              errors.push("Could not add a new umpire record");
            } else {
              dbUmpireId = newUmpire.id;
              if (game.hpUmpireMlbId) umpireByMlbId.set(game.hpUmpireMlbId, dbUmpireId!);
              umpireByName.set(nameKey, dbUmpireId!);
            }
          } else if (game.hpUmpireMlbId) {
            // Backfill mlb_id on existing umpire
            await supabase
              .from("umpires")
              .update({ mlb_id: game.hpUmpireMlbId })
              .eq("id", dbUmpireId);
            umpireByMlbId.set(game.hpUmpireMlbId, dbUmpireId);
          }
        }

        if (!dbUmpireId) {
          recordsSkipped++;
          continue;
        }

        // Upsert game record
        const homeTeamDbId = teamByName.get(game.homeTeamName?.toLowerCase() ?? "") ?? null;
        const awayTeamDbId = teamByName.get(game.awayTeamName?.toLowerCase() ?? "") ?? null;
        const { weekNumber, weekYear } = getWeekNumber(game.gameDate);

        const { data: upsertedGame } = await supabase
          .from("games")
          .upsert(
            {
              game_pk: game.gamePk,
              game_date: game.gameDate,
              season_year: 2026,
              game_type: "regular",
              home_team_id: homeTeamDbId,
              away_team_id: awayTeamDbId,
              umpire_id: dbUmpireId,
              total_calls: 0,
              total_challenges: 0,
            },
            { onConflict: "game_pk", ignoreDuplicates: false }
          )
          .select("id")
          .maybeSingle();

        const dbGameId = upsertedGame?.id ?? null;

        // Fetch play-by-play
        const pbpRes = await fetch(
          `${MLB_API}/game/${game.gamePk}/playByPlay`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        if (!pbpRes.ok) {
          console.error(`PBP fetch failed for game ${game.gamePk}: ${pbpRes.status}`);
          errors.push("Could not load play-by-play data for a game");
          continue;
        }

        const pbpData = await pbpRes.json();
        const allPlays: any[] = pbpData.allPlays ?? [];

        let gameChallenges = 0;

        for (let playIdx = 0; playIdx < allPlays.length; playIdx++) {
          const play = allPlays[playIdx];

          // Walk pitch events within the play
          for (let eventIdx = 0; eventIdx < (play.playEvents?.length ?? 0); eventIdx++) {
            const event = play.playEvents[eventIdx];
            const review = event.reviewDetails;

            // reviewType "MJ" = Manager/Player ABS challenge
            if (!review || review.reviewType !== "MJ") continue;

            const isOverturned: boolean = review.isOverturned === true;
            const pitchIdx = playIdx * 1000 + eventIdx; // unique within game

            const challengingTeamDbId =
              teamByMlbId.get(review.challengeTeamId) ?? null;

            const challengeRow = {
              game_pk: game.gamePk,
              play_index: pitchIdx,
              umpire_id: dbUmpireId,
              game_id: dbGameId,
              team_id: challengingTeamDbId,
              challenge_date: game.gameDate,
              outcome: isOverturned ? "overturned" : "stands",
              season_year: 2026,
              inning: play.about?.inning ?? null,
              ejection_occurred: false,
              game_type: "regular",
              week_number: weekNumber,
              week_year: weekYear,
              data_source: "MLB Stats API",
              last_synced_at: new Date().toISOString(),
              pitcher_name: play.matchup?.pitcher?.fullName ?? null,
              batter_name: play.matchup?.batter?.fullName ?? null,
              initial_call: event.details?.call?.description ?? null,
            };

            const { error: insertErr } = await supabase
              .from("challenges")
              .upsert(challengeRow, { onConflict: "game_pk,play_index", ignoreDuplicates: true });

            if (insertErr) {
              // Duplicate = already synced, not an error
              if (insertErr.code === "23505") {
                recordsSkipped++;
              } else {
                console.error(
                  `Challenge insert error game ${game.gamePk} play ${pitchIdx}`,
                  insertErr
                );
                errors.push("Could not save a challenge record");
              }
            } else {
              recordsAdded++;
              gameChallenges++;
            }
          }
        }

        // Update game total_challenges count
        if (dbGameId && gameChallenges > 0) {
          await supabase
            .from("games")
            .update({ total_challenges: gameChallenges })
            .eq("id", dbGameId);
        }

        // Small delay to be polite to the MLB API
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error processing game ${game.gamePk}`, err);
        errors.push("A game could not be processed");
      }
    }

    // Update umpire season totals from the challenges table
    await refreshUmpireSeasonTotals(supabase);

    const uniqueErrors = [...new Set(errors)];

    await supabase
      .from("sync_logs")
      .update({
        sync_completed_at: new Date().toISOString(),
        status: errors.length === 0 ? "success" : "partial",
        records_added: recordsAdded,
        records_updated: recordsUpdated,
        records_skipped: recordsSkipped,
        // sync_logs is world-readable, so only sanitized summaries are stored here.
        error_message:
          uniqueErrors.length > 0
            ? `${errors.length} issue(s): ${uniqueErrors.slice(0, 5).join("; ")}`
            : null,
        metadata: {
          startDate,
          endDate,
          gamesProcessed: games.length,
          umpire_count: new Set(games.map((g) => g.hpUmpireMlbId).filter(Boolean)).size,
        },
      })
      .eq("id", syncLogId);

    await supabase
      .from("data_sources")
      .update({
        last_successful_sync: new Date().toISOString(),
        consecutive_failures: 0,
      })
      .eq("id", dataSource.id);

    return jsonResponse({
      success: true,
      message: `Synced ${games.length} games (${startDate} to ${endDate}). ${recordsAdded} challenges added, ${recordsSkipped} skipped.`,
      recordsAdded,
      recordsUpdated,
      recordsSkipped,
      gamesProcessed: games.length,
      issueCount: errors.length,
    });
  } catch (error) {
    // Full detail stays in the function logs; callers get a generic message.
    console.error("Sync failed", error);

    if (syncLogId) {
      await supabase
        .from("sync_logs")
        .update({
          sync_completed_at: new Date().toISOString(),
          status: "failed",
          error_message: "Sync failed. See function logs for details.",
        })
        .eq("id", syncLogId);
    }

    const { data: ds } = await supabase
      .from("data_sources")
      .select("id, consecutive_failures")
      .eq("name", "MLB Stats API")
      .maybeSingle();

    if (ds) {
      await supabase
        .from("data_sources")
        .update({ consecutive_failures: (ds.consecutive_failures || 0) + 1 })
        .eq("id", ds.id);
    }

    return jsonResponse({ success: false, error: "Sync failed" }, 500);
  }
});

async function refreshUmpireSeasonTotals(supabase: any) {
  // Recompute season_challenges_total and season_challenges_overturned for all umpires
  // from the challenges table (MLB Stats API sourced rows only, to avoid double-counting seed data)
  const { data: stats } = await supabase
    .from("challenges")
    .select("umpire_id, outcome")
    .eq("season_year", 2026)
    .eq("data_source", "MLB Stats API");

  if (!stats || stats.length === 0) return;

  const totals = new Map<string, { total: number; overturned: number }>();
  for (const row of stats) {
    if (!row.umpire_id) continue;
    const entry = totals.get(row.umpire_id) ?? { total: 0, overturned: 0 };
    entry.total++;
    if (row.outcome === "overturned") entry.overturned++;
    totals.set(row.umpire_id, entry);
  }

  // Rank by overturned count descending
  const ranked = [...totals.entries()].sort((a, b) => b[1].overturned - a[1].overturned);

  for (let i = 0; i < ranked.length; i++) {
    const [umpireId, counts] = ranked[i];
    const overturnRate = counts.total > 0 ? (counts.overturned / counts.total) * 100 : 0;
    await supabase
      .from("umpires")
      .update({
        season_challenges_total: counts.total,
        season_challenges_overturned: counts.overturned,
        season_overturn_rate: Math.round(overturnRate * 100) / 100,
        season_rank: i + 1,
        data_source: "MLB Stats API",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", umpireId);
  }
}

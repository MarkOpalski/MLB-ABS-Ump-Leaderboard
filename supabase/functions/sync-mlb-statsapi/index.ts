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

function getWeekNumber(dateStr: string): { weekNumber: number; weekYear: number } {
  const date = new Date(dateStr + "T12:00:00Z");
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((date.getTime() - SEASON_START.getTime()) / msPerDay);
  return {
    weekNumber: Math.max(1, Math.floor(daysSinceStart / 7) + 1),
    weekYear: date.getFullYear(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let syncLogId: string | null = null;

  try {
    // Parse optional date range from request body; default to yesterday + today
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 1);

    const startDate: string = body.startDate ?? defaultStart.toISOString().split("T")[0];
    const endDate: string = body.endDate ?? today.toISOString().split("T")[0];

    const { data: dataSource } = await supabase
      .from("data_sources")
      .select("id")
      .eq("name", "MLB Stats API")
      .maybeSingle();

    if (!dataSource) throw new Error("MLB Stats API data source not found in database");

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
      `${MLB_API}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}` +
      `&hydrate=officials&gameType=R`;

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

        let hpUmpireMlbId: number | null = null;
        let hpUmpireName: string | null = null;

        for (const official of game.officials ?? []) {
          if (official.officialType === "Home Plate") {
            hpUmpireMlbId = official.official?.id ?? null;
            hpUmpireName = official.official?.fullName ?? null;
            break;
          }
        }

        games.push({
          gamePk: game.gamePk,
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
      umpireByName.set(u.name.toLowerCase(), u.id);
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
    const errors: string[] = [];

    // Step 2: for each game, fetch play-by-play and find ABS challenges
    for (const game of games) {
      try {
        // Ensure we have a DB record for this game's umpire
        let dbUmpireId: string | null = null;

        if (game.hpUmpireMlbId && umpireByMlbId.has(game.hpUmpireMlbId)) {
          dbUmpireId = umpireByMlbId.get(game.hpUmpireMlbId)!;
        } else if (game.hpUmpireName) {
          const nameLower = game.hpUmpireName.toLowerCase();
          dbUmpireId = umpireByName.get(nameLower) ?? null;

          // Try partial last-name match
          if (!dbUmpireId) {
            const lastName = nameLower.split(" ").pop()!;
            for (const [key, id] of umpireByName) {
              if (key.endsWith(lastName)) {
                dbUmpireId = id;
                break;
              }
            }
          }

          // Create a new umpire record if not found
          if (!dbUmpireId && game.hpUmpireName) {
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
              errors.push(`Failed to create umpire ${game.hpUmpireName}: ${uErr.message}`);
            } else {
              dbUmpireId = newUmpire.id;
              if (game.hpUmpireMlbId) umpireByMlbId.set(game.hpUmpireMlbId, dbUmpireId!);
              umpireByName.set(game.hpUmpireName.toLowerCase(), dbUmpireId!);
            }
          } else if (dbUmpireId && game.hpUmpireMlbId) {
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
          errors.push(`PBP fetch failed for game ${game.gamePk}: ${pbpRes.status}`);
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
                errors.push(`Challenge insert error game ${game.gamePk} play ${pitchIdx}: ${insertErr.message}`);
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
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error processing game ${game.gamePk}: ${msg}`);
      }
    }

    // Update umpire season totals from the challenges table
    await refreshUmpireSeasonTotals(supabase);

    await supabase
      .from("sync_logs")
      .update({
        sync_completed_at: new Date().toISOString(),
        status: errors.length === 0 ? "success" : "partial",
        records_added: recordsAdded,
        records_updated: recordsUpdated,
        records_skipped: recordsSkipped,
        error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
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

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${games.length} games (${startDate} to ${endDate}). ${recordsAdded} challenges added, ${recordsSkipped} skipped.`,
        recordsAdded,
        recordsUpdated,
        recordsSkipped,
        gamesProcessed: games.length,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (syncLogId) {
      await supabase
        .from("sync_logs")
        .update({
          sync_completed_at: new Date().toISOString(),
          status: "failed",
          error_message: errorMessage,
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

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

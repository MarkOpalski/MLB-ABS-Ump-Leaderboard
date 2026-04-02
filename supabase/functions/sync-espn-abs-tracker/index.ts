import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ESPNUmpireData {
  rank: number;
  name: string;
  pitchesChallenged: number;
  callsOverturned: number;
  overturnRate: number;
  pitchesCalled: number;
}

interface SyncResult {
  success: boolean;
  recordsAdded: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  umpires: ESPNUmpireData[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let syncLogId: string | null = null;

  try {
    const { data: dataSource } = await supabase
      .from("data_sources")
      .select("id")
      .eq("name", "ESPN")
      .maybeSingle();

    if (!dataSource) {
      throw new Error("ESPN data source not found in database");
    }

    const { data: syncLog, error: syncLogError } = await supabase
      .from("sync_logs")
      .insert({
        data_source_id: dataSource.id,
        sync_started_at: new Date().toISOString(),
        status: "running",
      })
      .select()
      .single();

    if (syncLogError) throw syncLogError;
    syncLogId = syncLog.id;

    const espnUrl = "https://www.espn.com/mlb/story/_/id/48305211/2026-mlb-abs-challenge-system-tracker-team-player-rankings";

    const response = await fetch(espnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`ESPN fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const umpires = parseESPNData(html);

    if (umpires.length === 0) {
      throw new Error("No umpire data found in ESPN page - page structure may have changed");
    }

    const result = await syncUmpireData(supabase, umpires);

    await supabase
      .from("sync_logs")
      .update({
        sync_completed_at: new Date().toISOString(),
        status: result.success ? "success" : "partial",
        records_added: result.recordsAdded,
        records_updated: result.recordsUpdated,
        records_skipped: result.recordsSkipped,
        error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
        metadata: { umpire_count: umpires.length },
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
        message: `Synced ${umpires.length} umpires from ESPN`,
        ...result,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
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

    const { data: dataSource } = await supabase
      .from("data_sources")
      .select("id, consecutive_failures")
      .eq("name", "ESPN")
      .maybeSingle();

    if (dataSource) {
      await supabase
        .from("data_sources")
        .update({
          consecutive_failures: (dataSource.consecutive_failures || 0) + 1,
        })
        .eq("id", dataSource.id);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

function parseESPNData(html: string): ESPNUmpireData[] {
  const umpires: ESPNUmpireData[] = [];

  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex);

  if (!tables) {
    return [];
  }

  for (const table of tables) {
    if (table.includes("Umpire") || table.includes("Name")) {
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = table.match(rowRegex);

      if (!rows) continue;

      for (const row of rows) {
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells = [...row.matchAll(cellRegex)].map(match => {
          const content = match[1].replace(/<[^>]+>/g, "").trim();
          return content;
        });

        if (cells.length >= 5 && cells[1] && !cells[1].includes("Name")) {
          const name = cells[1].trim();
          const pitchesChallenged = parseInt(cells[2]) || 0;
          const callsOverturned = parseInt(cells[3]) || 0;
          const overturnRate = parseFloat(cells[4].replace("%", "")) || 0;
          const pitchesCalled = parseInt(cells[5]) || 0;

          if (name && pitchesCalled > 0) {
            umpires.push({
              rank: parseInt(cells[0]) || 0,
              name,
              pitchesChallenged,
              callsOverturned,
              overturnRate,
              pitchesCalled,
            });
          }
        }
      }
    }
  }

  return umpires;
}

async function syncUmpireData(supabase: any, umpires: ESPNUmpireData[]): Promise<SyncResult> {
  let recordsAdded = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  const errors: string[] = [];

  for (const umpireData of umpires) {
    try {
      const normalizedName = normalizeUmpireName(umpireData.name);

      const { data: existingUmpire } = await supabase
        .from("umpires")
        .select("id, name, pitches_called")
        .ilike("name", normalizedName)
        .maybeSingle();

      if (existingUmpire) {
        const updates: any = {
          pitches_called: umpireData.pitchesCalled,
          data_source: "ESPN",
          last_synced_at: new Date().toISOString(),
        };

        await supabase
          .from("umpires")
          .update(updates)
          .eq("id", existingUmpire.id);

        recordsUpdated++;

        await syncChallenges(supabase, existingUmpire.id, umpireData);
      } else {
        const { data: newUmpire, error: insertError } = await supabase
          .from("umpires")
          .insert({
            name: umpireData.name,
            pitches_called: umpireData.pitchesCalled,
            data_source: "ESPN",
            last_synced_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          errors.push(`Failed to insert ${umpireData.name}: ${insertError.message}`);
          continue;
        }

        recordsAdded++;

        await syncChallenges(supabase, newUmpire.id, umpireData);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Error processing ${umpireData.name}: ${errorMsg}`);
    }
  }

  return {
    success: errors.length === 0,
    recordsAdded,
    recordsUpdated,
    recordsSkipped,
    errors,
    umpires,
  };
}

async function syncChallenges(supabase: any, umpireId: string, umpireData: ESPNUmpireData) {
  const challengesToCreate = umpireData.callsOverturned;
  const challengesToStand = umpireData.pitchesChallenged - umpireData.callsOverturned;

  const { data: existingChallenges } = await supabase
    .from("challenges")
    .select("id, outcome")
    .eq("umpire_id", umpireId)
    .eq("season_year", 2026)
    .eq("data_source", "ESPN");

  const existingOverturned = existingChallenges?.filter((c: any) => c.outcome === "overturned").length || 0;
  const existingStands = existingChallenges?.filter((c: any) => c.outcome === "stands").length || 0;

  const needOverturned = Math.max(0, challengesToCreate - existingOverturned);
  const needStands = Math.max(0, challengesToStand - existingStands);

  const challengeDate = new Date().toISOString().split("T")[0];

  for (let i = 0; i < needOverturned; i++) {
    await supabase.from("challenges").insert({
      umpire_id: umpireId,
      challenge_date: challengeDate,
      outcome: "overturned",
      season_year: 2026,
      data_source: "ESPN",
      last_synced_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < needStands; i++) {
    await supabase.from("challenges").insert({
      umpire_id: umpireId,
      challenge_date: challengeDate,
      outcome: "stands",
      season_year: 2026,
      data_source: "ESPN",
      last_synced_at: new Date().toISOString(),
    });
  }
}

function normalizeUmpireName(name: string): string {
  return name
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

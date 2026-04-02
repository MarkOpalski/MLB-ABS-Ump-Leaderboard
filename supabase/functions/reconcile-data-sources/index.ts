import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConflictResult {
  conflictsDetected: number;
  conflictsResolved: number;
  umpireStats: Array<{
    umpireId: string;
    umpireName: string;
    totalChallenges: number;
    sources: Record<string, number>;
    hasConflict: boolean;
  }>;
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

  try {
    const { data: umpires } = await supabase
      .from("umpires")
      .select("id, name")
      .order("name");

    if (!umpires || umpires.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No umpires found to reconcile",
          conflictsDetected: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let conflictsDetected = 0;
    let conflictsResolved = 0;
    const umpireStats: ConflictResult["umpireStats"] = [];

    for (const umpire of umpires) {
      const { data: challenges } = await supabase
        .from("challenges")
        .select("data_source, outcome")
        .eq("umpire_id", umpire.id)
        .eq("season_year", 2026);

      if (!challenges || challenges.length === 0) {
        continue;
      }

      const sourceStats: Record<string, number> = {};

      for (const challenge of challenges) {
        const source = challenge.data_source || "Unknown";
        sourceStats[source] = (sourceStats[source] || 0) + 1;
      }

      const sources = Object.keys(sourceStats);
      let hasConflict = false;

      if (sources.length > 1) {
        const counts = Object.values(sourceStats);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);

        if (maxCount - minCount > 2) {
          hasConflict = true;
          conflictsDetected++;

          const { data: existingConflict } = await supabase
            .from("data_conflicts")
            .select("id, resolved")
            .eq("umpire_id", umpire.id)
            .eq("conflict_type", "challenge_count_mismatch")
            .eq("resolved", false)
            .maybeSingle();

          if (!existingConflict) {
            await supabase.from("data_conflicts").insert({
              umpire_id: umpire.id,
              conflict_type: "challenge_count_mismatch",
              source_1_name: sources[0],
              source_1_value: { count: sourceStats[sources[0]] },
              source_2_name: sources[1] || sources[0],
              source_2_value: { count: sourceStats[sources[1] || sources[0]] },
              resolved: false,
            });
          }
        }
      }

      umpireStats.push({
        umpireId: umpire.id,
        umpireName: umpire.name,
        totalChallenges: challenges.length,
        sources: sourceStats,
        hasConflict,
      });
    }

    const result: ConflictResult = {
      conflictsDetected,
      conflictsResolved,
      umpireStats: umpireStats.filter(u => u.hasConflict),
    };

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reconciliation complete. Found ${conflictsDetected} conflicts.`,
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

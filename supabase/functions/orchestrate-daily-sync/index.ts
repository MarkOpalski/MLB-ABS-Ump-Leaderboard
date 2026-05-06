import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncStep {
  name: string;
  functionUrl: string;
  success: boolean;
  duration: number;
  error?: string;
  data?: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const syncStartTime = Date.now();
  const steps: SyncStep[] = [];

  try {
    const { data: dataSources } = await supabase
      .from("data_sources")
      .select("*")
      .eq("is_active", true)
      .order("priority");

    if (!dataSources || dataSources.length === 0) {
      throw new Error("No active data sources found");
    }

    for (const source of dataSources) {
      if (source.consecutive_failures >= 5) {
        console.log(`Skipping ${source.name} due to circuit breaker (${source.consecutive_failures} consecutive failures)`);
        continue;
      }

      const stepStartTime = Date.now();
      let step: SyncStep = {
        name: source.name,
        functionUrl: "",
        success: false,
        duration: 0,
      };

      try {
        const sourceFunctionMap: Record<string, string> = {
          "MLB Stats API": "sync-mlb-statsapi",
          "ESPN": "sync-espn-abs-tracker",
        };

        const functionSlug = sourceFunctionMap[source.name];

        if (!functionSlug) {
          step.success = false;
          step.error = `No sync function implemented for source: ${source.name}`;
          step.duration = Date.now() - stepStartTime;
          steps.push(step);
          continue;
        }

        const functionUrl = `${supabaseUrl}/functions/v1/${functionSlug}`;
        step.functionUrl = functionUrl;

        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();
        step.success = result.success;
        step.data = result;

        if (!result.success) {
          step.error = result.error || "Unknown error";
        }

        step.duration = Date.now() - stepStartTime;
        steps.push(step);

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        step.duration = Date.now() - stepStartTime;
        step.success = false;
        step.error = error instanceof Error ? error.message : String(error);
        steps.push(step);
      }
    }

    const reconcileStartTime = Date.now();
    let reconcileStep: SyncStep = {
      name: "Data Reconciliation",
      functionUrl: `${supabaseUrl}/functions/v1/reconcile-data-sources`,
      success: false,
      duration: 0,
    };

    try {
      const reconcileUrl = `${supabaseUrl}/functions/v1/reconcile-data-sources`;
      const response = await fetch(reconcileUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      reconcileStep.success = result.success;
      reconcileStep.data = result;

      if (!result.success) {
        reconcileStep.error = result.error || "Unknown error";
      }
    } catch (error) {
      reconcileStep.error = error instanceof Error ? error.message : String(error);
    }

    reconcileStep.duration = Date.now() - reconcileStartTime;
    steps.push(reconcileStep);

    const totalDuration = Date.now() - syncStartTime;
    const successfulSteps = steps.filter(s => s.success).length;
    const overallSuccess = successfulSteps === steps.length;

    return new Response(
      JSON.stringify({
        success: overallSuccess,
        message: `Daily sync completed. ${successfulSteps}/${steps.length} steps successful.`,
        totalDuration,
        steps,
        summary: {
          totalSteps: steps.length,
          successfulSteps,
          failedSteps: steps.length - successfulSteps,
          durationMs: totalDuration,
        },
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
    const totalDuration = Date.now() - syncStartTime;

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        totalDuration,
        steps,
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

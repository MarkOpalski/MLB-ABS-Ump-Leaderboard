import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Default: yesterday and today
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const startDate = body.startDate ?? yesterday.toISOString().split("T")[0];
  const endDate = body.endDate ?? today.toISOString().split("T")[0];

  const start = Date.now();

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-mlb-statsapi`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate }),
    });

    const result = await response.json();

    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.message ?? result.error,
        durationMs: Date.now() - start,
        ...result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, durationMs: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Constant-time string comparison. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().split("T")[0] === value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Default: yesterday and today
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch { /* no body */ }

  // Public callers (the site itself, using the anon key) always get the default
  // two-day window. A custom range is an operator capability, so it is honoured
  // only for a caller that presents the service role key.
  const presentedToken = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const isPrivilegedCaller =
    presentedToken.length > 0 && secretsMatch(presentedToken, supabaseServiceKey);

  let startDate = yesterday.toISOString().split("T")[0];
  let endDate = today.toISOString().split("T")[0];

  if (isPrivilegedCaller && isIsoDate(body.startDate) && isIsoDate(body.endDate)) {
    startDate = body.startDate;
    endDate = body.endDate;
  }

  const start = Date.now();

  try {
    // The sync function writes with the service role key and only accepts that key.
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-mlb-statsapi`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success !== true) {
      console.error("Sync run reported a failure", result);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Data refresh failed. Please try again later.",
          durationMs: Date.now() - start,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only counts and safe status fields are echoed back to the caller.
    return new Response(
      JSON.stringify({
        success: true,
        skipped: result.skipped === true,
        message: typeof result.message === "string" ? result.message : "Data refresh complete.",
        recordsAdded: result.recordsAdded ?? 0,
        recordsSkipped: result.recordsSkipped ?? 0,
        gamesProcessed: result.gamesProcessed ?? 0,
        durationMs: Date.now() - start,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Full detail stays in the function logs; callers get a generic message.
    console.error("Orchestrated sync failed", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Data refresh failed. Please try again later.",
        durationMs: Date.now() - start,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

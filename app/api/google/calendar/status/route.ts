import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      {
        connected: false,
        authenticated: false,
      },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error: connectionError } = await admin
      .from("google_calendar_connections")
      .select(
        "google_email,granted_scopes,connected_at,updated_at,revoked_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    const connected = Boolean(data && !data.revoked_at);

    return NextResponse.json(
      {
        authenticated: true,
        connected,
        googleEmail: connected ? data?.google_email ?? null : null,
        grantedScopes: connected ? data?.granted_scopes ?? [] : [],
        connectedAt: connected ? data?.connected_at ?? null : null,
        updatedAt: connected ? data?.updated_at ?? null : null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (statusError) {
    console.error("Google Calendar status error:", statusError);

    return NextResponse.json(
      {
        connected: false,
        authenticated: true,
        error: "Status Google Calendar gagal dibaca.",
      },
      { status: 500 },
    );
  }
}

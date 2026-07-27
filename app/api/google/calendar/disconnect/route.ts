import { NextResponse } from "next/server";

import { revokeGoogleToken } from "@/lib/google/oauth";
import { decryptGoogleToken } from "@/lib/google/token-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: "Pengguna belum login." },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error: readError } = await admin
      .from("google_calendar_connections")
      .select("encrypted_refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    if (data?.encrypted_refresh_token) {
      try {
        const refreshToken = decryptGoogleToken(data.encrypted_refresh_token);
        await revokeGoogleToken(refreshToken);
      } catch (revokeError) {
        console.warn("Google token revoke warning:", revokeError);
      }
    }

    const { error: deleteError } = await admin
      .from("google_calendar_connections")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (disconnectError) {
    console.error("Google Calendar disconnect error:", disconnectError);

    return NextResponse.json(
      {
        success: false,
        error: "Koneksi Google Calendar gagal diputus.",
      },
      { status: 500 },
    );
  }
}

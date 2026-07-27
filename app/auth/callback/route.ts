import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const code =
    requestUrl.searchParams.get("code");

  const requestedNext =
    requestUrl.searchParams.get("next") ?? "/";

  const safeNext =
    requestedNext.startsWith("/")
      ? requestedNext
      : "/";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/?auth_error=missing_code",
        requestUrl.origin,
      ),
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error) {
    console.error(
      "OAuth callback error:",
      error,
    );

    return NextResponse.redirect(
      new URL(
        "/?auth_error=exchange_failed",
        requestUrl.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL(safeNext, requestUrl.origin),
  );
}
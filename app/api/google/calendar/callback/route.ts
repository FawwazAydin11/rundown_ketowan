import { NextRequest, NextResponse } from "next/server";

import {
  exchangeGoogleAuthorizationCode,
  getGoogleUserInfo,
} from "@/lib/google/oauth";
import { encryptGoogleToken } from "@/lib/google/token-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATE_COOKIE = "rundownku_google_calendar_state";
const VERIFIER_COOKIE = "rundownku_google_calendar_verifier";

function redirectAndClearCookies(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(
    new URL(destination, request.nextUrl.origin),
  );

  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/google/calendar/callback",
    maxAge: 0,
  });

  response.cookies.set(VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/google/calendar/callback",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value;

  if (oauthError) {
    return redirectAndClearCookies(
      request,
      `/?calendar_error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (
    !code ||
    !returnedState ||
    !storedState ||
    returnedState !== storedState ||
    !codeVerifier
  ) {
    return redirectAndClearCookies(request, "/?calendar_error=invalid_state");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectAndClearCookies(request, "/?calendar_error=login_required");
  }

  try {
    const tokenResponse = await exchangeGoogleAuthorizationCode({
      code,
      codeVerifier,
      origin: request.nextUrl.origin,
    });

    const googleUser = await getGoogleUserInfo(tokenResponse.access_token!);
    const admin = createAdminClient();

    const { data: existingConnection, error: existingError } = await admin
      .from("google_calendar_connections")
      .select("encrypted_refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encryptGoogleToken(tokenResponse.refresh_token)
      : existingConnection?.encrypted_refresh_token;

    if (!encryptedRefreshToken) {
      throw new Error(
        "Google tidak memberikan refresh token. Cabut akses Rundownku dari akun Google, lalu hubungkan kembali.",
      );
    }

    const scopes = (tokenResponse.scope ?? "")
      .split(" ")
      .map((scope) => scope.trim())
      .filter(Boolean);

    const now = new Date().toISOString();

    const { error: upsertError } = await admin
      .from("google_calendar_connections")
      .upsert(
        {
          user_id: user.id,
          google_email: googleUser.email ?? user.email ?? null,
          encrypted_refresh_token: encryptedRefreshToken,
          granted_scopes: scopes,
          connected_at: now,
          updated_at: now,
          revoked_at: null,
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      throw upsertError;
    }

    return redirectAndClearCookies(request, "/?calendar=connected");
  } catch (callbackError) {
    console.error("Google Calendar callback error:", callbackError);

    return redirectAndClearCookies(request, "/?calendar_error=callback_failed");
  }
}

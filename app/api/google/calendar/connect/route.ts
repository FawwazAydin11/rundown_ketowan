import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleCalendarAuthorizationUrl,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
} from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATE_COOKIE = "rundownku_google_calendar_state";
const VERIFIER_COOKIE = "rundownku_google_calendar_verifier";
const COOKIE_MAX_AGE = 10 * 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(
      new URL("/?calendar_error=login_required", request.nextUrl.origin),
    );
  }

  try {
    const state = createOAuthState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    const authorizationUrl = buildGoogleCalendarAuthorizationUrl({
      origin: request.nextUrl.origin,
      state,
      codeChallenge,
      loginHint: user.email,
    });

    const response = NextResponse.redirect(authorizationUrl);
    const secure = request.nextUrl.protocol === "https:";

    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/google/calendar/callback",
      maxAge: COOKIE_MAX_AGE,
    });

    response.cookies.set(VERIFIER_COOKIE, codeVerifier, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/google/calendar/callback",
      maxAge: COOKIE_MAX_AGE,
    });

    return response;
  } catch (connectError) {
    console.error("Google Calendar connect error:", connectError);

    return NextResponse.redirect(
      new URL("/?calendar_error=configuration", request.nextUrl.origin),
    );
  }
}

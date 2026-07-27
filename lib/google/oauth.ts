import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function getClientId() {
  const value = process.env.GOOGLE_CLIENT_ID;

  if (!value) {
    throw new Error("GOOGLE_CLIENT_ID belum dikonfigurasi.");
  }

  return value;
}

function getClientSecret() {
  const value = process.env.GOOGLE_CLIENT_SECRET;

  if (!value) {
    throw new Error("GOOGLE_CLIENT_SECRET belum dikonfigurasi.");
  }

  return value;
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

export function createCodeChallenge(codeVerifier: string) {
  return createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

export function getGoogleCalendarRedirectUri(origin: string) {
  return `${origin}/api/google/calendar/callback`;
}

export function buildGoogleCalendarAuthorizationUrl({
  origin,
  state,
  codeChallenge,
  loginHint,
}: {
  origin: string;
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
}) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getGoogleCalendarRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  if (loginHint) {
    params.set("login_hint", loginHint);
  }

  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleAuthorizationCode({
  code,
  codeVerifier,
  origin,
}: {
  code: string;
  codeVerifier: string;
  origin: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getGoogleCalendarRedirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google tidak mengembalikan access token.",
    );
  }

  return payload;
}

export async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as GoogleUserInfo & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Identitas akun Google gagal dibaca.",
    );
  }

  return payload;
}

export async function revokeGoogleToken(token: string) {
  const response = await fetch(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  });

  // Google juga dapat mengembalikan 400 ketika token sudah tidak valid.
  // Koneksi lokal tetap boleh dihapus pada kondisi tersebut.
  return response.ok;
}

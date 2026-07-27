const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type GoogleErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
  error_description?: string;
};

type RefreshTokenPayload = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GoogleCalendarResource = {
  id: string;
  summary?: string;
  description?: string;
  timeZone?: string;
};

export type GoogleEventResource = {
  id: string;
  htmlLink?: string;
};

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{ email: string }>;
  reminders: {
    useDefault: false;
    overrides: Array<{
      method: "popup";
      minutes: number;
    }>;
  };
  extendedProperties: {
    private: Record<string, string>;
  };
};

export class GoogleCalendarApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "GoogleCalendarApiError";
    this.status = status;
    this.payload = payload;
  }
}

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

function getGoogleErrorMessage(payload: GoogleErrorPayload | null) {
  return (
    payload?.error?.message ??
    payload?.error?.errors?.[0]?.message ??
    payload?.error_description ??
    "Permintaan Google Calendar gagal."
  );
}

async function googleCalendarRequest<T>({
  accessToken,
  path,
  method = "GET",
  body,
}: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | GoogleErrorPayload
    | T
    | null;

  if (!response.ok) {
    throw new GoogleCalendarApiError(
      getGoogleErrorMessage(payload as GoogleErrorPayload | null),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as RefreshTokenPayload;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new GoogleCalendarApiError(
      payload.error_description ??
        payload.error ??
        "Access token Google gagal diperbarui.",
      response.status,
      payload,
    );
  }

  return payload.access_token;
}

export async function createGoogleCalendar({
  accessToken,
  summary,
  description,
  timeZone,
}: {
  accessToken: string;
  summary: string;
  description: string;
  timeZone: string;
}) {
  return googleCalendarRequest<GoogleCalendarResource>({
    accessToken,
    path: "/calendars",
    method: "POST",
    body: {
      summary,
      description,
      timeZone,
    },
  });
}

export async function getGoogleCalendar(
  accessToken: string,
  calendarId: string,
) {
  return googleCalendarRequest<GoogleCalendarResource>({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}`,
  });
}

export async function createGoogleEvent({
  accessToken,
  calendarId,
  event,
}: {
  accessToken: string;
  calendarId: string;
  event: GoogleCalendarEventInput;
}) {
  return googleCalendarRequest<GoogleEventResource>({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    method: "POST",
    body: event,
  });
}

export async function updateGoogleEvent({
  accessToken,
  calendarId,
  eventId,
  event,
}: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: GoogleCalendarEventInput;
}) {
  return googleCalendarRequest<GoogleEventResource>({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    method: "PATCH",
    body: event,
  });
}

export async function deleteGoogleEvent({
  accessToken,
  calendarId,
  eventId,
}: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}) {
  await googleCalendarRequest<void>({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    method: "DELETE",
  });
}

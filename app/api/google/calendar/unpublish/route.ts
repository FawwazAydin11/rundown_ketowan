import { NextResponse } from "next/server";

import {
  deleteGoogleEvent,
  GoogleCalendarApiError,
  refreshGoogleAccessToken,
} from "@/lib/google/calendar-api";
import { decryptGoogleToken } from "@/lib/google/token-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingGoogleResource(error: unknown) {
  return (
    error instanceof GoogleCalendarApiError &&
    (error.status === 404 || error.status === 410)
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { success: false, error: "Pengguna belum login." },
      { status: 401 },
    );
  }

  let projectId = "";

  try {
    const body = (await request.json()) as { projectId?: unknown };
    projectId = typeof body.projectId === "string" ? body.projectId : "";
  } catch {
    return NextResponse.json(
      { success: false, error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json(
      { success: false, error: "ID proyek tidak valid." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,name,owner_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Proyek tidak ditemukan." },
        { status: 404 },
      );
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Hanya pemilik proyek yang dapat membatalkan publikasi.",
        },
        { status: 403 },
      );
    }

    const [connectionResult, calendarResult, linksResult] = await Promise.all([
      admin
        .from("google_calendar_connections")
        .select("encrypted_refresh_token,revoked_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("project_calendars")
        .select(
          "project_id,connected_by,google_calendar_id,calendar_name,last_published_at",
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      admin
        .from("calendar_event_links")
        .select("rundown_item_id,google_calendar_id,google_event_id")
        .eq("project_id", projectId),
    ]);

    if (connectionResult.error) {
      throw connectionResult.error;
    }

    if (calendarResult.error) {
      throw calendarResult.error;
    }

    if (linksResult.error) {
      throw linksResult.error;
    }

    const projectCalendar = calendarResult.data;
    const links = (linksResult.data ?? []) as Array<{
      rundown_item_id: string;
      google_calendar_id: string;
      google_event_id: string;
    }>;

    if (!projectCalendar?.last_published_at && links.length === 0) {
      return NextResponse.json({
        success: true,
        calendarName: projectCalendar?.calendar_name ?? null,
        deleted: 0,
        alreadyUnpublished: true,
      });
    }

    if (
      projectCalendar &&
      projectCalendar.connected_by !== user.id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Kalender proyek terhubung ke akun Google pemilik yang berbeda.",
        },
        { status: 409 },
      );
    }

    const connection = connectionResult.data;

    if (!connection || connection.revoked_at) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Hubungkan kembali Google Calendar sebelum membatalkan publikasi.",
        },
        { status: 409 },
      );
    }

    const refreshToken = decryptGoogleToken(
      connection.encrypted_refresh_token,
    );
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    let deleted = 0;
    let alreadyMissing = 0;

    for (const link of links) {
      try {
        await deleteGoogleEvent({
          accessToken,
          calendarId: link.google_calendar_id,
          eventId: link.google_event_id,
        });
        deleted += 1;
      } catch (error) {
        if (isMissingGoogleResource(error)) {
          alreadyMissing += 1;
          continue;
        }

        throw error;
      }
    }

    const { error: deleteLinksError } = await admin
      .from("calendar_event_links")
      .delete()
      .eq("project_id", projectId);

    if (deleteLinksError) {
      throw deleteLinksError;
    }

    const now = new Date().toISOString();
    const { error: updateCalendarError } = await admin
      .from("project_calendars")
      .update({
        last_published_at: null,
        updated_at: now,
      })
      .eq("project_id", projectId);

    if (updateCalendarError) {
      throw updateCalendarError;
    }

    return NextResponse.json({
      success: true,
      calendarName: projectCalendar?.calendar_name ?? null,
      deleted,
      alreadyMissing,
      unpublishedAt: now,
    });
  } catch (error) {
    console.error("Google Calendar unpublish error:", error);

    if (error instanceof GoogleCalendarApiError) {
      const reconnectRequired =
        error.status === 400 || error.status === 401 || error.status === 403;

      return NextResponse.json(
        {
          success: false,
          error: reconnectRequired
            ? "Izin Google Calendar tidak lagi valid. Putuskan lalu hubungkan Calendar kembali."
            : error.message,
        },
        { status: reconnectRequired ? 409 : 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Publikasi Google Calendar gagal dibatalkan.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newestTimestamp(values: Array<string | null | undefined>) {
  let newest: string | null = null;
  let newestTime = 0;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const time = Date.parse(value);

    if (Number.isNaN(time)) {
      continue;
    }

    if (!newest || time > newestTime) {
      newest = value;
      newestTime = time;
    }
  }

  return newest;
}

export async function GET(request: Request) {
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

  const requestUrl = new URL(request.url);
  const projectId = requestUrl.searchParams.get("projectId") ?? "";

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
      .select("id,owner_id")
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
      const { data: membership, error: membershipError } = await admin
        .from("project_members")
        .select("user_id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      if (!membership) {
        return NextResponse.json(
          { success: false, error: "Anda bukan anggota proyek ini." },
          { status: 403 },
        );
      }
    }

    const [calendarResult, linksResult, daysResult] = await Promise.all([
      admin
        .from("project_calendars")
        .select(
          "project_id,calendar_name,google_calendar_id,last_published_at,updated_at",
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      admin
        .from("calendar_event_links")
        .select("rundown_item_id,last_synced_at")
        .eq("project_id", projectId),
      admin
        .from("rundown_days")
        .select("id,updated_at")
        .eq("project_id", projectId),
    ]);

    if (calendarResult.error) {
      throw calendarResult.error;
    }

    if (linksResult.error) {
      throw linksResult.error;
    }

    if (daysResult.error) {
      throw daysResult.error;
    }

    const dayRows = (daysResult.data ?? []) as Array<{
      id: string;
      updated_at: string | null;
    }>;
    const dayIds = dayRows.map((day) => day.id);

    let itemRows: Array<{
      id: string;
      calendar_scope: "all_participants" | "pic_only" | "not_synced";
      updated_at: string | null;
    }> = [];
    let assigneeRows: Array<{ assigned_at: string | null }> = [];

    if (dayIds.length > 0) {
      const itemsResult = await admin
        .from("rundown_items")
        .select("id,calendar_scope,updated_at")
        .in("day_id", dayIds);

      if (itemsResult.error) {
        throw itemsResult.error;
      }

      itemRows = (itemsResult.data ?? []) as typeof itemRows;
      const itemIds = itemRows.map((item) => item.id);

      if (itemIds.length > 0) {
        const assigneesResult = await admin
          .from("rundown_item_assignees")
          .select("assigned_at")
          .in("item_id", itemIds);

        if (assigneesResult.error) {
          throw assigneesResult.error;
        }

        assigneeRows = (assigneesResult.data ?? []) as typeof assigneeRows;
      }
    }

    const calendar = calendarResult.data;
    const links = (linksResult.data ?? []) as Array<{
      rundown_item_id: string;
      last_synced_at: string | null;
    }>;
    const publishedItemIds = links.map((link) => link.rundown_item_id);
    const publishedItemIdSet = new Set(publishedItemIds);
    const syncableItemIds = itemRows
      .filter((item) => item.calendar_scope !== "not_synced")
      .map((item) => item.id);
    const syncableItemIdSet = new Set(syncableItemIds);

    const linkMismatch =
      publishedItemIdSet.size !== syncableItemIdSet.size ||
      syncableItemIds.some((itemId) => !publishedItemIdSet.has(itemId)) ||
      publishedItemIds.some((itemId) => !syncableItemIdSet.has(itemId));

    const latestChangeAt = newestTimestamp([
      ...dayRows.map((row) => row.updated_at),
      ...itemRows.map((row) => row.updated_at),
      ...assigneeRows.map((row) => row.assigned_at),
    ]);

    const lastPublishedAt = calendar?.last_published_at ?? null;
    const published = Boolean(lastPublishedAt);
    const latestChangeTime = latestChangeAt ? Date.parse(latestChangeAt) : 0;
    const lastPublishedTime = lastPublishedAt ? Date.parse(lastPublishedAt) : 0;
    const changedAfterPublish =
      published &&
      latestChangeTime > 0 &&
      lastPublishedTime > 0 &&
      latestChangeTime > lastPublishedTime;
    const needsRepublish = published && (changedAfterPublish || linkMismatch);

    return NextResponse.json(
      {
        success: true,
        published,
        needsRepublish,
        calendarName: calendar?.calendar_name ?? null,
        googleCalendarId: calendar?.google_calendar_id ?? null,
        lastPublishedAt,
        latestChangeAt,
        totalPublished: publishedItemIds.length,
        totalSyncable: syncableItemIds.length,
        publishedItemIds,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Calendar publish status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Status publikasi Calendar gagal dibaca.",
      },
      { status: 500 },
    );
  }
}

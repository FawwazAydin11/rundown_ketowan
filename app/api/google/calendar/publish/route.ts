import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  createGoogleCalendar,
  createGoogleEvent,
  deleteGoogleEvent,
  getGoogleCalendar,
  GoogleCalendarApiError,
  type GoogleCalendarEventInput,
  refreshGoogleAccessToken,
  updateGoogleEvent,
} from "@/lib/google/calendar-api";
import { decryptGoogleToken } from "@/lib/google/token-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_TIMEZONE = "Asia/Jakarta";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProjectRow = {
  id: string;
  name: string;
  owner_id: string;
};

type DayRow = {
  id: string;
  title: string;
  event_date: string | null;
  first_start_time: string;
  position: number;
};

type ItemRow = {
  id: string;
  day_id: string;
  position: number;
  end_time: string | null;
  activity: string;
  note: string | null;
  pic_name: string | null;
  calendar_scope: "all_participants" | "pic_only" | "not_synced";
};

type AssigneeRow = {
  item_id: string;
  user_id: string;
};

type EventLinkRow = {
  rundown_item_id: string;
  project_id: string;
  google_calendar_id: string;
  google_event_id: string;
  content_hash: string | null;
};

type MemberIdentity = {
  id: string;
  email: string | null;
  name: string;
};

type DesiredEvent = {
  itemId: string;
  payload: GoogleCalendarEventInput;
  contentHash: string;
};

function normalizeTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function addDays(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));

  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function localDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function hashEvent(payload: GoogleCalendarEventInput) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getIdentityName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const candidate =
    metadata.full_name ?? metadata.name ?? metadata.display_name ?? null;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : user.email?.split("@")[0] ?? "Anggota";
}

function buildDescription({
  projectName,
  dayTitle,
  note,
  picNames,
  audience,
}: {
  projectName: string;
  dayTitle: string;
  note: string | null;
  picNames: string[];
  audience: ItemRow["calendar_scope"];
}) {
  const audienceLabel =
    audience === "all_participants" ? "Semua peserta" : "Hanya PIC";

  return [
    `Proyek: ${projectName}`,
    `Hari: ${dayTitle}`,
    `Penerima: ${audienceLabel}`,
    picNames.length > 0 ? `PIC: ${picNames.join(", ")}` : null,
    note?.trim() ? `Catatan: ${note.trim()}` : null,
    "",
    "Diterbitkan otomatis dari Rundownku.",
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
}

function isMissingGoogleResource(error: unknown) {
  return (
    error instanceof GoogleCalendarApiError &&
    (error.status === 404 || error.status === 410)
  );
}

async function loadMemberIdentities(
  admin: ReturnType<typeof createAdminClient>,
  memberIds: string[],
) {
  const entries = await Promise.all(
    memberIds.map(async (memberId): Promise<MemberIdentity> => {
      const { data, error } = await admin.auth.admin.getUserById(memberId);

      if (error || !data.user) {
        return {
          id: memberId,
          email: null,
          name: "Anggota",
        };
      }

      return {
        id: memberId,
        email: data.user.email ?? null,
        name: getIdentityName(data.user),
      };
    }),
  );

  return new Map(entries.map((entry) => [entry.id, entry]));
}

function buildDesiredEvents({
  project,
  days,
  items,
  assignees,
  identities,
  publisherId,
  timezone,
}: {
  project: ProjectRow;
  days: DayRow[];
  items: ItemRow[];
  assignees: AssigneeRow[];
  identities: Map<string, MemberIdentity>;
  publisherId: string;
  timezone: string;
}) {
  const itemsByDay = new Map<string, ItemRow[]>();
  const assigneesByItem = new Map<string, string[]>();

  for (const item of items) {
    const current = itemsByDay.get(item.day_id) ?? [];
    current.push(item);
    itemsByDay.set(item.day_id, current);
  }

  for (const assignee of assignees) {
    const current = assigneesByItem.get(assignee.item_id) ?? [];
    current.push(assignee.user_id);
    assigneesByItem.set(assignee.item_id, current);
  }

  const allRecipientIds = [...identities.keys()].filter(
    (memberId) => memberId !== publisherId,
  );
  const desired: DesiredEvent[] = [];
  let skipped = 0;
  const validationErrors: string[] = [];

  for (const day of days) {
    const dayItems = (itemsByDay.get(day.id) ?? []).sort(
      (a, b) => a.position - b.position,
    );

    if (dayItems.length === 0) {
      continue;
    }

    if (!day.event_date) {
      validationErrors.push(`${day.title}: tanggal belum diisi.`);
      continue;
    }

    let currentDate = day.event_date;
    let currentStartTime = normalizeTime(day.first_start_time);

    for (const item of dayItems) {
      const endTime = normalizeTime(item.end_time);

      const startMinutes = timeToMinutes(currentStartTime);
      const endMinutes = timeToMinutes(endTime);
      const activityLabel = item.activity.trim() || `Kegiatan ${item.position + 1}`;

      if (startMinutes === null || endMinutes === null) {
        validationErrors.push(
          `${day.title} — ${activityLabel}: jam mulai/selesai belum lengkap.`,
        );
        continue;
      }

      if (startMinutes === endMinutes) {
        validationErrors.push(
          `${day.title} — ${activityLabel}: durasi tidak boleh 0 menit.`,
        );
        continue;
      }

      const startDate = currentDate;
      const endDate =
        endMinutes < startMinutes ? addDays(startDate, 1) : startDate;

      if (item.calendar_scope === "not_synced") {
        skipped += 1;
        currentDate = endDate;
        currentStartTime = endTime;
        continue;
      }

      if (!item.activity.trim()) {
        validationErrors.push(`${day.title}: ada kegiatan tanpa nama.`);
        continue;
      }

      const selectedAssigneeIds = unique(
        assigneesByItem.get(item.id) ?? [],
      );

      if (
        item.calendar_scope === "pic_only" &&
        selectedAssigneeIds.length === 0
      ) {
        validationErrors.push(
          `${day.title} — ${item.activity}: pilih minimal satu PIC.`,
        );
        continue;
      }

      const recipientIds =
        item.calendar_scope === "all_participants"
          ? allRecipientIds
          : selectedAssigneeIds.filter((id) => id !== publisherId);

      const attendees = unique(
        recipientIds
          .map((id) => identities.get(id)?.email?.trim().toLowerCase() ?? "")
          .filter(Boolean),
      ).map((email) => ({ email }));

      const picNames = selectedAssigneeIds
        .map((id) => identities.get(id)?.name)
        .filter((name): name is string => Boolean(name));

      if (picNames.length === 0 && item.pic_name?.trim()) {
        picNames.push(item.pic_name.trim());
      }

      const payload: GoogleCalendarEventInput = {
        summary: item.activity.trim(),
        description: buildDescription({
          projectName: project.name,
          dayTitle: day.title,
          note: item.note,
          picNames,
          audience: item.calendar_scope,
        }),
        start: {
          dateTime: localDateTime(startDate, currentStartTime),
          timeZone: timezone,
        },
        end: {
          dateTime: localDateTime(endDate, endTime),
          timeZone: timezone,
        },
        attendees,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 10 },
            { method: "popup", minutes: 0 },
          ],
        },
        extendedProperties: {
          private: {
            rundownkuProjectId: project.id,
            rundownkuItemId: item.id,
          },
        },
      };

      desired.push({
        itemId: item.id,
        contentHash: hashEvent(payload),
        payload,
      });

      currentDate = endDate;
      currentStartTime = endTime;
    }
  }

  if (validationErrors.length > 0) {
    const firstErrors = validationErrors.slice(0, 4).join(" ");
    const remaining = validationErrors.length - 4;

    throw new Error(
      `Lengkapi rundown sebelum diterbitkan. ${firstErrors}${
        remaining > 0 ? ` (+${remaining} masalah lain)` : ""
      }`,
    );
  }

  return { desired, skipped };
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

    const { data: projectData, error: projectError } = await admin
      .from("projects")
      .select("id,name,owner_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    const project = projectData as ProjectRow | null;

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
          error: "Hanya pemilik proyek yang dapat menerbitkan rundown.",
        },
        { status: 403 },
      );
    }

    const { data: connection, error: connectionError } = await admin
      .from("google_calendar_connections")
      .select("encrypted_refresh_token,google_email,revoked_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    if (!connection || connection.revoked_at) {
      return NextResponse.json(
        {
          success: false,
          error: "Hubungkan Google Calendar terlebih dahulu.",
        },
        { status: 409 },
      );
    }

    const refreshToken = decryptGoogleToken(
      connection.encrypted_refresh_token,
    );
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    const { data: existingProjectCalendar, error: projectCalendarError } =
      await admin
        .from("project_calendars")
        .select(
          "project_id,connected_by,google_calendar_id,calendar_name,timezone,last_published_at",
        )
        .eq("project_id", projectId)
        .maybeSingle();

    if (projectCalendarError) {
      throw projectCalendarError;
    }

    let calendarId = existingProjectCalendar?.google_calendar_id ?? "";
    let calendarName =
      existingProjectCalendar?.calendar_name ?? `Rundownku — ${project.name}`;
    const timezone = existingProjectCalendar?.timezone ?? DEFAULT_TIMEZONE;
    let calendarNeedsCreation = !calendarId;

    if (
      existingProjectCalendar &&
      existingProjectCalendar.connected_by !== user.id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Kalender proyek terhubung ke akun lain. Hubungkan akun pemilik yang sebelumnya digunakan.",
        },
        { status: 409 },
      );
    }

    if (calendarId) {
      try {
        await getGoogleCalendar(accessToken, calendarId);
      } catch (error) {
        if (isMissingGoogleResource(error)) {
          calendarNeedsCreation = true;
        } else {
          throw error;
        }
      }
    }

    if (calendarNeedsCreation) {
      const createdCalendar = await createGoogleCalendar({
        accessToken,
        summary: calendarName,
        description: `Kalender proyek ${project.name}, dibuat oleh Rundownku.`,
        timeZone: timezone,
      });

      if (!createdCalendar.id) {
        throw new Error("Google tidak mengembalikan ID kalender baru.");
      }

      calendarId = createdCalendar.id;
      calendarName = createdCalendar.summary ?? calendarName;

      const now = new Date().toISOString();
      const { error: upsertCalendarError } = await admin
        .from("project_calendars")
        .upsert(
          {
            project_id: projectId,
            connected_by: user.id,
            google_calendar_id: calendarId,
            calendar_name: calendarName,
            timezone,
            updated_at: now,
          },
          { onConflict: "project_id" },
        );

      if (upsertCalendarError) {
        throw upsertCalendarError;
      }
    }

    const [daysResult, membersResult, linksResult] = await Promise.all([
      admin
        .from("rundown_days")
        .select("id,title,event_date,first_start_time,position")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      admin
        .from("project_members")
        .select("user_id")
        .eq("project_id", projectId),
      admin
        .from("calendar_event_links")
        .select(
          "rundown_item_id,project_id,google_calendar_id,google_event_id,content_hash",
        )
        .eq("project_id", projectId),
    ]);

    if (daysResult.error) {
      throw daysResult.error;
    }

    if (membersResult.error) {
      throw membersResult.error;
    }

    if (linksResult.error) {
      throw linksResult.error;
    }

    const days = (daysResult.data ?? []) as DayRow[];
    const dayIds = days.map((day) => day.id);

    let items: ItemRow[] = [];
    let assignees: AssigneeRow[] = [];

    if (dayIds.length > 0) {
      const actualItemsResult = await admin
        .from("rundown_items")
        .select(
          "id,day_id,position,end_time,activity,note,pic_name,calendar_scope",
        )
        .in("day_id", dayIds)
        .order("position", { ascending: true });

      if (actualItemsResult.error) {
        throw actualItemsResult.error;
      }

      items = (actualItemsResult.data ?? []) as ItemRow[];
      const itemIds = items.map((item) => item.id);

      if (itemIds.length > 0) {
        const assigneesResult = await admin
          .from("rundown_item_assignees")
          .select("item_id,user_id")
          .in("item_id", itemIds);

        if (assigneesResult.error) {
          throw assigneesResult.error;
        }

        assignees = (assigneesResult.data ?? []) as AssigneeRow[];
      }
    }

    const memberIds = unique([
      project.owner_id,
      ...((membersResult.data ?? []) as Array<{ user_id: string }>).map(
        (member) => member.user_id,
      ),
    ]);
    const identities = await loadMemberIdentities(admin, memberIds);

    const { desired, skipped } = buildDesiredEvents({
      project,
      days,
      items,
      assignees,
      identities,
      publisherId: user.id,
      timezone,
    });

    const links = (linksResult.data ?? []) as EventLinkRow[];
    const linkByItem = new Map(
      links.map((link) => [link.rundown_item_id, link]),
    );
    const desiredItemIds = new Set(desired.map((event) => event.itemId));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let deleted = 0;

    for (const desiredEvent of desired) {
      const existingLink = linkByItem.get(desiredEvent.itemId);

      if (
        existingLink &&
        existingLink.google_calendar_id === calendarId &&
        existingLink.content_hash === desiredEvent.contentHash
      ) {
        unchanged += 1;
        continue;
      }

      let googleEventId = existingLink?.google_event_id ?? "";
      let wasUpdated = false;

      if (
        existingLink &&
        existingLink.google_calendar_id !== calendarId &&
        googleEventId
      ) {
        try {
          await deleteGoogleEvent({
            accessToken,
            calendarId: existingLink.google_calendar_id,
            eventId: googleEventId,
          });
        } catch (error) {
          if (!isMissingGoogleResource(error)) {
            console.warn("Old Calendar event cleanup warning:", error);
          }
        }
      }

      if (
        existingLink &&
        existingLink.google_calendar_id === calendarId &&
        googleEventId
      ) {
        try {
          const updatedEvent = await updateGoogleEvent({
            accessToken,
            calendarId,
            eventId: googleEventId,
            event: desiredEvent.payload,
          });
          if (!updatedEvent.id) {
            throw new Error("Google tidak mengembalikan ID event yang diperbarui.");
          }

          googleEventId = updatedEvent.id;
          wasUpdated = true;
        } catch (error) {
          if (!isMissingGoogleResource(error)) {
            throw error;
          }
        }
      }

      if (!wasUpdated) {
        const createdEvent = await createGoogleEvent({
          accessToken,
          calendarId,
          event: desiredEvent.payload,
        });
        if (!createdEvent.id) {
          throw new Error("Google tidak mengembalikan ID event baru.");
        }

        googleEventId = createdEvent.id;
      }

      const now = new Date().toISOString();
      const { error: linkError } = await admin
        .from("calendar_event_links")
        .upsert(
          {
            rundown_item_id: desiredEvent.itemId,
            project_id: projectId,
            google_calendar_id: calendarId,
            google_event_id: googleEventId,
            content_hash: desiredEvent.contentHash,
            last_synced_at: now,
          },
          { onConflict: "rundown_item_id" },
        );

      if (linkError) {
        throw linkError;
      }

      if (wasUpdated) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    for (const staleLink of links) {
      if (desiredItemIds.has(staleLink.rundown_item_id)) {
        continue;
      }

      try {
        await deleteGoogleEvent({
          accessToken,
          calendarId: staleLink.google_calendar_id,
          eventId: staleLink.google_event_id,
        });
      } catch (error) {
        if (!isMissingGoogleResource(error)) {
          throw error;
        }
      }

      const { error: deleteLinkError } = await admin
        .from("calendar_event_links")
        .delete()
        .eq("rundown_item_id", staleLink.rundown_item_id);

      if (deleteLinkError) {
        throw deleteLinkError;
      }

      deleted += 1;
    }

    const publishedAt = new Date().toISOString();
    const { error: publishStatusError } = await admin
      .from("project_calendars")
      .update({
        calendar_name: calendarName,
        updated_at: publishedAt,
        last_published_at: publishedAt,
      })
      .eq("project_id", projectId);

    if (publishStatusError) {
      throw publishStatusError;
    }

    return NextResponse.json({
      success: true,
      calendarName,
      created,
      updated,
      unchanged,
      deleted,
      skipped,
      publishedAt,
    });
  } catch (error) {
    console.error("Google Calendar publish error:", error);

    if (error instanceof GoogleCalendarApiError) {
      const reconnectRequired =
        error.status === 400 || error.status === 401 || error.status === 403;

      return NextResponse.json(
        {
          success: false,
          error: reconnectRequired
            ? "Izin Google Calendar tidak lagi valid atau tidak mencukupi. Putuskan lalu hubungkan Calendar kembali."
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
            : "Rundown gagal diterbitkan ke Google Calendar.",
      },
      { status: 500 },
    );
  }
}

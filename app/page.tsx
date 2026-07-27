"use client";

import {
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  LogIn,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import GoogleCalendarConnection, {
  type GoogleCalendarStatus,
} from "@/components/GoogleCalendarConnection";
import InvitePeopleDialog from "@/components/InvitePeopleDialog";
import ManageMembersDialog from "@/components/ManageMembersDialog";
import PicMemberSelect, {
  type PicMemberOption,
} from "@/components/PicMemberSelect";
import PublishCalendarButton, {
  type CalendarPublishStatus,
} from "@/components/PublishCalendarButton";
import { createClient } from "@/lib/supabase/client";

/* =========================================================
 * TYPES
 * ======================================================= */

type CalendarAudience =
  | "Semua peserta"
  | "Hanya PIC"
  | "Tidak disinkronkan";

type CalendarScope =
  | "all_participants"
  | "pic_only"
  | "not_synced";

type RundownItem = {
  id: string;
  endTime: string;
  activity: string;
  note: string;
  personInCharge: string;
  assigneeIds: string[];
  audience: CalendarAudience;
};

type RundownDay = {
  id: string;
  title: string;
  date: string;
  firstStartTime: string;
  items: RundownItem[];
};

type SaveStatus = "loading" | "saving" | "saved" | "error";

type AuthStatus = "loading" | "idle" | "redirecting" | "error";

type ProjectStatus = "idle" | "loading" | "ready" | "error";

type RemoteLoadStatus =
  | "idle"
  | "loading"
  | "migrating"
  | "ready"
  | "error";

type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

type ProjectRole = "owner" | "editor" | "participant";

type RundownProject = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role: ProjectRole;
};

type ProjectRow = Omit<RundownProject, "role">;

type StoredRundownData = {
  days: RundownDay[];
  activeDayId: string;
};

type RemoteItemPayload = {
  id: string;
  endTime: string;
  activity: string;
  note: string;
  personInCharge: string;
  assigneeIds: string[];
  calendarScope: CalendarScope;
};

type RemoteDayPayload = {
  id: string;
  title: string;
  date: string;
  firstStartTime: string;
  items: RemoteItemPayload[];
};

type MembersResponse = {
  projectId: string;
  members: PicMemberOption[];
  total: number;
};

/* =========================================================
 * CONSTANTS
 * ======================================================= */

const GUEST_STORAGE_KEY = "rundownku-guest-v4";
const PREFERRED_PROJECT_STORAGE_KEY = "rundownku-preferred-project-id";

const LEGACY_STORAGE_KEYS = [
  "rundownku-data-v3",
  "rundownku-data-v2",
  "rundownku-data-v1",
];

const PROJECT_COLUMNS =
  "id,name,description,owner_id,created_at,updated_at";

const INPUT_BASE =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const INPUT_REQUIRED =
  "h-11 w-full rounded-xl border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-amber-700/50 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const initialDays: RundownDay[] = [
  {
    id: "eb974245-0d55-4d37-b9ea-3d8c1d1ba311",
    title: "27 Juli",
    date: "2026-07-27",
    firstStartTime: "00:00",
    items: [
      {
        id: "f1a67009-327c-4110-af5b-a7bbef18aa01",
        endTime: "10:00",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Semua peserta",
      },
      {
        id: "eb2ca138-071a-47fc-871a-d5428c6f48ec",
        endTime: "12:00",
        activity: "Ambil tai sapi",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Hanya PIC",
      },
      {
        id: "3bbaedbf-c231-42aa-8c4a-49527ea70854",
        endTime: "14:00",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Semua peserta",
      },
      {
        id: "7d37a813-b90e-4dcb-bae3-a4272b551d6e",
        endTime: "17:00",
        activity: "Melanjutkan proses pembuatan mie",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Hanya PIC",
      },
      {
        id: "fb18d867-1834-48aa-baf3-179d783527ba",
        endTime: "17:30",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Semua peserta",
      },
      {
        id: "549bcf8b-a13b-457d-bde5-39928d89935a",
        endTime: "19:00",
        activity: "pengajian anjay bersama ebok",
        note: "",
        personInCharge: "",
        assigneeIds: [],
        audience: "Semua peserta",
      },
    ],
  },
];

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/* =========================================================
 * UTILITY FUNCTIONS
 * ======================================================= */

function createId() {
  return crypto.randomUUID();
}

function getProjectStorageKey(projectId: string) {
  return `rundownku-project-${projectId}-v4`;
}

function timeToMinutes(time: string) {
  if (!time) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function calculateDurationMinutes(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const rawEnd = timeToMinutes(endTime);

  if (start === null || rawEnd === null) {
    return null;
  }

  let end = rawEnd;

  if (end < start) {
    end += 24 * 60;
  }

  return end - start;
}

function formatDuration(minutes: number | null) {
  if (minutes === null) {
    return "Belum lengkap";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} menit`;
  }

  if (remainingMinutes === 0) {
    return `${hours} jam`;
  }

  return `${hours} jam ${remainingMinutes} menit`;
}

function formatDate(date: string) {
  if (!date) {
    return "Tanggal belum diatur";
  }

  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  return `${day} ${monthNames[month - 1]} ${year}`;
}

function getNextDate(date: string) {
  if (!date) {
    return "";
  }

  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + 1));

  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTodayInJakarta() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function findOpeningDay(days: RundownDay[]) {
  if (days.length === 0) {
    return null;
  }

  const today = getTodayInJakarta();
  const datedDays = days
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentDay = datedDays.find((day) => day.date === today);

  if (currentDay) {
    return currentDay;
  }

  const nearestUpcomingDay = datedDays.find((day) => day.date > today);

  if (nearestUpcomingDay) {
    return nearestUpcomingDay;
  }

  return datedDays.at(-1) ?? days[0];
}

function getAudienceAppearance(audience: CalendarAudience) {
  switch (audience) {
    case "Semua peserta":
      return "bg-blue-50 text-blue-700 ring-blue-100";
    case "Hanya PIC":
      return "bg-violet-50 text-violet-700 ring-violet-100";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function audienceToScope(audience: CalendarAudience): CalendarScope {
  switch (audience) {
    case "Semua peserta":
      return "all_participants";
    case "Tidak disinkronkan":
      return "not_synced";
    default:
      return "pic_only";
  }
}

function scopeToAudience(scope: unknown): CalendarAudience {
  switch (scope) {
    case "all_participants":
      return "Semua peserta";
    case "not_synced":
      return "Tidak disinkronkan";
    default:
      return "Hanya PIC";
  }
}

function ensureAssigneeIds(days: RundownDay[]): RundownDay[] {
  return days.map((day) => ({
    ...day,
    items: day.items.map((item) => ({
      ...item,
      assigneeIds: Array.isArray(item.assigneeIds)
        ? item.assigneeIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    })),
  }));
}

function isStoredRundownData(value: unknown): value is StoredRundownData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<StoredRundownData>;

  return (
    Array.isArray(data.days) &&
    data.days.length > 0 &&
    typeof data.activeDayId === "string"
  );
}

function readStoredRundown(key: string): StoredRundownData | null {
  try {
    const storedValue = window.localStorage.getItem(key);

    if (!storedValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!isStoredRundownData(parsedValue)) {
      return null;
    }

    return {
      ...parsedValue,
      days: ensureAssigneeIds(parsedValue.days),
    };
  } catch (error) {
    console.error(`Gagal membaca penyimpanan lokal ${key}:`, error);
    return null;
  }
}

function getUserName(user: User | null) {
  if (!user) {
    return "Tamu";
  }

  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "Pengguna"
  );
}

function getUserAvatar(user: User | null) {
  if (!user) {
    return null;
  }

  return (
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    null
  );
}

function getRoleLabel(role: ProjectRole | undefined) {
  switch (role) {
    case "owner":
      return "Pemilik";
    case "editor":
      return "Editor";
    case "participant":
      return "Peserta";
    default:
      return "Belum ditentukan";
  }
}

function toRemotePayload(days: RundownDay[]): RemoteDayPayload[] {
  return days.map((day) => ({
    id: day.id,
    title: day.title,
    date: day.date,
    firstStartTime: day.firstStartTime,
    items: day.items.map((item) => ({
      id: item.id,
      endTime: item.endTime,
      activity: item.activity,
      note: item.note,
      personInCharge: item.personInCharge,
      assigneeIds: Array.isArray(item.assigneeIds) ? item.assigneeIds : [],
      calendarScope: audienceToScope(item.audience),
    })),
  }));
}

function serializeRemotePayload(days: RundownDay[]) {
  return JSON.stringify(toRemotePayload(days));
}

function normalizeRemoteRundown(value: unknown): RundownDay[] {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((rawDay, dayIndex): RundownDay | null => {
      if (!rawDay || typeof rawDay !== "object") {
        return null;
      }

      const day = rawDay as Record<string, unknown>;
      const rawItems = Array.isArray(day.items) ? day.items : [];

      const items = rawItems
        .map((rawItem): RundownItem | null => {
          if (!rawItem || typeof rawItem !== "object") {
            return null;
          }

          const item = rawItem as Record<string, unknown>;

          return {
            id:
              typeof item.id === "string" && item.id
                ? item.id
                : createId(),
            endTime:
              typeof item.endTime === "string" ? item.endTime : "",
            activity:
              typeof item.activity === "string" ? item.activity : "",
            note: typeof item.note === "string" ? item.note : "",
            personInCharge:
              typeof item.personInCharge === "string"
                ? item.personInCharge
                : "",
            assigneeIds: Array.isArray(item.assigneeIds)
              ? item.assigneeIds.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
            audience: scopeToAudience(item.calendarScope),
          };
        })
        .filter((item): item is RundownItem => item !== null);

      return {
        id:
          typeof day.id === "string" && day.id ? day.id : createId(),
        title:
          typeof day.title === "string" && day.title.trim()
            ? day.title
            : `Hari ${dayIndex + 1}`,
        date: typeof day.date === "string" ? day.date : "",
        firstStartTime:
          typeof day.firstStartTime === "string" && day.firstStartTime
            ? day.firstStartTime
            : "08:00",
        items,
      };
    })
    .filter((day): day is RundownDay => day !== null);
}

/* =========================================================
 * DATABASE FUNCTIONS
 * ======================================================= */

async function getProjectRole(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  ownerId: string,
): Promise<ProjectRole> {
  if (ownerId === userId) {
    return "owner";
  }

  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal membaca role: ${error.message}`);
  }

  return (data?.role as ProjectRole | undefined) ?? "participant";
}

async function getOrCreateDefaultProject(
  supabase: SupabaseClient,
  user: User,
  preferredProjectId?: string | null,
): Promise<RundownProject> {
  if (preferredProjectId) {
    const { data: preferredProject, error: preferredError } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", preferredProjectId)
      .maybeSingle();

    if (preferredError) {
      throw new Error(`Gagal membaca proyek pilihan: ${preferredError.message}`);
    }

    if (preferredProject) {
      const project = preferredProject as ProjectRow;
      const role = await getProjectRole(
        supabase,
        project.id,
        user.id,
        project.owner_id,
      );

      return { ...project, role };
    }
  }

  const { data: existingProject, error: selectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Gagal membaca proyek: ${selectError.message}`);
  }

  if (existingProject) {
    const project = existingProject as ProjectRow;
    const role = await getProjectRole(
      supabase,
      project.id,
      user.id,
      project.owner_id,
    );

    return { ...project, role };
  }

  const { data: createdProject, error: createError } = await supabase
    .rpc("get_or_create_default_project")
    .single();

  if (createError || !createdProject) {
    throw new Error(
      `Gagal membuat proyek: ${
        createError?.message ?? "Data proyek tidak dikembalikan."
      }`,
    );
  }

  return {
    ...(createdProject as ProjectRow),
    role: "owner",
  };
}

async function getProjectRundown(
  supabase: SupabaseClient,
  projectId: string,
) {
  const { data, error } = await supabase.rpc("get_project_rundown", {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(`Gagal membaca rundown online: ${error.message}`);
  }

  return normalizeRemoteRundown(data);
}

async function saveProjectRundown(
  supabase: SupabaseClient,
  projectId: string,
  days: RundownDay[],
) {
  const { error } = await supabase.rpc("save_project_rundown", {
    p_project_id: projectId,
    p_days: toRemotePayload(days),
  });

  if (error) {
    throw new Error(`Gagal menyimpan rundown online: ${error.message}`);
  }
}

/* =========================================================
 * MAIN COMPONENT
 * ======================================================= */

export default function Home() {
  const [days, setDays] = useState<RundownDay[]>(initialDays);
  const [activeDayId, setActiveDayId] = useState(initialDays[0].id);
  const [storageReady, setStorageReady] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] =
    useState<SaveStatus>("loading");

  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authMessage, setAuthMessage] = useState("");

  const [project, setProject] = useState<RundownProject | null>(null);
  const [projectStatus, setProjectStatus] =
    useState<ProjectStatus>("idle");

  const [remoteLoadStatus, setRemoteLoadStatus] =
    useState<RemoteLoadStatus>("idle");
  const [remoteSaveStatus, setRemoteSaveStatus] =
    useState<SaveStatus>("loading");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [projectMembers, setProjectMembers] = useState<PicMemberOption[]>([]);
  const [membersLoadStatus, setMembersLoadStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [membersReloadToken, setMembersReloadToken] = useState(0);
  const [googleCalendarStatus, setGoogleCalendarStatus] =
    useState<GoogleCalendarStatus | null>(null);
  const [calendarPublishStatus, setCalendarPublishStatus] =
    useState<CalendarPublishStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("idle");
  const [realtimeRefreshToken, setRealtimeRefreshToken] = useState(0);

  const handleGoogleCalendarStatusChange = useCallback(
    (status: GoogleCalendarStatus) => {
      setGoogleCalendarStatus(status);
    },
    [],
  );

  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const remoteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const projectLoadRef = useRef<string | null>(null);
  const rundownLoadRef = useRef<string | null>(null);
  const lastRemoteSnapshotRef = useRef("");
  const daysRef = useRef(days);
  const activeDayIdRef = useRef(activeDayId);
  const openingDaySelectionRef = useRef<string | null>(null);
  const activeDayTabRef = useRef<HTMLButtonElement | null>(null);
  const realtimeSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingRealtimeRefreshRef = useRef(false);
  const realtimeFetchInFlightRef = useRef(false);

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    activeDayIdRef.current = activeDayId;
  }, [activeDayId]);

  /* -------------------------------------------------------
   * LOAD LOCAL DATA
   * ----------------------------------------------------- */

  useEffect(() => {
    try {
      const keysToTry = [GUEST_STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
      let storedData: StoredRundownData | null = null;

      for (const key of keysToTry) {
        storedData = readStoredRundown(key);

        if (storedData) {
          break;
        }
      }

      if (storedData) {
        setDays(storedData.days);

        const activeDayStillExists = storedData.days.some(
          (day) => day.id === storedData.activeDayId,
        );

        setActiveDayId(
          activeDayStillExists
            ? storedData.activeDayId
            : storedData.days[0].id,
        );
      }

      setLocalSaveStatus("saved");
    } catch (error) {
      console.error("Gagal membaca rundown lokal:", error);
      setLocalSaveStatus("error");
    } finally {
      setStorageReady(true);
    }
  }, []);

  /* -------------------------------------------------------
   * LOCAL BACKUP AUTOSAVE
   * ----------------------------------------------------- */

  useEffect(() => {
    if (!storageReady || days.length === 0) {
      return;
    }

    setLocalSaveStatus("saving");

    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
    }

    localSaveTimerRef.current = setTimeout(() => {
      try {
        const storageKey = project?.id
          ? getProjectStorageKey(project.id)
          : GUEST_STORAGE_KEY;

        const dataToSave: StoredRundownData = {
          days,
          activeDayId,
        };

        window.localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        setLocalSaveStatus("saved");
      } catch (error) {
        console.error("Gagal menyimpan cadangan lokal:", error);
        setLocalSaveStatus("error");
      }
    }, 400);

    return () => {
      if (localSaveTimerRef.current) {
        clearTimeout(localSaveTimerRef.current);
      }
    };
  }, [days, activeDayId, project?.id, storageReady]);

  /* -------------------------------------------------------
   * AUTH SESSION
   * ----------------------------------------------------- */

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function loadSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!mounted) {
          return;
        }

        setUser(session?.user ?? null);
        setAuthStatus("idle");
      } catch (error) {
        console.error("Gagal membaca sesi:", error);

        if (!mounted) {
          return;
        }

        setAuthStatus("error");
        setAuthMessage("Sesi login gagal dibaca. Coba muat ulang halaman.");
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      setUser(session?.user ?? null);
      setAuthStatus("idle");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* -------------------------------------------------------
   * LOAD OR CREATE PROJECT
   * ----------------------------------------------------- */

  useEffect(() => {
    if (!user) {
      projectLoadRef.current = null;
      rundownLoadRef.current = null;
      lastRemoteSnapshotRef.current = "";
      setProject(null);
      setProjectStatus("idle");
      setRemoteLoadStatus("idle");
      setRemoteSaveStatus("loading");
      return;
    }

    const currentUser = user;

    if (projectLoadRef.current === currentUser.id) {
      return;
    }

    projectLoadRef.current = currentUser.id;

    const supabase = createClient();
    let cancelled = false;

    async function loadProject() {
      try {
        setProjectStatus("loading");

        const preferredProjectId = window.localStorage.getItem(
          PREFERRED_PROJECT_STORAGE_KEY,
        );

        const result = await getOrCreateDefaultProject(
          supabase,
          currentUser,
          preferredProjectId,
        );

        if (cancelled) {
          return;
        }

        window.localStorage.setItem(
          PREFERRED_PROJECT_STORAGE_KEY,
          result.id,
        );

        setProject(result);
        setProjectStatus("ready");
      } catch (error) {
        console.error("Gagal memuat proyek:", error);

        if (cancelled) {
          return;
        }

        projectLoadRef.current = null;
        setProjectStatus("error");
        setAuthMessage(
          error instanceof Error ? error.message : "Proyek gagal dimuat.",
        );
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* -------------------------------------------------------
   * LOAD PROJECT MEMBERS FOR PIC SELECTOR
   * ----------------------------------------------------- */

  useEffect(() => {
    if (!user || !project || projectStatus !== "ready") {
      setProjectMembers([]);
      setMembersLoadStatus("idle");
      return;
    }

    const supabase = createClient();
    const projectId = project.id;
    let cancelled = false;

    async function loadProjectMembers() {
      try {
        setMembersLoadStatus("loading");

        const { data, error } = await supabase.rpc("get_project_members", {
          p_project_id: projectId,
        });

        if (error) {
          throw error;
        }

        if (cancelled) {
          return;
        }

        const response = data as MembersResponse | null;
        setProjectMembers(
          Array.isArray(response?.members) ? response.members : [],
        );
        setMembersLoadStatus("ready");
      } catch (error) {
        console.error("Gagal memuat anggota untuk PIC:", error);

        if (cancelled) {
          return;
        }

        setProjectMembers([]);
        setMembersLoadStatus("error");
      }
    }

    void loadProjectMembers();

    return () => {
      cancelled = true;
    };
  }, [membersReloadToken, project, projectStatus, user]);

  /* -------------------------------------------------------
   * LOAD ONLINE RUNDOWN OR MIGRATE LOCAL DATA
   * ----------------------------------------------------- */

  useEffect(() => {
    if (
      !storageReady ||
      !user ||
      !project ||
      projectStatus !== "ready"
    ) {
      return;
    }

    const loadKey = `${user.id}:${project.id}:${syncAttempt}`;

    if (rundownLoadRef.current === loadKey) {
      return;
    }

    rundownLoadRef.current = loadKey;

    const currentProject = project;
    const supabase = createClient();
    let cancelled = false;

    async function loadRundown() {
      try {
        setSyncMessage("");
        setRemoteLoadStatus("loading");
        setRemoteSaveStatus("loading");

        const remoteDays = await getProjectRundown(
          supabase,
          currentProject.id,
        );

        if (cancelled) {
          return;
        }

        if (remoteDays.length > 0) {
          const currentActiveId = activeDayIdRef.current;
          const activeStillExists = remoteDays.some(
            (day) => day.id === currentActiveId,
          );

          lastRemoteSnapshotRef.current = serializeRemotePayload(remoteDays);
          setDays(remoteDays);
          setActiveDayId(
            activeStillExists ? currentActiveId : remoteDays[0].id,
          );
          setRemoteLoadStatus("ready");
          setRemoteSaveStatus("saved");
          return;
        }

        if (currentProject.role === "participant") {
          lastRemoteSnapshotRef.current = serializeRemotePayload(
            daysRef.current,
          );
          setRemoteLoadStatus("ready");
          setRemoteSaveStatus("saved");
          return;
        }

        setRemoteLoadStatus("migrating");
        setRemoteSaveStatus("saving");

        const projectBackup = readStoredRundown(
          getProjectStorageKey(currentProject.id),
        );

        const migrationDays =
          projectBackup?.days.length && projectBackup.days.length > 0
            ? projectBackup.days
            : daysRef.current;

        await saveProjectRundown(
          supabase,
          currentProject.id,
          migrationDays,
        );

        const refreshedDays = await getProjectRundown(
          supabase,
          currentProject.id,
        );

        if (cancelled) {
          return;
        }

        const finalDays =
          refreshedDays.length > 0 ? refreshedDays : migrationDays;

        const preferredActiveId =
          projectBackup?.activeDayId ?? activeDayIdRef.current;
        const activeStillExists = finalDays.some(
          (day) => day.id === preferredActiveId,
        );

        lastRemoteSnapshotRef.current = serializeRemotePayload(finalDays);
        setDays(finalDays);
        setActiveDayId(
          activeStillExists ? preferredActiveId : finalDays[0].id,
        );
        setRemoteLoadStatus("ready");
        setRemoteSaveStatus("saved");
      } catch (error) {
        console.error("Gagal memuat atau memigrasikan rundown:", error);

        if (cancelled) {
          return;
        }

        rundownLoadRef.current = null;
        setRemoteLoadStatus("error");
        setRemoteSaveStatus("error");
        setSyncMessage(
          error instanceof Error
            ? error.message
            : "Rundown online gagal dimuat.",
        );
      }
    }

    void loadRundown();

    return () => {
      cancelled = true;
    };
  }, [
    project,
    projectStatus,
    storageReady,
    syncAttempt,
    user,
  ]);

  /* -------------------------------------------------------
   * ONLINE AUTOSAVE
   * ----------------------------------------------------- */

  useEffect(() => {
    if (
      !user ||
      !project ||
      projectStatus !== "ready" ||
      remoteLoadStatus !== "ready" ||
      project.role === "participant"
    ) {
      return;
    }

    const snapshot = serializeRemotePayload(days);

    if (snapshot === lastRemoteSnapshotRef.current) {
      return;
    }

    setRemoteSaveStatus("saving");
    setSyncMessage("");

    if (remoteSaveTimerRef.current) {
      clearTimeout(remoteSaveTimerRef.current);
    }

    const supabase = createClient();
    const projectId = project.id;
    let cancelled = false;

    remoteSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await saveProjectRundown(supabase, projectId, days);

          if (cancelled) {
            return;
          }

          lastRemoteSnapshotRef.current = snapshot;
          setRemoteSaveStatus("saved");

          if (pendingRealtimeRefreshRef.current) {
            pendingRealtimeRefreshRef.current = false;
            setRealtimeRefreshToken((value) => value + 1);
          }
        } catch (error) {
          console.error("Autosave online gagal:", error);

          if (cancelled) {
            return;
          }

          setRemoteSaveStatus("error");
          setSyncMessage(
            error instanceof Error
              ? error.message
              : "Perubahan gagal disimpan secara online.",
          );
        }
      })();
    }, 900);

    return () => {
      cancelled = true;

      if (remoteSaveTimerRef.current) {
        clearTimeout(remoteSaveTimerRef.current);
      }
    };
  }, [days, project, projectStatus, remoteLoadStatus, user]);

  /* -------------------------------------------------------
   * SUPABASE REALTIME SUBSCRIPTION
   * ----------------------------------------------------- */

  useEffect(() => {
    if (
      !user ||
      !project ||
      projectStatus !== "ready" ||
      remoteLoadStatus !== "ready"
    ) {
      setRealtimeStatus("idle");
      return;
    }

    const supabase = createClient();
    const projectId = project.id;
    let disposed = false;

    function queueRundownRefresh() {
      if (realtimeSignalTimerRef.current) {
        clearTimeout(realtimeSignalTimerRef.current);
      }

      realtimeSignalTimerRef.current = setTimeout(() => {
        if (!disposed) {
          setRealtimeRefreshToken((value) => value + 1);
        }
      }, 650);
    }

    function queueMemberRefresh() {
      setMembersReloadToken((value) => value + 1);
      queueRundownRefresh();
    }

    setRealtimeStatus("connecting");

    const channel = supabase
      .channel(`rundown-project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rundown_days",
          filter: `project_id=eq.${projectId}`,
        },
        queueRundownRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rundown_items",
        },
        queueRundownRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rundown_item_assignees",
        },
        queueRundownRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_members",
          filter: `project_id=eq.${projectId}`,
        },
        queueMemberRefresh,
      )
      .subscribe((status) => {
        if (disposed) {
          return;
        }

        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("error");
          return;
        }

        if (status === "CLOSED") {
          setRealtimeStatus("idle");
        }
      });

    return () => {
      disposed = true;

      if (realtimeSignalTimerRef.current) {
        clearTimeout(realtimeSignalTimerRef.current);
        realtimeSignalTimerRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [project?.id, projectStatus, remoteLoadStatus, user?.id]);

  /* -------------------------------------------------------
   * APPLY REALTIME CHANGES
   * ----------------------------------------------------- */

  useEffect(() => {
    if (
      realtimeRefreshToken === 0 ||
      !user ||
      !project ||
      projectStatus !== "ready" ||
      remoteLoadStatus !== "ready"
    ) {
      return;
    }

    const currentSnapshot = serializeRemotePayload(daysRef.current);
    const hasUnsavedLocalChanges =
      currentSnapshot !== lastRemoteSnapshotRef.current;

    if (
      remoteSaveStatus === "saving" ||
      hasUnsavedLocalChanges ||
      realtimeFetchInFlightRef.current
    ) {
      pendingRealtimeRefreshRef.current = true;
      return;
    }

    pendingRealtimeRefreshRef.current = false;
    realtimeFetchInFlightRef.current = true;

    const supabase = createClient();
    const projectId = project.id;
    let cancelled = false;

    async function refreshFromRealtime() {
      try {
        const remoteDays = await getProjectRundown(supabase, projectId);

        if (cancelled) {
          return;
        }

        const remoteSnapshot = serializeRemotePayload(remoteDays);
        const latestLocalSnapshot = serializeRemotePayload(daysRef.current);

        lastRemoteSnapshotRef.current = remoteSnapshot;

        if (remoteSnapshot !== latestLocalSnapshot) {
          const currentActiveId = activeDayIdRef.current;
          const activeStillExists = remoteDays.some(
            (day) => day.id === currentActiveId,
          );

          setDays(remoteDays);

          if (remoteDays.length > 0) {
            setActiveDayId(
              activeStillExists ? currentActiveId : remoteDays[0].id,
            );
          }
        }

        setRemoteSaveStatus("saved");
        setRealtimeStatus("connected");
      } catch (error) {
        console.error("Gagal menerapkan perubahan realtime:", error);

        if (!cancelled) {
          setRealtimeStatus("error");
        }
      } finally {
        realtimeFetchInFlightRef.current = false;
      }
    }

    void refreshFromRealtime();

    return () => {
      cancelled = true;
    };
  }, [
    project?.id,
    projectStatus,
    realtimeRefreshToken,
    remoteLoadStatus,
    remoteSaveStatus,
    user?.id,
  ]);

  /* -------------------------------------------------------
   * OPEN ON TODAY'S DAY
   * ----------------------------------------------------- */

  useEffect(() => {
    const openingKey = project?.id ? `project:${project.id}` : "guest";
    const dataIsReady = user
      ? projectStatus === "ready" && remoteLoadStatus === "ready"
      : authStatus === "idle" && storageReady;

    if (
      !dataIsReady ||
      days.length === 0 ||
      openingDaySelectionRef.current === openingKey
    ) {
      return;
    }

    const openingDay = findOpeningDay(days);

    if (openingDay) {
      setActiveDayId(openingDay.id);
    }

    openingDaySelectionRef.current = openingKey;
  }, [
    authStatus,
    days,
    project?.id,
    projectStatus,
    remoteLoadStatus,
    storageReady,
    user,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeDayTabRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeDayId]);

  /* -------------------------------------------------------
   * DERIVED DATA
   * ----------------------------------------------------- */

  const activeDay =
    days.find((day) => day.id === activeDayId) ?? days[0];

  const daySummary = useMemo(() => {
    if (!activeDay) {
      return {
        totalActivities: 0,
        totalMinutes: 0,
        completedItems: 0,
      };
    }

    let totalMinutes = 0;
    let completedItems = 0;

    activeDay.items.forEach((item, index) => {
      const startTime =
        index === 0
          ? activeDay.firstStartTime
          : activeDay.items[index - 1].endTime;

      const duration = calculateDurationMinutes(startTime, item.endTime);

      if (duration !== null) {
        totalMinutes += duration;
      }

      if (item.activity.trim() && item.endTime) {
        completedItems += 1;
      }
    });

    return {
      totalActivities: activeDay.items.length,
      totalMinutes,
      completedItems,
    };
  }, [activeDay]);

  const userName = getUserName(user);
  const userAvatar = getUserAvatar(user);
  const roleLabel = getRoleLabel(project?.role);

  const canEdit =
    !user ||
    (projectStatus === "ready" &&
      remoteLoadStatus === "ready" &&
      project?.role !== "participant");

  const publishedCalendarItemIds = useMemo(
    () => new Set(calendarPublishStatus?.publishedItemIds ?? []),
    [calendarPublishStatus?.publishedItemIds],
  );

  const effectiveSaveStatus: SaveStatus = user
    ? remoteLoadStatus === "loading"
      ? "loading"
      : remoteLoadStatus === "migrating"
        ? "saving"
        : remoteLoadStatus === "error"
          ? "error"
          : remoteSaveStatus
    : localSaveStatus;

  const saveStatusText: Record<SaveStatus, string> = user
    ? {
        loading: "Memuat online...",
        saving:
          remoteLoadStatus === "migrating"
            ? "Memindahkan data..."
            : "Menyimpan online...",
        saved: "Tersimpan online",
        error: "Sinkronisasi gagal",
      }
    : {
        loading: "Memuat data...",
        saving: "Menyimpan lokal...",
        saved: "Tersimpan lokal",
        error: "Gagal menyimpan",
      };

  const saveStatusAppearance: Record<SaveStatus, string> = {
    loading: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    saving: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    saved: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    error: "bg-red-400/10 text-red-300 ring-red-400/20",
  };

  const realtimeStatusLabel: Record<RealtimeStatus, string> = {
    idle: user ? "Belum aktif" : "Belum login",
    connecting: "Menghubungkan",
    connected: "Terhubung",
    error: "Terputus",
  };

  const realtimeStatusAppearance: Record<RealtimeStatus, string> = {
    idle: "bg-white/10 text-slate-300 ring-white/10",
    connecting: "bg-amber-400/10 text-amber-200 ring-amber-400/20",
    connected: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20",
    error: "bg-red-400/10 text-red-200 ring-red-400/20",
  };

  const pageMessage = syncMessage || authMessage;

  /* -------------------------------------------------------
   * EDITOR FUNCTIONS
   * ----------------------------------------------------- */

  function updateActiveDay(updater: (day: RundownDay) => RundownDay) {
    if (!canEdit) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === activeDayId ? updater(day) : day,
      ),
    );
  }

  function patchItem(itemId: string, patch: Partial<RundownItem>) {
    updateActiveDay((day) => ({
      ...day,
      items: day.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addItem() {
    updateActiveDay((day) => ({
      ...day,
      items: [
        ...day.items,
        {
          id: createId(),
          endTime: "",
          activity: "",
          note: "",
          personInCharge: "",
          assigneeIds: [],
          audience: "Hanya PIC",
        },
      ],
    }));
  }

  function duplicateItem(itemId: string) {
    updateActiveDay((day) => {
      const index = day.items.findIndex((item) => item.id === itemId);

      if (index === -1) {
        return day;
      }

      const source = day.items[index];
      const copiedItem: RundownItem = {
        ...source,
        id: createId(),
        activity: source.activity ? `${source.activity} (salinan)` : "",
      };

      const updatedItems = [...day.items];
      updatedItems.splice(index + 1, 0, copiedItem);

      return { ...day, items: updatedItems };
    });
  }

  function deleteItem(itemId: string) {
    updateActiveDay((day) => ({
      ...day,
      items: day.items.filter((item) => item.id !== itemId),
    }));
  }

  function moveItem(itemId: string, direction: "up" | "down") {
    updateActiveDay((day) => {
      const currentIndex = day.items.findIndex((item) => item.id === itemId);

      if (currentIndex === -1) {
        return day;
      }

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= day.items.length) {
        return day;
      }

      const updatedItems = [...day.items];
      [updatedItems[currentIndex], updatedItems[targetIndex]] = [
        updatedItems[targetIndex],
        updatedItems[currentIndex],
      ];

      return { ...day, items: updatedItems };
    });
  }

  function addDay() {
    if (!canEdit) {
      return;
    }

    const previousDay = days[days.length - 1];
    const newDay: RundownDay = {
      id: createId(),
      title: `Hari ${days.length + 1}`,
      date: getNextDate(previousDay?.date ?? ""),
      firstStartTime: "08:00",
      items: [],
    };

    setDays((currentDays) => [...currentDays, newDay]);
    setActiveDayId(newDay.id);
  }

  function duplicateActiveDay() {
    if (!activeDay || !canEdit) {
      return;
    }

    const copiedDay: RundownDay = {
      ...activeDay,
      id: createId(),
      title: `${activeDay.title} salinan`,
      date: getNextDate(activeDay.date),
      items: activeDay.items.map((item) => ({
        ...item,
        id: createId(),
      })),
    };

    setDays((currentDays) => [...currentDays, copiedDay]);
    setActiveDayId(copiedDay.id);
  }

  /* -------------------------------------------------------
   * AUTH AND SYNC FUNCTIONS
   * ----------------------------------------------------- */

  async function handleGoogleLogin() {
    try {
      setAuthStatus("redirecting");
      setAuthMessage("");

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Login Google gagal:", error);
      setAuthStatus("error");
      setAuthMessage(
        error instanceof Error ? error.message : "Login Google gagal.",
      );
    }
  }

  async function handleLogout() {
    try {
      setAuthStatus("loading");
      setAuthMessage("");
      setSyncMessage("");

      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      projectLoadRef.current = null;
      rundownLoadRef.current = null;
      lastRemoteSnapshotRef.current = "";
      setProject(null);
      setUser(null);
      setProjectStatus("idle");
      setRemoteLoadStatus("idle");
      setRemoteSaveStatus("loading");
      setRealtimeStatus("idle");
      pendingRealtimeRefreshRef.current = false;
      setAuthStatus("idle");
    } catch (error) {
      console.error("Logout gagal:", error);
      setAuthStatus("error");
      setAuthMessage(
        error instanceof Error ? error.message : "Gagal keluar dari akun.",
      );
    }
  }

  function handleRetrySync() {
    rundownLoadRef.current = null;
    setSyncMessage("");
    setRemoteLoadStatus("idle");
    setRemoteSaveStatus("loading");
    setSyncAttempt((current) => current + 1);
  }

  if (!activeDay) {
    return null;
  }

  /* =======================================================
   * RENDER
   * ===================================================== */

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-200">
              <CalendarDays size={20} />
            </div>

            <div>
              <p className="font-black tracking-tight">Rundownku</p>
              <p className="text-xs text-slate-500">Workspace keluarga</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ring-1 sm:flex ${
                effectiveSaveStatus === "error"
                  ? "bg-red-50 text-red-700 ring-red-100"
                  : effectiveSaveStatus === "saved"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-amber-50 text-amber-700 ring-amber-100"
              }`}
            >
              {effectiveSaveStatus === "saving" ||
              effectiveSaveStatus === "loading" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {saveStatusText[effectiveSaveStatus]}
            </div>

            {authStatus === "loading" ? (
              <div className="h-10 w-32 animate-pulse rounded-full bg-slate-200" />
            ) : user ? (
              <>
                <div className="flex items-center gap-2 rounded-full bg-slate-950 py-1.5 pl-1.5 pr-3 text-white">
                  {userAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="size-8 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="grid size-8 place-items-center rounded-full bg-white/15">
                      <UserRound size={16} />
                    </div>
                  )}

                  <div className="hidden max-w-36 sm:block">
                    <p className="truncate text-xs font-bold">{userName}</p>
                    <p className="text-[10px] text-slate-300">
                      {projectStatus === "loading" ? "Memuat role..." : roleLabel}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Keluar"
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={authStatus === "redirecting"}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                <LogIn size={17} />
                {authStatus === "redirecting" ? "Mengarahkan..." : "Masuk Google"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        {pageMessage && (
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:flex-row sm:items-center">
            <span>{pageMessage}</span>

            <div className="flex gap-2">
              {syncMessage && user && project && (
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-black text-white"
                >
                  Coba lagi
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setAuthMessage("");
                  setSyncMessage("");
                }}
                className="px-2 text-xs font-black"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {!user && authStatus !== "loading" && (
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-black text-indigo-950">Kamu masih memakai mode tamu</p>
              <p className="mt-1 text-sm text-indigo-700">
                Data disimpan di perangkat ini. Masuk Google untuk menyimpan dan
                membukanya dari perangkat lain.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <LogIn size={17} />
              Masuk Google
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-2xl shadow-slate-200">
          <div className="relative isolate overflow-hidden px-6 py-7 sm:px-8">
            <div className="absolute -right-24 -top-32 -z-10 size-80 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute -bottom-28 left-1/3 -z-10 size-72 rounded-full bg-blue-500/20 blur-3xl" />

            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200 ring-1 ring-white/10">
                    Proyek rundown
                  </span>

                  <span
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${saveStatusAppearance[effectiveSaveStatus]}`}
                  >
                    {effectiveSaveStatus === "saving" ||
                    effectiveSaveStatus === "loading" ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    {saveStatusText[effectiveSaveStatus]}
                  </span>

                  {user && (
                    <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-200 ring-1 ring-indigo-400/20">
                      {projectStatus === "loading"
                        ? "Menghubungkan database..."
                        : remoteLoadStatus === "migrating"
                          ? "Memigrasikan data lokal..."
                          : projectStatus === "ready"
                            ? roleLabel
                            : "Akun terhubung"}
                    </span>
                  )}

                  {user && projectStatus === "ready" && (
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${realtimeStatusAppearance[realtimeStatus]}`}
                    >
                      {realtimeStatus === "connecting" ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <span
                          className={`size-1.5 rounded-full ${
                            realtimeStatus === "connected"
                              ? "bg-emerald-300"
                              : realtimeStatus === "error"
                                ? "bg-red-300"
                                : "bg-slate-400"
                          }`}
                        />
                      )}
                      Realtime {realtimeStatusLabel[realtimeStatus]}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  {projectStatus === "loading"
                    ? "Memuat proyek..."
                    : project?.name ?? "Keluarga Ketowan"}
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Susun kegiatan dalam satu tempat. Perubahan tersimpan otomatis
                  dan tetap memiliki cadangan lokal di perangkat.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setInviteDialogOpen(true)}
                  disabled={
                    !user ||
                    projectStatus !== "ready" ||
                    project?.role !== "owner"
                  }
                  title={
                    project?.role === "owner"
                      ? "Buat tautan undangan editor atau peserta"
                      : "Hanya pemilik proyek yang dapat mengundang orang"
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/10 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Users size={17} />
                  Undang orang
                </button>

                <button
                  type="button"
                  onClick={() => setMembersDialogOpen(true)}
                  disabled={!user || projectStatus !== "ready"}
                  title={
                    project?.role === "owner"
                      ? "Lihat dan kelola anggota proyek"
                      : "Lihat anggota proyek"
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/10 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Users size={17} />
                  {project?.role === "owner" ? "Kelola anggota" : "Anggota"}
                </button>

                <PublishCalendarButton
                  projectId={project?.id ?? null}
                  projectName={project?.name ?? "Keluarga Ketowan"}
                  canPublish={
                    Boolean(user) &&
                    projectStatus === "ready" &&
                    project?.role === "owner"
                  }
                  calendarConnected={Boolean(googleCalendarStatus?.connected)}
                  saveReady={
                    remoteLoadStatus === "ready" &&
                    effectiveSaveStatus === "saved"
                  }
                  totalItems={days.reduce(
                    (total, day) => total + day.items.length,
                    0,
                  )}
                  rundownVersion={serializeRemotePayload(days)}
                  onStatusChange={setCalendarPublishStatus}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Total kegiatan"
            value={String(daySummary.totalActivities)}
            helper="Dalam tab aktif"
            icon={<CalendarDays size={18} />}
          />

          <SummaryCard
            label="Total waktu"
            value={formatDuration(daySummary.totalMinutes)}
            helper="Akumulasi kegiatan"
            icon={<Clock3 size={18} />}
          />

          <SummaryCard
            label="Kelengkapan"
            value={`${daySummary.completedItems}/${daySummary.totalActivities}`}
            helper="Kegiatan siap diterbitkan"
            icon={<Check size={18} />}
          />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
          <section className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-4">
                {days.map((day) => {
                  const selected = day.id === activeDayId;

                  return (
                    <button
                      type="button"
                      key={day.id}
                      ref={selected ? activeDayTabRef : undefined}
                      onClick={() => setActiveDayId(day.id)}
                      className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                        selected
                          ? "bg-slate-950 text-white shadow-lg shadow-slate-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {day.title}
                    </button>
                  );
                })}

                {canEdit && (
                  <button
                    type="button"
                    onClick={addDay}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                  >
                    <Plus size={16} />
                    Tambah hari
                  </button>
                )}
              </div>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-6">
              <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto]">
                <Field label="Nama tab">
                  <input
                    value={activeDay.title}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateActiveDay((day) => ({
                        ...day,
                        title: event.target.value,
                      }))
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <Field label="Tanggal">
                  <input
                    type="date"
                    value={activeDay.date}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateActiveDay((day) => ({
                        ...day,
                        date: event.target.value,
                      }))
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <Field label="Mulai pertama">
                  <input
                    type="time"
                    value={activeDay.firstStartTime}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateActiveDay((day) => ({
                        ...day,
                        firstStartTime: event.target.value,
                      }))
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={duplicateActiveDay}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                  >
                    <Copy size={16} />
                    Duplikat
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black">Rundown {activeDay.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(activeDay.date)}
                  </p>
                </div>

                {!canEdit && (
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                    {remoteLoadStatus === "ready" ? "Mode lihat" : "Memuat data"}
                  </span>
                )}
              </div>

              {activeDay.items.length === 0 ? (
                <EmptyState onAdd={addItem} canEdit={canEdit} />
              ) : (
                <div className="space-y-3">
                  {activeDay.items.map((item, index) => {
                    const startTime =
                      index === 0
                        ? activeDay.firstStartTime
                        : activeDay.items[index - 1].endTime;

                    const duration = calculateDurationMinutes(
                      startTime,
                      item.endTime,
                    );

                    const incomplete =
                      !item.activity.trim() || !item.endTime;
                    const excludedFromCalendar =
                      item.audience === "Tidak disinkronkan";
                    const itemWasPublished = publishedCalendarItemIds.has(
                      item.id,
                    );

                    const calendarSyncText = excludedFromCalendar
                      ? "Tidak diterbitkan"
                      : !calendarPublishStatus?.published
                        ? "Belum terbit"
                        : calendarPublishStatus.needsRepublish
                          ? itemWasPublished
                            ? "Perlu terbitkan ulang"
                            : "Belum tersinkron"
                          : itemWasPublished
                            ? "Tersinkron"
                            : "Belum tersinkron";

                    const calendarSyncAppearance = excludedFromCalendar
                      ? "bg-slate-100 text-slate-600 ring-slate-200"
                      : calendarSyncText === "Tersinkron"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : calendarSyncText === "Perlu terbitkan ulang"
                          ? "bg-amber-50 text-amber-700 ring-amber-100"
                          : "bg-blue-50 text-blue-700 ring-blue-100";

                    return (
                      <article
                        key={item.id}
                        className={`overflow-hidden rounded-2xl border bg-white transition ${
                          incomplete
                            ? "border-amber-200"
                            : "border-slate-200 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-100"
                        }`}
                      >
                        <div className="grid lg:grid-cols-[178px_minmax(0,1fr)_150px]">
                          <div className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
                            <div className="flex items-start justify-between lg:block">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                                  Kegiatan {index + 1}
                                </p>

                                <div className="mt-3 flex items-center gap-2 text-lg font-black">
                                  <span>{startTime || "--:--"}</span>
                                  <span className="text-slate-300">→</span>
                                  <span>{item.endTime || "--:--"}</span>
                                </div>

                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-slate-200">
                                  <Clock3 size={13} />
                                  {formatDuration(duration)}
                                </div>
                              </div>

                              {canEdit && (
                                <div className="flex gap-1 lg:mt-5">
                                  <SmallIconButton
                                    label="Pindahkan ke atas"
                                    disabled={index === 0}
                                    onClick={() => moveItem(item.id, "up")}
                                  >
                                    <ArrowUp size={15} />
                                  </SmallIconButton>

                                  <SmallIconButton
                                    label="Pindahkan ke bawah"
                                    disabled={index === activeDay.items.length - 1}
                                    onClick={() => moveItem(item.id, "down")}
                                  >
                                    <ArrowDown size={15} />
                                  </SmallIconButton>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="min-w-0 p-4">
                            <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                              <Field label="Jam selesai" required>
                                <input
                                  type="time"
                                  value={item.endTime}
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    patchItem(item.id, {
                                      endTime: event.target.value,
                                    })
                                  }
                                  className={INPUT_REQUIRED}
                                />
                              </Field>

                              <Field label="Nama kegiatan" required>
                                <input
                                  value={item.activity}
                                  disabled={!canEdit}
                                  placeholder="Contoh: Free Time"
                                  onChange={(event) =>
                                    patchItem(item.id, {
                                      activity: event.target.value,
                                    })
                                  }
                                  className={INPUT_REQUIRED}
                                />
                              </Field>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <Field label="Penanggung jawab">
                                {user ? (
                                  <PicMemberSelect
                                    members={projectMembers}
                                    selectedIds={item.assigneeIds}
                                    legacyName={item.personInCharge}
                                    disabled={!canEdit}
                                    loading={membersLoadStatus === "loading"}
                                    loadError={membersLoadStatus === "error"}
                                    onRefresh={() =>
                                      setMembersReloadToken((value) => value + 1)
                                    }
                                    onChange={(assigneeIds) => {
                                      const selectedNames = assigneeIds
                                        .map(
                                          (userId) =>
                                            projectMembers.find(
                                              (member) => member.userId === userId,
                                            )?.fullName ?? "",
                                        )
                                        .filter(Boolean)
                                        .join(", ");

                                      patchItem(item.id, {
                                        assigneeIds,
                                        personInCharge: selectedNames,
                                      });
                                    }}
                                  />
                                ) : (
                                  <input
                                    value={item.personInCharge}
                                    disabled={!canEdit}
                                    placeholder="Masuk Google untuk memilih anggota"
                                    onChange={(event) =>
                                      patchItem(item.id, {
                                        personInCharge: event.target.value,
                                      })
                                    }
                                    className={INPUT_BASE}
                                  />
                                )}
                              </Field>

                              <Field label="Penerima Calendar">
                                <select
                                  value={item.audience}
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    patchItem(item.id, {
                                      audience: event.target.value as CalendarAudience,
                                    })
                                  }
                                  className={INPUT_BASE}
                                >
                                  <option>Semua peserta</option>
                                  <option>Hanya PIC</option>
                                  <option>Tidak disinkronkan</option>
                                </select>
                              </Field>
                            </div>

                            <Field label="Keterangan">
                              <textarea
                                value={item.note}
                                disabled={!canEdit}
                                rows={2}
                                placeholder="Catatan tambahan, lokasi, atau perlengkapan..."
                                onChange={(event) =>
                                  patchItem(item.id, { note: event.target.value })
                                }
                                className={`${INPUT_BASE} mt-3 h-auto resize-none py-3`}
                              />
                            </Field>
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start lg:border-l lg:border-t-0">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-center text-xs font-bold ring-1 ${getAudienceAppearance(item.audience)}`}
                            >
                              {item.audience}
                            </span>

                            <span
                              className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-center text-[11px] font-bold ring-1 ${calendarSyncAppearance}`}
                            >
                              {calendarSyncText}
                            </span>

                            {incomplete ? (
                              <span className="text-center text-xs font-bold text-amber-700">
                                Belum lengkap
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
                                <Check size={14} />
                                Siap
                              </span>
                            )}

                            {canEdit && (
                              <div className="flex justify-center gap-1 lg:mt-auto">
                                <SmallIconButton
                                  label="Duplikat kegiatan"
                                  onClick={() => duplicateItem(item.id)}
                                >
                                  <Copy size={15} />
                                </SmallIconButton>

                                <SmallIconButton
                                  label="Hapus kegiatan"
                                  danger
                                  onClick={() => deleteItem(item.id)}
                                >
                                  <Trash2 size={15} />
                                </SmallIconButton>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-4 font-black text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <Plus size={18} />
                  Tambah kegiatan
                </button>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <UserRound size={19} />
                </div>

                <div className="min-w-0">
                  <h3 className="truncate font-black">{userName}</h3>
                  <p className="truncate text-xs text-slate-500">
                    {user?.email ?? "Belum masuk akun"}
                  </p>
                </div>
              </div>

              <StatusRow
                label="Status akun"
                value={user ? "Terhubung" : "Mode tamu"}
                completed={Boolean(user)}
              />

              <StatusRow
                label="Role proyek"
                value={projectStatus === "loading" ? "Memuat..." : roleLabel}
                completed={projectStatus === "ready"}
              />

              {!user && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <LogIn size={16} />
                  Masuk Google
                </button>
              )}
            </div>

            <GoogleCalendarConnection
              loggedIn={Boolean(user)}
              onStatusChange={handleGoogleCalendarStatusChange}
            />

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <BellRing size={19} />
                </div>

                <div>
                  <h3 className="font-black">Pengingat Calendar</h3>
                  <p className="text-xs text-slate-500">
                    Aktif setelah integrasi
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <ReminderOption
                  title="10 menit sebelumnya"
                  description="Persiapan kegiatan berikutnya"
                />
                <ReminderOption
                  title="Saat kegiatan mulai"
                  description="Notifikasi tepat waktu"
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-black">Status proyek</h3>
                  <p className="mt-1 text-xs text-slate-500">Tahap integrasi</p>
                </div>

                <MoreHorizontal size={18} className="text-slate-400" />
              </div>

              <StatusRow
                label="Cadangan lokal"
                value={
                  localSaveStatus === "saved"
                    ? "Tersimpan"
                    : localSaveStatus === "error"
                      ? "Bermasalah"
                      : "Memproses"
                }
                completed={localSaveStatus === "saved"}
              />

              <StatusRow
                label="Login Google"
                value={user ? "Aktif" : "Belum"}
                completed={Boolean(user)}
              />

              <StatusRow
                label="Database proyek"
                value={
                  projectStatus === "ready"
                    ? "Terhubung"
                    : projectStatus === "loading"
                      ? "Menghubungkan"
                      : projectStatus === "error"
                        ? "Bermasalah"
                        : "Belum"
                }
                completed={projectStatus === "ready"}
              />

              <StatusRow
                label="Rundown online"
                value={
                  remoteLoadStatus === "ready" && remoteSaveStatus === "saved"
                    ? "Tersimpan"
                    : remoteLoadStatus === "migrating"
                      ? "Memigrasikan"
                      : remoteSaveStatus === "saving"
                        ? "Menyimpan"
                        : remoteLoadStatus === "error" ||
                            remoteSaveStatus === "error"
                          ? "Bermasalah"
                          : user
                            ? "Memuat"
                            : "Belum login"
                }
                completed={
                  remoteLoadStatus === "ready" && remoteSaveStatus === "saved"
                }
              />

              <StatusRow
                label="Realtime"
                value={realtimeStatusLabel[realtimeStatus]}
                completed={realtimeStatus === "connected"}
              />

              <StatusRow
                label="Google Calendar"
                value={
                  !user
                    ? "Belum login"
                    : googleCalendarStatus?.connected
                      ? "Terhubung"
                      : "Belum"
                }
                completed={Boolean(googleCalendarStatus?.connected)}
              />

              <StatusRow
                label="Publikasi Calendar"
                value={
                  !googleCalendarStatus?.connected
                    ? "Belum"
                    : !calendarPublishStatus
                      ? "Memuat"
                      : calendarPublishStatus.needsRepublish
                        ? "Perlu diperbarui"
                        : calendarPublishStatus.published
                          ? "Tersinkron"
                          : "Belum diterbitkan"
                }
                completed={Boolean(
                  calendarPublishStatus?.published &&
                    !calendarPublishStatus.needsRepublish,
                )}
              />

              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                Saat login, hari dan kegiatan tersimpan di Supabase. Perubahan dari
                perangkat lain muncul otomatis saat Realtime terhubung.
              </div>
            </div>

            <div className="rounded-[24px] bg-gradient-to-br from-indigo-600 to-blue-600 p-5 text-white shadow-xl shadow-indigo-100">
              <Sparkles size={21} />
              <h3 className="mt-4 text-lg font-black">Alur sederhana</h3>
              <p className="mt-2 text-sm leading-6 text-indigo-100">
                Isi jam selesai dan nama kegiatan. Jam mulai serta durasi akan
                dihitung otomatis dan disimpan online.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <InvitePeopleDialog
        open={inviteDialogOpen}
        projectId={project?.id ?? null}
        projectName={project?.name ?? "Keluarga Ketowan"}
        onClose={() => setInviteDialogOpen(false)}
      />

      <ManageMembersDialog
        open={membersDialogOpen}
        projectId={project?.id ?? null}
        projectName={project?.name ?? "Keluarga Ketowan"}
        currentRole={project?.role ?? null}
        onMembersChanged={() =>
          setMembersReloadToken((value) => value + 1)
        }
        onClose={() => setMembersDialogOpen(false)}
      />
    </main>
  );
}

/* =========================================================
 * SMALL COMPONENTS
 * ======================================================= */

function SummaryCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>

        <div className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </div>
      </div>
    </article>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-slate-500">
        {label}
        {required && <span className="text-amber-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function SmallIconButton({
  label,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "border-red-100 bg-white text-red-600 hover:bg-red-50"
          : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      }`}
    >
      {children}
    </button>
  );
}

function ReminderOption({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
      <div className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-indigo-600 text-white">
        <Check size={13} />
      </div>

      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  completed = false,
}: {
  label: string;
  value: string;
  completed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={`text-right text-xs font-bold ${
          completed ? "text-emerald-700" : "text-slate-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  onAdd,
  canEdit,
}: {
  onAdd: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
        <CalendarDays size={24} />
      </div>

      <h3 className="mt-4 text-lg font-black">Belum ada kegiatan</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {canEdit
          ? "Tambahkan kegiatan pertama. Jam mulai akan mengikuti pengaturan awal tab."
          : "Belum ada kegiatan yang ditambahkan pada tab ini."}
      </p>

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={17} />
          Tambah kegiatan
        </button>
      )}
    </div>
  );
}

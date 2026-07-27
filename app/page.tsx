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
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

type CalendarAudience =
  | "Semua peserta"
  | "Hanya PIC"
  | "Tidak disinkronkan";

type RundownItem = {
  id: string;
  endTime: string;
  activity: string;
  note: string;
  personInCharge: string;
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

type StoredRundownData = {
  days: RundownDay[];
  activeDayId: string;
};

const STORAGE_KEY = "rundownku-data-v2";

const INPUT_BASE =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

const INPUT_REQUIRED =
  "h-11 w-full rounded-xl border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-amber-700/50 focus:border-amber-400 focus:ring-4 focus:ring-amber-100";

const initialDays: RundownDay[] = [
  {
    id: "day-27-july",
    title: "27 Juli",
    date: "2026-07-27",
    firstStartTime: "00:00",
    items: [
      {
        id: "free-time-1",
        endTime: "10:00",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        audience: "Semua peserta",
      },
      {
        id: "ambil-tai-sapi",
        endTime: "12:00",
        activity: "Ambil tai sapi",
        note: "",
        personInCharge: "",
        audience: "Hanya PIC",
      },
      {
        id: "free-time-2",
        endTime: "14:00",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        audience: "Semua peserta",
      },
      {
        id: "membuat-mie",
        endTime: "17:00",
        activity: "Melanjutkan proses pembuatan mie",
        note: "",
        personInCharge: "",
        audience: "Hanya PIC",
      },
      {
        id: "free-time-3",
        endTime: "17:30",
        activity: "Free Time",
        note: "",
        personInCharge: "",
        audience: "Semua peserta",
      },
      {
        id: "pengajian",
        endTime: "19:00",
        activity: "pengajian anjay bersama ebok",
        note: "",
        personInCharge: "",
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

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function timeToMinutes(time: string) {
  if (!time) return null;

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

function calculateDurationMinutes(
  startTime: string,
  endTime: string,
) {
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

function isStoredRundownData(
  value: unknown,
): value is StoredRundownData {
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

function getUserName(user: User | null) {
  if (!user) {
    return "Tamu";
  }

  const metadata = user.user_metadata;

  return (
    metadata?.full_name ??
    metadata?.name ??
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

export default function Home() {
  const [days, setDays] =
    useState<RundownDay[]>(initialDays);

  const [activeDayId, setActiveDayId] =
    useState(initialDays[0].id);

  const [storageReady, setStorageReady] =
    useState(false);

  const [saveStatus, setSaveStatus] =
    useState<SaveStatus>("loading");

  const [user, setUser] =
    useState<User | null>(null);

  const [authStatus, setAuthStatus] =
    useState<AuthStatus>("loading");

  const [authMessage, setAuthMessage] =
    useState("");

  const saveTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const storedValue =
        window.localStorage.getItem(STORAGE_KEY);

      if (storedValue) {
        const parsedValue: unknown =
          JSON.parse(storedValue);

        if (isStoredRundownData(parsedValue)) {
          setDays(parsedValue.days);

          const savedActiveDayExists =
            parsedValue.days.some(
              (day) =>
                day.id === parsedValue.activeDayId,
            );

          setActiveDayId(
            savedActiveDayExists
              ? parsedValue.activeDayId
              : parsedValue.days[0].id,
          );
        }
      }

      setSaveStatus("saved");
    } catch (error) {
      console.error(
        "Gagal membaca data rundown:",
        error,
      );

      setSaveStatus("error");
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    setSaveStatus("saving");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      try {
        const dataToSave: StoredRundownData = {
          days,
          activeDayId,
        };

        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(dataToSave),
        );

        setSaveStatus("saved");
      } catch (error) {
        console.error(
          "Gagal menyimpan data rundown:",
          error,
        );

        setSaveStatus("error");
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [days, activeDayId, storageReady]);

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

        if (mounted) {
          setUser(session?.user ?? null);
          setAuthStatus("idle");
        }
      } catch (error) {
        console.error(
          "Gagal membaca sesi login:",
          error,
        );

        if (mounted) {
          setAuthStatus("error");
          setAuthMessage(
            "Sesi login gagal dibaca. Coba muat ulang halaman.",
          );
        }
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) {
          return;
        }

        setUser(session?.user ?? null);
        setAuthStatus("idle");
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const activeDay =
    days.find((day) => day.id === activeDayId) ??
    days[0];

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

      const duration =
        calculateDurationMinutes(
          startTime,
          item.endTime,
        );

      if (duration !== null) {
        totalMinutes += duration;
      }

      if (
        item.activity.trim() &&
        item.endTime
      ) {
        completedItems += 1;
      }
    });

    return {
      totalActivities: activeDay.items.length,
      totalMinutes,
      completedItems,
    };
  }, [activeDay]);

  function updateActiveDay(
    updater: (day: RundownDay) => RundownDay,
  ) {
    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === activeDayId
          ? updater(day)
          : day,
      ),
    );
  }

  function patchItem(
    itemId: string,
    patch: Partial<RundownItem>,
  ) {
    updateActiveDay((day) => ({
      ...day,
      items: day.items.map((item) =>
        item.id === itemId
          ? { ...item, ...patch }
          : item,
      ),
    }));
  }

  function addItem() {
    updateActiveDay((day) => ({
      ...day,
      items: [
        ...day.items,
        {
          id: createId("item"),
          endTime: "",
          activity: "",
          note: "",
          personInCharge: "",
          audience: "Hanya PIC",
        },
      ],
    }));
  }

  function duplicateItem(itemId: string) {
    updateActiveDay((day) => {
      const index = day.items.findIndex(
        (item) => item.id === itemId,
      );

      if (index === -1) {
        return day;
      }

      const source = day.items[index];

      const copiedItem: RundownItem = {
        ...source,
        id: createId("item"),
        activity: source.activity
          ? `${source.activity} (salinan)`
          : "",
      };

      const updatedItems = [...day.items];

      updatedItems.splice(
        index + 1,
        0,
        copiedItem,
      );

      return {
        ...day,
        items: updatedItems,
      };
    });
  }

  function deleteItem(itemId: string) {
    updateActiveDay((day) => ({
      ...day,
      items: day.items.filter(
        (item) => item.id !== itemId,
      ),
    }));
  }

  function moveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    updateActiveDay((day) => {
      const currentIndex =
        day.items.findIndex(
          (item) => item.id === itemId,
        );

      if (currentIndex === -1) {
        return day;
      }

      const targetIndex =
        direction === "up"
          ? currentIndex - 1
          : currentIndex + 1;

      if (
        targetIndex < 0 ||
        targetIndex >= day.items.length
      ) {
        return day;
      }

      const updatedItems = [...day.items];

      [
        updatedItems[currentIndex],
        updatedItems[targetIndex],
      ] = [
        updatedItems[targetIndex],
        updatedItems[currentIndex],
      ];

      return {
        ...day,
        items: updatedItems,
      };
    });
  }

  function addDay() {
    const previousDay =
      days[days.length - 1];

    const newDay: RundownDay = {
      id: createId("day"),
      title: `Hari ${days.length + 1}`,
      date: getNextDate(
        previousDay?.date ?? "",
      ),
      firstStartTime: "08:00",
      items: [],
    };

    setDays((currentDays) => [
      ...currentDays,
      newDay,
    ]);

    setActiveDayId(newDay.id);
  }

  function duplicateActiveDay() {
    if (!activeDay) {
      return;
    }

    const copiedDay: RundownDay = {
      ...activeDay,
      id: createId("day"),
      title: `${activeDay.title} salinan`,
      date: getNextDate(activeDay.date),
      items: activeDay.items.map((item) => ({
        ...item,
        id: createId("item"),
      })),
    };

    setDays((currentDays) => [
      ...currentDays,
      copiedDay,
    ]);

    setActiveDayId(copiedDay.id);
  }

  async function handleGoogleLogin() {
    try {
      setAuthStatus("redirecting");
      setAuthMessage("");

      const supabase = createClient();

      const { error } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo:
              `${window.location.origin}/auth/callback?next=/`,
          },
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(
        "Gagal masuk menggunakan Google:",
        error,
      );

      setAuthStatus("error");
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Login Google gagal.",
      );
    }
  }

  async function handleLogout() {
    try {
      setAuthStatus("loading");
      setAuthMessage("");

      const supabase = createClient();
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setUser(null);
      setAuthStatus("idle");
    } catch (error) {
      console.error("Gagal keluar:", error);

      setAuthStatus("error");
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Gagal keluar dari akun.",
      );
    }
  }

  const saveStatusText: Record<
    SaveStatus,
    string
  > = {
    loading: "Memuat data...",
    saving: "Menyimpan...",
    saved: "Tersimpan otomatis",
    error: "Gagal menyimpan",
  };

  const saveStatusAppearance: Record<
    SaveStatus,
    string
  > = {
    loading:
      "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    saving:
      "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    saved:
      "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    error:
      "bg-red-400/10 text-red-300 ring-red-400/20",
  };

  const userName = getUserName(user);
  const userAvatar = getUserAvatar(user);

  if (!activeDay) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-200">
              <CalendarDays size={20} />
            </div>

            <div>
              <p className="font-black tracking-tight text-slate-950">
                Rundownku
              </p>

              <p className="text-xs text-slate-500">
                Workspace keluarga
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ring-1 sm:flex ${
                saveStatus === "error"
                  ? "bg-red-50 text-red-700 ring-red-100"
                  : saveStatus === "saved"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-amber-50 text-amber-700 ring-amber-100"
              }`}
            >
              <Check size={14} />
              {saveStatusText[saveStatus]}
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

                  <div className="hidden max-w-32 sm:block">
                    <p className="truncate text-xs font-bold">
                      {userName}
                    </p>

                    <p className="text-[10px] text-slate-300">
                      Pemilik
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
                disabled={
                  authStatus === "redirecting"
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                <LogIn size={17} />

                {authStatus === "redirecting"
                  ? "Mengarahkan..."
                  : "Masuk Google"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        {authMessage && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <span>{authMessage}</span>

            <button
              type="button"
              onClick={() => setAuthMessage("")}
              className="text-xs font-black"
            >
              Tutup
            </button>
          </div>
        )}

        {!user && authStatus !== "loading" && (
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-black text-indigo-950">
                Kamu masih menggunakan mode tamu
              </p>

              <p className="mt-1 text-sm text-indigo-700">
                Masuk dengan Google agar nanti proyek dapat
                disimpan online dan dibagikan kepada kolaborator.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={
                authStatus === "redirecting"
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <LogIn size={17} />
              Masuk dengan Google
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
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${saveStatusAppearance[saveStatus]}`}
                  >
                    <Check size={13} />
                    {saveStatusText[saveStatus]}
                  </span>

                  <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-200 ring-1 ring-indigo-400/20">
                    {user
                      ? "Akun terhubung"
                      : "Mode tamu"}
                  </span>
                </div>

                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Keluarga Ketowan
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Susun seluruh kegiatan dalam satu tempat.
                  Jam mulai dan durasi dihitung otomatis.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled
                  title="Fitur undangan akan dibuat setelah data proyek terhubung ke database"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white opacity-60 ring-1 ring-white/10"
                >
                  <Users size={17} />
                  Undang orang
                </button>

                <button
                  type="button"
                  disabled
                  title="Google Calendar belum dihubungkan"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 opacity-70"
                >
                  <CalendarDays size={17} />
                  Terbitkan
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Total kegiatan"
            value={String(
              daySummary.totalActivities,
            )}
            helper="Dalam tab aktif"
            icon={<CalendarDays size={18} />}
          />

          <SummaryCard
            label="Total waktu"
            value={formatDuration(
              daySummary.totalMinutes,
            )}
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
                  const selected =
                    day.id === activeDayId;

                  return (
                    <button
                      type="button"
                      key={day.id}
                      onClick={() =>
                        setActiveDayId(day.id)
                      }
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

                <button
                  type="button"
                  onClick={addDay}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
                >
                  <Plus size={16} />
                  Tambah hari
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-6">
              <div className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto]">
                <Field label="Nama tab">
                  <input
                    value={activeDay.title}
                    onChange={(event) =>
                      updateActiveDay(
                        (day) => ({
                          ...day,
                          title:
                            event.target.value,
                        }),
                      )
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <Field label="Tanggal">
                  <input
                    type="date"
                    value={activeDay.date}
                    onChange={(event) =>
                      updateActiveDay(
                        (day) => ({
                          ...day,
                          date:
                            event.target.value,
                        }),
                      )
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <Field label="Mulai pertama">
                  <input
                    type="time"
                    value={
                      activeDay.firstStartTime
                    }
                    onChange={(event) =>
                      updateActiveDay(
                        (day) => ({
                          ...day,
                          firstStartTime:
                            event.target.value,
                        }),
                      )
                    }
                    className={INPUT_BASE}
                  />
                </Field>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={duplicateActiveDay}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 md:w-auto"
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
                  <h2 className="text-lg font-black">
                    Rundown {activeDay.title}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(
                      activeDay.date,
                    )}
                  </p>
                </div>

                <p className="hidden text-xs font-semibold text-slate-400 sm:block">
                  Isi bagian berwarna kuning
                </p>
              </div>

              {activeDay.items.length === 0 ? (
                <EmptyState onAdd={addItem} />
              ) : (
                <div className="space-y-3">
                  {activeDay.items.map(
                    (item, index) => {
                      const startTime =
                        index === 0
                          ? activeDay.firstStartTime
                          : activeDay.items[
                              index - 1
                            ].endTime;

                      const duration =
                        calculateDurationMinutes(
                          startTime,
                          item.endTime,
                        );

                      const incomplete =
                        !item.activity.trim() ||
                        !item.endTime;

                      return (
                        <article
                          key={item.id}
                          className={`group relative overflow-hidden rounded-2xl border bg-white transition ${
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
                                    Kegiatan{" "}
                                    {index + 1}
                                  </p>

                                  <div className="mt-3 flex items-center gap-2 text-lg font-black">
                                    <span>
                                      {startTime ||
                                        "--:--"}
                                    </span>

                                    <span className="text-slate-300">
                                      →
                                    </span>

                                    <span>
                                      {item.endTime ||
                                        "--:--"}
                                    </span>
                                  </div>

                                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-slate-200">
                                    <Clock3
                                      size={13}
                                    />

                                    {formatDuration(
                                      duration,
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-1 lg:mt-5">
                                  <SmallIconButton
                                    label="Pindahkan ke atas"
                                    disabled={
                                      index === 0
                                    }
                                    onClick={() =>
                                      moveItem(
                                        item.id,
                                        "up",
                                      )
                                    }
                                  >
                                    <ArrowUp
                                      size={15}
                                    />
                                  </SmallIconButton>

                                  <SmallIconButton
                                    label="Pindahkan ke bawah"
                                    disabled={
                                      index ===
                                      activeDay
                                        .items
                                        .length -
                                        1
                                    }
                                    onClick={() =>
                                      moveItem(
                                        item.id,
                                        "down",
                                      )
                                    }
                                  >
                                    <ArrowDown
                                      size={15}
                                    />
                                  </SmallIconButton>
                                </div>
                              </div>
                            </div>

                            <div className="min-w-0 p-4">
                              <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                                <Field
                                  label="Jam selesai"
                                  required
                                >
                                  <input
                                    type="time"
                                    value={
                                      item.endTime
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      patchItem(
                                        item.id,
                                        {
                                          endTime:
                                            event
                                              .target
                                              .value,
                                        },
                                      )
                                    }
                                    className={
                                      INPUT_REQUIRED
                                    }
                                  />
                                </Field>

                                <Field
                                  label="Nama kegiatan"
                                  required
                                >
                                  <input
                                    value={
                                      item.activity
                                    }
                                    placeholder="Contoh: Free Time"
                                    onChange={(
                                      event,
                                    ) =>
                                      patchItem(
                                        item.id,
                                        {
                                          activity:
                                            event
                                              .target
                                              .value,
                                        },
                                      )
                                    }
                                    className={
                                      INPUT_REQUIRED
                                    }
                                  />
                                </Field>
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <Field label="Penanggung jawab">
                                  <input
                                    value={
                                      item.personInCharge
                                    }
                                    placeholder="Pilih atau tulis PIC"
                                    onChange={(
                                      event,
                                    ) =>
                                      patchItem(
                                        item.id,
                                        {
                                          personInCharge:
                                            event
                                              .target
                                              .value,
                                        },
                                      )
                                    }
                                    className={
                                      INPUT_BASE
                                    }
                                  />
                                </Field>

                                <Field label="Penerima Calendar">
                                  <select
                                    value={
                                      item.audience
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      patchItem(
                                        item.id,
                                        {
                                          audience:
                                            event
                                              .target
                                              .value as CalendarAudience,
                                        },
                                      )
                                    }
                                    className={
                                      INPUT_BASE
                                    }
                                  >
                                    <option>
                                      Semua peserta
                                    </option>

                                    <option>
                                      Hanya PIC
                                    </option>

                                    <option>
                                      Tidak disinkronkan
                                    </option>
                                  </select>
                                </Field>
                              </div>

                              <Field label="Keterangan">
                                <textarea
                                  value={item.note}
                                  rows={2}
                                  placeholder="Catatan tambahan, lokasi, atau perlengkapan..."
                                  onChange={(
                                    event,
                                  ) =>
                                    patchItem(
                                      item.id,
                                      {
                                        note:
                                          event
                                            .target
                                            .value,
                                      },
                                    )
                                  }
                                  className={`${INPUT_BASE} mt-3 h-auto resize-none py-3`}
                                />
                              </Field>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start lg:border-l lg:border-t-0">
                              <span
                                className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-center text-xs font-bold ring-1 ${getAudienceAppearance(
                                  item.audience,
                                )}`}
                              >
                                {item.audience}
                              </span>

                              {incomplete ? (
                                <span className="text-center text-xs font-bold text-amber-700">
                                  Lengkapi kegiatan
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
                                  <Check
                                    size={14}
                                  />
                                  Siap
                                </span>
                              )}

                              <div className="flex justify-center gap-1 lg:mt-auto">
                                <SmallIconButton
                                  label="Duplikat kegiatan"
                                  onClick={() =>
                                    duplicateItem(
                                      item.id,
                                    )
                                  }
                                >
                                  <Copy
                                    size={15}
                                  />
                                </SmallIconButton>

                                <SmallIconButton
                                  label="Hapus kegiatan"
                                  danger
                                  onClick={() =>
                                    deleteItem(
                                      item.id,
                                    )
                                  }
                                >
                                  <Trash2
                                    size={15}
                                  />
                                </SmallIconButton>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={addItem}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-4 font-black text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                <Plus size={18} />
                Tambah kegiatan
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <UserRound size={19} />
                </div>

                <div className="min-w-0">
                  <h3 className="truncate font-black">
                    {userName}
                  </h3>

                  <p className="truncate text-xs text-slate-500">
                    {user?.email ??
                      "Belum masuk akun"}
                  </p>
                </div>
              </div>

              <StatusRow
                label="Status akun"
                value={
                  user
                    ? "Terhubung"
                    : "Mode tamu"
                }
                completed={Boolean(user)}
              />

              <StatusRow
                label="Role proyek"
                value={
                  user
                    ? "Pemilik"
                    : "Belum ditentukan"
                }
                completed={Boolean(user)}
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

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <BellRing size={19} />
                </div>

                <div>
                  <h3 className="font-black">
                    Pengingat Calendar
                  </h3>

                  <p className="text-xs text-slate-500">
                    Berlaku saat Calendar aktif
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
                  <h3 className="font-black">
                    Status proyek
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Tahap integrasi
                  </p>
                </div>

                <MoreHorizontal
                  size={18}
                  className="text-slate-400"
                />
              </div>

              <StatusRow
                label="Data lokal"
                value={
                  saveStatus === "saved"
                    ? "Tersimpan"
                    : saveStatus === "error"
                      ? "Bermasalah"
                      : "Memproses"
                }
                completed={
                  saveStatus === "saved"
                }
              />

              <StatusRow
                label="Login Google"
                value={
                  user
                    ? "Aktif"
                    : "Belum"
                }
                completed={Boolean(user)}
              />

              <StatusRow
                label="Database proyek"
                value="Belum terhubung"
              />

              <StatusRow
                label="Google Calendar"
                value="Belum terhubung"
              />

              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Login Google sudah disiapkan. Data rundown
                masih tersimpan pada browser sampai tahap
                sinkronisasi database selesai.
              </div>
            </div>

            <div className="rounded-[24px] bg-gradient-to-br from-indigo-600 to-blue-600 p-5 text-white shadow-xl shadow-indigo-100">
              <Sparkles size={21} />

              <h3 className="mt-4 text-lg font-black">
                Alur sederhana
              </h3>

              <p className="mt-2 text-sm leading-6 text-indigo-100">
                Isi jam selesai dan nama kegiatan.
                Jam mulai serta durasi dihitung otomatis.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

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

          <p className="mt-2 text-2xl font-black text-slate-950">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {helper}
          </p>
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

        {required && (
          <span className="text-amber-600">
            *
          </span>
        )}
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
        <p className="text-sm font-bold text-slate-800">
          {title}
        </p>

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
      <span className="text-sm text-slate-600">
        {label}
      </span>

      <span
        className={`text-right text-xs font-bold ${
          completed
            ? "text-emerald-700"
            : "text-slate-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
        <CalendarDays size={24} />
      </div>

      <h3 className="mt-4 text-lg font-black">
        Belum ada kegiatan
      </h3>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
        Tambahkan kegiatan pertama. Jam mulai akan
        mengikuti pengaturan awal tab.
      </p>

      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
      >
        <Plus size={17} />
        Tambah kegiatan
      </button>
    </div>
  );
}
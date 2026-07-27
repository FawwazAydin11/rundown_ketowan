"use client";

import {
  CalendarCheck2,
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type GoogleCalendarStatus = {
  authenticated: boolean;
  connected: boolean;
  googleEmail: string | null;
  grantedScopes: string[];
  connectedAt: string | null;
  updatedAt: string | null;
};

type LoadStatus = "idle" | "loading" | "ready" | "error";

const DISCONNECTED_STATUS: GoogleCalendarStatus = {
  authenticated: false,
  connected: false,
  googleEmail: null,
  grantedScopes: [],
  connectedAt: null,
  updatedAt: null,
};

function getCalendarMessageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("calendar") === "connected";
  const error = params.get("calendar_error");

  if (!connected && !error) {
    return null;
  }

  params.delete("calendar");
  params.delete("calendar_error");

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);

  if (connected) {
    return {
      type: "success" as const,
      text: "Google Calendar berhasil dihubungkan.",
    };
  }

  const errorMessages: Record<string, string> = {
    access_denied: "Izin Google Calendar dibatalkan.",
    configuration: "Konfigurasi Google Calendar belum lengkap.",
    invalid_state: "Sesi izin Calendar kedaluwarsa. Coba hubungkan lagi.",
    login_required: "Masuk ke Rundownku terlebih dahulu.",
    callback_failed: "Koneksi Google Calendar gagal disimpan.",
  };

  return {
    type: "error" as const,
    text: errorMessages[error ?? ""] ?? "Google Calendar gagal dihubungkan.",
  };
}

export default function GoogleCalendarConnection({
  loggedIn,
  onStatusChange,
}: {
  loggedIn: boolean;
  onStatusChange?: (status: GoogleCalendarStatus) => void;
}) {
  const [status, setStatus] = useState<GoogleCalendarStatus>(
    DISCONNECTED_STATUS,
  );
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatusFromServer = useCallback(async () => {
    if (!loggedIn) {
      setStatus(DISCONNECTED_STATUS);
      setLoadStatus("idle");
      onStatusChange?.(DISCONNECTED_STATUS);
      return;
    }

    setLoadStatus("loading");

    try {
      const response = await fetch("/api/google/calendar/status", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as Partial<
        GoogleCalendarStatus & { error: string }
      >;

      if (!response.ok) {
        throw new Error(payload.error ?? "Status Calendar gagal dibaca.");
      }

      const nextStatus: GoogleCalendarStatus = {
        authenticated: payload.authenticated ?? true,
        connected: payload.connected ?? false,
        googleEmail: payload.googleEmail ?? null,
        grantedScopes: payload.grantedScopes ?? [],
        connectedAt: payload.connectedAt ?? null,
        updatedAt: payload.updatedAt ?? null,
      };

      setStatus(nextStatus);
      setLoadStatus("ready");
      onStatusChange?.(nextStatus);
    } catch (error) {
      console.error("Calendar status error:", error);
      setLoadStatus("error");
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Status Google Calendar gagal dibaca.",
      });
    }
  }, [loggedIn, onStatusChange]);

  useEffect(() => {
    const urlMessage = getCalendarMessageFromUrl();

    if (urlMessage) {
      setMessage(urlMessage);
    }
  }, []);

  useEffect(() => {
    void loadStatusFromServer();
  }, [loadStatusFromServer]);

  function connectCalendar() {
    window.location.assign("/api/google/calendar/connect");
  }

  async function disconnectCalendar() {
    const confirmed = window.confirm(
      "Putuskan koneksi Google Calendar dari akun ini?",
    );

    if (!confirmed) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/google/calendar/disconnect", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Koneksi gagal diputus.");
      }

      setMessage({
        type: "success",
        text: "Koneksi Google Calendar sudah diputus.",
      });

      await loadStatusFromServer();
    } catch (error) {
      console.error("Calendar disconnect error:", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Koneksi Google Calendar gagal diputus.",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              status.connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-indigo-50 text-indigo-700"
            }`}
          >
            {status.connected ? (
              <CalendarCheck2 size={19} />
            ) : (
              <CalendarDays size={19} />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-black">Google Calendar</h3>
            <p className="truncate text-xs text-slate-500">
              {loadStatus === "loading"
                ? "Memeriksa koneksi..."
                : status.connected
                  ? status.googleEmail ?? "Akun Calendar terhubung"
                  : "Belum terhubung"}
            </p>
          </div>
        </div>

        {loadStatus === "loading" && (
          <LoaderCircle className="animate-spin text-slate-400" size={18} />
        )}
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-semibold leading-5 ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {!loggedIn ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          Masuk dengan Google terlebih dahulu sebelum menghubungkan Calendar.
        </div>
      ) : status.connected ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
            Izin Calendar aktif. Tahap berikutnya akan membuat kalender proyek dan
            menerbitkan seluruh kegiatan.
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadStatusFromServer()}
              disabled={loadStatus === "loading" || disconnecting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Periksa
            </button>

            <button
              type="button"
              onClick={() => void disconnectCalendar()}
              disabled={disconnecting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {disconnecting ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <Unplug size={14} />
              )}
              Putuskan
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={connectCalendar}
          disabled={loadStatus === "loading"}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          <CalendarDays size={16} />
          Hubungkan Google Calendar
        </button>
      )}

      {loadStatus === "error" && (
        <button
          type="button"
          onClick={() => void loadStatusFromServer()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
        >
          <RefreshCw size={14} />
          Coba lagi
        </button>
      )}
    </div>
  );
}

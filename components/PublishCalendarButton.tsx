"use client";

import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Check,
  LoaderCircle,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CalendarPublishStatus = {
  published: boolean;
  needsRepublish: boolean;
  calendarName: string | null;
  googleCalendarId: string | null;
  lastPublishedAt: string | null;
  latestChangeAt: string | null;
  totalPublished: number;
  totalSyncable: number;
  publishedItemIds: string[];
};

type PublishResult = {
  success: boolean;
  calendarName: string;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
  publishedAt: string;
};

type UnpublishResult = {
  success: boolean;
  calendarName: string | null;
  deleted: number;
  alreadyMissing?: number;
  alreadyUnpublished?: boolean;
  unpublishedAt?: string;
};

type ActionState =
  | "idle"
  | "publishing"
  | "unpublishing"
  | "publish-success"
  | "unpublish-success"
  | "error";

const EMPTY_STATUS: CalendarPublishStatus = {
  published: false,
  needsRepublish: false,
  calendarName: null,
  googleCalendarId: null,
  lastPublishedAt: null,
  latestChangeAt: null,
  totalPublished: 0,
  totalSyncable: 0,
  publishedItemIds: [],
};

function formatPublishedTime(value: string | null) {
  if (!value) {
    return "Belum pernah diterbitkan";
  }

  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function PublishCalendarButton({
  projectId,
  projectName,
  canPublish,
  calendarConnected,
  saveReady,
  totalItems,
  rundownVersion,
  onStatusChange,
}: {
  projectId: string | null;
  projectName: string;
  canPublish: boolean;
  calendarConnected: boolean;
  saveReady: boolean;
  totalItems: number;
  rundownVersion: string;
  onStatusChange?: (status: CalendarPublishStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [unpublishResult, setUnpublishResult] =
    useState<UnpublishResult | null>(null);
  const [status, setStatus] = useState<CalendarPublishStatus>(EMPTY_STATUS);
  const [statusLoading, setStatusLoading] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const emitStatus = useCallback(
    (nextStatus: CalendarPublishStatus) => {
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  const loadStatus = useCallback(async () => {
    if (!projectId || !calendarConnected) {
      emitStatus(EMPTY_STATUS);
      return;
    }

    try {
      setStatusLoading(true);

      const response = await fetch(
        `/api/google/calendar/publish/status?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as CalendarPublishStatus & {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? "Status publikasi gagal dibaca.");
      }

      emitStatus({
        published: Boolean(payload.published),
        needsRepublish: Boolean(payload.needsRepublish),
        calendarName: payload.calendarName ?? null,
        googleCalendarId: payload.googleCalendarId ?? null,
        lastPublishedAt: payload.lastPublishedAt ?? null,
        latestChangeAt: payload.latestChangeAt ?? null,
        totalPublished: Number(payload.totalPublished ?? 0),
        totalSyncable: Number(payload.totalSyncable ?? 0),
        publishedItemIds: Array.isArray(payload.publishedItemIds)
          ? payload.publishedItemIds.filter(
              (itemId): itemId is string => typeof itemId === "string",
            )
          : [],
      });
    } catch (error) {
      console.error("Calendar publish status error:", error);
    } finally {
      setStatusLoading(false);
    }
  }, [calendarConnected, emitStatus, projectId]);

  useEffect(() => {
    if (!calendarConnected || !projectId) {
      emitStatus(EMPTY_STATUS);
      return;
    }

    if (!saveReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [calendarConnected, emitStatus, loadStatus, projectId, rundownVersion, saveReady]);

  const disabledReason = useMemo(() => {
    if (!canPublish) {
      return "Hanya pemilik proyek yang dapat menerbitkan rundown";
    }

    if (!calendarConnected) {
      return "Hubungkan Google Calendar terlebih dahulu";
    }

    if (!saveReady) {
      return "Tunggu sampai perubahan selesai tersimpan online";
    }

    if (!projectId) {
      return "Proyek belum siap";
    }

    if (status.published && status.needsRepublish) {
      return "Ada perubahan yang perlu diterbitkan ulang";
    }

    if (status.published) {
      return "Lihat status publikasi Google Calendar";
    }

    return "Terbitkan rundown ke Google Calendar";
  }, [calendarConnected, canPublish, projectId, saveReady, status]);

  const disabled =
    !canPublish || !calendarConnected || !saveReady || !projectId;

  const buttonLabel = statusLoading
    ? "Memeriksa..."
    : status.published && status.needsRepublish
      ? "Terbitkan ulang"
      : status.published
        ? "Sudah terbit"
        : "Terbitkan";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const busy =
        actionState === "publishing" || actionState === "unpublishing";

      if (event.key === "Escape" && !busy) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [actionState, open]);

  function openDialog() {
    if (disabled) {
      return;
    }

    setActionState("idle");
    setMessage("");
    setPublishResult(null);
    setUnpublishResult(null);
    setConfirmUnpublish(false);
    setOpen(true);
  }

  async function publish() {
    if (!projectId) {
      return;
    }

    try {
      setActionState("publishing");
      setMessage("");
      setPublishResult(null);
      setUnpublishResult(null);
      setConfirmUnpublish(false);

      const response = await fetch("/api/google/calendar/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });

      const payload = (await response.json()) as PublishResult & {
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Rundown gagal diterbitkan.");
      }

      setPublishResult(payload);
      setActionState("publish-success");
      await loadStatus();
    } catch (error) {
      console.error("Calendar publish error:", error);
      setActionState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Rundown gagal diterbitkan ke Google Calendar.",
      );
    }
  }

  async function unpublish() {
    if (!projectId) {
      return;
    }

    try {
      setActionState("unpublishing");
      setMessage("");
      setPublishResult(null);
      setUnpublishResult(null);

      const response = await fetch("/api/google/calendar/unpublish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });
      const payload = (await response.json()) as UnpublishResult & {
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Publikasi gagal dibatalkan.");
      }

      setUnpublishResult(payload);
      setActionState("unpublish-success");
      setConfirmUnpublish(false);
      await loadStatus();
    } catch (error) {
      console.error("Calendar unpublish error:", error);
      setActionState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Publikasi Google Calendar gagal dibatalkan.",
      );
    }
  }

  const busy =
    actionState === "publishing" || actionState === "unpublishing";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled || statusLoading}
        title={disabledReason}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {statusLoading ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : status.published && !status.needsRepublish ? (
          <CalendarCheck2 size={17} />
        ) : status.published ? (
          <RotateCcw size={17} />
        ) : (
          <CalendarDays size={17} />
        )}
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget && !busy) {
              setOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-calendar-title"
            className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                  {actionState === "unpublish-success" ? (
                    <Trash2 size={20} />
                  ) : actionState === "publish-success" ||
                    (status.published && !status.needsRepublish) ? (
                    <CalendarCheck2 size={21} />
                  ) : status.published ? (
                    <CalendarClock size={21} />
                  ) : (
                    <Send size={20} />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 id="publish-calendar-title" className="text-xl font-black">
                    {actionState === "publish-success"
                      ? "Rundown diterbitkan"
                      : actionState === "unpublish-success"
                        ? "Publikasi dibatalkan"
                        : status.published
                          ? "Status publikasi"
                          : "Terbitkan ke Calendar"}
                  </h2>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {projectName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Tutup dialog"
                className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X size={19} />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              {actionState === "publish-success" && publishResult ? (
                <PublishSuccess result={publishResult} />
              ) : actionState === "unpublish-success" && unpublishResult ? (
                <div>
                  <div className="flex items-start gap-3 rounded-2xl bg-slate-100 p-4 text-slate-900">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
                      <Check size={17} />
                    </div>
                    <div>
                      <p className="font-black">Semua event sudah dilepas</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {unpublishResult.deleted} event dihapus dari Google
                        Calendar. Kalender proyek tetap tersedia dan dapat dipakai
                        lagi saat rundown diterbitkan ulang.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Selesai
                  </button>
                </div>
              ) : (
                <div>
                  {status.published && (
                    <div
                      className={`rounded-2xl p-4 ${
                        status.needsRepublish
                          ? "bg-amber-50 text-amber-950"
                          : "bg-emerald-50 text-emerald-950"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`grid size-9 shrink-0 place-items-center rounded-full text-white ${
                            status.needsRepublish
                              ? "bg-amber-500"
                              : "bg-emerald-600"
                          }`}
                        >
                          {status.needsRepublish ? (
                            <CalendarClock size={18} />
                          ) : (
                            <Check size={18} />
                          )}
                        </div>
                        <div>
                          <p className="font-black">
                            {status.needsRepublish
                              ? "Ada perubahan yang belum diterbitkan"
                              : "Rundown sudah tersinkron"}
                          </p>
                          <p className="mt-1 text-sm leading-6 opacity-80">
                            Terakhir diterbitkan: {formatPublishedTime(status.lastPublishedAt)}.
                            {status.calendarName
                              ? ` Kalender: ${status.calendarName}.`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`${status.published ? "mt-4" : ""} rounded-2xl bg-slate-50 p-4`}>
                    <p className="font-black text-slate-900">
                      {totalItems} kegiatan akan diperiksa
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Rundownku akan membuat atau memperbarui event sesuai data
                      terbaru, menghapus event yang sudah tidak dipakai, dan
                      mengirim pembaruan kepada penerima kegiatan.
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>• <strong>Semua peserta:</strong> seluruh anggota menerima undangan.</p>
                    <p>• <strong>Hanya PIC:</strong> hanya anggota yang dipilih sebagai PIC.</p>
                    <p>• <strong>Tidak disinkronkan:</strong> kegiatan tidak dibuat sebagai event.</p>
                  </div>

                  {message && (
                    <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold leading-6 text-red-700">
                      {message}
                    </div>
                  )}

                  {confirmUnpublish && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                      <p className="font-black text-red-900">
                        Hapus semua event dari Calendar?
                      </p>
                      <p className="mt-1 text-sm leading-6 text-red-700">
                        Peserta akan menerima pembatalan event. Data rundown di
                        aplikasi tidak ikut terhapus.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmUnpublish(false)}
                          disabled={busy}
                          className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-bold text-red-700"
                        >
                          Kembali
                        </button>
                        <button
                          type="button"
                          onClick={() => void unpublish()}
                          disabled={busy}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-black text-white disabled:opacity-60"
                        >
                          {actionState === "unpublishing" ? (
                            <LoaderCircle size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                          Hapus event
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <div>
                      {status.published && !confirmUnpublish && (
                        <button
                          type="button"
                          onClick={() => setConfirmUnpublish(true)}
                          disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
                        >
                          <Trash2 size={16} />
                          Batalkan publikasi
                        </button>
                      )}
                    </div>

                    {!confirmUnpublish && (
                      <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => setOpen(false)}
                          disabled={busy}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Tutup
                        </button>

                        <button
                          type="button"
                          onClick={() => void publish()}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
                        >
                          {actionState === "publishing" ? (
                            <LoaderCircle size={17} className="animate-spin" />
                          ) : status.published ? (
                            <RotateCcw size={17} />
                          ) : (
                            <Send size={17} />
                          )}
                          {actionState === "publishing"
                            ? "Menerbitkan..."
                            : status.published
                              ? "Terbitkan ulang"
                              : "Terbitkan sekarang"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PublishSuccess({ result }: { result: PublishResult }) {
  return (
    <div>
      <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
          <Check size={17} />
        </div>
        <div>
          <p className="font-black">Sinkronisasi selesai</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">
            Kalender <strong>{result.calendarName}</strong> sudah diperbarui.
            Undangan dan perubahan dikirim kepada penerima kegiatan.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ResultCard label="Dibuat" value={result.created} />
        <ResultCard label="Diperbarui" value={result.updated} />
        <ResultCard label="Tetap" value={result.unchanged} />
        <ResultCard label="Dihapus" value={result.deleted} />
        <ResultCard label="Tidak disinkronkan" value={result.skipped} />
      </div>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <p className="text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

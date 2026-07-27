"use client";

import {
  CalendarCheck2,
  CalendarDays,
  Check,
  LoaderCircle,
  Send,
  X,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

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

type PublishState = "idle" | "publishing" | "success" | "error";

export default function PublishCalendarButton({
  projectId,
  projectName,
  canPublish,
  calendarConnected,
  saveReady,
  totalItems,
}: {
  projectId: string | null;
  projectName: string;
  canPublish: boolean;
  calendarConnected: boolean;
  saveReady: boolean;
  totalItems: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PublishState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);

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

    return "Terbitkan rundown ke Google Calendar";
  }, [calendarConnected, canPublish, projectId, saveReady]);

  const disabled =
    !canPublish || !calendarConnected || !saveReady || !projectId;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && state !== "publishing") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, state]);

  function openDialog() {
    if (disabled) {
      return;
    }

    setState("idle");
    setMessage("");
    setResult(null);
    setOpen(true);
  }

  async function publish() {
    if (!projectId) {
      return;
    }

    try {
      setState("publishing");
      setMessage("");
      setResult(null);

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

      setResult(payload);
      setState("success");
    } catch (error) {
      console.error("Calendar publish error:", error);
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Rundown gagal diterbitkan ke Google Calendar.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title={disabledReason}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays size={17} />
        Terbitkan
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (
              event.target === event.currentTarget &&
              state !== "publishing"
            ) {
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
                  {state === "success" ? (
                    <CalendarCheck2 size={21} />
                  ) : (
                    <Send size={20} />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 id="publish-calendar-title" className="text-xl font-black">
                    {state === "success"
                      ? "Rundown diterbitkan"
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
                disabled={state === "publishing"}
                aria-label="Tutup dialog"
                className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X size={19} />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              {state === "success" && result ? (
                <div>
                  <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check size={17} />
                    </div>
                    <div>
                      <p className="font-black">Sinkronisasi selesai</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-800">
                        Kalender <strong>{result.calendarName}</strong> sudah
                        diperbarui. Undangan dan perubahan dikirim kepada
                        penerima kegiatan.
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
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-black text-slate-900">
                      {totalItems} kegiatan akan diperiksa
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Rundownku akan membuat kalender proyek bila belum ada,
                      menambah atau memperbarui event, menghapus event yang sudah
                      dihapus dari rundown, dan mengirim pembaruan kepada peserta
                      sesuai pilihan penerima Calendar.
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

                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      disabled={state === "publishing"}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Batal
                    </button>

                    <button
                      type="button"
                      onClick={() => void publish()}
                      disabled={state === "publishing"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
                    >
                      {state === "publishing" ? (
                        <LoaderCircle size={17} className="animate-spin" />
                      ) : (
                        <Send size={17} />
                      )}
                      {state === "publishing"
                        ? "Menerbitkan..."
                        : state === "error"
                          ? "Coba lagi"
                          : "Terbitkan sekarang"}
                    </button>
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

function ResultCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <p className="text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

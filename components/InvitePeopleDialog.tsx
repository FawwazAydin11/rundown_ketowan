"use client";

import {
  Check,
  Copy,
  Link2,
  RefreshCw,
  ShieldCheck,
  UserPen,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type InviteRole = "editor" | "participant";
type InviteStatus = "idle" | "creating" | "ready" | "revoking" | "error";

type InviteResponse = {
  token?: string;
  projectId?: string;
  role?: InviteRole;
  expiresAt?: string;
  maxUses?: number;
};

type InvitePeopleDialogProps = {
  open: boolean;
  projectId: string | null;
  projectName: string;
  onClose: () => void;
};

function formatExpiry(value?: string) {
  if (!value) {
    return "7 hari sejak dibuat";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "7 hari sejak dibuat";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function InvitePeopleDialog({
  open,
  projectId,
  projectName,
  onClose,
}: InvitePeopleDialogProps) {
  const [role, setRole] = useState<InviteRole>("editor");
  const [status, setStatus] = useState<InviteStatus>("idle");
  const [inviteUrl, setInviteUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRole("editor");
    setStatus("idle");
    setInviteUrl("");
    setExpiresAt(undefined);
    setMessage("");
    setCopied(false);
  }, [open, projectId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function createInvite() {
    if (!projectId) {
      setStatus("error");
      setMessage("Proyek belum siap. Tutup dialog lalu coba lagi.");
      return;
    }

    try {
      setStatus("creating");
      setMessage("");
      setCopied(false);

      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_project_invite", {
        p_project_id: projectId,
        p_role: role,
      });

      if (error) {
        throw error;
      }

      const result = data as InviteResponse | null;

      if (!result?.token) {
        throw new Error("Token undangan tidak dikembalikan oleh database.");
      }

      setInviteUrl(`${window.location.origin}/invite/${result.token}`);
      setExpiresAt(result.expiresAt);
      setStatus("ready");
    } catch (error) {
      console.error("Gagal membuat undangan:", error);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Tautan undangan gagal dibuat.",
      );
    }
  }

  async function copyInvite() {
    if (!inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Gagal menyalin tautan:", error);
      setMessage("Tautan gagal disalin. Blok teks tautan lalu salin manual.");
    }
  }

  async function revokeInvite() {
    if (!projectId) {
      return;
    }

    try {
      setStatus("revoking");
      setMessage("");

      const supabase = createClient();
      const { error } = await supabase.rpc("revoke_project_invites", {
        p_project_id: projectId,
        p_role: role,
      });

      if (error) {
        throw error;
      }

      setInviteUrl("");
      setExpiresAt(undefined);
      setStatus("idle");
      setMessage("Tautan undangan sudah dinonaktifkan.");
    } catch (error) {
      console.error("Gagal menonaktifkan undangan:", error);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Tautan undangan gagal dinonaktifkan.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <Link2 size={20} />
            </div>

            <div className="min-w-0">
              <h2 id="invite-dialog-title" className="text-xl font-black">
                Undang orang
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {projectName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={19} />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm font-bold text-slate-700">Pilih hak akses</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setRole("editor");
                setInviteUrl("");
                setExpiresAt(undefined);
                setStatus("idle");
                setMessage("");
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                role === "editor"
                  ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100"
                  : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
                  <UserPen size={18} />
                </div>
                <div>
                  <p className="font-black">Editor</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Dapat mengubah rundown
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setRole("participant");
                setInviteUrl("");
                setExpiresAt(undefined);
                setStatus("idle");
                setMessage("");
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                role === "participant"
                  ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100"
                  : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="font-black">Peserta</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Hanya dapat melihat
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            {inviteUrl ? (
              <>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Tautan undangan {role === "editor" ? "editor" : "peserta"}
                </label>

                <div className="mt-2 flex gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />

                  <button
                    type="button"
                    onClick={copyInvite}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span className="hidden sm:inline">
                      {copied ? "Tersalin" : "Salin"}
                    </span>
                  </button>
                </div>

                <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>
                    Berlaku sampai {formatExpiry(expiresAt)} dan maksimal 20
                    pengguna baru. Membuat link baru untuk role yang sama akan
                    menonaktifkan link lama.
                  </span>
                </div>
              </>
            ) : (
              <div className="py-2 text-center">
                <p className="font-bold text-slate-700">
                  Link belum dibuat
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Orang yang membuka link wajib masuk menggunakan Google.
                </p>
              </div>
            )}
          </div>

          {message && (
            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                status === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {message}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {inviteUrl && (
              <button
                type="button"
                onClick={revokeInvite}
                disabled={status === "revoking"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              >
                {status === "revoking" && (
                  <RefreshCw size={16} className="animate-spin" />
                )}
                Nonaktifkan link
              </button>
            )}

            <button
              type="button"
              onClick={createInvite}
              disabled={!projectId || status === "creating" || status === "revoking"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
            >
              {status === "creating" ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Link2 size={16} />
              )}
              {inviteUrl ? "Buat link baru" : "Buat tautan undangan"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

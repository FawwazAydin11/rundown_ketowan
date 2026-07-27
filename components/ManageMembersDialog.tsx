"use client";

import {
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ProjectRole = "owner" | "editor" | "participant";

type ProjectMember = {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  fullName: string;
  email: string;
  avatarUrl: string;
  isCurrentUser: boolean;
  isOwner: boolean;
};

type MembersResponse = {
  projectId: string;
  members: ProjectMember[];
  total: number;
};

type LoadStatus = "idle" | "loading" | "ready" | "error";

export default function ManageMembersDialog({
  open,
  projectId,
  projectName,
  currentRole,
  onMembersChanged,
  onClose,
}: {
  open: boolean;
  projectId: string | null;
  projectName: string;
  currentRole: ProjectRole | null;
  onMembersChanged?: () => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState("");
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ProjectMember | null>(
    null,
  );

  const canManage = currentRole === "owner";

  const loadMembers = useCallback(async () => {
    if (!projectId) {
      setMembers([]);
      setStatus("error");
      setMessage("Proyek belum tersedia.");
      return;
    }

    try {
      setStatus("loading");
      setMessage("");

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_project_members", {
        p_project_id: projectId,
      });

      if (error) {
        throw error;
      }

      const response = data as MembersResponse | null;
      setMembers(Array.isArray(response?.members) ? response.members : []);
      setStatus("ready");
    } catch (error) {
      console.error("Gagal memuat anggota:", error);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Daftar anggota gagal dimuat.",
      );
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) {
      setPendingRemoval(null);
      setMessage("");
      return;
    }

    void loadMembers();
  }, [open, loadMembers]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const memberCountLabel = useMemo(() => {
    const count = members.length;
    return `${count} anggota`;
  }, [members.length]);

  async function updateRole(userId: string, role: "editor" | "participant") {
    if (!projectId || !canManage) {
      return;
    }

    try {
      setWorkingUserId(userId);
      setMessage("");

      const supabase = createClient();
      const { error } = await supabase.rpc("update_project_member_role", {
        p_project_id: projectId,
        p_user_id: userId,
        p_role: role,
      });

      if (error) {
        throw error;
      }

      setMembers((current) =>
        current.map((member) =>
          member.userId === userId ? { ...member, role } : member,
        ),
      );
      onMembersChanged?.();
      setMessage("Role anggota berhasil diperbarui.");
    } catch (error) {
      console.error("Gagal mengubah role anggota:", error);
      setMessage(
        error instanceof Error ? error.message : "Role anggota gagal diubah.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  async function removeMember(member: ProjectMember) {
    if (!projectId || !canManage) {
      return;
    }

    try {
      setWorkingUserId(member.userId);
      setMessage("");

      const supabase = createClient();
      const { error } = await supabase.rpc("remove_project_member", {
        p_project_id: projectId,
        p_user_id: member.userId,
      });

      if (error) {
        throw error;
      }

      setMembers((current) =>
        current.filter((item) => item.userId !== member.userId),
      );
      onMembersChanged?.();
      setPendingRemoval(null);
      setMessage(`${member.fullName || "Anggota"} berhasil dikeluarkan.`);
    } catch (error) {
      console.error("Gagal mengeluarkan anggota:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Anggota gagal dikeluarkan.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Tutup dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-members-title"
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl shadow-slate-950/25"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <Users size={22} />
            </div>

            <div className="min-w-0">
              <h2
                id="manage-members-title"
                className="truncate text-xl font-black text-slate-950 sm:text-2xl"
              >
                {canManage ? "Kelola anggota" : "Anggota proyek"}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {projectName} · {memberCountLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-black text-slate-900">Akses proyek</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Editor dapat mengubah rundown. Peserta hanya dapat melihat.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadMembers()}
              disabled={status === "loading"}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={status === "loading" ? "animate-spin" : ""}
              />
              Muat ulang
            </button>
          </div>

          {message && (
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
              {message}
            </div>
          )}

          {status === "loading" ? (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200">
              <div className="text-center">
                <LoaderCircle
                  size={28}
                  className="mx-auto animate-spin text-indigo-600"
                />
                <p className="mt-3 text-sm font-bold text-slate-600">
                  Memuat anggota...
                </p>
              </div>
            </div>
          ) : status === "error" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="font-black text-red-800">Daftar anggota gagal dimuat</p>
              <button
                type="button"
                onClick={() => void loadMembers()}
                className="mt-4 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white"
              >
                Coba lagi
              </button>
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-12 text-center">
              <UserRound size={28} className="mx-auto text-slate-400" />
              <p className="mt-3 font-black text-slate-800">Belum ada anggota</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const busy = workingUserId === member.userId;
                const confirmingRemoval = pendingRemoval?.userId === member.userId;

                return (
                  <article
                    key={member.userId}
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <MemberAvatar member={member} />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-black text-slate-900">
                              {member.fullName || "Anggota"}
                            </p>

                            {member.isCurrentUser && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                                Kamu
                              </span>
                            )}

                            {member.isOwner && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                <ShieldCheck size={11} />
                                Pemilik
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {member.email || "Email tidak tersedia"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        {member.isOwner ? (
                          <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                            Pemilik
                          </span>
                        ) : canManage ? (
                          <select
                            value={member.role}
                            disabled={busy}
                            onChange={(event) =>
                              void updateRole(
                                member.userId,
                                event.target.value as "editor" | "participant",
                              )
                            }
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            <option value="editor">Editor</option>
                            <option value="participant">Peserta</option>
                          </select>
                        ) : (
                          <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                            {member.role === "editor" ? "Editor" : "Peserta"}
                          </span>
                        )}

                        {canManage && !member.isOwner && (
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(member)}
                            disabled={busy}
                            className="grid size-10 place-items-center rounded-xl border border-red-100 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                            aria-label={`Keluarkan ${member.fullName}`}
                            title="Keluarkan anggota"
                          >
                            {busy ? (
                              <LoaderCircle size={17} className="animate-spin" />
                            ) : (
                              <Trash2 size={17} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {confirmingRemoval && (
                      <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-3 sm:flex-row sm:items-center">
                        <p className="text-sm font-semibold text-red-800">
                          Keluarkan {member.fullName || "anggota ini"} dari proyek?
                        </p>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(null)}
                            className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeMember(member)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
                          >
                            {busy ? (
                              <LoaderCircle size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            Keluarkan
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Check size={14} className="text-emerald-600" />
            Perubahan role langsung tersimpan
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
          >
            Selesai
          </button>
        </footer>
      </section>
    </div>
  );
}

function MemberAvatar({ member }: { member: ProjectMember }) {
  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt={member.fullName || "Anggota"}
        className="size-11 shrink-0 rounded-full object-cover ring-2 ring-slate-100"
        referrerPolicy="no-referrer"
      />
    );
  }

  const initials = (member.fullName || member.email || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
      {initials || "A"}
    </div>
  );
}

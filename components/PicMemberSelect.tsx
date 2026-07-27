"use client";

import {
  Check,
  ChevronDown,
  LoaderCircle,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type PicMemberOption = {
  userId: string;
  role: "owner" | "editor" | "participant";
  joinedAt: string;
  fullName: string;
  email: string;
  avatarUrl: string;
  isCurrentUser: boolean;
  isOwner: boolean;
};

export default function PicMemberSelect({
  members,
  selectedIds,
  legacyName,
  disabled,
  loading,
  loadError,
  onRefresh,
  onChange,
}: {
  members: PicMemberOption[];
  selectedIds: string[];
  legacyName: string;
  disabled: boolean;
  loading: boolean;
  loadError: boolean;
  onRefresh: () => void;
  onChange: (selectedIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

  const selectedMembers = useMemo(
    () =>
      safeSelectedIds
        .map((userId) => members.find((member) => member.userId === userId))
        .filter((member): member is PicMemberOption => Boolean(member)),
    [members, safeSelectedIds],
  );

  const unavailableCount = safeSelectedIds.length - selectedMembers.length;

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return members;
    }

    return members.filter((member) =>
      [member.fullName, member.email, roleLabel(member.role)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [members, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleMember(userId: string) {
    if (disabled) {
      return;
    }

    if (safeSelectedIds.includes(userId)) {
      onChange(safeSelectedIds.filter((selectedId) => selectedId !== userId));
      return;
    }

    onChange([...safeSelectedIds, userId]);
  }

  function removeMember(userId: string) {
    if (disabled) {
      return;
    }

    onChange(safeSelectedIds.filter((selectedId) => selectedId !== userId));
  }

  const buttonLabel = loading
    ? "Memuat anggota..."
    : selectedMembers.length > 0
      ? `${selectedMembers.length} PIC dipilih`
      : legacyName.trim()
        ? legacyName
        : "Pilih anggota sebagai PIC";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left text-sm text-slate-900 outline-none transition hover:border-indigo-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      >
        <span className="min-w-0 truncate">
          {loading ? (
            <span className="inline-flex items-center gap-2 text-slate-500">
              <LoaderCircle size={15} className="animate-spin" />
              {buttonLabel}
            </span>
          ) : (
            buttonLabel
          )}
        </span>

        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {(selectedMembers.length > 0 || unavailableCount > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedMembers.map((member) => (
            <span
              key={member.userId}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100"
            >
              <span className="truncate">{member.fullName || member.email}</span>

              {!disabled && (
                <button
                  type="button"
                  aria-label={`Hapus ${member.fullName || member.email} dari PIC`}
                  onClick={() => removeMember(member.userId)}
                  className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-indigo-100"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}

          {unavailableCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100">
              {unavailableCount} PIC tidak tersedia
            </span>
          )}
        </div>
      )}

      {loadError && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-100">
          <span>Daftar anggota gagal dimuat.</span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex shrink-0 items-center gap-1 font-black"
          >
            <RefreshCw size={12} />
            Coba lagi
          </button>
        </div>
      )}

      {!selectedMembers.length && legacyName.trim() && !loading && (
        <p className="mt-1.5 text-xs leading-5 text-amber-700">
          PIC lama: {legacyName}. Pilih anggota agar notifikasi Calendar nantinya
          dapat diarahkan ke akun yang tepat.
        </p>
      )}

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80">
          <div className="border-b border-slate-100 p-3">
            <div className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Search size={15} className="text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau email..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2" role="listbox">
            {filteredMembers.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <UserRound className="mx-auto text-slate-300" size={24} />
                <p className="mt-2 text-sm font-bold text-slate-600">
                  Anggota tidak ditemukan
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Undang anggota atau coba kata pencarian lain.
                </p>
              </div>
            ) : (
              filteredMembers.map((member) => {
                const selected = safeSelectedIds.includes(member.userId);

                return (
                  <button
                    type="button"
                    key={member.userId}
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggleMember(member.userId)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    {member.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                        <UserRound size={16} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {member.fullName || member.email || "Anggota"}
                        {member.isCurrentUser ? " (kamu)" : ""}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {member.email || roleLabel(member.role)} · {roleLabel(member.role)}
                      </p>
                    </div>

                    <div
                      className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                        selected
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check size={13} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span>{safeSelectedIds.length} dipilih</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-black text-indigo-700"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function roleLabel(role: PicMemberOption["role"]) {
  switch (role) {
    case "owner":
      return "Pemilik";
    case "editor":
      return "Editor";
    default:
      return "Peserta";
  }
}

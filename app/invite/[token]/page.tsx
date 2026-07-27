"use client";

import {
  CheckCircle2,
  LogIn,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

const PREFERRED_PROJECT_STORAGE_KEY = "rundownku-preferred-project-id";

type AuthStatus = "loading" | "ready" | "redirecting" | "error";
type AcceptStatus = "idle" | "accepting" | "accepted" | "error";

type InviteResult = {
  success?: boolean;
  projectId?: string;
  projectName?: string;
  role?: "owner" | "editor" | "participant";
  alreadyMember?: boolean;
};

function roleLabel(role?: InviteResult["role"]) {
  switch (role) {
    case "owner":
      return "Pemilik";
    case "editor":
      return "Editor";
    case "participant":
      return "Peserta";
    default:
      return "Anggota";
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default function InvitePage() {
  const params = useParams<{ token: string | string[] }>();
  const router = useRouter();

  const token = useMemo(() => {
    const rawToken = params.token;
    return Array.isArray(rawToken) ? rawToken[0] ?? "" : rawToken ?? "";
  }, [params.token]);

  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [acceptStatus, setAcceptStatus] = useState<AcceptStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const attemptedKeyRef = useRef("");

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
        setAuthStatus("ready");
      } catch (error) {
        console.error("Gagal membaca sesi undangan:", error);

        if (!mounted) {
          return;
        }

        setAuthStatus("error");
        setMessage("Sesi login gagal dibaca. Muat ulang halaman.");
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
      setAuthStatus("ready");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "ready" || !user || !token || !isUuid(token)) {
      return;
    }

    const attemptKey = `${user.id}:${token}`;

    if (attemptedKeyRef.current === attemptKey) {
      return;
    }

    attemptedKeyRef.current = attemptKey;
    let cancelled = false;

    async function acceptInvite() {
      try {
        setAcceptStatus("accepting");
        setMessage("");

        const supabase = createClient();
        const { data, error } = await supabase.rpc("accept_project_invite", {
          p_token: token,
        });

        if (error) {
          throw error;
        }

        const accepted = data as InviteResult | null;

        if (!accepted?.projectId) {
          throw new Error("Database tidak mengembalikan proyek undangan.");
        }

        if (cancelled) {
          return;
        }

        window.localStorage.setItem(
          PREFERRED_PROJECT_STORAGE_KEY,
          accepted.projectId,
        );

        setResult(accepted);
        setAcceptStatus("accepted");
      } catch (error) {
        console.error("Gagal menerima undangan:", error);

        if (cancelled) {
          return;
        }

        setAcceptStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Undangan gagal diterima.",
        );
      }
    }

    void acceptInvite();

    return () => {
      cancelled = true;
    };
  }, [authStatus, retryCounter, token, user]);

  async function handleGoogleLogin() {
    if (!token) {
      return;
    }

    try {
      setAuthStatus("redirecting");
      setMessage("");

      const supabase = createClient();
      const nextPath = `/invite/${token}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            nextPath,
          )}`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Login Google gagal:", error);
      setAuthStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Login Google gagal.",
      );
    }
  }

  function retryAccept() {
    attemptedKeyRef.current = "";
    setAcceptStatus("idle");
    setMessage("");

    setRetryCounter((current) => current + 1);
  }

  const invalidToken = Boolean(token) && !isUuid(token);

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-10 text-slate-950 sm:py-16">
      <div className="mx-auto max-w-lg">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-700"
        >
          ← Kembali ke Rundownku
        </Link>

        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
          <div className="bg-slate-950 px-6 py-7 text-white sm:px-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <Users size={22} />
            </div>
            <h1 className="mt-5 text-2xl font-black">Undangan Rundownku</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Masuk dengan Google untuk bergabung ke proyek rundown yang
              dibagikan kepadamu.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {authStatus === "loading" && (
              <StatusPanel
                icon={<RefreshCw size={24} className="animate-spin" />}
                title="Memeriksa akun..."
                description="Tunggu sebentar, sesi login sedang dibaca."
              />
            )}

            {invalidToken && (
              <StatusPanel
                tone="error"
                icon={<ShieldAlert size={24} />}
                title="Tautan tidak valid"
                description="Format token undangan tidak dikenali. Minta pemilik proyek membuat link baru."
              />
            )}

            {!invalidToken && authStatus !== "loading" && !user && (
              <>
                <StatusPanel
                  icon={<LogIn size={24} />}
                  title="Login diperlukan"
                  description="Gunakan akun Google yang akan tercatat sebagai anggota proyek."
                />

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={authStatus === "redirecting"}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {authStatus === "redirecting" ? (
                    <RefreshCw size={17} className="animate-spin" />
                  ) : (
                    <LogIn size={17} />
                  )}
                  {authStatus === "redirecting"
                    ? "Mengarahkan ke Google..."
                    : "Masuk dengan Google"}
                </button>
              </>
            )}

            {!invalidToken && user && acceptStatus === "accepting" && (
              <StatusPanel
                icon={<RefreshCw size={24} className="animate-spin" />}
                title="Menerima undangan..."
                description="Keanggotaan proyek sedang disiapkan."
              />
            )}

            {!invalidToken && user && acceptStatus === "accepted" && result && (
              <>
                <StatusPanel
                  tone="success"
                  icon={<CheckCircle2 size={25} />}
                  title={
                    result.alreadyMember
                      ? "Kamu sudah menjadi anggota"
                      : "Undangan berhasil diterima"
                  }
                  description={`Kamu bergabung ke ${
                    result.projectName ?? "proyek rundown"
                  } sebagai ${roleLabel(result.role)}.`}
                />

                <button
                  type="button"
                  onClick={() => {
                    router.replace("/");
                    router.refresh();
                  }}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"
                >
                  Buka rundown
                </button>
              </>
            )}

            {!invalidToken && user && acceptStatus === "error" && (
              <>
                <StatusPanel
                  tone="error"
                  icon={<ShieldAlert size={24} />}
                  title="Undangan tidak dapat dipakai"
                  description={message || "Tautan mungkin kedaluwarsa atau sudah dinonaktifkan."}
                />

                <button
                  type="button"
                  onClick={retryAccept}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={17} />
                  Coba lagi
                </button>
              </>
            )}

            {authStatus === "error" && !user && message && (
              <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {message}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusPanel({
  icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "success" | "error";
}) {
  const appearance = {
    neutral: "bg-indigo-50 text-indigo-700",
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="text-center">
      <div className={`mx-auto grid size-14 place-items-center rounded-2xl ${appearance}`}>
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

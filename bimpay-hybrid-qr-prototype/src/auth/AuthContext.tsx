import {
  useEffect,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession(): Promise<void> {
      try {
        const response = await fetch("/api/auth", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = (await response.json()) as { authenticated?: boolean };

        if (!cancelled) {
          setAuthenticated(response.ok && result.authenticated === true);
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setError("Could not reach the sign-in service.");
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Sign in failed.");
      }

      setPassword("");
      setAuthenticated(true);
    } catch (signInError) {
      setError(
        signInError instanceof Error ? signInError.message : "Sign in failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut(): Promise<void> {
    try {
      await fetch("/api/auth", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } finally {
      setAuthenticated(false);
    }
  }

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <p className="text-sm font-semibold text-slate-300">
          Checking your session...
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-8 shadow-2xl sm:p-10">
          <div className="mb-8">
            <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
              Private prototype
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Sign in to continue
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Enter the site password to access the Hybrid QR prototype.
            </p>
          </div>

          <form className="space-y-5" onSubmit={(event) => void signIn(event)}>
            <div>
              <label
                className="mb-2 block text-sm font-bold text-slate-800"
                htmlFor="site-password"
              >
                Password
              </label>
              <input
                id="site-password"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>

            {error && (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={{ signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

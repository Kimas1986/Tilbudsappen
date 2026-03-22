"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getSafeNextPath() {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const supabase = createClient();

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message || "Kunne ikke logge inn");
        return;
      }

      await supabase.auth.refreshSession();

      const target = getSafeNextPath();

      router.replace(target);
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setError("Uventet feil ved innlogging");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <div className="w-full rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div>
            <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Logg inn</h1>
            <p className="mt-3 text-sm text-neutral-600">
              Logg inn for å administrere tilbud, materialer, fakturaer og økonomi.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium">E-post</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="deg@firma.no"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Passord</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="Passord"
                required
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-black px-4 py-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Logger inn..." : "Logg inn"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-600">
            Har du ikke bruker ennå?{" "}
            <Link href="/register" className="font-medium text-black underline">
              Registrer deg
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
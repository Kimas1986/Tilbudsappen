import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  next?: string;
  error?: string;
}>;

function getSafeNextPath(nextValue: string | undefined) {
  const next = String(nextValue || "").trim();

  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = getSafeNextPath(resolvedSearchParams?.next);
  const errorMessage = String(resolvedSearchParams?.error || "").trim();

  async function login(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const next = getSafeNextPath(String(formData.get("next") || ""));

    if (!email || !password) {
      redirect(
        `/login?error=${encodeURIComponent("Fyll inn e-post og passord")}&next=${encodeURIComponent(next)}`
      );
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      redirect(
        `/login?error=${encodeURIComponent(
          error.message || "Kunne ikke logge inn"
        )}&next=${encodeURIComponent(next)}`
      );
    }

    redirect(next);
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

          <form action={login} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={nextPath} />

            <div>
              <label className="block text-sm font-medium">E-post</label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="deg@firma.no"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Passord</label>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="Passord"
                required
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-black px-4 py-4 text-sm font-medium text-white"
            >
              Logg inn
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
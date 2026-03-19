import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-3xl font-bold tracking-tight">
            Tilbudsapp for håndverkere
          </h1>

          <p className="mt-4 text-base text-neutral-600">
            Lag, send og få godkjent tilbud raskt og enkelt.
          </p>

          <div className="mt-8 flex gap-3">
            <Link
              href="/login"
              className="rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white"
            >
              Logg inn
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
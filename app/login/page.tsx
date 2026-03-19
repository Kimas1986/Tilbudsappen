import { login, signup } from "./actions";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-2">
          <div className="bg-black p-8 text-white">
            <h1 className="text-3xl font-bold tracking-tight">Tilbudsapp</h1>
            <p className="mt-4 text-sm text-white/80">
              Logg inn og bygg tilbud ute hos kunde på noen få minutter.
            </p>
          </div>

          <div className="p-8">
            <div className="mx-auto max-w-md">
              <h2 className="text-2xl font-semibold">
                Logg inn eller opprett bruker
              </h2>

              <p className="mt-2 text-sm text-neutral-600">
                Foreløpig setter vi kun opp grunnmuren.
              </p>

              <form action={login} className="mt-8 space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium"
                  >
                    E-post
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    placeholder="navn@firma.no"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium"
                  >
                    Passord
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
                >
                  Logg inn
                </button>

                <button
                  formAction={signup}
                  className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900"
                >
                  Opprett bruker
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
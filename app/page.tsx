"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function HomePage() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Sjekk om app allerede er installert
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Lytt etter install-event
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;

    installPrompt.prompt();

    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

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

          {/* 🔥 INSTALL APP */}
          {!isInstalled && (
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-medium">
                Installer appen på mobilen
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Få varsler når tilbud blir godkjent.
              </p>

              <button
                onClick={handleInstall}
                disabled={!installPrompt}
                className="mt-3 w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Last ned app
              </button>

              {!installPrompt && (
                <p className="mt-2 text-xs text-neutral-500">
                  Åpne siden i Chrome/Safari på mobil for å installere.
                </p>
              )}
            </div>
          )}

          {/* LOGIN */}
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
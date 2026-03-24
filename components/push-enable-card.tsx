"use client";

import { useEffect, useState } from "react";

type PermissionState = "default" | "granted" | "denied";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PushEnableCard() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(standalone);

    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstallApp() {
    if (!installPrompt) return;

    try {
      setIsBusy(true);
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;

      if (result.outcome === "accepted") {
        setInstallPrompt(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsBusy(false);
    }
  }

  if (isStandalone || permission === "granted") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleInstallApp}
      disabled={!installPrompt || isBusy}
      className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-50"
    >
      Installer app
    </button>
  );
}
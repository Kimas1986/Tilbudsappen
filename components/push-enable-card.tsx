"use client";

import { useEffect, useState } from "react";

type PermissionState = "default" | "granted" | "denied";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export default function PushEnableCard() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isStandalone, setIsStandalone] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"neutral" | "success" | "error">(
    "neutral"
  );

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const supported =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setIsStandalone(standalone);
    setIsSupported(supported);

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
      await installPrompt.userChoice;
      setInstallPrompt(null);
      setMessage("App-installasjon startet. Åpne appen og slå deretter på pushvarsler.");
      setMessageType("success");
    } catch (error) {
      console.error(error);
      setMessage("Kunne ikke starte app-installasjon.");
      setMessageType("error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEnablePush() {
    try {
      setIsBusy(true);
      setMessage("");

      if (!isSupported) {
        setMessage("Pushvarsler støttes ikke på denne enheten.");
        setMessageType("error");
        return;
      }

      if (!isStandalone) {
        setMessage("Installer og åpne appen først. Push skal aktiveres inne i appen.");
        setMessageType("error");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidKey) {
        setMessage("NEXT_PUBLIC_VAPID_PUBLIC_KEY mangler.");
        setMessageType("error");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        setMessage("Pushvarsler ble ikke tillatt.");
        setMessageType("error");
        return;
      }

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Kunne ikke lagre push-abonnement.");
      }

      setMessage("Pushvarsler er slått på.");
      setMessageType("success");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Kunne ikke slå på pushvarsler."
      );
      setMessageType("error");
    } finally {
      setIsBusy(false);
    }
  }

  const showInstallButton = !isStandalone;
  const showEnableButton = isStandalone && isSupported && permission !== "granted";

  return (
    <section className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-neutral-700">App og varsler</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
            Installer appen og slå på pushvarsler
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Først installerer du appen på telefonen. Deretter åpner du appen og
            slår på pushvarsler derfra. Da kan du senere få beskjed når tilbud
            blir godkjent.
          </p>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-black/5">
          <p className="text-neutral-500">Status</p>
          <p className="mt-1 font-medium text-neutral-900">
            {isStandalone
              ? permission === "granted"
                ? "App åpnet • Push aktiv"
                : "App åpnet • Push ikke aktiv"
              : "Åpnet i nettleser"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {showInstallButton ? (
          <button
            type="button"
            onClick={handleInstallApp}
            disabled={!installPrompt || isBusy}
            className="min-h-[48px] rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Last ned app
          </button>
        ) : (
          <div className="flex min-h-[48px] items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            Appen er åpnet
          </div>
        )}

        {showEnableButton ? (
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={isBusy}
            className="min-h-[48px] rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Slå på pushvarsler
          </button>
        ) : permission === "granted" ? (
          <div className="flex min-h-[48px] items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            Pushvarsler er aktive
          </div>
        ) : (
          <div className="flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-600">
            Åpne appen først
          </div>
        )}
      </div>

      {showInstallButton && !installPrompt ? (
        <p className="mt-3 text-xs text-neutral-500">
          Install-knappen vises når nettleseren tillater app-installasjon.
        </p>
      ) : null}

      {message ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            messageType === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : messageType === "error"
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-neutral-200 bg-white text-neutral-700"
          }`}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}
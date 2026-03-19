"use client";

import { useState } from "react";

type CopyLinkButtonProps = {
  url: string;
  offerId: string;
};

export default function CopyLinkButton({
  url,
  offerId,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);

      // 🔥 Oppdater status til "sent"
      await fetch("/api/offers/sent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ offerId }),
      });

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Kunne ikke kopiere lenke:", error);
      alert("Kunne ikke kopiere lenken automatisk.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-2xl border border-neutral-300 px-4 py-2"
    >
      {copied ? "Lenke kopiert" : "Kopier lenke"}
    </button>
  );
}
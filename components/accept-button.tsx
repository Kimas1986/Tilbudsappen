"use client";

import { useState } from "react";

export default function AcceptButton({ offerId }: { offerId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function accept() {
    setLoading(true);

    await fetch("/api/offers/accept", {
      method: "POST",
      body: JSON.stringify({ id: offerId }),
    });

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="text-green-600 font-medium">
        ✔️ Tilbud godkjent
      </div>
    );
  }

  return (
    <button
      onClick={accept}
      disabled={loading}
      className="w-full bg-green-600 text-white py-3 rounded-xl"
    >
      {loading ? "Godkjenner..." : "Godkjenn tilbud"}
    </button>
  );
}
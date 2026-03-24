import webpush from "web-push";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys mangler i miljøvariabler.");
  }

  webpush.setVapidDetails(
    "mailto:post@lokalapp.no",
    publicKey,
    privateKey
  );

  vapidConfigured = true;
}

export async function sendPushToSubscriptions(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload
) {
  ensureVapidConfigured();

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (item) => {
      if (!item.endpoint || !item.p256dh || !item.auth) {
        throw new Error("Ufullstendig push subscription.");
      }

      await webpush.sendNotification(
        {
          endpoint: item.endpoint,
          keys: {
            p256dh: item.p256dh,
            auth: item.auth,
          },
        },
        body
      );
    })
  );

  return results;
}
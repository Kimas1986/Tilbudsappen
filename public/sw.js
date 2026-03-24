self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {
    title: "Varsel",
    body: "Du har fått et nytt varsel.",
    url: "/dashboard",
    requireInteraction: true,
  };

  try {
    const parsed = event.data.json();
    data = {
      title: parsed.title || data.title,
      body: parsed.body || data.body,
      url: parsed.url || data.url,
      requireInteraction:
        typeof parsed.requireInteraction === "boolean"
          ? parsed.requireInteraction
          : true,
    };
  } catch {
    // fallback
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: {
        url: data.url,
      },
      requireInteraction: data.requireInteraction,
      badge: "/icon-192.png",
      icon: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
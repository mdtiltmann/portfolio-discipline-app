// Minimal service worker for Web Push notifications. Plain JS (not
// compiled/bundled) so it can be served as-is from /public.

self.addEventListener("push", (event) => {
  let payload = { title: "Signal update", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Non-JSON payload — fall back to the default title/body.
  }

  const title = payload.title || "Signal update";
  const options = {
    body: payload.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.ticker || undefined,
    data: { ticker: payload.ticker, verdict: payload.verdict },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })()
  );
});

"use client";

// Toggle for enabling/disabling phone push notifications when a held
// ticker's signal crosses into/out of Buy or Sell. Feature-detects
// serviceWorker/PushManager support so unsupported browsers (e.g. iOS
// Safari not added to the home screen) get a plain message instead of a
// crash.

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "denied";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
      } catch {
        if (!cancelled) setStatus("unsubscribed");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Push is not configured (missing VAPID public key)");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to save subscription");

      setStatus("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
      {status === "unsupported" && (
        <p className="text-neutral-500 dark:text-neutral-400">
          Push notifications aren&apos;t supported in this browser. On iPhone, add this site to your home screen
          first (Share → Add to Home Screen), then open it from there to enable notifications.
        </p>
      )}

      {status === "denied" && (
        <p className="text-neutral-500 dark:text-neutral-400">
          Notification permission was denied. Enable notifications for this site in your browser/phone settings, then
          try again.
        </p>
      )}

      {(status === "subscribed" || status === "unsubscribed") && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-neutral-600 dark:text-neutral-300">
            {status === "subscribed"
              ? "Phone notifications are on — you'll be alerted when a held ticker enters or leaves Buy/Sell."
              : "Get a phone notification when a held ticker's signal crosses into or out of Buy or Sell."}
          </p>
          <button
            onClick={status === "subscribed" ? handleDisable : handleEnable}
            disabled={busy}
            className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {busy ? "Working…" : status === "subscribed" ? "Disable" : "Enable phone notifications"}
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-red-600 dark:text-red-400">{error}</p>}

      <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
        iOS requires adding this site to your home screen first (Share → Add to Home Screen). Notifications are
        informational only, based on public price/news data — not financial advice.
      </p>
    </div>
  );
}

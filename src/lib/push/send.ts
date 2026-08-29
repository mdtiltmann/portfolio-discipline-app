// Server-side Web Push sending. Used by the Netlify scheduled function (and
// could be reused elsewhere) to notify a user's subscribed devices.
//
// Runs outside any user's browser session (a scheduled job has no cookies/
// auth context), so it needs a Supabase client that bypasses RLS: a
// service-role client via SUPABASE_SERVICE_ROLE_KEY, NOT the anon-key
// server client used by request handlers (src/lib/supabase/server.ts),
// which relies on the user's session cookie and won't see any rows here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export interface PushPayload {
  title: string;
  body: string;
  ticker: string;
  verdict: string;
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("Missing VAPID_SUBJECT / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/**
 * Creates a service-role Supabase client for trusted server-only contexts
 * (scheduled functions) that must read/write across all users, bypassing
 * RLS. Requires SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard > Project
 * Settings > API > service_role key) to be set in the environment.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * Sends a push notification to every subscription on file for a user.
 * Per-subscription failures are caught and logged, never thrown — a stale
 * or invalid subscription (expired, revoked) is removed on a 404/410
 * response rather than aborting the batch.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  supabase: SupabaseClient = createServiceRoleClient()
): Promise<void> {
  ensureConfigured();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error(`sendPushToUser: failed to load subscriptions for ${userId}:`, error.message);
    return;
  }
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (unsubscribed, expired) — clean it up.
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error(`sendPushToUser: failed to send to subscription ${sub.id}:`, err);
        }
      }
    })
  );
}

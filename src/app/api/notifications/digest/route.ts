import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { loadPortfolioData, computeAlerts } from "@/lib/portfolio";
import { computeMonthlyContribution } from "@/lib/engine";

// Best-effort email digest: current alerts + this month's contribution
// recommendation. Intended to be triggered externally on a schedule (e.g.
// a Supabase cron job, GitHub Actions schedule, or any HTTP-capable cron
// service calling POST /api/notifications/digest). No email provider is
// bundled — set RESEND_API_KEY (or wire in your provider of choice) to
// enable actual sending; without it this degrades to a no-op that returns
// the digest content so it can still be inspected/logged.
//
// Manual setup required by the user (not automated by this app):
//   1. Choose a scheduler (Supabase Edge Function cron, GitHub Actions
//      `schedule:`, cron-job.org, etc.) to POST this endpoint periodically.
//   2. Set RESEND_API_KEY (or adapt the send step below to your provider)
//      and DIGEST_TO_EMAIL in the environment for actual delivery.
export async function POST() {
  const user = await requireUser();
  const data = await loadPortfolioData(user.id);
  const alerts = computeAlerts(data);
  const monthlyContribution = data.schedule ? computeMonthlyContribution(data.schedule) : null;

  const digest = {
    generatedAt: new Date().toISOString(),
    userId: user.id,
    alertCount: alerts.length,
    alerts: alerts.map((a) => ({ severity: a.severity, message: a.message })),
    monthlyContribution,
  };

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.DIGEST_TO_EMAIL;

  if (!apiKey || !toEmail) {
    return NextResponse.json({
      sent: false,
      message: "No email provider configured (RESEND_API_KEY / DIGEST_TO_EMAIL not set). Digest computed but not sent.",
      digest,
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Portfolio Discipline <notifications@resend.dev>",
        to: [toEmail],
        subject: `Portfolio digest: ${alerts.length} alert(s)`,
        text:
          `Alerts (${alerts.length}):\n` +
          alerts.map((a) => `- [${a.severity}] ${a.message}`).join("\n") +
          `\n\nThis month's contribution: ${monthlyContribution != null ? `€${monthlyContribution.toFixed(0)}` : "n/a"}`,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ sent: false, message: errText, digest }, { status: 200 });
    }
    return NextResponse.json({ sent: true, digest });
  } catch (err) {
    return NextResponse.json(
      { sent: false, message: err instanceof Error ? err.message : "Send failed", digest },
      { status: 200 }
    );
  }
}

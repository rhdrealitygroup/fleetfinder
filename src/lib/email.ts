import "server-only";

// Minimal transactional email via Resend's REST API (no SDK dependency).
// Active only when RESEND_API_KEY + ALERT_EMAIL are set; otherwise it's a safe
// no-op (logs + returns false) so crons/app run fine without email configured.
//
// Vercel env to enable:
//   RESEND_API_KEY  — from resend.com (free tier is plenty for alerts)
//   ALERT_EMAIL     — recipient(s), comma-separated (e.g. rhdrealitygroup@gmail.com)
//   ALERT_FROM      — verified sender; defaults to Resend's shared onboarding
//                     sender, which can email your own account in test mode without
//                     domain setup. For production use a verified domain sender.
export async function sendAlertEmail(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) {
    console.warn(`[email] not configured (RESEND_API_KEY/ALERT_EMAIL) — skipped: ${subject}`);
    return false;
  }
  const from = process.env.ALERT_FROM || "LotCompass Alerts <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!r.ok) {
      console.error(`[email] send failed ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email] send error: ${(e as Error).message}`);
    return false;
  }
}

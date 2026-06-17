import type { VercelRequest, VercelResponse } from "@vercel/node";

type WebhookEvent =
  | { event: "frame_added"; notificationDetails?: { url: string; token: string } }
  | { event: "frame_removed" }
  | { event: "notifications_enabled"; notificationDetails: { url: string; token: string } }
  | { event: "notifications_disabled" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as WebhookEvent;
    console.log("[Farcaster Webhook]", JSON.stringify(body));

    if (
      body.event === "frame_added" ||
      body.event === "notifications_enabled"
    ) {
      const details = body.notificationDetails;
      if (details?.token && details?.url) {
        console.log("[Notification Token]", {
          token: details.token,
          url: details.url,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Webhook Error]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

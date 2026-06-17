import { Router } from "express";

type WebhookEvent =
  | { event: "frame_added"; notificationDetails?: { url: string; token: string } }
  | { event: "frame_removed" }
  | { event: "notifications_enabled"; notificationDetails: { url: string; token: string } }
  | { event: "notifications_disabled" };

const router = Router();

router.post("/webhook", (req, res) => {
  try {
    const body = req.body as WebhookEvent;
    // Log event type only — never log tokens or notification URLs (sensitive)
    req.log?.info({ event: body.event }, "[farcaster-webhook] received");

    if (
      (body.event === "frame_added" || body.event === "notifications_enabled") &&
      "notificationDetails" in body &&
      body.notificationDetails?.token
    ) {
      // TODO: store token securely in DB when notification sending is needed
      req.log?.info({ event: body.event }, "[farcaster-webhook] notification token received (not stored yet)");
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "[farcaster-webhook] error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import express from "express";
import cors from "cors";
import { resolve } from "node:path";
import { config } from "./config";
import { migrate } from "./db";
import { seed } from "./seed";
import {
  deleteChild,
  deleteMember,
  getAdminState,
  getAssignmentViews,
  getLineDestinations,
  saveFamilyName,
  updateNotificationSetting,
  upsertChild,
  upsertMember,
  upsertWeeklyRule
} from "./repository";
import { buildMorningMessage, buildPreviousDayMessage, handleLineEvent, isoDate, isWeekend, lineMiddleware, previewLinePayload, pushToFamily } from "./line";
import { startScheduler } from "./scheduler";
import { syncCronJobOrgSchedule } from "./cronJobOrg";

migrate();
seed();

const app = express();

app.use(cors());
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/line/webhook" && lineMiddleware) return lineMiddleware(req, res, next);
  return express.json()(req, res, next);
});

app.get("/api/state", (_req, res) => {
  res.json(getAdminState(config.defaultFamilyId));
});

app.get("/api/line/destinations", (_req, res) => {
  res.json(
    [
      ...config.lineDestinationIds.map((destinationId) => ({
        type: "env",
        idLength: destinationId.length
      })),
      ...getLineDestinations(config.defaultFamilyId).map((destination) => ({
        type: destination.destinationType,
        idLength: destination.destinationId.length
      }))
    ]
  );
});

app.get("/api/line/destinations/reveal", (req, res) => {
  if (!config.cronSecret || req.query.secret !== config.cronSecret) {
    return res.sendStatus(401);
  }
  res.json(
    getLineDestinations(config.defaultFamilyId).map((destination) => ({
      type: destination.destinationType,
      id: destination.destinationId
    }))
  );
});

app.put("/api/family", (req, res) => {
  saveFamilyName(config.defaultFamilyId, req.body.name);
  res.json(getAdminState(config.defaultFamilyId));
});

app.post("/api/members", (req, res) => {
  upsertMember({ ...req.body, familyId: config.defaultFamilyId });
  res.json(getAdminState(config.defaultFamilyId));
});

app.delete("/api/members/:id", (req, res) => {
  deleteMember(req.params.id);
  res.json(getAdminState(config.defaultFamilyId));
});

app.post("/api/children", (req, res) => {
  upsertChild({ ...req.body, familyId: config.defaultFamilyId });
  res.json(getAdminState(config.defaultFamilyId));
});

app.delete("/api/children/:id", (req, res) => {
  deleteChild(req.params.id);
  res.json(getAdminState(config.defaultFamilyId));
});

app.put("/api/weekly-rules", (req, res) => {
  for (const rule of req.body.rules) {
    upsertWeeklyRule({ ...rule, familyId: config.defaultFamilyId });
  }
  res.json(getAdminState(config.defaultFamilyId));
});

app.put("/api/notification-setting", async (req, res) => {
  updateNotificationSetting(config.defaultFamilyId, req.body.previousDayNotifyTime, req.body.morningNotifyTime);
  try {
    const [previousCron, morningCron] = await Promise.all([
      syncCronJobOrgSchedule("previous", req.body.previousDayNotifyTime),
      syncCronJobOrgSchedule("morning", req.body.morningNotifyTime)
    ]);
    console.log("[cron-job.org sync]", { previousCron, morningCron });
  } catch (error) {
    console.error("[cron-job.org sync failed]", error instanceof Error ? error.message : String(error));
  }
  res.json(getAdminState(config.defaultFamilyId));
});

app.get("/api/assignments/:date", (req, res) => {
  res.json(getAssignmentViews(config.defaultFamilyId, req.params.date));
});

app.get("/api/line/preview/:kind", async (req, res) => {
  const kind = req.params.kind === "morning" ? "morning" : "previous";
  res.json(await previewLinePayload(config.defaultFamilyId, req.query.date ? String(req.query.date) : isoDate(kind === "previous" ? 1 : 0), kind));
});

app.post("/api/line/test/:kind", async (req, res) => {
  const date = req.body.date ?? isoDate(req.params.kind === "previous" ? 1 : 0);
  const message = req.params.kind === "morning"
    ? await buildMorningMessage(config.defaultFamilyId, date)
    : buildPreviousDayMessage(config.defaultFamilyId, date);
  const delivery = await pushToFamily(config.defaultFamilyId, message);
  res.json({ ok: delivery.successCount > 0, date, delivery, message });
});

function requireCronSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.cronSecret) return next();
  if (req.header("x-cron-secret") === config.cronSecret || req.query.secret === config.cronSecret) return next();
  return res.sendStatus(401);
}

app.post("/api/cron/previous-day", requireCronSecret, async (_req, res) => {
  const date = isoDate(1);
  if (isWeekend(date)) {
    return res.json({ ok: true, date, skipped: true, reason: "weekend" });
  }
  const message = buildPreviousDayMessage(config.defaultFamilyId, date);
  const delivery = await pushToFamily(config.defaultFamilyId, message);
  res.json({ ok: delivery.successCount > 0, date, delivery });
});

app.post("/api/cron/morning", requireCronSecret, async (_req, res) => {
  const date = isoDate(0);
  if (isWeekend(date)) {
    return res.json({ ok: true, date, skipped: true, reason: "weekend" });
  }
  const message = await buildMorningMessage(config.defaultFamilyId, date);
  const delivery = await pushToFamily(config.defaultFamilyId, message);
  res.json({ ok: delivery.successCount > 0, date, delivery });
});

app.post("/line/webhook", async (req, res) => {
  const events = req.body.events ?? [];
  try {
    await Promise.all(events.map((event: never) => handleLineEvent(event, config.defaultFamilyId)));
    res.sendStatus(200);
  } catch (error) {
    console.error("[LINE webhook failed]", error instanceof Error ? error.message : String(error));
    res.sendStatus(200);
  }
});

app.get("/line/webhook", (_req, res) => {
  res.status(200).send("LINE webhook endpoint is ready. Configure this URL in LINE Developers; LINE will call it with POST.");
});

startScheduler();

const distPath = resolve("dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(resolve(distPath, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

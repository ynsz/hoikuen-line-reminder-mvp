import cron from "node-cron";
import { config } from "./config";
import { buildMorningMessage, buildPreviousDayMessage, isoDate, pushToFamily } from "./line";
import { getNotificationSetting } from "./repository";

function cronFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

export function startScheduler() {
  const setting = getNotificationSetting(config.defaultFamilyId);

  cron.schedule(
    cronFromTime(setting.previousDayNotifyTime),
    () => pushToFamily(config.defaultFamilyId, buildPreviousDayMessage(config.defaultFamilyId, isoDate(1))),
    { timezone: "Asia/Tokyo" }
  );

  cron.schedule(
    cronFromTime(setting.morningNotifyTime),
    () => pushToFamily(config.defaultFamilyId, buildMorningMessage(config.defaultFamilyId, isoDate(0))),
    { timezone: "Asia/Tokyo" }
  );

  console.log(`Scheduler ready: previous day ${setting.previousDayNotifyTime}, morning ${setting.morningNotifyTime}`);
}

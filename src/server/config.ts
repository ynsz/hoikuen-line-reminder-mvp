import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  defaultFamilyId: process.env.DEFAULT_FAMILY_ID ?? "fam-demo",
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
  lineDestinationIds: (process.env.LINE_DESTINATION_IDS ?? process.env.LINE_DESTINATION_ID ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  cronJobOrgApiKey: process.env.CRON_JOB_ORG_API_KEY ?? "",
  cronJobPreviousId: process.env.CRON_JOB_PREVIOUS_ID ?? "",
  cronJobMorningId: process.env.CRON_JOB_MORNING_ID ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  weatherLatitude: process.env.WEATHER_LATITUDE ?? "",
  weatherLongitude: process.env.WEATHER_LONGITUDE ?? ""
};

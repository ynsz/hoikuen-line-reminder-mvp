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
  cronSecret: process.env.CRON_SECRET ?? ""
};

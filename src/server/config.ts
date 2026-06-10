import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  defaultFamilyId: process.env.DEFAULT_FAMILY_ID ?? "fam-demo",
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? ""
};

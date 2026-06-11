import { config } from "./config";

type CronJobKind = "previous" | "morning";

function parseTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid notification time: ${time}`);
  }
  return { hour, minute };
}

function jobIdFor(kind: CronJobKind) {
  return kind === "previous" ? config.cronJobPreviousId : config.cronJobMorningId;
}

export async function syncCronJobOrgSchedule(kind: CronJobKind, time: string) {
  if (!config.cronJobOrgApiKey) return { skipped: true, reason: "CRON_JOB_ORG_API_KEY is not set" };
  const jobId = jobIdFor(kind);
  if (!jobId) return { skipped: true, reason: `${kind} cron job id is not set` };

  const { hour, minute } = parseTime(time);
  const response = await fetch(`https://api.cron-job.org/jobs/${jobId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.cronJobOrgApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      job: {
        schedule: {
          timezone: "Asia/Tokyo",
          expiresAt: 0,
          hours: [hour],
          mdays: [-1],
          minutes: [minute],
          months: [-1],
          wdays: [-1]
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`cron-job.org ${kind} sync failed: ${response.status} ${await response.text()}`);
  }

  return { skipped: false, jobId, time };
}

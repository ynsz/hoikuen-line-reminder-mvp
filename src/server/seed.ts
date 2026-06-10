import { config } from "./config";
import { db, id, migrate } from "./db";
import { pathToFileURL } from "node:url";

export function seed() {
  migrate();
  const familyId = config.defaultFamilyId;
  db.prepare("INSERT OR IGNORE INTO families (id, name) VALUES (?, ?)").run(familyId, "サンプル家族");

  const members = [
    ["mem_father", "パパ", "father"],
    ["mem_mother", "ママ", "mother"]
  ];
  for (const [memberId, name, role] of members) {
    db.prepare("INSERT OR IGNORE INTO members (id, family_id, name, role) VALUES (?, ?, ?, ?)").run(memberId, familyId, name, role);
  }

  const children = [
    ["child_older", "兄", 1, "幼児園"],
    ["child_younger", "妹", 2, "保育園"]
  ];
  for (const [childId, name, displayOrder, nurseryName] of children) {
    db.prepare("INSERT OR IGNORE INTO children (id, family_id, name, display_order, nursery_name) VALUES (?, ?, ?, ?, ?)").run(
      childId,
      familyId,
      name,
      displayOrder,
      nurseryName
    );
  }

  for (let day = 0; day <= 6; day += 1) {
    db.prepare(`
      INSERT OR IGNORE INTO weekly_rules (id, family_id, child_id, day_of_week, dropoff_member_id, pickup_member_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id("rule"), familyId, "child_older", day, "mem_mother", "mem_mother");
    db.prepare(`
      INSERT OR IGNORE INTO weekly_rules (id, family_id, child_id, day_of_week, dropoff_member_id, pickup_member_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id("rule"), familyId, "child_younger", day, "mem_father", "mem_father");
  }

  db.prepare(`
    INSERT OR IGNORE INTO notification_settings (id, family_id, previous_day_notify_time, morning_notify_time)
    VALUES (?, ?, '12:00', '06:00')
  `).run("notify_demo", familyId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
  console.log("Seed data is ready.");
}

import { db, id } from "./db";
import type {
  AdminState,
  AssignmentStatus,
  AssignmentView,
  Child,
  DailyAssignment,
  Family,
  LineDestination,
  LineUser,
  Member,
  NotificationSetting,
  WeeklyRule
} from "../shared/types";

type Row = Record<string, unknown>;

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

const childRow = (row: Row): Child => ({
  id: String(row.id),
  familyId: String(row.family_id),
  name: String(row.name),
  displayOrder: Number(row.display_order),
  nurseryName: row.nursery_name ? String(row.nursery_name) : null,
  birthDate: row.birth_date ? String(row.birth_date) : null,
  gender: row.gender ? childGender(String(row.gender)) : null,
  emoji: row.emoji ? String(row.emoji) : null
});

function childGender(value: string): Child["gender"] {
  return value === "male" || value === "female" || value === "other" ? value : null;
}

const memberRow = (row: Row): Member => ({
  id: String(row.id),
  familyId: String(row.family_id),
  name: String(row.name),
  role: row.role as Member["role"]
});

const weeklyRuleRow = (row: Row): WeeklyRule => ({
  id: String(row.id),
  familyId: String(row.family_id),
  childId: String(row.child_id),
  dayOfWeek: Number(row.day_of_week),
  dropoffMemberId: row.dropoff_member_id ? String(row.dropoff_member_id) : null,
  pickupMemberId: row.pickup_member_id ? String(row.pickup_member_id) : null
});

const dailyAssignmentRow = (row: Row): DailyAssignment => ({
  id: String(row.id),
  familyId: String(row.family_id),
  childId: String(row.child_id),
  date: String(row.date),
  dropoffMemberId: row.dropoff_member_id ? String(row.dropoff_member_id) : null,
  pickupMemberId: row.pickup_member_id ? String(row.pickup_member_id) : null,
  status: row.status as AssignmentStatus
});

export function getFamily(familyId: string): Family {
  return db.prepare("SELECT id, name FROM families WHERE id = ?").get(familyId) as Family;
}

export function getMembers(familyId: string): Member[] {
  return (
    db
      .prepare("SELECT * FROM members WHERE family_id = ? ORDER BY CASE role WHEN 'father' THEN 1 WHEN 'mother' THEN 2 WHEN 'grandmother' THEN 3 WHEN 'grandfather' THEN 4 ELSE 5 END, name")
      .all(familyId) as Row[]
  ).map(memberRow);
}

export function getChildren(familyId: string): Child[] {
  return (db.prepare("SELECT * FROM children WHERE family_id = ? ORDER BY display_order, name").all(familyId) as Row[]).map(childRow);
}

export function getWeeklyRules(familyId: string): WeeklyRule[] {
  return (db.prepare("SELECT * FROM weekly_rules WHERE family_id = ? ORDER BY day_of_week").all(familyId) as Row[]).map(weeklyRuleRow);
}

export function getNotificationSetting(familyId: string): NotificationSetting {
  return db.prepare("SELECT id, family_id as familyId, previous_day_notify_time as previousDayNotifyTime, morning_notify_time as morningNotifyTime FROM notification_settings WHERE family_id = ?").get(familyId) as NotificationSetting;
}

export function getAdminState(familyId: string): AdminState {
  return {
    family: getFamily(familyId),
    members: getMembers(familyId),
    children: getChildren(familyId),
    weeklyRules: getWeeklyRules(familyId),
    notificationSetting: getNotificationSetting(familyId)
  };
}

export function saveFamilyName(familyId: string, name: string) {
  db.prepare("UPDATE families SET name = ? WHERE id = ?").run(name, familyId);
}

export function upsertMember(member: Partial<Member> & Pick<Member, "familyId" | "name" | "role">): Member {
  const memberId = member.id ?? id("mem");
  db.prepare(`
    INSERT INTO members (id, family_id, name, role)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role
  `).run(memberId, member.familyId, member.name, member.role);
  return db.prepare("SELECT * FROM members WHERE id = ?").get(memberId) as Member;
}

export function deleteMember(memberId: string) {
  db.prepare("DELETE FROM members WHERE id = ?").run(memberId);
}

export function upsertChild(child: Partial<Child> & Pick<Child, "familyId" | "name" | "displayOrder">): Child {
  const childId = child.id ?? id("child");
  db.prepare(`
    INSERT INTO children (id, family_id, name, display_order, nursery_name, birth_date, gender, emoji)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      display_order = excluded.display_order,
      nursery_name = excluded.nursery_name,
      birth_date = excluded.birth_date,
      gender = excluded.gender,
      emoji = excluded.emoji
  `).run(
    childId,
    child.familyId,
    child.name,
    child.displayOrder,
    child.nurseryName ?? null,
    child.birthDate ?? null,
    child.gender ?? null,
    child.emoji ?? null
  );
  return childRow(db.prepare("SELECT * FROM children WHERE id = ?").get(childId) as Row);
}

export function deleteChild(childId: string) {
  db.prepare("DELETE FROM children WHERE id = ?").run(childId);
}

export function upsertWeeklyRule(rule: Omit<WeeklyRule, "id"> & { id?: string }) {
  db.prepare(`
    INSERT INTO weekly_rules (id, family_id, child_id, day_of_week, dropoff_member_id, pickup_member_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(family_id, child_id, day_of_week)
    DO UPDATE SET dropoff_member_id = excluded.dropoff_member_id, pickup_member_id = excluded.pickup_member_id
  `).run(rule.id ?? id("rule"), rule.familyId, rule.childId, rule.dayOfWeek, rule.dropoffMemberId, rule.pickupMemberId);
}

export function updateNotificationSetting(familyId: string, previousDayNotifyTime: string, morningNotifyTime: string) {
  db.prepare(`
    UPDATE notification_settings
    SET previous_day_notify_time = ?, morning_notify_time = ?
    WHERE family_id = ?
  `).run(previousDayNotifyTime, morningNotifyTime, familyId);
}

export function getLineUsers(familyId: string): LineUser[] {
  return db.prepare("SELECT id, family_id as familyId, line_user_id as lineUserId, display_name as displayName FROM line_users WHERE family_id = ?").all(familyId) as LineUser[];
}

export function upsertLineUser(familyId: string, lineUserId: string, displayName: string | null) {
  db.prepare(`
    INSERT INTO line_users (id, family_id, line_user_id, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(line_user_id) DO UPDATE SET family_id = excluded.family_id, display_name = COALESCE(excluded.display_name, line_users.display_name)
  `).run(id("line"), familyId, lineUserId, displayName);
}

export function getLineDestinations(familyId: string): LineDestination[] {
  return db
    .prepare("SELECT id, family_id as familyId, destination_type as destinationType, destination_id as destinationId, display_name as displayName FROM line_destinations WHERE family_id = ?")
    .all(familyId) as LineDestination[];
}

export function upsertLineDestination(
  familyId: string,
  destinationType: LineDestination["destinationType"],
  destinationId: string,
  displayName: string | null
) {
  db.prepare(`
    INSERT INTO line_destinations (id, family_id, destination_type, destination_id, display_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(destination_id) DO UPDATE SET
      family_id = excluded.family_id,
      destination_type = excluded.destination_type,
      display_name = COALESCE(excluded.display_name, line_destinations.display_name)
  `).run(id("dest"), familyId, destinationType, destinationId, displayName);
}

export function getAssignmentViews(familyId: string, date: string): AssignmentView[] {
  const targetDayOfWeek = dayOfWeek(date);
  const members = new Map(getMembers(familyId).map((member) => [member.id, member]));
  const children = getChildren(familyId);
  const daily = new Map(
    db.prepare("SELECT * FROM daily_assignments WHERE family_id = ? AND date = ?").all(familyId, date).map((row) => {
      const assignment = dailyAssignmentRow(row as Row);
      return [assignment.childId, assignment] as const;
    })
  );
  const rules = new Map(getWeeklyRules(familyId).filter((rule) => rule.dayOfWeek === targetDayOfWeek).map((rule) => [rule.childId, rule]));

  return children.map((child) => {
    const assignment = daily.get(child.id);
    const rule = rules.get(child.id);
    const status = assignment?.status ?? "scheduled";
    return {
      child,
      dropoffMember: members.get(assignment?.dropoffMemberId ?? rule?.dropoffMemberId ?? "") ?? null,
      pickupMember: members.get(assignment?.pickupMemberId ?? rule?.pickupMemberId ?? "") ?? null,
      status
    };
  });
}

export function setDailyAssignment(input: {
  familyId: string;
  childId: string;
  date: string;
  dropoffMemberId: string | null;
  pickupMemberId: string | null;
  status: AssignmentStatus;
}) {
  db.prepare(`
    INSERT INTO daily_assignments (id, family_id, child_id, date, dropoff_member_id, pickup_member_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(family_id, child_id, date)
    DO UPDATE SET dropoff_member_id = excluded.dropoff_member_id, pickup_member_id = excluded.pickup_member_id, status = excluded.status
  `).run(id("day"), input.familyId, input.childId, input.date, input.dropoffMemberId, input.pickupMemberId, input.status);
}

export function getMonthlyTransportCounts(familyId: string, date: string) {
  const members = getMembers(familyId);
  const children = getChildren(familyId);
  const [year, month] = date.split("-").map(Number);
  const targetDay = Number(date.split("-")[2]);
  const result = new Map<string, Map<string, number>>();

  for (const child of children) {
    result.set(child.id, new Map(members.map((member) => [member.id, 0])));
  }

  for (let day = 1; day <= targetDay; day += 1) {
    const current = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const currentDayOfWeek = dayOfWeek(current);
    if (currentDayOfWeek === 0 || currentDayOfWeek === 6) continue;

    const assignments = getAssignmentViews(familyId, current);
    for (const assignment of assignments) {
      if (assignment.status !== "scheduled") continue;
      const counts = result.get(assignment.child.id);
      if (!counts) continue;
      if (assignment.dropoffMember) {
        counts.set(assignment.dropoffMember.id, (counts.get(assignment.dropoffMember.id) ?? 0) + 1);
      }
      if (assignment.pickupMember) {
        counts.set(assignment.pickupMember.id, (counts.get(assignment.pickupMember.id) ?? 0) + 1);
      }
    }
  }

  return result;
}

export type Role = "father" | "mother" | "grandfather" | "grandmother" | "other";
export type AssignmentStatus = "scheduled" | "no_transport" | "absent";

export type Family = {
  id: string;
  name: string;
};

export type Member = {
  id: string;
  familyId: string;
  name: string;
  role: Role;
};

export type Child = {
  id: string;
  familyId: string;
  name: string;
  displayOrder: number;
  nurseryName?: string | null;
};

export type WeeklyRule = {
  id: string;
  familyId: string;
  childId: string;
  dayOfWeek: number;
  dropoffMemberId: string | null;
  pickupMemberId: string | null;
};

export type DailyAssignment = {
  id: string;
  familyId: string;
  childId: string;
  date: string;
  dropoffMemberId: string | null;
  pickupMemberId: string | null;
  status: AssignmentStatus;
};

export type NotificationSetting = {
  id: string;
  familyId: string;
  previousDayNotifyTime: string;
  morningNotifyTime: string;
};

export type LineUser = {
  id: string;
  familyId: string;
  lineUserId: string;
  displayName: string | null;
};

export type LineDestination = {
  id: string;
  familyId: string;
  destinationType: "user" | "group" | "room";
  destinationId: string;
  displayName: string | null;
};

export type AssignmentView = {
  child: Child;
  dropoffMember: Member | null;
  pickupMember: Member | null;
  status: AssignmentStatus;
};

export type AdminState = {
  family: Family;
  members: Member[];
  children: Child[];
  weeklyRules: WeeklyRule[];
  notificationSetting: NotificationSetting;
};

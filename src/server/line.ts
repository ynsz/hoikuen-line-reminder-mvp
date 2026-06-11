import { Client, middleware, type Message, type WebhookEvent } from "@line/bot-sdk";
import { config } from "./config";
import {
  getAssignmentViews,
  getChildren,
  getLineDestinations,
  getLineUsers,
  getMembers,
  getMonthlyTransportCounts,
  setDailyAssignment,
  upsertLineDestination,
  upsertLineUser
} from "./repository";
import type { AssignmentStatus, AssignmentView, Child, Member } from "../shared/types";

const client = config.lineChannelAccessToken && config.lineChannelSecret
  ? new Client({
      channelAccessToken: config.lineChannelAccessToken,
      channelSecret: config.lineChannelSecret
    })
  : null;

export const lineMiddleware = config.lineChannelAccessToken && config.lineChannelSecret
  ? middleware({
      channelAccessToken: config.lineChannelAccessToken,
      channelSecret: config.lineChannelSecret
    })
  : undefined;

const jaWeekdays = ["日", "月", "火", "水", "木", "金", "土"];
const childButtonColors = ["#DDEBFF", "#FFE3E3", "#EFE5FF", "#FFF0D6", "#DFF4EA"];
const childTextColors = ["#2F5F9F", "#9A4A4A", "#6E5597", "#88622F", "#3F7258"];

function dateFromIsoDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const jstDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays));
  return `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(jstDate.getUTCDate()).padStart(2, "0")}`;
}

export function formatDateLabel(date: string) {
  const d = dateFromIsoDay(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${jaWeekdays[d.getUTCDay()]})`;
}

export function isWeekend(date: string) {
  const day = dateFromIsoDay(date).getUTCDay();
  return day === 0 || day === 6;
}

function isLastWeekdayOfMonth(date: string) {
  const current = dateFromIsoDay(date);
  const probe = new Date(current);
  probe.setUTCDate(probe.getUTCDate() + 1);
  while (probe.getUTCMonth() === current.getUTCMonth()) {
    const day = probe.getUTCDay();
    if (day !== 0 && day !== 6) return false;
    probe.setUTCDate(probe.getUTCDate() + 1);
  }
  return true;
}

function daysSinceBirth(child: Child, date: string) {
  if (!child.birthDate) return null;
  const birth = dateFromIsoDay(child.birthDate).getTime();
  const target = dateFromIsoDay(date).getTime();
  if (!Number.isFinite(birth) || target < birth) return null;
  return Math.floor((target - birth) / 86_400_000);
}

function childSuffix(child: Child) {
  return child.gender === "male" ? "くん" : "ちゃん";
}

function memberName(member: Member | null) {
  return member?.name ?? "";
}

function monthlyCountLine(counts: Map<string, number> | undefined, members: Member[]) {
  if (!counts) return "";
  const parts = members
    .filter((member) => member.role === "father" || member.role === "mother")
    .map((member) => `${member.name}${counts.get(member.id) ?? 0}回`);
  return parts.length ? `今月の送迎\n${parts.join(" / ")}` : "";
}

function monthlyFamilySummary(counts: Map<string, Map<string, number>>, members: Member[], date: string) {
  if (!isLastWeekdayOfMonth(date)) return "";
  const parentIds = new Set(members.filter((member) => member.role === "father" || member.role === "mother").map((member) => member.id));
  let total = 0;
  for (const childCounts of counts.values()) {
    for (const [memberId, count] of childCounts.entries()) {
      if (parentIds.has(memberId)) total += count;
    }
  }
  return total > 0 ? `\n\n今月は夫婦で${total}回の送迎をこなしました👏` : "";
}

function assignmentLines(familyId: string, date: string, views: AssignmentView[]) {
  const members = getMembers(familyId);
  const counts = getMonthlyTransportCounts(familyId, date);
  return views
    .map((view) => {
      const age = daysSinceBirth(view.child, date);
      const childTitle = `${view.child.emoji || "👶"} ${view.child.name}${childSuffix(view.child)}${age === null ? "" : ` 生後${age}日`}`;
      const countLine = monthlyCountLine(counts.get(view.child.id), members);
      if (view.status === "absent") {
        return `${childTitle}\nこの日は休み${countLine ? `\n\n${countLine}` : ""}`;
      }
      if (view.status === "no_transport") {
        return `${childTitle}\nこの日は送迎なし${countLine ? `\n\n${countLine}` : ""}`;
      }
      return `${childTitle}\n送り：${memberName(view.dropoffMember)}\n迎え：${memberName(view.pickupMember)}${countLine ? `\n\n${countLine}` : ""}`;
    })
    .join("\n\n") + monthlyFamilySummary(counts, members, date);
}

type ButtonSpec = {
  label: string;
  data: string;
  color?: string;
  textColor?: string;
  style?: "primary" | "secondary";
};

function postbackAction(label: string, data: string) {
  return {
    type: "postback",
    label,
    data,
    displayText: label
  };
}

function flexButton({ label, data, color = "#E7F4EC", textColor = "#2F7D57", style = "primary" }: ButtonSpec) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: color,
    cornerRadius: "xxl",
    paddingAll: "10px",
    action: postbackAction(label, data),
    contents: [
      {
        type: "text",
        text: label,
        align: "center",
        weight: "bold",
        size: "md",
        color: textColor,
        adjustMode: "shrink-to-fit"
      }
    ]
  };
}

function flexMessage(title: string, body: string, buttons: ButtonSpec[]): Message {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "lg",
            color: "#202124",
            wrap: true
          },
          {
            type: "text",
            text: body,
            size: "sm",
            color: "#3F4441",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: buttons.map(flexButton)
      }
    }
  } as Message;
}

function textMessage(text: string): Message {
  return { type: "text", text };
}

export function buildPreviousDayMessage(familyId: string, date: string): Message {
  const views = getAssignmentViews(familyId, date);
  return flexMessage(
    "明日の送迎予定です",
    `${formatDateLabel(date)}\n\n${assignmentLines(familyId, date, views)}\n\n変更がある場合のみ押してください。`,
    [{ label: "変更する", data: `action=start&date=${date}`, color: "#E7F4EC", textColor: "#2F7D57", style: "secondary" }]
  );
}

export function buildMorningMessage(familyId: string, date: string): Message {
  const views = getAssignmentViews(familyId, date);
  return textMessage(`今日の送迎担当です。\n\n${formatDateLabel(date)}\n\n${assignmentLines(familyId, date, views)}`);
}

function selectChildrenMessage(familyId: string, date: string): Message {
  const children = getChildren(familyId);
  return flexMessage(
    "誰の予定を変更しますか？",
    "変更する子どもを選んでください。",
    children.map((child, index) => ({
      label: child.name,
      data: `action=target&date=${date}&childIds=${child.id}`,
      color: childButtonColors[index % childButtonColors.length],
      textColor: childTextColors[index % childTextColors.length]
    }))
  );
}

function selectChangeTypeMessage(date: string, childIds: string): Message {
  return flexMessage("何を変更しますか？", "変更内容を選んでください。", [
    { label: "送り", data: `action=changeType&date=${date}&childIds=${childIds}&type=dropoff`, color: "#E7F4EC", textColor: "#2F7D57" },
    { label: "迎え", data: `action=changeType&date=${date}&childIds=${childIds}&type=pickup`, color: "#E4F3F2", textColor: "#407B78" },
    { label: "両方", data: `action=changeType&date=${date}&childIds=${childIds}&type=both`, color: "#E8EEF8", textColor: "#486585" },
    { label: "送迎なし", data: `action=applyStatus&date=${date}&childIds=${childIds}&status=no_transport`, color: "#EEEEEE", textColor: "#626262" },
    { label: "休み", data: `action=applyStatus&date=${date}&childIds=${childIds}&status=absent`, color: "#FFF0D6", textColor: "#88622F" }
  ]);
}

function selectMemberMessage(familyId: string, date: string, childIds: string, type: string): Message {
  return flexMessage(
    "担当者を選びます",
    "担当する人を選んでください。",
    getMembers(familyId).map((member) => ({
      label: member.name,
      data: `action=member&date=${date}&childIds=${childIds}&type=${type}&memberId=${member.id}`,
      color: member.role === "father" ? "#DDEBFF" : member.role === "mother" ? "#FFE3E3" : "#E7F4EC",
      textColor: member.role === "father" ? "#2F5F9F" : member.role === "mother" ? "#9A4A4A" : "#2F7D57"
    }))
  );
}

function applyChange(input: {
  familyId: string;
  date: string;
  childIds: string[];
  type: "dropoff" | "pickup" | "both";
  memberId: string | null;
  status: AssignmentStatus;
}) {
  const current = new Map(getAssignmentViews(input.familyId, input.date).map((view) => [view.child.id, view]));

  for (const childId of input.childIds) {
    const view = current.get(childId);
    const existingDropoff = view?.dropoffMember?.id ?? null;
    const existingPickup = view?.pickupMember?.id ?? null;
    setDailyAssignment({
      familyId: input.familyId,
      childId,
      date: input.date,
      status: input.status,
      dropoffMemberId: input.type === "pickup" ? existingDropoff : input.memberId,
      pickupMemberId: input.type === "dropoff" ? existingPickup : input.memberId
    });
  }
}

function applyStatus(familyId: string, date: string, childIds: string[], status: AssignmentStatus) {
  for (const childId of childIds) {
    setDailyAssignment({
      familyId,
      childId,
      date,
      status,
      dropoffMemberId: null,
      pickupMemberId: null
    });
  }
}

function updatedMessage(familyId: string, date: string): Message {
  const children = getChildren(familyId);
  return flexMessage(
    `${formatDateLabel(date)}の送迎予定を更新しました`,
    `${assignmentLines(familyId, date, getAssignmentViews(familyId, date))}\n\n他にも変更しますか？`,
    [
      ...children.map((child, index) => ({
        label: `${child.name}を変更`,
        data: `action=target&date=${date}&childIds=${child.id}`,
        color: childButtonColors[index % childButtonColors.length],
        textColor: childTextColors[index % childTextColors.length]
      })),
      { label: "これで確定", data: `action=confirm&date=${date}`, color: "#E7F4EC", textColor: "#2F7D57", style: "secondary" as const }
    ]
  );
}

function confirmedMessage(familyId: string, date: string): Message {
  return textMessage(`${formatDateLabel(date)}の送迎予定を確定しました。\n\n${assignmentLines(familyId, date, getAssignmentViews(familyId, date))}`);
}

function parseData(data: string) {
  return Object.fromEntries(new URLSearchParams(data)) as Record<string, string>;
}

export async function handleLineEvent(event: WebhookEvent, familyId: string) {
  console.log("[LINE event]", event.type, event.source.type);
  if (event.source.type === "user" && event.source.userId) {
    upsertLineUser(familyId, event.source.userId, null);
    upsertLineDestination(familyId, "user", event.source.userId, null);
  }
  if (event.source.type === "group" && event.source.groupId) {
    upsertLineDestination(familyId, "group", event.source.groupId, null);
  }
  if (event.source.type === "room" && event.source.roomId) {
    upsertLineDestination(familyId, "room", event.source.roomId, null);
  }

  if (event.type !== "postback") return;

  const data = parseData(event.postback.data);
  console.log("[LINE postback]", data.action ?? "unknown");
  let message: Message;

  if (data.action === "start") {
    message = selectChildrenMessage(familyId, data.date);
  } else if (data.action === "target") {
    message = selectChangeTypeMessage(data.date, data.childIds);
  } else if (data.action === "changeType") {
    message = selectMemberMessage(familyId, data.date, data.childIds, data.type);
  } else if (data.action === "applyStatus") {
    applyStatus(familyId, data.date, data.childIds.split(","), data.status as AssignmentStatus);
    message = updatedMessage(familyId, data.date);
  } else if (data.action === "member") {
    applyChange({
      familyId,
      date: data.date,
      childIds: data.childIds.split(","),
      type: data.type as "dropoff" | "pickup" | "both",
      memberId: data.memberId,
      status: "scheduled"
    });
    message = updatedMessage(familyId, data.date);
  } else if (data.action === "confirm") {
    message = confirmedMessage(familyId, data.date);
  } else {
    message = textMessage("操作を確認できませんでした。前日の通知からもう一度操作してください。");
  }

  if (client && event.replyToken) {
    try {
      await client.replyMessage(event.replyToken, message);
    } catch (error) {
      console.error("[LINE reply failed]", error instanceof Error ? error.message : String(error));
      await pushToFamily(familyId, message);
    }
  }
}

export async function pushToFamily(familyId: string, message: Message) {
  if (!client) {
    console.log("[LINE disabled]", JSON.stringify(message, null, 2));
    return { destinationCount: 0, successCount: 0, failureCount: 0, disabled: true };
  }
  const destinations = getLineDestinations(familyId);
  const legacyUsers = getLineUsers(familyId).map((user) => user.lineUserId);
  const destinationIds = [...new Set([...config.lineDestinationIds, ...destinations.map((item) => item.destinationId), ...legacyUsers])];
  let successCount = 0;
  let failureCount = 0;
  await Promise.all(
    destinationIds.map(async (destinationId) => {
      try {
        await client.pushMessage(destinationId, message);
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        console.error("[LINE push failed]", error instanceof Error ? error.message : String(error));
      }
    })
  );
  return { destinationCount: destinationIds.length, successCount, failureCount, disabled: false };
}

export function previewLinePayload(familyId: string, date: string, kind: "previous" | "morning") {
  return kind === "previous" ? buildPreviousDayMessage(familyId, date) : buildMorningMessage(familyId, date);
}

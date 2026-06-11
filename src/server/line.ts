import { Client, middleware, type Message, type QuickReplyItem, type WebhookEvent } from "@line/bot-sdk";
import { config } from "./config";
import {
  getAssignmentViews,
  getChildren,
  getLineDestinations,
  getLineUsers,
  getMembers,
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

export function isoDate(offsetDays = 0) {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  jst.setDate(jst.getDate() + offsetDays);
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(jst.getDate()).padStart(2, "0")}`;
}

export function formatDateLabel(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${jaWeekdays[d.getDay()]})`;
}

function memberName(member: Member | null) {
  return member?.name ?? "";
}

function assignmentLines(views: AssignmentView[]) {
  return views
    .map((view) => {
      if (view.status === "absent") {
        return `【${view.child.name}】\nこの日は休み`;
      }
      if (view.status === "no_transport") {
        return `【${view.child.name}】\nこの日は送迎なし`;
      }
      return `【${view.child.name}】\n送り：${memberName(view.dropoffMember)}\n迎え：${memberName(view.pickupMember)}`;
    })
    .join("\n\n");
}

function postback(label: string, data: string): QuickReplyItem {
  return {
    type: "action",
    action: {
      type: "postback",
      label,
      data,
      displayText: label
    }
  };
}

function textMessage(text: string, items?: QuickReplyItem[]): Message {
  return items?.length
    ? { type: "text", text, quickReply: { items } }
    : { type: "text", text };
}

export function buildPreviousDayMessage(familyId: string, date: string): Message {
  const views = getAssignmentViews(familyId, date);
  return textMessage(
    `明日の送迎予定です。\n\n${formatDateLabel(date)}\n\n${assignmentLines(views)}\n\n変更がある場合のみ押してください。`,
    [postback("変更する", `action=start&date=${date}`)]
  );
}

export function buildMorningMessage(familyId: string, date: string): Message {
  const views = getAssignmentViews(familyId, date);
  return textMessage(`今日の送迎担当です。\n\n${formatDateLabel(date)}\n\n${assignmentLines(views)}`);
}

function selectChildrenMessage(familyId: string, date: string): Message {
  const children = getChildren(familyId);
  const items = children.map((child) => postback(child.name, `action=target&date=${date}&childIds=${child.id}`));
  return textMessage("誰の予定を変更しますか？", items);
}

function selectChangeTypeMessage(date: string, childIds: string): Message {
  return textMessage("何を変更しますか？", [
    postback("送り", `action=changeType&date=${date}&childIds=${childIds}&type=dropoff`),
    postback("迎え", `action=changeType&date=${date}&childIds=${childIds}&type=pickup`),
    postback("両方", `action=changeType&date=${date}&childIds=${childIds}&type=both`),
    postback("送迎なし", `action=applyStatus&date=${date}&childIds=${childIds}&status=no_transport`),
    postback("休み", `action=applyStatus&date=${date}&childIds=${childIds}&status=absent`)
  ]);
}

function selectMemberMessage(familyId: string, date: string, childIds: string, type: string): Message {
  const items = getMembers(familyId).map((member) => postback(member.name, `action=member&date=${date}&childIds=${childIds}&type=${type}&memberId=${member.id}`));
  return textMessage("担当者を選びます", items);
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
  return textMessage(
    `${formatDateLabel(date)}の送迎予定を更新しました。\n\n${assignmentLines(getAssignmentViews(familyId, date))}\n\n他にも変更しますか？`,
    [
      ...children.map((child) => postback(`${child.name}を変更`, `action=target&date=${date}&childIds=${child.id}`)),
      postback("これで確定", `action=confirm&date=${date}`)
    ]
  );
}

function confirmedMessage(familyId: string, date: string): Message {
  return textMessage(`${formatDateLabel(date)}の送迎予定を確定しました。\n\n${assignmentLines(getAssignmentViews(familyId, date))}`);
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

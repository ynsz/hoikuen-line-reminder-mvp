import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, CalendarDays, Clock, Plus, Save, Send, Trash2, UsersRound } from "lucide-react";
import type { AdminState, Child, Member, Role, WeeklyRule } from "../shared/types";
import "./styles.css";

const days = [
  { label: "月", value: 1 },
  { label: "火", value: 2 },
  { label: "水", value: 3 },
  { label: "木", value: 4 },
  { label: "金", value: 5 }
];
const roleLabels: Record<Role, string> = {
  father: "パパ",
  mother: "ママ",
  grandfather: "祖父",
  grandmother: "祖母",
  other: "その他"
};
const genderLabels = {
  male: "男の子",
  female: "女の子",
  other: "その他"
} as const;
const childColors = ["#DDEBFF", "#FFE3E3", "#EFE5FF", "#FFF0D6", "#DFF4EA"];
const childTextColors = ["#2F5F9F", "#9A4A4A", "#6E5597", "#88622F", "#3F7258"];

function childColor(index: number) {
  return childColors[index % childColors.length];
}

function memberColor(member: Member) {
  if (member.role === "father") return "#DDEBFF";
  if (member.role === "mother") return "#FFE3E3";
  return "#E7F4EC";
}

function memberTextColor(member: Member) {
  if (member.role === "father") return "#2F5F9F";
  if (member.role === "mother") return "#9A4A4A";
  return "#2F7D57";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useAdminState() {
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    api<AdminState>("/api/state")
      .then(setState)
      .catch((err) => setError(err.message));

  useEffect(() => {
    refresh();
  }, []);

  return { state, setState, error, refresh };
}

function memberName(members: Member[], id: string | null) {
  return members.find((member) => member.id === id)?.name ?? "";
}

function App() {
  const { state, setState, error } = useAdminState();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const saveRules = async (rules: WeeklyRule[]) => {
    setSaving(true);
    const next = await api<AdminState>("/api/weekly-rules", {
      method: "PUT",
      body: JSON.stringify({ rules })
    });
    setState(next);
    setSaving(false);
    setToast("保存しました");
  };

  const runTest = async (kind: "previous" | "morning") => {
    const result = await api<{ message: unknown }>(`/api/line/test/${kind}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    setToast(kind === "previous" ? "前日確認を送信しました" : "当日朝通知を送信しました");
    console.log(result.message);
  };

  if (error) return <div className="center">APIに接続できません: {error}</div>;
  if (!state) return <div className="center">読み込み中...</div>;

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-ink">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-leaf">LINE送迎秘書 MVP</p>
            <h1 className="text-2xl font-semibold tracking-normal">{state.family.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn line" onClick={() => runTest("previous")}>
              <Send size={18} /> 前日確認
            </button>
            <button className="btn secondary" onClick={() => runTest("morning")}>
              <Bell size={18} /> 朝通知
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <FamilyPanel state={state} setState={setState} />
          <NotificationPanel state={state} setState={setState} onSaved={() => setToast("通知時間を変更しました")} />
          <MembersPanel state={state} setState={setState} />
          <ChildrenPanel state={state} setState={setState} />
        </aside>

        <section className="space-y-5">
          <div className="toolbar">
            <div>
              <h2 className="section-title"><CalendarDays size={20} /> 曜日ごとの固定パターン</h2>
              <p className="text-sm text-black/60">変更がない日はこの表の担当でLINE通知されます。</p>
            </div>
            <button className="btn primary" disabled={saving} onClick={() => saveRules(state.weeklyRules)}>
              <Save size={18} /> {saving ? "保存中" : "保存"}
            </button>
          </div>
          <WeeklyRulesTable state={state} setState={setState} />
          <PreviewPanel state={state} />
        </section>
      </div>
      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
    </main>
  );
}

function FamilyPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const [name, setName] = useState(state.family.name);
  const save = async () => {
    setState(await api<AdminState>("/api/family", { method: "PUT", body: JSON.stringify({ name }) }));
  };
  return (
    <section className="panel">
      <h2 className="section-title"><UsersRound size={20} /> 家族</h2>
      <label className="field">
        <span>表示名</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="btn primary w-full" onClick={save}><Save size={18} /> 保存</button>
    </section>
  );
}

function NotificationPanel({ state, setState, onSaved }: { state: AdminState; setState: (state: AdminState) => void; onSaved: () => void }) {
  const [previous, setPrevious] = useState(state.notificationSetting.previousDayNotifyTime);
  const [morning, setMorning] = useState(state.notificationSetting.morningNotifyTime);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setState(await api<AdminState>("/api/notification-setting", {
      method: "PUT",
      body: JSON.stringify({ previousDayNotifyTime: previous, morningNotifyTime: morning })
    }));
    setSaving(false);
    onSaved();
  };
  return (
    <section className="panel">
      <h2 className="section-title"><Clock size={20} /> 通知設定</h2>
      <label className="field">
        <span>前日確認</span>
        <input type="time" value={previous} onChange={(event) => setPrevious(event.target.value)} />
      </label>
      <label className="field">
        <span>当日通知</span>
        <input type="time" value={morning} onChange={(event) => setMorning(event.target.value)} />
      </label>
      <button className="btn primary w-full" disabled={saving} onClick={save}><Save size={18} /> {saving ? "保存中" : "保存"}</button>
    </section>
  );
}

function MembersPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const editableMembers = state.members.filter((member) => member.role === "father" || member.role === "mother");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftFor = (member: Member) => drafts[member.id] ?? member.name;
  const save = async (member: Member) => {
    const name = draftFor(member).trim();
    if (!name) return;
    setState(await api<AdminState>("/api/members", {
      method: "POST",
      body: JSON.stringify({ id: member.id, name, role: member.role })
    }));
  };
  return (
    <section className="panel">
      <h2 className="section-title"><UsersRound size={20} /> 担当者</h2>
      <div className="stack">
        {editableMembers.map((member) => {
          const draft = draftFor(member);
          const changed = draft !== member.name;
          const color = memberColor(member);
          const textColor = memberTextColor(member);
          return (
            <div className="edit-row color-row" key={member.id} style={{ "--accent": color, "--accent-text": textColor } as React.CSSProperties}>
              <label className="field">
                <span className="color-label"><i />{roleLabels[member.role]}</span>
                <input value={draft} onChange={(event) => setDrafts({ ...drafts, [member.id]: event.target.value })} />
              </label>
              <div className="edit-actions">
                <button className="icon-btn" title="保存" disabled={!changed} onClick={() => save(member)}><Save size={17} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChildrenPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const blank = { name: "", birthDate: "", gender: "other", emoji: "👶" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Record<string, { name: string; birthDate: string; gender: string; emoji: string }>>({});
  const save = async () => {
    if (!form.name.trim()) return;
    setState(await api<AdminState>("/api/children", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        nurseryName: "",
        displayOrder: state.children.length + 1,
        birthDate: form.birthDate || null,
        gender: form.gender,
        emoji: form.emoji || "👶"
      })
    }));
    setForm(blank);
  };
  const update = async (child: Child) => {
    const values = editing[child.id];
    if (!values?.name.trim()) return;
    setState(await api<AdminState>("/api/children", {
      method: "POST",
      body: JSON.stringify({
        id: child.id,
        name: values.name,
        nurseryName: child.nurseryName ?? "",
        displayOrder: child.displayOrder,
        birthDate: values.birthDate || null,
        gender: values.gender,
        emoji: values.emoji || "👶"
      })
    }));
  };
  const remove = async (id: string) => setState(await api<AdminState>(`/api/children/${id}`, { method: "DELETE" }));
  const draftFor = (child: Child) => editing[child.id] ?? {
    name: child.name,
    birthDate: child.birthDate ?? "",
    gender: child.gender ?? "other",
    emoji: child.emoji ?? "👶"
  };
  const setDraft = (child: Child, values: Partial<{ name: string; birthDate: string; gender: string; emoji: string }>) => {
    setEditing({ ...editing, [child.id]: { ...draftFor(child), ...values } });
  };
  return (
    <section className="panel">
      <h2 className="section-title"><UsersRound size={20} /> 子ども</h2>
      <div className="stack">
        {state.children.map((child, index) => {
          const draft = draftFor(child);
          const changed =
            draft.name !== child.name ||
            draft.birthDate !== (child.birthDate ?? "") ||
            draft.gender !== (child.gender ?? "other") ||
            draft.emoji !== (child.emoji ?? "👶");
          const color = childColor(index);
          const textColor = childTextColors[index % childTextColors.length];
          return (
            <div className="edit-row color-row" key={child.id} style={{ "--accent": color, "--accent-text": textColor } as React.CSSProperties}>
              <span className="color-label"><i />子ども</span>
              <input aria-label={`${child.name}の名前`} value={draft.name} onChange={(event) => setDraft(child, { name: event.target.value })} />
              <input aria-label={`${child.name}の絵文字`} value={draft.emoji} maxLength={4} onChange={(event) => setDraft(child, { emoji: event.target.value })} />
              <input aria-label={`${child.name}の生年月日`} type="date" value={draft.birthDate} onChange={(event) => setDraft(child, { birthDate: event.target.value })} />
              <select aria-label={`${child.name}の性別`} value={draft.gender} onChange={(event) => setDraft(child, { gender: event.target.value })}>
                {Object.entries(genderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="edit-actions">
                <button className="icon-btn" title="保存" disabled={!changed} onClick={() => update(child)}><Save size={17} /></button>
                <button className="icon-btn" title="削除" onClick={() => remove(child.id)}><Trash2 size={17} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <input placeholder="名前" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="絵文字" value={form.emoji} maxLength={4} onChange={(event) => setForm({ ...form, emoji: event.target.value })} />
      <input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} />
      <select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
        {Object.entries(genderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="btn secondary w-full" onClick={save}><Plus size={18} /> 追加</button>
    </section>
  );
}

function WeeklyRulesTable({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const rulesByKey = useMemo(() => {
    return new Map(state.weeklyRules.map((rule) => [`${rule.childId}:${rule.dayOfWeek}`, rule]));
  }, [state.weeklyRules]);

  const updateRule = (child: Child, dayOfWeek: number, field: "dropoffMemberId" | "pickupMemberId", value: string) => {
    const key = `${child.id}:${dayOfWeek}`;
    const existing = rulesByKey.get(key);
    const nextRule: WeeklyRule = {
      id: existing?.id ?? `new_${key}`,
      familyId: state.family.id,
      childId: child.id,
      dayOfWeek,
      dropoffMemberId: existing?.dropoffMemberId ?? null,
      pickupMemberId: existing?.pickupMemberId ?? null,
      [field]: value || null
    };
    setState({
      ...state,
      weeklyRules: [...state.weeklyRules.filter((rule) => `${rule.childId}:${rule.dayOfWeek}` !== key), nextRule]
    });
  };

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>曜日</th>
            {state.children.map((child, index) => (
              <th key={child.id}>
                <span className="table-name-pill" style={{ background: childColor(index), color: childTextColors[index % childTextColors.length] }}>{child.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.value}>
              <td className="day">{day.label}</td>
              {state.children.map((child) => {
                const rule = rulesByKey.get(`${child.id}:${day.value}`);
                return (
                  <td key={child.id}>
                    <div className="rule-cell">
                      <label>
                        <span>送り</span>
                        <select value={rule?.dropoffMemberId ?? ""} onChange={(event) => updateRule(child, day.value, "dropoffMemberId", event.target.value)}>
                          {state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>迎え</span>
                        <select value={rule?.pickupMemberId ?? ""} onChange={(event) => updateRule(child, day.value, "pickupMemberId", event.target.value)}>
                          {state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewPanel({ state }: { state: AdminState }) {
  const nextThursday = "2026-06-11";
  const day = new Date(`${nextThursday}T00:00:00+09:00`).getDay();
  return (
    <section className="preview">
      <h2 className="section-title"><Bell size={20} /> LINE表示イメージ</h2>
      <div className="phone">
        <div className="bubble">
          <p>明日の送迎予定です。</p>
          <p>6/11(木)</p>
          {state.children.map((child) => {
            const rule = state.weeklyRules.find((item) => item.childId === child.id && item.dayOfWeek === day);
            return (
              <div key={child.id} className="mt-4">
                <p>【{child.name}】</p>
                <p>送り：{memberName(state.members, rule?.dropoffMemberId ?? null)}</p>
                <p>迎え：{memberName(state.members, rule?.pickupMemberId ?? null)}</p>
              </div>
            );
          })}
          <p className="mt-4">変更がある場合のみ押してください。</p>
        </div>
        <button className="line-pill">変更する</button>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

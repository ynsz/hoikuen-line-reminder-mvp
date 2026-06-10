import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, CalendarDays, Clock, Plus, Save, Send, Trash2, UsersRound } from "lucide-react";
import type { AdminState, Child, Member, Role, WeeklyRule } from "../shared/types";
import "./styles.css";

const days = ["日", "月", "火", "水", "木", "金", "土"];
const roleLabels: Record<Role, string> = {
  father: "パパ",
  mother: "ママ",
  grandfather: "祖父",
  grandmother: "祖母",
  other: "その他"
};
const roleOptions: Role[] = ["father", "mother", "other"];

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
  return members.find((member) => member.id === id)?.name ?? "未定";
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
          <NotificationPanel state={state} setState={setState} />
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

function NotificationPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const [previous, setPrevious] = useState(state.notificationSetting.previousDayNotifyTime);
  const [morning, setMorning] = useState(state.notificationSetting.morningNotifyTime);
  const save = async () => {
    setState(await api<AdminState>("/api/notification-setting", {
      method: "PUT",
      body: JSON.stringify({ previousDayNotifyTime: previous, morningNotifyTime: morning })
    }));
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
      <button className="btn primary w-full" onClick={save}><Save size={18} /> 保存</button>
    </section>
  );
}

function MembersPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const blank = { name: "", role: "other" as Role };
  const [form, setForm] = useState(blank);
  const save = async () => {
    if (!form.name.trim()) return;
    setState(await api<AdminState>("/api/members", { method: "POST", body: JSON.stringify(form) }));
    setForm(blank);
  };
  const remove = async (id: string) => setState(await api<AdminState>(`/api/members/${id}`, { method: "DELETE" }));
  return (
    <section className="panel">
      <h2 className="section-title"><UsersRound size={20} /> 担当者</h2>
      <div className="stack">
        {state.members.map((member) => (
          <div className="row" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <p>{roleLabels[member.role]}</p>
            </div>
            <button className="icon-btn" title="削除" onClick={() => remove(member.id)}><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_112px] gap-2">
        <input placeholder="担当者名" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
          {roleOptions.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}
        </select>
      </div>
      <button className="btn secondary w-full" onClick={save}><Plus size={18} /> 追加</button>
    </section>
  );
}

function ChildrenPanel({ state, setState }: { state: AdminState; setState: (state: AdminState) => void }) {
  const blank = { name: "", nurseryName: "", displayOrder: state.children.length + 1 };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Record<string, Pick<Child, "name" | "displayOrder"> & { nurseryName: string }>>({});
  const save = async () => {
    if (!form.name.trim()) return;
    setState(await api<AdminState>("/api/children", { method: "POST", body: JSON.stringify(form) }));
    setForm({ ...blank, displayOrder: state.children.length + 2 });
  };
  const update = async (child: Child) => {
    const values = editing[child.id];
    if (!values?.name.trim()) return;
    setState(await api<AdminState>("/api/children", {
      method: "POST",
      body: JSON.stringify({ id: child.id, ...values })
    }));
  };
  const remove = async (id: string) => setState(await api<AdminState>(`/api/children/${id}`, { method: "DELETE" }));
  const draftFor = (child: Child) => editing[child.id] ?? {
    name: child.name,
    nurseryName: child.nurseryName ?? "",
    displayOrder: child.displayOrder
  };
  const setDraft = (child: Child, values: Partial<Pick<Child, "name" | "displayOrder"> & { nurseryName: string }>) => {
    setEditing({ ...editing, [child.id]: { ...draftFor(child), ...values } });
  };
  return (
    <section className="panel">
      <h2 className="section-title"><UsersRound size={20} /> 子ども</h2>
      <div className="stack">
        {state.children.map((child) => {
          const draft = draftFor(child);
          const changed =
            draft.name !== child.name ||
            draft.nurseryName !== (child.nurseryName ?? "") ||
            draft.displayOrder !== child.displayOrder;
          return (
            <div className="edit-row" key={child.id}>
              <input aria-label={`${child.name}の名前`} value={draft.name} onChange={(event) => setDraft(child, { name: event.target.value })} />
              <input aria-label={`${child.name}の園名`} placeholder="園名（任意）" value={draft.nurseryName} onChange={(event) => setDraft(child, { nurseryName: event.target.value })} />
              <input aria-label={`${child.name}の表示順`} type="number" min={1} value={draft.displayOrder} onChange={(event) => setDraft(child, { displayOrder: Number(event.target.value) })} />
              <div className="edit-actions">
                <button className="icon-btn" title="保存" disabled={!changed} onClick={() => update(child)}><Save size={17} /></button>
                <button className="icon-btn" title="削除" onClick={() => remove(child.id)}><Trash2 size={17} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <input placeholder="名前" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="園名（任意）" value={form.nurseryName} onChange={(event) => setForm({ ...form, nurseryName: event.target.value })} />
      <input type="number" min={1} value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: Number(event.target.value) })} />
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
            {state.children.map((child) => <th key={child.id}>{child.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((day, dayOfWeek) => (
            <tr key={day}>
              <td className="day">{day}</td>
              {state.children.map((child) => {
                const rule = rulesByKey.get(`${child.id}:${dayOfWeek}`);
                return (
                  <td key={child.id}>
                    <div className="rule-cell">
                      <label>
                        <span>送り</span>
                        <select value={rule?.dropoffMemberId ?? ""} onChange={(event) => updateRule(child, dayOfWeek, "dropoffMemberId", event.target.value)}>
                          <option value="">未定</option>
                          {state.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>迎え</span>
                        <select value={rule?.pickupMemberId ?? ""} onChange={(event) => updateRule(child, dayOfWeek, "pickupMemberId", event.target.value)}>
                          <option value="">未定</option>
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

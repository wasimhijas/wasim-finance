import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const USER_COLOR = "#3B82F6";
const DEFAULT_CATEGORIES = ["Living", "Utilities", "Food", "Transport", "Hobby", "Fixed", "Health", "Entertainment", "Other"];
const DEFAULT_BUDGETS = { "Living": 30000, "Utilities": 8000, "Food": 15000, "Transport": 5000, "Hobby": 15000, "Fixed": 20000, "Health": 5000, "Entertainment": 5000, "Other": 5000 };
const DEFAULT_SETTINGS = {
  password: "wasim123",
  salary: 0,
  categoryBudgets: DEFAULT_BUDGETS,
  categories: DEFAULT_CATEGORIES,
  billingCycleStart: 4,
  overallBudget: 0,
};
const DEFAULT_DATA = { income: [], expenses: [], creditCards: [], installments: [], savings: [], investments: [] };

// ─── STORAGE ─────────────────────────────────────────────────────────────────
// localStorage is the primary store — instant, never fails.
// Cosmos (/api/storage) is synced in the background for cross-device persistence.
const API = "/api";

const lsGet = (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const cosmosGet = async (key) => {
  try {
    const r = await fetch(`${API}/storage?key=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const data = await r.json();
    return data.value ? JSON.parse(data.value) : null;
  } catch { return null; }
};
const cosmosSet = async (key, val) => {
  try {
    await fetch(`${API}/storage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: JSON.stringify(val) }) });
  } catch {}
};

// Load: use localStorage immediately, then reconcile with Cosmos in background
const load = async (key) => {
  const local = lsGet(key);
  // Fire Cosmos fetch in background — if it has newer/existing data, sync it back
  cosmosGet(key).then(remote => {
    if (remote !== null) lsSet(key, remote);
  });
  return local;
};

// Save: write to localStorage instantly, then sync to Cosmos
const save = (key, val) => {
  lsSet(key, val);
  cosmosSet(key, val);
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n) => "LKR " + Number(n || 0).toLocaleString("en-LK");
const today = () => new Date().toISOString().slice(0, 10);
const getMonthKey = (date, cs = 4) => { const d = new Date(date); if (d.getDate() < cs) d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const currentMonth = (cs) => getMonthKey(today(), cs);
const monthLabel = (mk) => { const [y, m] = mk.split("-"); return new Date(y, m - 1).toLocaleString("default", { month: "long", year: "numeric" }); };
const prevMonth = (mk) => { const [y, m] = mk.split("-"); const d = new Date(y, m - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const nextMonth = (mk) => { const [y, m] = mk.split("-"); const d = new Date(y, m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const progressColor = (pct) => pct >= 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#10B981";
const todayLabel = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const cmpMonth = (a, b) => { const [ay, am] = a.split("-").map(Number); const [by, bm] = b.split("-").map(Number); return ay !== by ? ay - by : am - bm; };

// ─── EMI HELPERS ─────────────────────────────────────────────────────────────
const emiCalcFromDates = (inst) => {
  const startDate = inst.startDate ? new Date(inst.startDate) : null;
  const endDate = inst.dueUntil ? new Date(inst.dueUntil) : null;
  const monthly = +(inst.monthly || 0);
  const total = +(inst.total || 0);
  if (!startDate || !monthly || monthly <= 0) {
    return { remaining: inst.remaining ?? total, paid: total - (inst.remaining ?? total), installmentsPaid: 0, installmentsTotal: total > 0 ? Math.ceil(total / monthly) : 0, installmentsLeft: inst.remaining ?? total > 0 ? Math.ceil((inst.remaining ?? total) / monthly) : 0, endDate: null, isAutoCalc: false };
  }
  const now = new Date();
  const installmentsFromTotal = total > 0 && monthly > 0 ? Math.round(total / monthly) : null;
  let derivedTotal = installmentsFromTotal;
  if (!derivedTotal && endDate) {
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
    derivedTotal = Math.max(1, months);
  }
  const monthsElapsed = Math.max(0, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()) + (now.getDate() >= startDate.getDate() ? 1 : 0));
  const installmentsPaid = derivedTotal ? Math.min(monthsElapsed, derivedTotal) : monthsElapsed;
  const installmentsLeft = derivedTotal ? Math.max(0, derivedTotal - installmentsPaid) : null;
  const amountPaid = installmentsPaid * monthly;
  const remaining = derivedTotal ? Math.max(0, total > 0 ? total - amountPaid : installmentsLeft * monthly) : (inst.remaining ?? total);
  let computedEndDate = null;
  if (derivedTotal) { const end = new Date(startDate); end.setMonth(end.getMonth() + derivedTotal - 1); computedEndDate = end.toISOString().slice(0, 7); }
  else if (endDate) { computedEndDate = endDate.toISOString().slice(0, 7); }
  return { remaining, paid: amountPaid, installmentsPaid, installmentsTotal: derivedTotal, installmentsLeft, endDate: computedEndDate, isAutoCalc: true };
};

const emiInstallmentsLeft = (inst) => {
  const calc = emiCalcFromDates(inst);
  if (calc.installmentsLeft !== null) return { count: calc.installmentsLeft, endDate: calc.endDate };
  const rem = inst.remaining ?? inst.total ?? 0;
  if (!inst.monthly || inst.monthly <= 0 || rem <= 0) return { count: 0, endDate: null };
  const count = Math.ceil(rem / inst.monthly);
  const base = inst.startDate ? new Date(inst.startDate) : new Date();
  const end = new Date(base); end.setMonth(end.getMonth() + count - 1);
  return { count, endDate: end.toISOString().slice(0, 7) };
};

// ─── CC BILLING HELPERS ──────────────────────────────────────────────────────
const ccGetPeriods = (cc, monthKey) => {
  const closeDay = +(cc.billingCloseDay || cc.settlementDay || 25);
  const dueDays = +(cc.dueDays || 20);
  const [y, m] = monthKey.split("-").map(Number);
  const closedEnd = new Date(y, m - 1, closeDay);
  const closedStart = new Date(y, m - 2, closeDay + 1);
  const dueDate = new Date(closedEnd); dueDate.setDate(dueDate.getDate() + dueDays);
  const openStart = new Date(y, m - 1, closeDay + 1);
  const openEnd = new Date(y, m, closeDay);
  return { closed: { start: closedStart.toISOString().slice(0, 10), end: closedEnd.toISOString().slice(0, 10), dueDate: dueDate.toISOString().slice(0, 10) }, open: { start: openStart.toISOString().slice(0, 10), end: openEnd.toISOString().slice(0, 10) }, closeDay, dueDays };
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const IS = { width: "100%", padding: "10px 13px", borderRadius: 9, border: "2px solid #334155", background: "#0F172A", color: "#F1F5F9", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "system-ui" };
const BP = (c = "#3B82F6") => ({ padding: "9px 18px", borderRadius: 9, border: "none", background: c, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui" });
const BS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94A3B8", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "system-ui" };
const BD = { padding: "7px 11px", borderRadius: 8, border: "none", background: "#EF444418", color: "#EF4444", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui" };
const BGr = { padding: "7px 11px", borderRadius: 8, border: "none", background: "#10B98118", color: "#10B981", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui" };
const BEd = { padding: "7px 11px", borderRadius: 8, border: "none", background: "#3B82F618", color: "#3B82F6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui" };
const PIE_COLORS = ["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EF4444","#06B6D4","#F97316","#6366F1","#14B8A6","#A78BFA","#EC4899","#FB7185"];

// ─── TINY COMPONENTS ─────────────────────────────────────────────────────────
function ProgressBar({ pct, color }) {
  return <div style={{ background: "#0F172A", borderRadius: 99, height: 7, overflow: "hidden" }}><div style={{ width: `${Math.min(pct, 100)}%`, background: color || progressColor(pct), height: "100%", borderRadius: 99, transition: "width 0.4s" }} /></div>;
}
function Card({ children, accent, style = {} }) {
  return <div style={{ background: "#1E293B", borderRadius: 14, padding: 22, borderLeft: accent ? `4px solid ${accent}` : "none", ...style }}>{children}</div>;
}
function SectionCard({ title, action, children, style = {} }) {
  return (
    <Card style={{ marginBottom: 18, ...style }}>
      {(title || action) && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>{title && <h3 style={{ color: "#F1F5F9", margin: 0, fontFamily: "system-ui", fontSize: 15, fontWeight: 600 }}>{title}</h3>}{action}</div>}
      {children}
    </Card>
  );
}
function Field({ label, hint, children, style = {} }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", color: "#64748B", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: hint ? 2 : 5 }}>{label}</label>
      {hint && <p style={{ color: "#475569", fontSize: 11, margin: "0 0 5px", fontFamily: "system-ui" }}>{hint}</p>}
      {children}
    </div>
  );
}
function Tag({ children, color = "#3B82F6" }) {
  return <span style={{ background: color + "20", color, fontSize: 11, padding: "2px 8px", borderRadius: 99, fontFamily: "system-ui", fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}
function Toggle({ checked, onChange, label, color = "#3B82F6" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => onChange(!checked)}>
      <div style={{ width: 38, height: 20, borderRadius: 99, background: checked ? color : "#334155", transition: "background 0.2s", position: "relative", flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 21 : 3, transition: "left 0.2s" }} />
      </div>
      {label && <span style={{ color: "#94A3B8", fontFamily: "system-ui", fontSize: 13 }}>{label}</span>}
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function Login({ onLogin, password }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const handle = () => {
    if (pw === (password || "wasim123")) onLogin();
    else setErr("Incorrect password.");
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0F172A 0%,#1E293B 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1E293B", borderRadius: 20, padding: "44px 38px", width: 360, boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💰</div>
          <h1 style={{ color: "#F1F5F9", margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "system-ui" }}>Wasim's Finance</h1>
          <p style={{ color: "#475569", margin: "6px 0 0", fontSize: 13, fontFamily: "system-ui" }}>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Field label="Password">
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} placeholder="Enter password" style={{ ...IS, marginTop: 4 }} autoFocus />
        </Field>
        {err && <p style={{ color: "#EF4444", fontSize: 13, margin: "-6px 0 12px", fontFamily: "system-ui" }}>{err}</p>}
        <button onClick={handle} style={{ ...BP(USER_COLOR), width: "100%", padding: "12px", fontSize: 15 }}>Sign In →</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await load("financeSettings");
        const d = await load("financeData");
        const merged = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
        if (s) setSettings(merged);
        if (d) setData({ ...DEFAULT_DATA, ...d });
        setSelectedMonth(currentMonth(merged.billingCycleStart));
      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persistSettings = (s) => { setSettings(s); save("financeSettings", s); };
  const persistData = (d) => { setData(d); save("financeData", d); };
  const updData = (key, val) => persistData({ ...data, [key]: val });
  const updDataMulti = (updates) => persistData({ ...data, ...updates });
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  if (!loaded) return <div style={{ minHeight: "100vh", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: "system-ui", fontSize: 16 }}>Loading…</div>;
  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} password={settings.password} />;

  const cats = settings.categories || DEFAULT_CATEGORIES;
  const budgets = settings.categoryBudgets || DEFAULT_BUDGETS;
  const cycleStart = settings.billingCycleStart || 4;
  const myCards = data.creditCards || [];
  const myInstallments = data.installments || [];
  const storedEmiExpenses = data.expenses || [];

  const getEffectiveEmiRemaining = (inst) => {
    const calc = emiCalcFromDates(inst);
    if (calc.isAutoCalc && calc.installmentsTotal !== null) return calc.remaining;
    return inst.remaining ?? inst.total ?? 0;
  };

  // Virtual EMI expenses for selected month
  const emiVirtualExpenses = myInstallments.flatMap(inst => {
    const rem = getEffectiveEmiRemaining(inst);
    const startMk = getMonthKey(inst.startDate || inst.date || today(), cycleStart);
    const dueMk = inst.dueUntil ? getMonthKey(inst.dueUntil, cycleStart) : null;
    if (cmpMonth(selectedMonth, startMk) < 0) return [];
    if (dueMk && cmpMonth(selectedMonth, dueMk) > 0) return [];
    if (rem <= 0) return [];
    const hasReal = storedEmiExpenses.some(e => e.emiId === inst.id && !e.isSetupFee && getMonthKey(e.date, cycleStart) === selectedMonth);
    if (hasReal) return [];
    const [y, m] = selectedMonth.split("-");
    const day = new Date(inst.startDate || today()).getDate();
    const expDate = new Date(+y, +m - 1, day).toISOString().slice(0, 10);
    return [{ id: `emi_${inst.id}_${selectedMonth}`, description: `EMI: ${inst.name}`, amount: inst.monthly, date: expDate, category: inst.category || "Fixed", extraCategories: inst.extraCategories || [], ccId: inst.ccId || "", recurring: false, isEmiInstance: true, emiId: inst.id, notes: `Auto EMI: ${inst.name}` }];
  });

  const allStoredExpenses = data.expenses || [];
  const originMonthExpenses = allStoredExpenses.filter(e => getMonthKey(e.date, cycleStart) === selectedMonth);
  const recurringFromOtherMonths = allStoredExpenses
    .filter(e => e.recurring && getMonthKey(e.date, cycleStart) !== selectedMonth)
    .map(r => { const origDay = new Date(r.date).getDate(); const [y, m] = selectedMonth.split("-"); return { ...r, id: `rec_${r.id}_${selectedMonth}`, isRecurringInstance: true, date: new Date(+y, +m - 1, origDay).toISOString().slice(0, 10) }; });

  const allMonthExpenses = [...originMonthExpenses, ...recurringFromOtherMonths, ...emiVirtualExpenses];
  const monthIncome = (data.income || []).filter(i => getMonthKey(i.date, cycleStart) === selectedMonth);
  const salary = settings.salary || 0;
  const totalAddlIncome = monthIncome.reduce((s, i) => s + i.amount, 0);
  const carryover = monthIncome.filter(i => i.type === "carryover").reduce((s, i) => s + i.amount, 0);
  const totalIncome = salary + totalAddlIncome;
  const totalExpenses = allMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const myNet = totalIncome - totalExpenses;

  const catTotals = {};
  cats.forEach(c => catTotals[c] = 0);
  allMonthExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });

  const overallBudget = +(settings.overallBudget || 0);
  const catBudgetSum = Object.values(budgets).reduce((s, v) => s + (+v || 0), 0);
  const totalBudget = overallBudget > 0 ? overallBudget : catBudgetSum;
  const totalBudgetRemaining = totalBudget - totalExpenses;
  const totalBudgetPct = totalBudget > 0 ? Math.round(totalExpenses / totalBudget * 100) : 0;
  const usingOverallBudget = overallBudget > 0;

  const ccDue = myCards.map(cc => {
    const { closed, open, closeDay, dueDays } = ccGetPeriods(cc, selectedMonth);
    const sumForCard = (start, end) => {
      const expenses = (data.expenses || []).filter(e => e.ccId === cc.id && e.date >= start && e.date <= end);
      const emiCharges = myInstallments.flatMap(inst => {
        if (inst.ccId !== cc.id) return [];
        const rem = getEffectiveEmiRemaining(inst);
        if (rem <= 0) return [];
        const instStart = (inst.startDate || today()).slice(0, 10);
        const day = new Date(instStart).getDate();
        const results = [];
        const [sy, sm] = start.split("-").map(Number);
        const [ey, em] = end.split("-").map(Number);
        for (let y = sy, mo = sm; y < ey || (y === ey && mo <= em); mo++) {
          let cy = y, cm = mo;
          if (cm > 12) { cm -= 12; cy++; }
          const emiDate = new Date(cy, cm - 1, day).toISOString().slice(0, 10);
          if (emiDate >= start && emiDate <= end && emiDate >= instStart) {
            const monthKey = `${String(cy).padStart(4,"0")}-${String(cm).padStart(2,"0")}`;
            const alreadyCovered = expenses.some(e => e.emiId === inst.id && !e.isSetupFee && e.date.slice(0,7) === monthKey);
            if (!alreadyCovered) results.push({ amount: inst.monthly, date: emiDate, description: `EMI: ${inst.name}`, isEmi: true });
          }
          if (cy > ey || (cy === ey && cm >= em)) break;
          y = cy;
        }
        return results;
      });
      return { expenses, emiCharges, total: expenses.reduce((s, e) => s + e.amount, 0) + emiCharges.reduce((s, e) => s + e.amount, 0) };
    };
    const closedData = sumForCard(closed.start, closed.end);
    const openData = sumForCard(open.start, open.end);
    const emiRemainingOnCard = myInstallments.filter(i => i.ccId === cc.id).reduce((s, i) => { const r = getEffectiveEmiRemaining(i); return s + (r > 0 ? r : 0); }, 0);
    const availableBalance = cc.limit > 0 ? Math.max(0, cc.limit - emiRemainingOnCard - openData.total) : null;
    return { ...cc, closed, open, closeDay, dueDays, closedAmount: closedData.total, closedExpenses: closedData.expenses, closedEmiCharges: closedData.emiCharges, openAmount: openData.total, openExpenses: openData.expenses, openEmiCharges: openData.emiCharges, statementAmount: closedData.total, billing: { periodStart: closed.start, periodEnd: closed.end, dueDate: closed.dueDate }, statementExpenses: closedData.expenses, currentSpend: openData.total, emiRemainingOnCard, availableBalance };
  });

  const totalSavingsBalance = (data.savings || []).reduce((s, sv) => s + sv.balance, 0);
  const totalInvestmentsBalance = (data.investments || []).reduce((s, inv) => s + inv.balance, 0);
  const netWorth = totalSavingsBalance + totalInvestmentsBalance;

  // ─── SHARED COMPONENTS ────────────────────────────────────────────────────
  const MonthNav = ({ compact }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: compact ? 0 : 22 }}>
      <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} style={{ ...BS, padding: "5px 10px" }}>‹</button>
      <span style={{ color: "#F1F5F9", fontFamily: "system-ui", fontSize: 14, fontWeight: 600, minWidth: 140, textAlign: "center" }}>{monthLabel(selectedMonth)}</span>
      <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} style={{ ...BS, padding: "5px 10px" }}>›</button>
      {selectedMonth !== currentMonth(cycleStart) && <button onClick={() => setSelectedMonth(currentMonth(cycleStart))} style={{ ...BS, padding: "4px 9px", fontSize: 11 }}>Today</button>}
    </div>
  );

  const ExpenseFormFields = ({ form, set, isEdit }) => {
    const budgetWarning = form.category && budgets[form.category] && form.amount ? catTotals[form.category] + +form.amount > budgets[form.category] : false;
    const splitWith = form.splitWith || [];
    const perPerson = form.amount && splitWith.length > 0 ? (+form.amount / (splitWith.length + 1)).toFixed(0) : null;
    const addPerson = () => set("splitWith", [...splitWith, { name: "", amount: perPerson || "" }]);
    const removePerson = (i) => set("splitWith", splitWith.filter((_, idx) => idx !== i));
    const updatePerson = (i, key, val) => set("splitWith", splitWith.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Description"><input style={IS} value={form.description} onChange={e => set("description", e.target.value)} placeholder="What was this for?" autoFocus={!isEdit} /></Field>
          <Field label="Amount (LKR)">
            <input style={{ ...IS, ...(budgetWarning ? { borderColor: "#F59E0B" } : {}) }} type="number" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0" />
            {budgetWarning && <p style={{ color: "#F59E0B", fontSize: 10, margin: "3px 0 0", fontFamily: "system-ui" }}>⚠️ Will exceed budget</p>}
          </Field>
          <Field label="Date"><input style={IS} type="date" value={form.date} onChange={e => set("date", e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Primary Category" hint="Counts toward budget totals">
            <select style={IS} value={form.category} onChange={e => set("category", e.target.value)}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Pay via">
            <select style={IS} value={form.ccId || ""} onChange={e => set("ccId", e.target.value)}>
              <option value="">Cash / Debit</option>
              {myCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
            </select>
          </Field>
        </div>
        {/* Extra categories */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", color: "#64748B", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Also tagged as <span style={{ color: "#334155", fontWeight: 400 }}>(optional — label only, no budget impact)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", background: "#0F172A", borderRadius: 9, border: "2px solid #334155" }}>
            {cats.filter(c => c !== form.category).map(c => {
              const selected = (form.extraCategories || []).includes(c);
              return (
                <button key={c} type="button" onClick={() => {
                  const cur = form.extraCategories || [];
                  set("extraCategories", selected ? cur.filter(x => x !== c) : [...cur, c]);
                }} style={{ padding: "3px 10px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: selected ? 600 : 400, background: selected ? "#3B82F6" : "#1E293B", color: selected ? "#fff" : "#64748B", transition: "all 0.15s" }}>{c}</button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Notes (optional)"><input style={IS} value={form.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Optional note" /></Field>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14 }}>
            <Toggle checked={!!form.recurring} onChange={v => set("recurring", v)} label="Recurring monthly" color="#10B981" />
          </div>
        </div>
        {/* Split toggle */}
        <div style={{ marginBottom: form.split ? 0 : 4, display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle checked={!!form.split} onChange={v => { set("split", v); if (!v) set("splitWith", []); }} label="Split this expense" color="#F59E0B" />
          {form.split && perPerson && <span style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui" }}>Each owes: <strong style={{ color: "#F59E0B" }}>LKR {Number(perPerson).toLocaleString("en-LK")}</strong></span>}
        </div>
        {form.split && (
          <div style={{ background: "#0F172A", borderRadius: 10, padding: "12px 14px", marginTop: 10, marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "system-ui", fontWeight: 600 }}>👥 Split with</span>
              <button onClick={addPerson} style={{ ...BP("#F59E0B"), padding: "5px 12px", fontSize: 12 }}>+ Add Person</button>
            </div>
            {splitWith.length === 0 && <p style={{ color: "#334155", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>Add at least one person to split with.</p>}
            {splitWith.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input style={{ ...IS, fontSize: 13 }} value={p.name} onChange={e => updatePerson(i, "name", e.target.value)} placeholder={`Person ${i + 1} name`} />
                <input style={{ ...IS, fontSize: 13 }} type="number" value={p.amount} onChange={e => updatePerson(i, "amount", e.target.value)} placeholder="Amount they owe" />
                <button onClick={() => removePerson(i)} style={{ ...BD, padding: "8px 10px" }}>×</button>
              </div>
            ))}
            {splitWith.length > 0 && form.amount && (
              <div style={{ marginTop: 6, padding: "6px 10px", background: "#1E293B", borderRadius: 7, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Total: <strong style={{ color: "#F1F5F9" }}>LKR {Number(form.amount).toLocaleString("en-LK")}</strong></span>
                <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Others owe: <strong style={{ color: "#F59E0B" }}>LKR {splitWith.reduce((s, p) => s + (+p.amount || 0), 0).toLocaleString("en-LK")}</strong></span>
                <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>You paid: <strong style={{ color: "#10B981" }}>LKR {(+form.amount - splitWith.reduce((s, p) => s + (+p.amount || 0), 0)).toLocaleString("en-LK")}</strong></span>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 📊 DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  const Dashboard = () => {
    const activeEMIs = myInstallments.filter(i => getEffectiveEmiRemaining(i) > 0);
    const totalEMIMonthly = activeEMIs.reduce((s, i) => s + i.monthly, 0);
    const pieData = cats.map(c => ({ name: c, spent: catTotals[c] || 0 })).filter(c => c.spent > 0);
    const catData = cats.map(c => ({ name: c.length > 8 ? c.slice(0, 7) + "…" : c, budget: budgets[c] || 0, spent: catTotals[c] || 0 }));
    const budgetLeft = totalBudget - totalExpenses;

    return (
      <div>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ color: "#F1F5F9", margin: "0 0 2px", fontFamily: "system-ui", fontSize: 22, fontWeight: 700 }}>👋 Hey, Wasim</h2>
          <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>{todayLabel()}</p>
        </div>
        <MonthNav />

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
          {[
            { label: "Income", value: fmt(totalIncome), color: "#10B981", icon: "💰", hint: carryover > 0 ? "🔄 incl. " + fmt(carryover) : null },
            { label: "Spent", value: fmt(totalExpenses), color: "#F59E0B", icon: "🧾" },
            { label: "Budget Left", value: fmt(budgetLeft), color: budgetLeft < 0 ? "#EF4444" : "#10B981", icon: "📊" },
            { label: "Net This Month", value: fmt(myNet), color: myNet < 0 ? "#EF4444" : "#3B82F6", icon: "👤" },
            { label: "EMIs / month", value: fmt(totalEMIMonthly), color: "#8B5CF6", icon: "📅" },
          ].map(({ label, value, color, icon, hint }) => (
            <Card key={label} accent={color} style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</span>
              </div>
              <p style={{ color, margin: 0, fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>{value}</p>
              {hint && <p style={{ color: "#475569", fontSize: 10, fontFamily: "system-ui", margin: "3px 0 0" }}>{hint}</p>}
            </Card>
          ))}
        </div>

        {/* Balance bar */}
        {totalIncome > 0 && (
          <div style={{ background: "#1E293B", borderRadius: 14, padding: "16px 20px", marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui" }}>Spent <strong style={{ color: progressColor(totalIncome > 0 ? Math.round(totalExpenses/totalIncome*100) : 0) }}>{Math.min(100, Math.round(totalExpenses / totalIncome * 100))}%</strong> of income</span>
              <span style={{ color: myNet >= 0 ? "#10B981" : "#EF4444", fontSize: 12, fontFamily: "system-ui", fontWeight: 700 }}>{myNet >= 0 ? fmt(myNet) + " remaining" : "Over by " + fmt(Math.abs(myNet))}</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: "#334155", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, Math.round(totalExpenses / totalIncome * 100))}%`, height: "100%", background: progressColor(Math.round(totalExpenses/totalIncome*100)), borderRadius: 99, transition: "width 0.4s" }} />
            </div>
          </div>
        )}

        {/* Budget overview */}
        {(() => {
          const [showLabels, setShowLabels] = React.useState(false);
          // Build label totals: only count extraCategories — primary category is already shown in budget view
          const labelTotals = {};
          allMonthExpenses.forEach(e => {
            (e.extraCategories || []).forEach(tag => { if (tag) labelTotals[tag] = (labelTotals[tag] || 0) + e.amount; });
          });
          const labelEntries = cats.map(c => ({ name: c, total: labelTotals[c] || 0 })).filter(l => l.total > 0).sort((a, b) => b.total - a.total);
          const maxLabel = labelEntries.length > 0 ? labelEntries[0].total : 1;
          return (
            <SectionCard title="📊 Budget Overview" action={
              <button onClick={() => setShowLabels(v => !v)} style={{ padding: "4px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: 600, background: showLabels ? "#3B82F6" : "#1E293B", color: showLabels ? "#fff" : "#64748B", transition: "all 0.15s" }}>
                {showLabels ? "📊 By Category" : "🏷️ By Label"}
              </button>
            }>
              {totalBudget > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ color: "#F1F5F9", fontSize: 13, fontFamily: "system-ui", fontWeight: 600 }}>{usingOverallBudget ? "Overall Budget" : "Total Budget"}</span>
                    <span style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui" }}>{fmt(totalExpenses)} of {fmt(totalBudget)}</span>
                  </div>
                  <ProgressBar pct={totalBudgetPct} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ color: progressColor(totalBudgetPct), fontSize: 12, fontFamily: "system-ui", fontWeight: 600 }}>{totalBudgetPct}% used</span>
                    <span style={{ color: totalBudgetRemaining < 0 ? "#EF4444" : "#10B981", fontSize: 12, fontFamily: "system-ui", fontWeight: 700 }}>{totalBudgetRemaining < 0 ? "⚠️ Over by " + fmt(Math.abs(totalBudgetRemaining)) : fmt(totalBudgetRemaining) + " left"}</span>
                  </div>
                </div>
              )}
              {!showLabels ? (
                <div style={{ borderTop: totalBudget > 0 ? "1px solid #334155" : "none", paddingTop: totalBudget > 0 ? 14 : 0 }}>
                  {cats.map(c => {
                    const spent = catTotals[c] || 0;
                    const catBudget = budgets[c] || 0;
                    const barPct = usingOverallBudget ? (totalBudget > 0 ? Math.round(spent / totalBudget * 100) : 0) : (catBudget > 0 ? Math.round(spent / catBudget * 100) : 0);
                    const overLimit = catBudget > 0 && spent > catBudget;
                    const isEmpty = spent === 0;
                    return (
                      <div key={c} style={{ marginBottom: 10, opacity: isEmpty ? 0.4 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: isEmpty ? "#475569" : "#CBD5E1", fontSize: 12, fontFamily: "system-ui" }}>{c}{overLimit && <span style={{ color: "#F59E0B", fontSize: 10, marginLeft: 6 }}>⚠️</span>}</span>
                          <span style={{ color: isEmpty ? "#334155" : "#64748B", fontSize: 11, fontFamily: "system-ui" }}>
                            {isEmpty ? "—" : fmt(spent)}{!usingOverallBudget && catBudget > 0 ? " / " + fmt(catBudget) : ""}{usingOverallBudget && spent > 0 ? " (" + barPct + "%)" : ""}
                          </span>
                        </div>
                        <div style={{ background: "#0F172A", borderRadius: 99, height: 5, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(barPct, 100)}%`, background: isEmpty ? "#1E293B" : progressColor(overLimit ? 101 : barPct), height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ borderTop: "1px solid #334155", paddingTop: 14 }}>
                  <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "0 0 12px", fontStyle: "italic" }}>
                    🏷️ Spending grouped by extra labels only. Primary categories are shown in the Budget view above.
                  </p>
                  {labelEntries.length === 0 ? (
                    <p style={{ color: "#334155", fontSize: 12, fontFamily: "system-ui" }}>No extra labels used this month.</p>
                  ) : labelEntries.map(({ name, total }) => {
                    const barPct = Math.round(total / maxLabel * 100);
                    return (
                      <div key={name} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: "#CBD5E1", fontSize: 12, fontFamily: "system-ui" }}>{name}</span>
                          <span style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui" }}>{fmt(total)}</span>
                        </div>
                        <div style={{ background: "#0F172A", borderRadius: 99, height: 5, overflow: "hidden" }}>
                          <div style={{ width: `${barPct}%`, background: "#6366F1", height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          );
        })()}

        {/* Active EMIs */}
        {activeEMIs.length > 0 && (
          <SectionCard title="📅 Active EMIs This Month">
            {emiVirtualExpenses.map((e, i, arr) => {
              const inst = myInstallments.find(x => x.id === e.emiId);
              const ccName = myCards.find(c => c.id === e.ccId)?.name;
              const { count, endDate } = inst ? emiInstallmentsLeft(inst) : { count: 0, endDate: null };
              return (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid #334155" : "none", gap: 10 }}>
                  <div>
                    <span style={{ color: "#CBD5E1", fontFamily: "system-ui", fontSize: 13 }}>{e.description}</span>
                    <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      <Tag color="#8B5CF6">Auto-EMI</Tag>
                      {ccName && <Tag color="#EC4899">💳 {ccName}</Tag>}
                      {!e.ccId && <Tag color="#334155">Cash</Tag>}
                      {count > 0 && <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>{count} left · ends {endDate}</span>}
                    </div>
                  </div>
                  <span style={{ color: "#F59E0B", fontFamily: "system-ui", fontWeight: 600 }}>{fmt(e.amount)}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748B", fontSize: 12, fontFamily: "system-ui" }}>Total EMIs this month</span>
              <span style={{ color: "#8B5CF6", fontSize: 14, fontFamily: "system-ui", fontWeight: 700 }}>{fmt(totalEMIMonthly)}</span>
            </div>
          </SectionCard>
        )}

        {/* Charts */}
        {pieData.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <Card>
              <h3 style={{ color: "#F1F5F9", margin: "0 0 12px", fontFamily: "system-ui", fontSize: 14, fontWeight: 600 }}>Spending by Category</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={46} outerRadius={72} dataKey="spent" labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie><Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8, color: "#F1F5F9", fontSize: 12 }} /></PieChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <h3 style={{ color: "#F1F5F9", margin: "0 0 12px", fontFamily: "system-ui", fontSize: 14, fontWeight: 600 }}>Budget vs Spent</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={catData.filter(c => c.budget > 0)} margin={{ left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#64748B", fontSize: 9 }} tickFormatter={v => v >= 1000 ? (v/1000)+"k" : v} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8, color: "#F1F5F9", fontSize: 12 }} />
                  <Bar dataKey="budget" fill="#334155" name="Budget" radius={[3,3,0,0]} />
                  <Bar dataKey="spent" fill="#3B82F6" name="Spent" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* CC bills due */}
        {ccDue.length > 0 && ccDue.some(cc => cc.billing) && (
          <SectionCard title="💳 Credit Card Bills Due">
            {ccDue.filter(cc => cc.billing).map((cc, i, arr) => {
              const settled = typeof cc.settled === "object" ? !!cc.settled?.[selectedMonth] : !!cc.settled;
              return (
                <div key={cc.id} style={{ borderBottom: i < arr.length - 1 ? "1px solid #334155" : "none", paddingBottom: i < arr.length - 1 ? 12 : 0, marginBottom: i < arr.length - 1 ? 12 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ color: "#CBD5E1", fontFamily: "system-ui", fontSize: 13, fontWeight: 600 }}>💳 {cc.name}</span>
                      <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "2px 0 0" }}>Statement {new Date(cc.billing.periodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} → {new Date(cc.billing.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · pay by {new Date(cc.billing.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </div>
                    <span style={{ color: settled ? "#10B981" : "#F59E0B", fontFamily: "system-ui", fontWeight: 700, fontSize: 15 }}>{settled ? "✓ Paid" : fmt(cc.statementAmount)}</span>
                  </div>
                </div>
              );
            })}
          </SectionCard>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧾 EXPENSES TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const ExpensesTab = () => {
    const blankForm = { description: "", category: cats[0], amount: "", date: today(), recurring: false, ccId: "", notes: "", split: false, splitWith: [], extraCategories: [] };
    const [filterCat, setFilterCat] = useState("All");
    const [filterCC, setFilterCC] = useState("all");
    const [filterTime, setFilterTime] = useState("current");
    const [showAdd, setShowAdd] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(blankForm);
    const [editForm, setEditForm] = useState(null);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

    const submit = () => {
      if (!form.amount || !form.description) { showToast("Fill description and amount", "error"); return; }
      updData("expenses", [...(data.expenses || []), { ...form, id: Date.now().toString(), amount: +form.amount }]);
      const over = budgets[form.category] && catTotals[form.category] + +form.amount > budgets[form.category];
      showToast(over ? "⚠️ Added — over budget!" : "Expense added");
      setForm(blankForm); setShowAdd(false);
    };
    const saveEdit = () => {
      if (!editForm.amount || !editForm.description) { showToast("Fill required fields", "error"); return; }
      updData("expenses", data.expenses.map(x => x.id === editingId ? { ...editForm, amount: +editForm.amount } : x));
      showToast("Updated!"); setEditingId(null); setEditForm(null);
    };

    const todayStr = today();
    const visible = allMonthExpenses
      .filter(e => filterCat === "All" || e.category === filterCat || (e.extraCategories || []).includes(filterCat))
      .filter(e => filterCC === "all" ? true : filterCC === "cash" ? !e.ccId : e.ccId === filterCC)
      .filter(e => filterTime === "future" ? e.date > todayStr : e.date <= todayStr)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const futureCount = allMonthExpenses.filter(e => e.date > todayStr).length;

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
          <MonthNav compact />
          <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#3B82F6")}>{showAdd ? "✕ Cancel" : "+ Add Expense"}</button>
        </div>

        {totalBudget > 0 && (
          <div style={{ background: "#1E293B", borderRadius: 10, padding: "10px 16px", marginBottom: 10, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui" }}>{usingOverallBudget ? "Overall Budget" : "Budget"}</span>
            <span style={{ color: "#F1F5F9", fontSize: 13, fontFamily: "system-ui", fontWeight: 600 }}>{fmt(totalExpenses)} / {fmt(totalBudget)}</span>
            <div style={{ flex: 1, minWidth: 120 }}><ProgressBar pct={totalBudgetPct} /></div>
            <span style={{ color: totalBudgetRemaining < 0 ? "#EF4444" : "#10B981", fontSize: 13, fontFamily: "system-ui", fontWeight: 700 }}>{totalBudgetRemaining < 0 ? "Over by " : ""}{fmt(Math.abs(totalBudgetRemaining))}{totalBudgetRemaining >= 0 ? " left" : ""}</span>
          </div>
        )}

        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 20, marginBottom: 16, border: "2px solid #3B82F630" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New Expense</h3>
            <ExpenseFormFields form={form} set={set} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={submit} style={{ ...BP(), flex: 1, padding: "11px" }}>✓ Add Expense</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 18px" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Show:</span>
          {[{ id: "current", label: "📅 To date" }, { id: "future", label: `🔮 Upcoming${futureCount > 0 ? " (" + futureCount + ")" : ""}` }].map(opt => (
            <button key={opt.id} onClick={() => setFilterTime(opt.id)} style={{ padding: "4px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: filterTime === opt.id ? 600 : 400, background: filterTime === opt.id ? "#3B82F6" : "#1E293B", color: filterTime === opt.id ? "#fff" : "#64748B" }}>{opt.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Card:</span>
          {[{ id: "all", label: "All" }, { id: "cash", label: "💵 Cash" }, ...myCards.map(cc => ({ id: cc.id, label: "💳 " + cc.name }))].map(opt => (
            <button key={opt.id} onClick={() => setFilterCC(opt.id)} style={{ padding: "4px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: filterCC === opt.id ? 600 : 400, background: filterCC === opt.id ? "#EC4899" : "#1E293B", color: filterCC === opt.id ? "#fff" : "#64748B" }}>{opt.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Cat:</span>
          {["All", ...cats].map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{ padding: "4px 11px", borderRadius: 99, border: "none", background: filterCat === c ? "#3B82F6" : "#1E293B", color: filterCat === c ? "#fff" : "#64748B", cursor: "pointer", fontSize: 12, fontFamily: "system-ui" }}>{c}</button>
          ))}
        </div>

        <div style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui", marginBottom: 10 }}>
          {visible.length} entries · <strong style={{ color: "#F59E0B" }}>{fmt(visible.reduce((s, e) => s + e.amount, 0))}</strong>
        </div>

        {visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>No expenses found.</div>
        ) : (
          <div style={{ background: "#1E293B", borderRadius: 12, overflow: "hidden" }}>
            {visible.map((e, i) => {
              const ccName = myCards.find(c => c.id === e.ccId)?.name;
              const isEditing = editingId === e.id;
              const canEdit = !e.isRecurringInstance && !e.isEmiInstance;
              return (
                <div key={e.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid #0F172A" : "none" }}>
                  {isEditing && editForm ? (
                    <div style={{ padding: "14px 16px", background: "#0F172A" }}>
                      <h4 style={{ color: "#3B82F6", margin: "0 0 12px", fontFamily: "system-ui", fontSize: 13 }}>✏️ Edit Expense</h4>
                      <ExpenseFormFields form={editForm} set={setEdit} isEdit />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveEdit} style={{ ...BP("#10B981"), padding: "9px 18px" }}>✓ Save</button>
                        <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ ...BS, padding: "9px 14px" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ color: "#F1F5F9", fontFamily: "system-ui", fontWeight: 500, fontSize: 14 }}>{e.description}</span>
                          {e.recurring && <Tag color="#10B981">🔁 Recurring</Tag>}
                          {e.isRecurringInstance && <Tag color="#475569">🔁 Auto</Tag>}
                          {e.isEmiInstance && <Tag color="#8B5CF6">📅 EMI</Tag>}
                        </div>
                        <div style={{ display: "flex", gap: 7, marginTop: 3, flexWrap: "wrap" }}>
                          <Tag color="#3B82F6">{e.category}</Tag>
                          {(e.extraCategories || []).map(ec => <Tag key={ec} color="#475569">{ec}</Tag>)}
                          <span style={{ color: "#334155", fontSize: 11, fontFamily: "system-ui" }}>{e.date}</span>
                          {ccName && <Tag color="#EC4899">💳 {ccName}</Tag>}
                          {!e.ccId && <Tag color="#334155">Cash</Tag>}
                          {e.notes && <span style={{ color: "#334155", fontSize: 11, fontFamily: "system-ui", fontStyle: "italic" }}>{e.notes}</span>}
                          {e.split && e.splitWith && e.splitWith.length > 0 && <Tag color="#F59E0B">🤝 Split</Tag>}
                          {e.split && e.splitWith && e.splitWith.map((p, pi) => p.name && <Tag key={pi} color="#F59E0B20" style={{ background: "#F59E0B15", color: "#F59E0B" }}>{p.name}: {fmt(+p.amount || 0)}</Tag>)}
                        </div>
                      </div>
                      <span style={{ color: "#F59E0B", fontFamily: "system-ui", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{fmt(e.amount)}</span>
                      <div style={{ display: "flex", gap: 5 }}>
                        {canEdit && <>
                          <button onClick={() => { setEditingId(e.id); setEditForm({ ...e, amount: String(e.amount) }); }} style={{ ...BEd, padding: "5px 8px", fontSize: 12 }}>✏️</button>
                          {e.recurring && <button onClick={() => { updData("expenses", data.expenses.map(x => x.id === e.id ? { ...x, recurring: false } : x)); showToast("Recurring stopped"); }} style={{ ...BGr, padding: "5px 8px", fontSize: 12 }}>🔁</button>}
                          <button onClick={() => { updData("expenses", data.expenses.filter(x => x.id !== e.id)); showToast("Deleted"); }} style={BD}>×</button>
                        </>}
                        {(e.isRecurringInstance || e.isEmiInstance) && <Tag color={e.isEmiInstance ? "#8B5CF6" : "#10B981"}>Auto</Tag>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(() => {
          // Build "who owes me" summary from all stored expenses (not just this month)
          const oweSummary = {};
          (data.expenses || []).forEach(e => {
            if (!e.split || !e.splitWith || e.splitWith.length === 0) return;
            e.splitWith.forEach(p => {
              if (!p.name) return;
              const name = p.name.trim();
              if (!oweSummary[name]) oweSummary[name] = { total: 0, entries: [] };
              oweSummary[name].total += +p.amount || 0;
              oweSummary[name].entries.push({ description: e.description, amount: +p.amount || 0, date: e.date });
            });
          });
          const people = Object.entries(oweSummary).filter(([, v]) => v.total > 0);
          if (people.length === 0) return null;
          return (
            <SectionCard title="🤝 Who Owes Me" style={{ marginTop: 18 }}>
              {people.map(([name, info]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ color: "#F1F5F9", fontFamily: "system-ui", fontWeight: 600, fontSize: 14 }}>👤 {name}</span>
                    <span style={{ color: "#F59E0B", fontFamily: "system-ui", fontWeight: 700, fontSize: 15 }}>{fmt(info.total)}</span>
                  </div>
                  {info.entries.map((en, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", background: "#0F172A", borderRadius: 7, marginBottom: 4 }}>
                      <span style={{ color: "#64748B", fontSize: 12, fontFamily: "system-ui" }}>{en.description} <span style={{ color: "#334155" }}>· {en.date}</span></span>
                      <span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "system-ui", fontWeight: 600 }}>{fmt(en.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ borderTop: "1px solid #334155", paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B", fontSize: 12, fontFamily: "system-ui" }}>Total owed to you</span>
                <span style={{ color: "#F59E0B", fontFamily: "system-ui", fontWeight: 700, fontSize: 14 }}>{fmt(people.reduce((s, [, v]) => s + v.total, 0))}</span>
              </div>
            </SectionCard>
          );
        })()}
      </div>
    );
  };
  // ═══════════════════════════════════════════════════════════════════════════
  const IncomeTab = () => {
    const [showAdd, setShowAdd] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ description: "", amount: "", date: today(), type: "bonus" });
    const [editForm, setEditForm] = useState(null);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isCarryover = form.type === "carryover";
    const submit = () => {
      if (!form.amount) return;
      updData("income", [...(data.income || []), { ...form, id: Date.now().toString(), amount: +form.amount }]);
      showToast("Income added"); setForm({ description: "", amount: "", date: today(), type: "bonus" }); setShowAdd(false);
    };
    const saveEdit = () => {
      updData("income", data.income.map(x => x.id === editingId ? { ...editForm, amount: +editForm.amount } : x));
      showToast("Updated!"); setEditingId(null); setEditForm(null);
    };
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#F1F5F9", margin: "0 0 3px", fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>Income</h2>
            <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>Salary: <strong style={{ color: "#10B981" }}>{fmt(salary)}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <MonthNav compact />
            <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#10B981")}>{showAdd ? "✕" : "+ Add Income"}</button>
          </div>
        </div>
        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #10B98130" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New Income Entry</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <Field label="Description" hint={isCarryover ? "e.g. February surplus" : undefined}>
                <input style={IS} value={form.description} onChange={e => set("description", e.target.value)} placeholder={isCarryover ? "February surplus…" : "Freelance, bonus, etc."} autoFocus />
              </Field>
              <Field label="Amount (LKR)"><input style={IS} type="number" value={form.amount} onChange={e => set("amount", e.target.value)} /></Field>
              <Field label={isCarryover ? "Available From" : "Date"}>
                <input style={IS} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
              </Field>
              <Field label="Type">
                <select style={IS} value={form.type} onChange={e => set("type", e.target.value)}>
                  {["carryover","bonus","freelance","rental","dividend","gift","other"].map(t => <option key={t} value={t}>{t === "carryover" ? "🔄 Carryover" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={submit} style={{ ...BP("#10B981"), flex: 1, padding: "11px" }}>✓ Add Income</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 16px" }}>Cancel</button>
            </div>
          </div>
        )}
        <Card style={{ marginBottom: 16, padding: "14px 18px" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div><p style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui", margin: "0 0 3px", textTransform: "uppercase" }}>Salary</p><p style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt(salary)}</p></div>
            <div><p style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui", margin: "0 0 3px", textTransform: "uppercase" }}>Extra Income</p><p style={{ color: "#3B82F6", fontFamily: "system-ui", fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt(monthIncome.filter(i => i.type !== "carryover").reduce((s, i) => s + i.amount, 0))}</p></div>
            {carryover > 0 && <div><p style={{ color: "#64748B", fontSize: 11, fontFamily: "system-ui", margin: "0 0 3px", textTransform: "uppercase" }}>🔄 Carryover</p><p style={{ color: "#06B6D4", fontFamily: "system-ui", fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt(carryover)}</p></div>}
          </div>
        </Card>
        {monthIncome.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>No extra income this month.</div>
        ) : (
          <div style={{ background: "#1E293B", borderRadius: 12, overflow: "hidden" }}>
            {monthIncome.map((inc, i) => (
              <div key={inc.id} style={{ borderBottom: i < monthIncome.length - 1 ? "1px solid #0F172A" : "none" }}>
                {editingId === inc.id && editForm ? (
                  <div style={{ padding: "14px 16px", background: "#0F172A" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <Field label="Description"><input style={IS} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></Field>
                      <Field label="Amount"><input style={IS} type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} /></Field>
                      <Field label="Date"><input style={IS} type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} /></Field>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit} style={{ ...BP("#10B981"), padding: "9px 18px" }}>✓ Save</button>
                      <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ ...BS, padding: "9px 14px" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "#F1F5F9", fontFamily: "system-ui", fontSize: 14 }}>{inc.description || inc.type}</span>
                      <div style={{ display: "flex", gap: 7, marginTop: 3 }}>
                        <Tag color={inc.type === "carryover" ? "#06B6D4" : "#10B981"}>{inc.type === "carryover" ? "🔄 Carryover" : inc.type}</Tag>
                        <span style={{ color: "#334155", fontSize: 11, fontFamily: "system-ui" }}>{inc.date}</span>
                      </div>
                    </div>
                    <span style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>{fmt(inc.amount)}</span>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => { setEditingId(inc.id); setEditForm({ ...inc, amount: String(inc.amount) }); }} style={{ ...BEd, padding: "5px 8px", fontSize: 12 }}>✏️</button>
                      <button onClick={() => { updData("income", data.income.filter(x => x.id !== inc.id)); showToast("Deleted"); }} style={BD}>×</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 💳 CREDIT CARDS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const CCTab = () => {
    const blankCC = { name: "", limit: "", billingCloseDay: "25", dueDays: "20" };
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState(blankCC);
    const [editingCCId, setEditingCCId] = useState(null);
    const [editCCForm, setEditCCForm] = useState(null);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setEdit = (k, v) => setEditCCForm(f => ({ ...f, [k]: v }));
    const addCC = () => {
      if (!form.name) { showToast("Enter card name", "error"); return; }
      updData("creditCards", [...myCards, { ...form, id: Date.now().toString(), limit: +form.limit || 0, billingCloseDay: +form.billingCloseDay || 25, dueDays: +form.dueDays || 20 }]);
      showToast("Card added"); setForm(blankCC); setShowAdd(false);
    };
    const saveEditCC = () => {
      if (!editCCForm.name) { showToast("Card name required", "error"); return; }
      updData("creditCards", myCards.map(cc => cc.id === editingCCId ? { ...cc, name: editCCForm.name, limit: +editCCForm.limit || 0, billingCloseDay: +editCCForm.billingCloseDay || 25, dueDays: +editCCForm.dueDays || 20 } : cc));
      showToast("Card updated!"); setEditingCCId(null); setEditCCForm(null);
    };
    const markSettled = (ccId, mk) => {
      const settled = data.creditCards.find(cc => cc.id === ccId)?.settled || {};
      const newSettled = typeof settled === "object" && !Array.isArray(settled) ? { ...settled, [mk]: !settled[mk] } : { [mk]: true };
      updData("creditCards", data.creditCards.map(cc => cc.id === ccId ? { ...cc, settled: newSettled } : cc));
    };
    const isSettled = (cc, mk) => { if (!cc.settled) return false; if (typeof cc.settled === "boolean") return cc.settled; return !!cc.settled[mk]; };
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#F1F5F9", margin: "0 0 3px", fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>Credit Cards</h2>
            <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>Total due: <strong style={{ color: "#F59E0B" }}>{fmt(ccDue.reduce((s, c) => s + (c.statementAmount || 0), 0))}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <MonthNav compact />
            <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#EC4899")}>{showAdd ? "✕" : "+ Add Card"}</button>
          </div>
        </div>
        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #EC489930" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New Credit Card</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
              <Field label="Card Name"><input style={IS} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Visa Signature, Amex Gold…" autoFocus /></Field>
              <Field label="Credit Limit"><input style={IS} type="number" value={form.limit} onChange={e => set("limit", e.target.value)} placeholder="0 = no limit" /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <Field label="Billing Close Day"><input style={IS} type="number" min="1" max="31" value={form.billingCloseDay} onChange={e => set("billingCloseDay", e.target.value)} /></Field>
              <Field label="Payment Due (days after close)"><input style={IS} type="number" value={form.dueDays} onChange={e => set("dueDays", e.target.value)} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addCC} style={{ ...BP("#EC4899"), flex: 1, padding: "11px" }}>✓ Add Card</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 16px" }}>Cancel</button>
            </div>
          </div>
        )}
        {myCards.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>No cards added yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {ccDue.map(cc => {
              const { closed, open, closedAmount, closedExpenses, closedEmiCharges, openAmount, openExpenses, openEmiCharges, closeDay, emiRemainingOnCard, availableBalance } = cc;
              const dueDaysVal = cc.dueDays || 20;
              const settled = isSettled(cc, selectedMonth);
              const utilPct = cc.limit > 0 ? Math.round(openAmount / cc.limit * 100) : 0;
              const allClosedTx = [...(closedExpenses || []), ...(closedEmiCharges || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
              const allOpenTx = [...(openExpenses || []), ...(openEmiCharges || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
              return (
                <Card key={cc.id} accent="#EC4899">
                  {editingCCId === cc.id && editCCForm ? (
                    <div style={{ marginBottom: 14, background: "#0F172A", borderRadius: 10, padding: 14 }}>
                      <p style={{ color: "#EC4899", fontSize: 12, fontFamily: "system-ui", margin: "0 0 12px", fontWeight: 600 }}>✏️ Edit Card</p>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
                        <Field label="Card Name"><input style={IS} value={editCCForm.name} onChange={e => setEdit("name", e.target.value)} autoFocus /></Field>
                        <Field label="Credit Limit"><input style={IS} type="number" value={editCCForm.limit} onChange={e => setEdit("limit", e.target.value)} /></Field>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                        <Field label="Billing Close Day"><input style={IS} type="number" value={editCCForm.billingCloseDay} onChange={e => setEdit("billingCloseDay", e.target.value)} /></Field>
                        <Field label="Due Days After Close"><input style={IS} type="number" value={editCCForm.dueDays} onChange={e => setEdit("dueDays", e.target.value)} /></Field>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveEditCC} style={{ ...BP("#10B981"), padding: "8px 18px" }}>✓ Save</button>
                        <button onClick={() => { setEditingCCId(null); setEditCCForm(null); }} style={{ ...BS, padding: "8px 14px" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <h3 style={{ color: "#F1F5F9", margin: "0 0 4px", fontFamily: "system-ui", fontSize: 16, fontWeight: 700 }}>💳 {cc.name}</h3>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Closes {closeDay}th · Due {dueDaysVal} days later</span>
                          {cc.limit > 0 && <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>Limit: {fmt(cc.limit)}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditingCCId(cc.id); setEditCCForm({ name: cc.name, limit: String(cc.limit || ""), billingCloseDay: String(cc.billingCloseDay || "25"), dueDays: String(cc.dueDays || "20") }); }} style={{ ...BEd, padding: "6px 10px" }}>✏️</button>
                        <button onClick={() => { if (window.confirm(`Remove ${cc.name}?`)) { updData("creditCards", myCards.filter(c => c.id !== cc.id)); showToast("Card removed"); } }} style={{ ...BD, padding: "6px 10px" }}>×</button>
                      </div>
                    </div>
                  )}
                  {/* Statement */}
                  <div style={{ background: settled ? "#10B98115" : "#F59E0B10", border: `1px solid ${settled ? "#10B98130" : "#F59E0B30"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <p style={{ color: "#64748B", fontSize: 10, margin: "0 0 3px", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 0.8 }}>📋 Last statement</p>
                        <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: 0 }}>Charges: {new Date(closed.start + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} → {new Date(closed.end + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                        <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "2px 0 0" }}>Pay by: <strong style={{ color: settled ? "#10B981" : "#F59E0B" }}>{new Date(closed.dueDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong></p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ color: settled ? "#10B981" : "#F59E0B", fontFamily: "system-ui", fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>{fmt(closedAmount)}</p>
                        <button onClick={() => markSettled(cc.id, selectedMonth)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${settled ? "#10B98150" : "#F59E0B50"}`, background: "transparent", color: settled ? "#10B981" : "#F59E0B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui" }}>{settled ? "✓ Paid" : "Mark Paid"}</button>
                      </div>
                    </div>
                    {closedAmount === 0 && <p style={{ color: "#334155", fontSize: 11, fontFamily: "system-ui", margin: 0 }}>No charges in this statement period.</p>}
                    {allClosedTx.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", cursor: "pointer" }}>{allClosedTx.length} transaction{allClosedTx.length !== 1 ? "s" : ""}</summary>
                        <div style={{ marginTop: 8 }}>{allClosedTx.map((e, i) => (
                          <div key={e.id || i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < allClosedTx.length - 1 ? "1px solid #0F172A" : "none" }}>
                            <div><span style={{ color: "#CBD5E1", fontFamily: "system-ui", fontSize: 12 }}>{e.description}</span>{e.isEmi && <span style={{ color: "#8B5CF6", fontSize: 10, marginLeft: 6 }}>EMI</span>}<span style={{ color: "#334155", fontSize: 11, marginLeft: 8 }}>{e.date}</span></div>
                            <span style={{ color: "#F59E0B", fontFamily: "system-ui", fontSize: 12, fontWeight: 600 }}>{fmt(e.amount)}</span>
                          </div>
                        ))}</div>
                      </details>
                    )}
                  </div>
                  {/* Current period */}
                  <div style={{ background: "#0F172A", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <p style={{ color: "#64748B", fontSize: 10, margin: 0, fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 0.8 }}>🔄 Current period</p>
                      <p style={{ color: "#3B82F6", fontFamily: "system-ui", fontSize: 16, fontWeight: 700, margin: 0 }}>{fmt(openAmount)}</p>
                    </div>
                    <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "0 0 6px" }}>{new Date(open.start + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} → {new Date(open.end + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    {allOpenTx.length > 0 && (
                      <details>
                        <summary style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", cursor: "pointer" }}>{allOpenTx.length} transaction{allOpenTx.length !== 1 ? "s" : ""}</summary>
                        <div style={{ marginTop: 8 }}>{allOpenTx.map((e, i) => (
                          <div key={e.id || i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < allOpenTx.length - 1 ? "1px solid #1E293B" : "none" }}>
                            <div><span style={{ color: "#CBD5E1", fontFamily: "system-ui", fontSize: 12 }}>{e.description}</span>{e.isEmi && <span style={{ color: "#8B5CF6", fontSize: 10, marginLeft: 6 }}>EMI</span>}<span style={{ color: "#334155", fontSize: 11, marginLeft: 8 }}>{e.date}</span></div>
                            <span style={{ color: "#3B82F6", fontFamily: "system-ui", fontSize: 12, fontWeight: 600 }}>{fmt(e.amount)}</span>
                          </div>
                        ))}</div>
                      </details>
                    )}
                    {openAmount === 0 && <p style={{ color: "#334155", fontSize: 11, fontFamily: "system-ui", margin: 0 }}>No charges yet.</p>}
                    {cc.limit > 0 && <div style={{ marginTop: 8 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ color: "#475569", fontSize: 10, fontFamily: "system-ui" }}>Utilisation</span><span style={{ color: progressColor(utilPct), fontSize: 10, fontFamily: "system-ui", fontWeight: 600 }}>{utilPct}%</span></div><ProgressBar pct={utilPct} color="#3B82F6" /></div>}
                  </div>
                  {/* Available balance panel */}
                  {cc.limit > 0 && availableBalance !== null && (
                    <div style={{ background: "#0F172A", borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
                      <p style={{ color: "#64748B", fontSize: 10, margin: "0 0 10px", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 0.8 }}>💳 Credit Limit Breakdown</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                        <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 12px" }}><p style={{ color: "#64748B", fontSize: 10, margin: "0 0 3px", fontFamily: "system-ui", textTransform: "uppercase" }}>Total Limit</p><p style={{ color: "#CBD5E1", fontFamily: "system-ui", fontSize: 15, fontWeight: 700, margin: 0 }}>{fmt(cc.limit)}</p></div>
                        <div style={{ background: "#EF444410", border: "1px solid #EF444430", borderRadius: 8, padding: "10px 12px" }}><p style={{ color: "#64748B", fontSize: 10, margin: "0 0 3px", fontFamily: "system-ui", textTransform: "uppercase" }}>EMI Outstanding</p><p style={{ color: "#EF4444", fontFamily: "system-ui", fontSize: 15, fontWeight: 700, margin: 0 }}>{fmt(emiRemainingOnCard)}</p><p style={{ color: "#475569", fontSize: 10, margin: "2px 0 0", fontFamily: "system-ui" }}>locked by active EMIs</p></div>
                        <div style={{ background: availableBalance < cc.limit * 0.2 ? "#EF444415" : "#10B98115", border: "1px solid " + (availableBalance < cc.limit * 0.2 ? "#EF444430" : "#10B98130"), borderRadius: 8, padding: "10px 12px" }}><p style={{ color: "#64748B", fontSize: 10, margin: "0 0 3px", fontFamily: "system-ui", textTransform: "uppercase" }}>Available Now</p><p style={{ color: availableBalance < cc.limit * 0.2 ? "#EF4444" : "#10B981", fontFamily: "system-ui", fontSize: 15, fontWeight: 700, margin: 0 }}>{fmt(availableBalance)}</p><p style={{ color: "#475569", fontSize: 10, margin: "2px 0 0", fontFamily: "system-ui" }}>after EMIs + open charges</p></div>
                      </div>
                      <div style={{ height: 10, borderRadius: 99, background: "#334155", overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${Math.min(100, Math.round(emiRemainingOnCard / cc.limit * 100))}%`, background: "#EF4444", transition: "width 0.4s" }} />
                        <div style={{ width: `${Math.min(100 - Math.round(emiRemainingOnCard / cc.limit * 100), Math.round(openAmount / cc.limit * 100))}%`, background: "#F59E0B", transition: "width 0.4s" }} />
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                        <span style={{ color: "#EF4444", fontSize: 10, fontFamily: "system-ui" }}>● EMI balance</span>
                        <span style={{ color: "#F59E0B", fontSize: 10, fontFamily: "system-ui" }}>● Current charges</span>
                        <span style={{ color: "#10B981", fontSize: 10, fontFamily: "system-ui" }}>● Available</span>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 📅 EMI TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const EMITab = () => {
    const blankForm = { name: "", type: "emi", category: "Fixed", extraCategories: [], monthly: "", total: "", remaining: "", ccId: "", startDate: today(), dueUntil: "", setupFee: "" };
    const [showAdd, setShowAdd] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [form, setForm] = useState(blankForm);
    const [filterCC, setFilterCC] = useState("all");
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

    const filteredInstallments = myInstallments
      .filter(inst => {
        if (filterCC === "all") return true;
        if (filterCC === "cash") return !inst.ccId;
        return inst.ccId === filterCC;
      })
      .sort((a, b) => {
        const calcA = emiCalcFromDates(a);
        const calcB = emiCalcFromDates(b);
        const doneA = (calcA.isAutoCalc && calcA.installmentsTotal !== null ? calcA.remaining : (a.remaining ?? a.total ?? 0)) <= 0 || (calcA.installmentsLeft !== null && calcA.installmentsLeft <= 0);
        const doneB = (calcB.isAutoCalc && calcB.installmentsTotal !== null ? calcB.remaining : (b.remaining ?? b.total ?? 0)) <= 0 || (calcB.installmentsLeft !== null && calcB.installmentsLeft <= 0);
        // Completed go to bottom
        if (doneA && !doneB) return 1;
        if (!doneA && doneB) return -1;
        // Both active — sort by months remaining ascending (least remaining first)
        const leftA = calcA.installmentsLeft ?? 9999;
        const leftB = calcB.installmentsLeft ?? 9999;
        return leftA - leftB;
      });

    const formPreview = (() => {
      if (!form.monthly || !form.startDate) return null;
      const monthly = +form.monthly;
      const total = +form.total || 0;
      const dueUntil = form.dueUntil || null;
      if (monthly <= 0) return null;
      let installmentsTotal = null;
      if (total > 0) installmentsTotal = Math.round(total / monthly);
      if (!installmentsTotal && dueUntil) {
        const start = new Date(form.startDate); const end = new Date(dueUntil);
        installmentsTotal = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
      }
      if (!installmentsTotal) return null;
      return { installmentsTotal, totalAmt: installmentsTotal * monthly };
    })();

    const submit = () => {
      if (!form.name || !form.monthly || !form.total) { showToast("Fill name, monthly amount, and total", "error"); return; }
      const emiId = Date.now().toString();
      const startDate = form.startDate || today();
      const monthly = +form.monthly;
      const total = +form.total;
      const setupFee = +form.setupFee || 0;
      const newEMI = { ...form, id: emiId, monthly, total, remaining: +(form.remaining || form.total) };
      const firstExpense = { id: (Date.now() + 1).toString(), description: `EMI: ${form.name}`, amount: monthly, date: startDate, category: form.category || "Fixed", extraCategories: form.extraCategories || [], ccId: form.ccId || "", recurring: false, notes: `First installment — EMI: ${form.name}`, emiId, isEmiInstance: true };
      const newExpenses = [firstExpense];
      if (setupFee > 0) newExpenses.push({ id: (Date.now() + 2).toString(), description: `Setup fee: ${form.name}`, amount: setupFee, date: startDate, category: form.category || "Fixed", ccId: form.ccId || "", recurring: false, notes: `Setup fee for EMI: ${form.name}`, emiId, isSetupFee: true });
      updDataMulti({ installments: [...myInstallments, newEMI], expenses: [...(data.expenses || []), ...newExpenses] });
      showToast("EMI added ✓"); setShowAdd(false); setForm(blankForm);
    };

    const totalActive = myInstallments.filter(i => getEffectiveEmiRemaining(i) > 0).reduce((s, i) => s + i.monthly, 0);

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#F1F5F9", margin: "0 0 3px", fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>EMIs & Loans</h2>
            <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>Monthly outgoing: <strong style={{ color: "#8B5CF6" }}>{fmt(totalActive)}</strong></p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#3B82F6")}>{showAdd ? "✕" : "+ Add EMI / Loan"}</button>
        </div>

        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #8B5CF630" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New EMI / Loan</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Field label="Name"><input style={IS} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Car loan, phone EMI…" autoFocus /></Field>
              <Field label="Type">
                <select style={IS} value={form.type} onChange={e => set("type", e.target.value)}>
                  {["emi","loan","mortgage","personal loan","other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Primary Category" hint="Counts toward budget">
                <select style={IS} value={form.category} onChange={e => set("category", e.target.value)}>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", color: "#64748B", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Also tagged as <span style={{ color: "#334155", fontWeight: 400 }}>(optional — label only)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", background: "#0F172A", borderRadius: 9, border: "2px solid #334155" }}>
                {cats.filter(c => c !== form.category).map(c => {
                  const selected = (form.extraCategories || []).includes(c);
                  return <button key={c} type="button" onClick={() => { const cur = form.extraCategories || []; set("extraCategories", selected ? cur.filter(x => x !== c) : [...cur, c]); }} style={{ padding: "3px 10px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: selected ? 600 : 400, background: selected ? "#8B5CF6" : "#1E293B", color: selected ? "#fff" : "#64748B", transition: "all 0.15s" }}>{c}</button>;
                })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Field label="Monthly (LKR)"><input style={IS} type="number" value={form.monthly} onChange={e => set("monthly", e.target.value)} /></Field>
              <Field label="Total (LKR)"><input style={IS} type="number" value={form.total} onChange={e => set("total", e.target.value)} /></Field>
              <Field label="Remaining (LKR)" hint="Leave blank if new"><input style={IS} type="number" value={form.remaining} onChange={e => set("remaining", e.target.value)} placeholder="= Total" /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Field label="Pay via">
                <select style={IS} value={form.ccId} onChange={e => set("ccId", e.target.value)}>
                  <option value="">Cash / Debit</option>
                  {myCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                </select>
              </Field>
              <Field label="Start Date"><input style={IS} type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field>
              <Field label="End Date (Last Installment)" hint="Sets the final payment date"><input style={IS} type="date" value={form.dueUntil} onChange={e => set("dueUntil", e.target.value)} /></Field>
              <Field label="Setup Fee (optional)"><input style={IS} type="number" value={form.setupFee} onChange={e => set("setupFee", e.target.value)} placeholder="0 = none" /></Field>
            </div>
            {formPreview && (
              <div style={{ background: "#8B5CF615", border: "1px solid #8B5CF630", borderRadius: 9, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Total Installments</span><p style={{ color: "#8B5CF6", fontFamily: "system-ui", fontSize: 16, fontWeight: 700, margin: "2px 0 0" }}>{formPreview.installmentsTotal} months</p></div>
                <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Total Payable</span><p style={{ color: "#F59E0B", fontFamily: "system-ui", fontSize: 16, fontWeight: 700, margin: "2px 0 0" }}>{fmt(formPreview.totalAmt)}</p></div>
                {form.dueUntil && <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Final Payment</span><p style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 16, fontWeight: 700, margin: "2px 0 0" }}>{new Date(form.dueUntil).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p></div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={submit} style={{ ...BP("#8B5CF6"), flex: 1, padding: "11px" }}>✓ Add EMI / Loan</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 16px" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Filter pills */}
        {myInstallments.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[{ id: "all", label: "All" }, { id: "cash", label: "💵 Cash / Debit" }, ...myCards.map(cc => ({ id: cc.id, label: "💳 " + cc.name }))].map(opt => (
              <button key={opt.id} onClick={() => setFilterCC(opt.id)} style={{ padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: filterCC === opt.id ? 600 : 400, background: filterCC === opt.id ? "#8B5CF6" : "#1E293B", color: filterCC === opt.id ? "#fff" : "#64748B" }}>{opt.label}</button>
            ))}
          </div>
        )}

        {myInstallments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>No EMIs or loans tracked.</div>
        ) : filteredInstallments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#334155", fontFamily: "system-ui" }}>No EMIs match this filter.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredInstallments.map(inst => {
              const calc = emiCalcFromDates(inst);
              const rem = calc.isAutoCalc && calc.installmentsTotal !== null ? calc.remaining : (inst.remaining ?? inst.total ?? 0);
              const paid = calc.isAutoCalc && calc.installmentsTotal !== null ? calc.paid : (inst.total - rem);
              const installmentsPaid = calc.installmentsPaid;
              const installmentsTotal = calc.installmentsTotal;
              const installmentsLeft = calc.installmentsLeft;
              const endDate = calc.endDate;
              const total = inst.total || 0;
              const pct = total > 0 ? Math.round(paid / total * 100) : (installmentsTotal && installmentsTotal > 0 ? Math.round(installmentsPaid / installmentsTotal * 100) : 0);
              const done = rem <= 0 || (installmentsLeft !== null && installmentsLeft <= 0);
              const ccName = myCards.find(c => c.id === inst.ccId)?.name;
              const isEditing = editingId === inst.id;
              return (
                <div key={inst.id} style={{ background: "#1E293B", borderRadius: 12, padding: 20, opacity: done ? 0.65 : 1, border: done ? "none" : "1px solid #334155" }}>
                  {isEditing && editForm ? (
                    <div>
                      <h4 style={{ color: "#3B82F6", margin: "0 0 12px", fontFamily: "system-ui" }}>✏️ Edit EMI</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <Field label="Name"><input style={IS} value={editForm.name} onChange={e => setEdit("name", e.target.value)} /></Field>
                        <Field label="Type"><select style={IS} value={editForm.type || "emi"} onChange={e => setEdit("type", e.target.value)}>{["emi","loan","mortgage","personal loan","other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></Field>
                        <Field label="Primary Category" hint="Counts toward budget"><select style={IS} value={editForm.category || "Fixed"} onChange={e => setEdit("category", e.target.value)}>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", color: "#64748B", fontSize: 11, fontFamily: "system-ui", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Also tagged as <span style={{ color: "#334155", fontWeight: 400 }}>(optional — label only)</span></label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", background: "#0F172A", borderRadius: 9, border: "2px solid #334155" }}>
                          {cats.filter(c => c !== (editForm.category || "Fixed")).map(c => {
                            const selected = (editForm.extraCategories || []).includes(c);
                            return <button key={c} type="button" onClick={() => { const cur = editForm.extraCategories || []; setEdit("extraCategories", selected ? cur.filter(x => x !== c) : [...cur, c]); }} style={{ padding: "3px 10px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", fontWeight: selected ? 600 : 400, background: selected ? "#8B5CF6" : "#1E293B", color: selected ? "#fff" : "#64748B", transition: "all 0.15s" }}>{c}</button>;
                          })}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <Field label="Monthly (LKR)"><input style={IS} type="number" value={editForm.monthly} onChange={e => setEdit("monthly", e.target.value)} /></Field>
                        <Field label="Total (LKR)"><input style={IS} type="number" value={editForm.total || ""} onChange={e => setEdit("total", e.target.value)} /></Field>
                        <Field label="Remaining (LKR)" hint="Override auto-calc"><input style={IS} type="number" value={editForm.remaining} onChange={e => setEdit("remaining", e.target.value)} placeholder="Auto from dates" /></Field>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <Field label="Pay via"><select style={IS} value={editForm.ccId || ""} onChange={e => setEdit("ccId", e.target.value)}><option value="">Cash / Debit</option>{myCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}</select></Field>
                        <Field label="Start Date"><input style={IS} type="date" value={editForm.startDate || ""} onChange={e => setEdit("startDate", e.target.value)} /></Field>
                        <Field label="End Date"><input style={IS} type="date" value={editForm.dueUntil || ""} onChange={e => setEdit("dueUntil", e.target.value)} /></Field>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => {
                          const updatedEMI = { ...editForm, monthly: +editForm.monthly, total: +editForm.total || 0, remaining: editForm.remaining !== "" ? +editForm.remaining : undefined };
                          const updatedExpenses = data.expenses.map(x => {
                            if (x.emiId !== editingId) return x;
                            return {
                              ...x,
                              category: updatedEMI.category || x.category,
                              extraCategories: updatedEMI.extraCategories || [],
                              ccId: updatedEMI.ccId || "",
                            };
                          });
                          updDataMulti({ installments: data.installments.map(x => x.id === editingId ? updatedEMI : x), expenses: updatedExpenses });
                          showToast("Updated ✓"); setEditingId(null); setEditForm(null);
                        }} style={{ ...BP("#10B981"), padding: "9px 18px" }}>✓ Save</button>
                        <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ ...BS, padding: "9px 14px" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <h3 style={{ color: done ? "#475569" : "#F1F5F9", margin: 0, fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>{inst.name}</h3>
                            <Tag color="#8B5CF6">{inst.type || "EMI"}</Tag>
                            {done && <Tag color="#10B981">✓ Paid Off</Tag>}
                            {calc.isAutoCalc && <Tag color="#06B6D4">🔄 Auto-calc</Tag>}
                            {ccName && <Tag color="#EC4899">💳 {ccName}</Tag>}
                            {!inst.ccId && <Tag color="#334155">Cash</Tag>}
                          </div>
                          <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "4px 0 0" }}>
                            <Tag color="#8B5CF6">{inst.category}</Tag>
                            {(inst.extraCategories || []).map(ec => <Tag key={ec} color="#475569" style={{ marginLeft: 4 }}>{ec}</Tag>)}
                            <span style={{ marginLeft: 6 }}>{fmt(inst.monthly)}/mo{endDate ? ` · ends ${endDate}` : ""}</span>
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ color: done ? "#10B981" : "#EF4444", fontFamily: "system-ui", fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt(rem)}</p>
                          <p style={{ color: "#475569", fontSize: 10, fontFamily: "system-ui", margin: "2px 0 0" }}>remaining</p>
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui" }}>{installmentsPaid !== undefined ? `${installmentsPaid} paid` : ""}{installmentsLeft !== null && installmentsLeft !== undefined ? ` · ${installmentsLeft} left` : ""}</span>
                          <span style={{ color: progressColor(pct), fontSize: 11, fontFamily: "system-ui", fontWeight: 600 }}>{pct}%</span>
                        </div>
                        <ProgressBar pct={pct} color={done ? "#10B981" : undefined} />
                      </div>
                      {calc.isAutoCalc && installmentsTotal && (
                        <div style={{ background: "#0F172A", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Paid</span><p style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 13, fontWeight: 700, margin: "2px 0 0" }}>{installmentsPaid}/{installmentsTotal}</p></div>
                          <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Left</span><p style={{ color: "#F59E0B", fontFamily: "system-ui", fontSize: 13, fontWeight: 700, margin: "2px 0 0" }}>{installmentsLeft} months</p></div>
                          {inst.total > 0 && <div><span style={{ color: "#64748B", fontSize: 10, fontFamily: "system-ui", textTransform: "uppercase" }}>Amount Paid</span><p style={{ color: "#3B82F6", fontFamily: "system-ui", fontSize: 13, fontWeight: 700, margin: "2px 0 0" }}>{fmt(paid)}</p></div>}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={() => { setEditingId(inst.id); setEditForm({ ...inst, monthly: String(inst.monthly), total: String(inst.total || ""), remaining: inst.remaining !== undefined ? String(inst.remaining) : "" }); }} style={{ ...BEd, padding: "6px 12px", fontSize: 12 }}>✏️ Edit</button>
                        <button onClick={() => { if (window.confirm("Delete this EMI?")) { updDataMulti({ installments: data.installments.filter(x => x.id !== inst.id), expenses: (data.expenses || []).filter(e => e.emiId !== inst.id) }); showToast("EMI deleted"); } }} style={{ ...BD, padding: "6px 12px", fontSize: 12 }}>🗑 Delete</button>
                        {!done && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                            <input type="number" placeholder="Payment amt" style={{ ...IS, width: 130, fontSize: 12, padding: "6px 10px" }} id={`pay_${inst.id}`} />
                            <button onClick={() => {
                              const el = document.getElementById(`pay_${inst.id}`);
                              const amt = +el.value;
                              if (amt > 0) {
                                const newExpense = { id: Date.now().toString(), description: `EMI Payment: ${inst.name}`, amount: amt, date: today(), category: inst.category || "Fixed", ccId: inst.ccId || "", notes: `Manual payment for EMI: ${inst.name}`, emiId: inst.id, isEmiInstance: true };
                                const updatedInstallments = data.installments.map(i => i.id === inst.id ? { ...i, remaining: Math.max(0, (i.remaining ?? i.total ?? 0) - amt) } : i);
                                updDataMulti({ installments: updatedInstallments, expenses: [...(data.expenses || []), newExpense] });
                                el.value = ""; showToast("Payment recorded ✓");
                              }
                            }} style={BGr}>Pay</button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🏦 SAVINGS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const SavingsTab = () => {
    const [showAdd, setShowAdd] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [form, setForm] = useState({ name: "", balance: "", target: "", category: "" });
    const savings = data.savings || [];
    const savingsContributions = (svId) => (data.expenses || []).filter(e => e.fromSavingsId === svId);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#F1F5F9", margin: "0 0 3px", fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>Savings</h2>
            <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>Total: <strong style={{ color: "#10B981" }}>{fmt(totalSavingsBalance)}</strong></p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#10B981")}>{showAdd ? "✕" : "+ Add Account"}</button>
        </div>
        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #10B98130" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New Savings Account</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <Field label="Account Name"><input style={IS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Emergency fund, vacation…" autoFocus /></Field>
              <Field label="Current Balance"><input style={IS} type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} /></Field>
              <Field label="Target (optional)"><input style={IS} type="number" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="Goal amount" /></Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (!form.name) return; updData("savings", [...savings, { ...form, id: Date.now().toString(), balance: +form.balance || 0, target: +form.target || 0 }]); setForm({ name: "", balance: "", target: "", category: "" }); setShowAdd(false); showToast("Account added"); }} style={{ ...BP("#10B981"), flex: 1, padding: "11px" }}>✓ Add Account</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 16px" }}>Cancel</button>
            </div>
          </div>
        )}
        {savings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>No savings accounts yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {savings.map(sv => {
              const pct = sv.target > 0 ? Math.min(100, Math.round(sv.balance / sv.target * 100)) : 0;
              const [addAmt, setAddAmt] = useState("");
              return (
                <Card key={sv.id} accent="#10B981">
                  {editingId === sv.id && editForm ? (
                    <div>
                      <h4 style={{ color: "#10B981", margin: "0 0 12px", fontFamily: "system-ui" }}>✏️ Edit Account</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <Field label="Name"><input style={IS} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></Field>
                        <Field label="Balance"><input style={IS} type="number" value={editForm.balance} onChange={e => setEditForm(f => ({ ...f, balance: e.target.value }))} /></Field>
                        <Field label="Target"><input style={IS} type="number" value={editForm.target || ""} onChange={e => setEditForm(f => ({ ...f, target: e.target.value }))} /></Field>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { updData("savings", savings.map(x => x.id === sv.id ? { ...editForm, balance: +editForm.balance, target: +editForm.target || 0 } : x)); setEditingId(null); setEditForm(null); showToast("Updated!"); }} style={{ ...BP("#10B981"), padding: "9px 18px" }}>✓ Save</button>
                        <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ ...BS, padding: "9px 14px" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div><h3 style={{ color: "#F1F5F9", margin: "0 0 4px", fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>🏦 {sv.name}</h3>{sv.target > 0 && <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: 0 }}>Goal: {fmt(sv.target)} · {pct}%</p>}</div>
                        <div style={{ textAlign: "right" }}><p style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 20, fontWeight: 700, margin: 0 }}>{fmt(sv.balance)}</p></div>
                      </div>
                      {sv.target > 0 && <div style={{ marginBottom: 12 }}><ProgressBar pct={pct} color="#10B981" /></div>}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={() => { setEditingId(sv.id); setEditForm({ ...sv, balance: String(sv.balance), target: String(sv.target || "") }); }} style={{ ...BEd, padding: "6px 10px", fontSize: 12 }}>✏️</button>
                        <button onClick={() => { if (window.confirm("Delete this account?")) { updData("savings", savings.filter(x => x.id !== sv.id)); showToast("Deleted"); } }} style={{ ...BD, padding: "6px 10px", fontSize: 12 }}>×</button>
                        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                          <input type="number" value={addAmt} onChange={e => setAddAmt(e.target.value)} placeholder="Add amount" style={{ ...IS, width: 130, fontSize: 12, padding: "6px 10px" }} />
                          <button onClick={() => { if (+addAmt > 0) { const newExp = { id: Date.now().toString(), description: `Savings: ${sv.name}`, amount: +addAmt, date: today(), category: "Fixed", notes: `Contribution to ${sv.name}`, fromSavingsId: sv.id }; updDataMulti({ savings: savings.map(x => x.id === sv.id ? { ...x, balance: x.balance + +addAmt } : x), expenses: [...(data.expenses || []), newExp] }); setAddAmt(""); showToast("Contribution added ✓"); } }} style={BGr}>+ Add</button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 📈 INVESTMENTS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const InvestmentsTab = () => {
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: "", balance: "", type: "stocks" });
    const investments = data.investments || [];
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: "#F1F5F9", margin: "0 0 3px", fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>Investments</h2>
            <p style={{ color: "#475569", margin: 0, fontSize: 12, fontFamily: "system-ui" }}>Total: <strong style={{ color: "#8B5CF6" }}>{fmt(totalInvestmentsBalance)}</strong></p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} style={BP(showAdd ? "#475569" : "#8B5CF6")}>{showAdd ? "✕" : "+ Add Investment"}</button>
        </div>
        {showAdd && (
          <div style={{ background: "#1E293B", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #8B5CF630" }}>
            <h3 style={{ color: "#F1F5F9", margin: "0 0 14px", fontFamily: "system-ui", fontSize: 15 }}>New Investment</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <Field label="Name"><input style={IS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Index fund, crypto…" autoFocus /></Field>
              <Field label="Current Value"><input style={IS} type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} /></Field>
              <Field label="Type"><select style={IS} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{["stocks","crypto","real estate","bonds","mutual funds","other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { if (!form.name) return; updData("investments", [...investments, { ...form, id: Date.now().toString(), balance: +form.balance || 0 }]); setForm({ name: "", balance: "", type: "stocks" }); setShowAdd(false); showToast("Investment added"); }} style={{ ...BP("#8B5CF6"), flex: 1, padding: "11px" }}>✓ Add</button>
              <button onClick={() => setShowAdd(false)} style={{ ...BS, padding: "11px 16px" }}>Cancel</button>
            </div>
          </div>
        )}
        {investments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#334155", fontFamily: "system-ui" }}><div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>No investments tracked yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {investments.map(inv => {
              const [addAmt, setAddAmt] = useState("");
              const [setAmt, setSetAmt] = useState("");
              return (
                <Card key={inv.id} accent="#8B5CF6">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div><h3 style={{ color: "#F1F5F9", margin: "0 0 4px", fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>📈 {inv.name}</h3><Tag color="#8B5CF6">{inv.type}</Tag></div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "#8B5CF6", fontFamily: "system-ui", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{fmt(inv.balance)}</p>
                      <button onClick={() => { if (window.confirm("Delete this investment?")) { updData("investments", investments.filter(x => x.id !== inv.id)); showToast("Deleted"); } }} style={{ ...BD, padding: "4px 8px", fontSize: 11 }}>×</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ color: "#475569", fontSize: 10, margin: "0 0 5px", fontFamily: "system-ui", textTransform: "uppercase" }}>Add contribution</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" value={addAmt} onChange={e => setAddAmt(e.target.value)} placeholder="Amount" style={{ ...IS, width: 120, fontSize: 12, padding: "6px 10px" }} />
                        <button onClick={() => { if (+addAmt > 0) { const newExpense = { id: Date.now().toString(), description: `Investment: ${inv.name}`, amount: +addAmt, date: today(), category: "Fixed", notes: `Contribution to ${inv.name}`, fromInvestmentId: inv.id }; updDataMulti({ investments: investments.map(i => i.id === inv.id ? { ...i, balance: i.balance + +addAmt } : i), expenses: [...(data.expenses || []), newExpense] }); setAddAmt(""); showToast("Contributed ✓"); } }} style={BGr}>+</button>
                      </div>
                    </div>
                    <div>
                      <p style={{ color: "#475569", fontSize: 10, margin: "0 0 5px", fontFamily: "system-ui", textTransform: "uppercase" }}>Update value (no expense)</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" value={setAmt} onChange={e => setSetAmt(e.target.value)} placeholder="New total" style={{ ...IS, width: 120, fontSize: 12, padding: "6px 10px" }} />
                        <button onClick={() => { if (+setAmt > 0) { updData("investments", investments.map(i => i.id === inv.id ? { ...i, balance: +setAmt } : i)); setSetAmt(""); showToast("Value updated!"); } }} style={BS}>Set</button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚙️ SETTINGS TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const SettingsTab = () => {
    const [localSettings, setLocalSettings] = useState(settings);
    const [newCat, setNewCat] = useState("");
    const [newCatBudget, setNewCatBudget] = useState("");
    const set = (path, val) => {
      setLocalSettings(s => {
        const parts = path.split(".");
        if (parts.length === 1) return { ...s, [path]: val };
        if (parts.length === 2) return { ...s, [parts[0]]: { ...s[parts[0]], [parts[1]]: val } };
        return s;
      });
    };
    const save_ = () => { persistSettings(localSettings); showToast("Settings saved ✓"); };
    const addCategory = () => {
      const trimmed = newCat.trim();
      if (!trimmed) return;
      if ((localSettings.categories || DEFAULT_CATEGORIES).includes(trimmed)) { showToast("Category exists", "error"); return; }
      const updated = { ...localSettings, categories: [...(localSettings.categories || DEFAULT_CATEGORIES), trimmed], categoryBudgets: { ...localSettings.categoryBudgets, [trimmed]: +newCatBudget || 0 } };
      setLocalSettings(updated); persistSettings(updated); setNewCat(""); setNewCatBudget("");
    };
    const removeCategory = (cat) => {
      const newCats = (localSettings.categories || DEFAULT_CATEGORIES).filter(c => c !== cat);
      const newBudgets = { ...localSettings.categoryBudgets };
      delete newBudgets[cat];
      const updated = { ...localSettings, categories: newCats, categoryBudgets: newBudgets };
      setLocalSettings(updated); persistSettings(updated);
    };
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ color: "#F1F5F9", margin: 0, fontFamily: "system-ui", fontSize: 20, fontWeight: 700 }}>Settings</h2>
          <button onClick={save_} style={BP()}>Save Settings</button>
        </div>
        <SectionCard title="💰 Salary">
          <Field label="Monthly Salary (LKR)">
            <input style={{ ...IS, maxWidth: 220 }} type="number" value={localSettings.salary || ""} onChange={e => set("salary", +e.target.value)} placeholder="0" />
          </Field>
        </SectionCard>
        <SectionCard title="🔐 Password">
          <Field label="App Password">
            <input style={{ ...IS, maxWidth: 220 }} type="password" value={localSettings.password || ""} onChange={e => set("password", e.target.value)} placeholder="New password" />
          </Field>
        </SectionCard>
        <SectionCard title="💵 Overall Monthly Budget">
          <Field label="Total Monthly Budget (LKR)" hint="Set a single budget. Leave 0 to use per-category budgets instead.">
            <input style={{ ...IS, maxWidth: 220 }} type="number" value={localSettings.overallBudget || ""} onChange={e => set("overallBudget", +e.target.value)} placeholder="0 = use category budgets" />
          </Field>
          {localSettings.overallBudget > 0 && <div style={{ background: "#3B82F615", border: "1px solid #3B82F630", borderRadius: 8, padding: "9px 12px" }}><p style={{ color: "#3B82F6", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>✓ Overall budget active: <strong>{fmt(localSettings.overallBudget)}/month</strong>. Category budgets become optional sub-limits.</p></div>}
          {!localSettings.overallBudget && <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", margin: "4px 0 0" }}>Currently using sum of category budgets.</p>}
        </SectionCard>
        <SectionCard title="📅 Billing Cycle">
          <Field label="Cycle starts on day" hint="e.g. 4 = month resets on the 4th">
            <input style={{ ...IS, maxWidth: 100 }} type="number" min="1" max="28" value={localSettings.billingCycleStart || 4} onChange={e => set("billingCycleStart", +e.target.value)} />
          </Field>
        </SectionCard>
        <SectionCard title="🗂 Categories & Budgets">
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input style={{ ...IS, flex: 2 }} value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name…" onKeyDown={e => e.key === "Enter" && addCategory()} />
            <input style={{ ...IS, flex: 1 }} type="number" value={newCatBudget} onChange={e => setNewCatBudget(e.target.value)} placeholder="Budget (LKR)" onKeyDown={e => e.key === "Enter" && addCategory()} />
            <button onClick={addCategory} style={BP()}>+ Add</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {(localSettings.categories || DEFAULT_CATEGORIES).map(c => (
              <div key={c} style={{ position: "relative" }}>
                <Field label={c}><input style={IS} type="number" value={localSettings.categoryBudgets?.[c] || ""} onChange={e => set("categoryBudgets", { ...localSettings.categoryBudgets, [c]: +e.target.value })} placeholder="0 = no budget" /></Field>
                <button onClick={() => removeCategory(c)} style={{ position: "absolute", top: 0, right: 0, background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>×</button>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="⚠️ Danger Zone">
          <button onClick={() => { if (window.confirm("Clear ALL data? This cannot be undone.")) { persistData(DEFAULT_DATA); showToast("All data cleared"); } }} style={{ ...BD, padding: "9px 18px" }}>🗑 Clear All Data</button>
          <p style={{ color: "#475569", fontSize: 11, fontFamily: "system-ui", marginTop: 10 }}>Storage keys are stable — redeploying will not clear your data.</p>
        </SectionCard>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "expenses", label: "Expenses", icon: "🧾" },
    { id: "income", label: "Income", icon: "💰" },
    { id: "cc", label: "Cards", icon: "💳" },
    { id: "installments", label: "EMIs", icon: "📅" },
    { id: "savings", label: "Savings", icon: "🏦" },
    { id: "investments", label: "Invest", icon: "📈" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];
  const tabContent = { dashboard: <Dashboard />, expenses: <ExpensesTab />, income: <IncomeTab />, cc: <CCTab />, installments: <EMITab />, savings: <SavingsTab />, investments: <InvestmentsTab />, settings: <SettingsTab /> };

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A" }}>
      {toast && <div style={{ position: "fixed", top: 18, right: 18, zIndex: 9999, background: toast.type === "error" ? "#EF4444" : "#10B981", color: "#fff", padding: "11px 18px", borderRadius: 10, fontFamily: "system-ui", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeIn 0.2s" }}>{toast.msg}</div>}
      {/* Header */}
      <div style={{ background: "#1E293B", borderBottom: "1px solid #0F172A", padding: "0 22px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 18 }}>💰</span>
            <span style={{ color: "#F1F5F9", fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>Wasim's Finance</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#334155", fontSize: 12, fontFamily: "system-ui" }}>📅 {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            <button onClick={() => setLoggedIn(false)} style={{ ...BS, fontSize: 12, padding: "4px 10px" }}>Logout</button>
          </div>
        </div>
      </div>
      {/* Net worth bar */}
      <div style={{ background: "#0F172A", borderBottom: "1px solid #1E293B", padding: "8px 22px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui" }}>🏦 Net Worth</span><span style={{ color: "#06B6D4", fontFamily: "system-ui", fontSize: 15, fontWeight: 700 }}>{fmt(netWorth)}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui" }}>💰 Savings</span><span style={{ color: "#10B981", fontFamily: "system-ui", fontSize: 14, fontWeight: 600 }}>{fmt(totalSavingsBalance)}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui" }}>📈 Investments</span><span style={{ color: "#8B5CF6", fontFamily: "system-ui", fontSize: 14, fontWeight: 600 }}>{fmt(totalInvestmentsBalance)}</span></div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "#475569", fontSize: 12, fontFamily: "system-ui" }}>Net this month</span><span style={{ color: myNet < 0 ? "#EF4444" : "#3B82F6", fontFamily: "system-ui", fontSize: 14, fontWeight: 700 }}>{fmt(myNet)}</span></div>
        </div>
      </div>
      {/* Tabs */}
      <div style={{ background: "#1E293B", borderBottom: "1px solid #0F172A", overflowX: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", padding: "0 22px" }}>
          {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "12px 14px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #3B82F6" : "2px solid transparent", color: tab === t.id ? "#3B82F6" : "#64748B", cursor: "pointer", fontSize: 12, fontFamily: "system-ui", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, fontWeight: tab === t.id ? 600 : 400 }}><span>{t.icon}</span>{t.label}</button>)}
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 22px" }}>
        {tabContent[tab]}
      </div>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } } *{box-sizing:border-box;} select option{background:#1E293B;}`}</style>
    </div>
  );
}

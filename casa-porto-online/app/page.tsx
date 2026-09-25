"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, BedDouble, CalendarDays,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardCheck,
  Copy, CreditCard, DoorOpen, Edit3, Home, LogOut, Menu, MoreHorizontal, Plus,
  ReceiptText, RefreshCw, Settings, Sparkles, Trash2, Users, Wallet, Waves, X
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { formatDate, localISO, money, monthKey, nights, parseDate } from "@/lib/date";

type Tab = "dashboard" | "calendar" | "reservations" | "finance" | "tasks" | "settings";
type Household = { id: string; name: string; join_code: string; owner_user_id: string };
type Property = { id: string; household_id: string; name: string; address: string | null; check_in_time: string; check_out_time: string };
type Reservation = { id: string; household_id: string; property_id: string; guest_name: string; phone: string | null; check_in: string; check_out: string; guests: number; total_amount: number; source: string; status: string; notes: string | null; created_at: string };
type Payment = { id: string; household_id: string; reservation_id: string; amount: number; paid_at: string; method: string; notes: string | null };
type Expense = { id: string; household_id: string; amount: number; spent_at: string; category: string; description: string };
type Task = { id: string; household_id: string; reservation_id: string | null; title: string; due_date: string; status: string; notes: string | null };

type ReservationForm = {
  id?: string; guest_name: string; phone: string; check_in: string; check_out: string;
  guests: string; total_amount: string; source: string; status: string; notes: string;
};

const emptyReservation: ReservationForm = {
  guest_name: "", phone: "", check_in: localISO(), check_out: "", guests: "2",
  total_amount: "", source: "WhatsApp", status: "confirmed", notes: ""
};

const statusLabel: Record<string, string> = {
  tentative: "Pré-reserva", confirmed: "Confirmada", in_house: "Hospedado", completed: "Finalizada", canceled: "Cancelada"
};

const sourceOptions = ["WhatsApp", "Airbnb", "Booking", "Indicação", "Instagram", "Outro"];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState<Household | null>(null);
  const [role, setRole] = useState<string>("");
  const [property, setProperty] = useState<Property | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reservationModal, setReservationModal] = useState(false);
  const [reservationForm, setReservationForm] = useState<ReservationForm>(emptyReservation);
  const [paymentFor, setPaymentFor] = useState<Reservation | null>(null);
  const [expenseModal, setExpenseModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else { setUser(data.user); initialize(data.user.id); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  async function initialize(userId: string) {
    setLoading(true);
    const { data: membership } = await supabase.from("household_members")
      .select("household_id,role").eq("user_id", userId).limit(1).maybeSingle();
    if (!membership) { setLoading(false); return; }
    setRole(membership.role);
    const { data: h } = await supabase.from("households").select("*").eq("id", membership.household_id).single();
    setHousehold(h as Household);
    await loadData(membership.household_id);
    setLoading(false);
  }

  async function loadData(householdId: string) {
    const [p, r, pay, exp, task] = await Promise.all([
      supabase.from("properties").select("*").eq("household_id", householdId).limit(1).single(),
      supabase.from("reservations").select("*").eq("household_id", householdId).order("check_in"),
      supabase.from("payments").select("*").eq("household_id", householdId).order("paid_at", { ascending: false }),
      supabase.from("expenses").select("*").eq("household_id", householdId).order("spent_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("household_id", householdId).order("due_date")
    ]);
    if (p.data) setProperty(p.data as Property);
    setReservations((r.data ?? []) as Reservation[]);
    setPayments((pay.data ?? []) as Payment[]);
    setExpenses((exp.data ?? []) as Expense[]);
    setTasks((task.data ?? []) as Task[]);
  }

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }

  async function refresh() {
    if (!household) return;
    setBusy(true); await loadData(household.id); setBusy(false); notify("Dados atualizados.");
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/login"); }

  const paymentByReservation = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach(p => map.set(p.reservation_id, (map.get(p.reservation_id) ?? 0) + Number(p.amount)));
    return map;
  }, [payments]);

  const today = localISO();
  const currentMonth = today.slice(0, 7);
  const activeToday = reservations.find(r => r.status !== "canceled" && r.check_in <= today && r.check_out > today);
  const nextReservation = reservations.filter(r => r.status !== "canceled" && r.check_in >= today).sort((a,b) => a.check_in.localeCompare(b.check_in))[0];
  const monthReceived = payments.filter(p => monthKey(p.paid_at) === currentMonth).reduce((s,p) => s + Number(p.amount), 0);
  const pendingTotal = reservations.filter(r => !["canceled"].includes(r.status)).reduce((s,r) => s + Math.max(0, Number(r.total_amount) - (paymentByReservation.get(r.id) ?? 0)), 0);
  const openTasks = tasks.filter(t => t.status !== "done").length;

  const movements = useMemo(() => {
    const rows: { date: string; type: "in"|"out"; reservation: Reservation }[] = [];
    reservations.filter(r => r.status !== "canceled").forEach(r => {
      if (r.check_in >= today) rows.push({ date: r.check_in, type: "in", reservation: r });
      if (r.check_out >= today) rows.push({ date: r.check_out, type: "out", reservation: r });
    });
    return rows.sort((a,b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [reservations, today]);

  function openNewReservation(prefill?: Partial<ReservationForm>) {
    setReservationForm({ ...emptyReservation, ...prefill });
    setReservationModal(true);
  }

  function openEditReservation(r: Reservation) {
    setReservationForm({
      id: r.id, guest_name: r.guest_name, phone: r.phone ?? "", check_in: r.check_in, check_out: r.check_out,
      guests: String(r.guests), total_amount: String(r.total_amount), source: r.source, status: r.status, notes: r.notes ?? ""
    });
    setReservationModal(true);
  }

  async function saveReservation() {
    if (!household || !property) return;
    if (!reservationForm.guest_name || !reservationForm.check_in || !reservationForm.check_out || !reservationForm.total_amount) return notify("Preencha os campos obrigatórios.");
    if (reservationForm.check_out <= reservationForm.check_in) return notify("A saída precisa ser depois da entrada.");

    const conflict = reservations.find(r => r.id !== reservationForm.id && r.status !== "canceled" && reservationForm.status !== "canceled" && reservationForm.check_in < r.check_out && reservationForm.check_out > r.check_in);
    if (conflict) return notify(`Conflito com a reserva de ${conflict.guest_name}.`);

    setBusy(true);
    const payload = {
      household_id: household.id, property_id: property.id, guest_name: reservationForm.guest_name.trim(),
      phone: reservationForm.phone.trim() || null, check_in: reservationForm.check_in, check_out: reservationForm.check_out,
      guests: Number(reservationForm.guests || 1), total_amount: Number(reservationForm.total_amount.replace(",", ".")),
      source: reservationForm.source, status: reservationForm.status, notes: reservationForm.notes.trim() || null,
      created_by: user?.id
    };
    const result = reservationForm.id
      ? await supabase.from("reservations").update(payload).eq("id", reservationForm.id)
      : await supabase.from("reservations").insert(payload);
    if (result.error) notify(result.error.message.includes("no_overlapping") ? "Essas datas já estão ocupadas." : result.error.message);
    else { notify(reservationForm.id ? "Reserva atualizada." : "Reserva criada."); setReservationModal(false); await loadData(household.id); }
    setBusy(false);
  }

  async function deleteReservation(id: string) {
    if (!household || !confirm("Excluir esta reserva e seus pagamentos?")) return;
    setBusy(true);
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) notify(error.message); else { notify("Reserva excluída."); setReservationModal(false); await loadData(household.id); }
    setBusy(false);
  }

  async function quickStatus(r: Reservation, status: string) {
    if (!household) return;
    await supabase.from("reservations").update({ status }).eq("id", r.id);
    await loadData(household.id); notify("Status atualizado.");
  }

  if (loading) return <div className="loading-screen"><Waves size={35}/><strong>Casa Porto</strong><span>Carregando seu painel…</span></div>;
  if (!household) return <Setup user={user} onDone={() => user && initialize(user.id)} />;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Início", icon: Home },
    { id: "calendar", label: "Calendário", icon: CalendarDays },
    { id: "reservations", label: "Reservas", icon: BedDouble },
    { id: "finance", label: "Financeiro", icon: Wallet },
    { id: "tasks", label: "Operação", icon: ClipboardCheck },
    { id: "settings", label: "Ajustes", icon: Settings },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand"><div className="brand-icon"><Waves size={22}/></div><div><strong>Casa Porto</strong><span>Gestão de temporada</span></div></div>
          <button className="icon-btn mobile-only" onClick={() => setMenuOpen(false)}><X size={20}/></button>
        </div>
        <div className="property-mini"><span className="dot live"></span><div><strong>{property?.name}</strong><span>{activeToday ? `Hospedado: ${activeToday.guest_name}` : "Livre hoje"}</span></div></div>
        <nav>{tabs.map(t => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => { setTab(t.id); setMenuOpen(false); }}><t.icon size={19}/>{t.label}{t.id === "tasks" && openTasks > 0 && <em>{openTasks}</em>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={signOut}><LogOut size={18}/> Sair</button><span>{user?.email}</span></div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
          <div><span className="eyebrow">{property?.name}</span><h1>{tabTitle(tab)}</h1></div>
          <div className="top-actions"><button className="icon-btn" onClick={refresh} title="Atualizar"><RefreshCw className={busy ? "spin" : ""} size={19}/></button><button className="btn primary" onClick={() => openNewReservation()}><Plus size={18}/> Nova reserva</button></div>
        </header>

        {tab === "dashboard" && <Dashboard activeToday={activeToday} nextReservation={nextReservation} monthReceived={monthReceived} pendingTotal={pendingTotal} movements={movements} paymentByReservation={paymentByReservation} tasks={tasks} onReservation={openEditReservation} onStatus={quickStatus} />}
        {tab === "calendar" && <CalendarView date={calendarDate} setDate={setCalendarDate} reservations={reservations} payments={paymentByReservation} onDay={(date: string) => openNewReservation({ check_in: date })} onReservation={openEditReservation} />}        {tab === "reservations" && <ReservationsView reservations={reservations} paymentByReservation={paymentByReservation} onEdit={openEditReservation} onPayment={setPaymentFor} />}
        {tab === "finance" && <FinanceView reservations={reservations} payments={payments} expenses={expenses} paymentByReservation={paymentByReservation} onPayment={setPaymentFor} onExpense={() => setExpenseModal(true)} />}
        {tab === "tasks" && <TasksView tasks={tasks} reservations={reservations} householdId={household.id} onReload={() => loadData(household.id)} onNew={() => setTaskModal(true)} notify={notify} />}
        {tab === "settings" && <SettingsView household={household} property={property} role={role} user={user} onReload={() => initialize(user!.id)} notify={notify} />}
      </main>

      {reservationModal && <ReservationModal form={reservationForm} setForm={setReservationForm} onClose={() => setReservationModal(false)} onSave={saveReservation} onDelete={reservationForm.id ? () => deleteReservation(reservationForm.id!) : undefined} busy={busy} paid={reservationForm.id ? paymentByReservation.get(reservationForm.id) ?? 0 : 0} />}
      {paymentFor && <PaymentModal reservation={paymentFor} paid={paymentByReservation.get(paymentFor.id) ?? 0} householdId={household.id} onClose={() => setPaymentFor(null)} onDone={async () => { setPaymentFor(null); await loadData(household.id); notify("Pagamento registrado."); }} />}
      {expenseModal && <ExpenseModal householdId={household.id} onClose={() => setExpenseModal(false)} onDone={async () => { setExpenseModal(false); await loadData(household.id); notify("Despesa registrada."); }} />}
      {taskModal && <TaskModal householdId={household.id} reservations={reservations} onClose={() => setTaskModal(false)} onDone={async () => { setTaskModal(false); await loadData(household.id); notify("Tarefa criada."); }} />}
      {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
    </div>
  );
}

function tabTitle(tab: Tab) {
  return ({ dashboard: "Visão geral", calendar: "Calendário", reservations: "Reservas", finance: "Financeiro", tasks: "Operação da casa", settings: "Configurações" } as Record<Tab,string>)[tab];
}

function Setup({ user, onDone }: { user: User | null; onDone: () => void }) {
  const [mode, setMode] = useState<"choose"|"create"|"join">("choose");
  const [name, setName] = useState("Família");
  const [property, setProperty] = useState("Casa Porto de Galinhas");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("create_household", { p_name: name, p_property_name: property });
    if (error) setError(error.message); else onDone();
    setBusy(false);
  }
  async function join() {
    setBusy(true); setError("");
    const displayName = user?.user_metadata?.name || user?.email?.split("@")[0] || "Usuário";
    const { error } = await supabase.rpc("join_household", { p_join_code: code.trim().toLowerCase(), p_display_name: displayName });
    if (error) setError("Código inválido ou expirado."); else onDone();
    setBusy(false);
  }

  return <main className="setup-shell"><div className="setup-card"><div className="brand-mark dark"><Waves size={26}/> Casa Porto</div>
    {mode === "choose" && <><span className="eyebrow">PRIMEIRA CONFIGURAÇÃO</span><h1>Como você quer começar?</h1><p className="muted">Crie o espaço da casa ou entre em um espaço que alguém da família já criou.</p><div className="choice-grid"><button onClick={() => setMode("create")}><Home size={28}/><strong>Criar a casa</strong><span>Sou o primeiro a configurar</span><ArrowRight size={18}/></button><button onClick={() => setMode("join")}><Users size={28}/><strong>Entrar com código</strong><span>Alguém já criou o espaço</span><ArrowRight size={18}/></button></div></>}
    {mode === "create" && <><button className="back-btn" onClick={() => setMode("choose")}><ArrowLeft size={17}/> Voltar</button><span className="eyebrow">CRIAR ESPAÇO</span><h1>Vamos cadastrar a casa</h1><div className="form-stack"><label>Nome do espaço<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Nome da propriedade<input value={property} onChange={e=>setProperty(e.target.value)}/></label>{error&&<div className="notice danger">{error}</div>}<button className="btn primary full" onClick={create} disabled={busy}>{busy?"Criando…":"Criar e abrir painel"}</button></div></>}
    {mode === "join" && <><button className="back-btn" onClick={() => setMode("choose")}><ArrowLeft size={17}/> Voltar</button><span className="eyebrow">ENTRAR NO ESPAÇO</span><h1>Digite o código da casa</h1><p className="muted">Peça o código para quem criou o espaço.</p><div className="form-stack"><label>Código de acesso<input className="code-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="ex.: a1b2c3d4e5f6"/></label>{error&&<div className="notice danger">{error}</div>}<button className="btn primary full" onClick={join} disabled={busy||code.length<6}>{busy?"Entrando…":"Entrar no espaço"}</button></div></>}
  </div></main>;
}

function Dashboard({ activeToday, nextReservation, monthReceived, pendingTotal, movements, paymentByReservation, tasks, onReservation, onStatus }: any) {
  const nextTasks = tasks.filter((t: Task) => t.status !== "done").slice(0,4);
  return <div className="page-grid">
    <section className="hero-status">
      <div><span className="eyebrow light">STATUS DE HOJE</span><h2>{activeToday ? "Casa ocupada" : "Casa livre"}</h2><p>{activeToday ? `${activeToday.guest_name} • saída ${formatDate(activeToday.check_out)}` : nextReservation ? `Próxima entrada: ${formatDate(nextReservation.check_in)}` : "Nenhuma reserva futura cadastrada"}</p></div>
      <div className={`status-orb ${activeToday ? "occupied" : "free"}`}><DoorOpen size={29}/><strong>{activeToday ? "OCUPADA" : "LIVRE"}</strong></div>
    </section>
    <section className="stats-grid">
      <Stat icon={CircleDollarSign} label="Recebido este mês" value={money(monthReceived)} note="Pagamentos registrados" />
      <Stat icon={CreditCard} label="Total a receber" value={money(pendingTotal)} note="Saldo das reservas" />
      <Stat icon={BedDouble} label="Próxima reserva" value={nextReservation ? formatDate(nextReservation.check_in) : "—"} note={nextReservation?.guest_name ?? "Sem reservas futuras"} />
      <Stat icon={ClipboardCheck} label="Tarefas abertas" value={String(tasks.filter((t: Task)=>t.status!=="done").length)} note="Limpeza e operação" />
    </section>
    <section className="card span-2"><div className="section-head"><div><span className="eyebrow">AGENDA</span><h3>Próximas entradas e saídas</h3></div></div><div className="movement-list">{movements.length ? movements.map((m: any, i: number) => <button key={i} className="movement" onClick={() => onReservation(m.reservation)}><div className={`movement-icon ${m.type}`} >{m.type === "in" ? <ArrowDownToLine size={19}/> : <ArrowUpFromLine size={19}/>}</div><div className="movement-date"><strong>{relativeDate(m.date)}</strong><span>{formatDate(m.date)}</span></div><div className="movement-main"><strong>{m.type === "in" ? "Check-in" : "Check-out"} • {m.reservation.guest_name}</strong><span>{m.reservation.guests} hóspedes · {m.reservation.source}</span></div><div className="movement-money"><strong>{money(m.reservation.total_amount)}</strong><span>Saldo {money(Math.max(0, Number(m.reservation.total_amount) - (paymentByReservation.get(m.reservation.id) ?? 0)))}</span></div><ChevronRight size={18}/></button>) : <Empty text="Nenhuma movimentação futura."/>}</div></section>
    <section className="card"><div className="section-head"><div><span className="eyebrow">OPERAÇÃO</span><h3>O que precisa ser feito</h3></div></div>{nextTasks.length ? <div className="compact-list">{nextTasks.map((t: Task)=><div key={t.id}><span className={`task-dot ${t.due_date < localISO() ? "late" : ""}`}></span><div><strong>{t.title}</strong><span>{relativeDate(t.due_date)} · {formatDate(t.due_date)}</span></div></div>)}</div> : <Empty text="Tudo em dia por aqui." icon={Sparkles}/>}</section>
    {activeToday && <section className="card"><div className="section-head"><div><span className="eyebrow">HÓSPEDE ATUAL</span><h3>{activeToday.guest_name}</h3></div><button className="icon-btn" onClick={() => onReservation(activeToday)}><Edit3 size={17}/></button></div><div className="guest-now"><div><Users size={18}/><span>{activeToday.guests} hóspedes</span></div><div><CalendarDays size={18}/><span>{formatDate(activeToday.check_in)} → {formatDate(activeToday.check_out)}</span></div><div><Wallet size={18}/><span>{money(activeToday.total_amount)}</span></div></div>{activeToday.status !== "in_house" && <button className="btn soft full" onClick={()=>onStatus(activeToday,"in_house")}><Check size={17}/> Marcar check-in realizado</button>}</section>}
  </div>;
}

function Stat({ icon: Icon, label, value, note }: any) { return <div className="stat-card"><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }

function CalendarView({ date, setDate, reservations, payments, onDay, onReservation }: any) {
  const year = date.getFullYear(), month = date.getMonth();
  const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay()+6)%7));
  const days = Array.from({length:42}, (_,i) => { const d = new Date(start); d.setDate(start.getDate()+i); return d; });
  const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric" }).format(date);
  return <section className="card calendar-card"><div className="calendar-head"><div><span className="eyebrow">VISÃO MENSAL</span><h2 className="capitalize">{fmtMonth}</h2></div><div className="calendar-actions"><button className="btn soft" onClick={()=>setDate(new Date())}>Hoje</button><button className="icon-btn" onClick={()=>setDate(new Date(year,month-1,1))}><ChevronLeft/></button><button className="icon-btn" onClick={()=>setDate(new Date(year,month+1,1))}><ChevronRight/></button></div></div><div className="week-head">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-grid">{days.map(d => { const iso=localISO(d); const same=d.getMonth()===month; const dayRes=reservations.filter((r:Reservation)=>r.status!=="canceled" && r.check_in<=iso && r.check_out>iso); return <div key={iso} className={`calendar-day ${!same?"muted-day":""} ${iso===localISO()?"today":""}`} onDoubleClick={()=>onDay(iso)}><button className="day-number" onClick={()=>onDay(iso)}>{d.getDate()}</button><div className="day-reservations">{dayRes.slice(0,2).map((r:Reservation)=><button key={r.id} className={`calendar-event ${r.status}`} onClick={(e)=>{e.stopPropagation();onReservation(r)}}><strong>{r.check_in===iso?"↘ ":""}{r.guest_name}</strong><span>{r.check_in===iso?`${r.guests} hóspedes`:r.check_out===iso?"saída":"ocupado"}</span></button>)}{dayRes.length>2&&<small>+{dayRes.length-2}</small>}</div></div>})}</div><div className="calendar-legend"><span><i className="confirmed"></i>Confirmada</span><span><i className="tentative"></i>Pré-reserva</span><span><i className="in_house"></i>Hospedado</span><small>Dica: toque no número do dia para criar uma reserva.</small></div></section>;
}

function ReservationsView({ reservations, paymentByReservation, onEdit, onPayment }: any) {
  const [filter,setFilter]=useState("all");
  const visible=reservations.filter((r:Reservation)=>filter==="all"?true:filter==="future"?r.check_out>=localISO():r.status===filter).sort((a:Reservation,b:Reservation)=>b.check_in.localeCompare(a.check_in));
  return <section className="card"><div className="section-head responsive"><div><span className="eyebrow">HISTÓRICO E PRÓXIMAS</span><h2>Todas as reservas</h2></div><div className="filters">{[["all","Todas"],["future","Futuras"],["confirmed","Confirmadas"],["canceled","Canceladas"]].map(([v,l])=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{l}</button>)}</div></div><div className="table-wrap"><table><thead><tr><th>Hóspede</th><th>Período</th><th>Status</th><th>Valor</th><th>Recebido</th><th>Saldo</th><th></th></tr></thead><tbody>{visible.map((r:Reservation)=>{const paid=paymentByReservation.get(r.id)??0;return <tr key={r.id}><td><strong>{r.guest_name}</strong><span>{r.guests} hóspedes · {r.source}</span></td><td><strong>{formatDate(r.check_in)}</strong><span>{nights(r.check_in,r.check_out)} noites → {formatDate(r.check_out)}</span></td><td><span className={`status-pill ${r.status}`}>{statusLabel[r.status]}</span></td><td>{money(r.total_amount)}</td><td>{money(paid)}</td><td><strong className={Number(r.total_amount)-paid>0?"warning-text":"success-text"}>{money(Math.max(0,Number(r.total_amount)-paid))}</strong></td><td><div className="row-actions"><button className="icon-btn small" onClick={()=>onPayment(r)} title="Registrar pagamento"><CreditCard size={16}/></button><button className="icon-btn small" onClick={()=>onEdit(r)}><Edit3 size={16}/></button></div></td></tr>})}</tbody></table>{!visible.length&&<Empty text="Nenhuma reserva neste filtro."/>}</div></section>;
}

function FinanceView({ reservations, payments, expenses, paymentByReservation, onPayment, onExpense }: any) {
  const received=payments.reduce((s:number,p:Payment)=>s+Number(p.amount),0); const spent=expenses.reduce((s:number,e:Expense)=>s+Number(e.amount),0); const booked=reservations.filter((r:Reservation)=>r.status!=="canceled").reduce((s:number,r:Reservation)=>s+Number(r.total_amount),0); const pending=Math.max(0,booked-received);
  return <div className="finance-grid"><section className="stats-grid span-all"><Stat icon={ReceiptText} label="Valor contratado" value={money(booked)} note="Reservas não canceladas"/><Stat icon={CircleDollarSign} label="Total recebido" value={money(received)} note="Todos os pagamentos"/><Stat icon={CreditCard} label="A receber" value={money(pending)} note="Saldo das reservas"/><Stat icon={Wallet} label="Resultado" value={money(received-spent)} note={`${money(spent)} em despesas`}/></section><section className="card"><div className="section-head"><div><span className="eyebrow">ENTRADAS</span><h3>Pagamentos recentes</h3></div></div><div className="transaction-list">{payments.slice(0,12).map((p:Payment)=>{const r=reservations.find((x:Reservation)=>x.id===p.reservation_id);return <div key={p.id}><div className="transaction-icon income"><ArrowDownToLine size={18}/></div><div><strong>{r?.guest_name??"Reserva"}</strong><span>{formatDate(p.paid_at)} · {p.method}</span></div><strong>{money(p.amount)}</strong></div>})}{!payments.length&&<Empty text="Nenhum pagamento registrado."/>}</div></section><section className="card"><div className="section-head"><div><span className="eyebrow">SAÍDAS</span><h3>Despesas</h3></div><button className="btn soft" onClick={onExpense}><Plus size={16}/> Despesa</button></div><div className="transaction-list">{expenses.slice(0,12).map((e:Expense)=><div key={e.id}><div className="transaction-icon expense"><ArrowUpFromLine size={18}/></div><div><strong>{e.description}</strong><span>{formatDate(e.spent_at)} · {e.category}</span></div><strong>{money(e.amount)}</strong></div>)}{!expenses.length&&<Empty text="Nenhuma despesa registrada."/>}</div></section><section className="card span-all"><div className="section-head"><div><span className="eyebrow">SALDOS</span><h3>Reservas com valor pendente</h3></div></div><div className="balance-grid">{reservations.filter((r:Reservation)=>r.status!=="canceled"&&Number(r.total_amount)-(paymentByReservation.get(r.id)??0)>0).map((r:Reservation)=><button key={r.id} onClick={()=>onPayment(r)}><div><strong>{r.guest_name}</strong><span>{formatDate(r.check_in)} · {r.source}</span></div><div><span>Falta receber</span><strong>{money(Number(r.total_amount)-(paymentByReservation.get(r.id)??0))}</strong></div></button>)}</div></section></div>;
}

function TasksView({ tasks, reservations, householdId, onReload, onNew, notify }: any) {
  async function toggle(t:Task){await supabase.from("tasks").update({status:t.status==="done"?"open":"done"}).eq("id",t.id);await onReload();notify(t.status==="done"?"Tarefa reaberta.":"Tarefa concluída.")}
  async function remove(t:Task){if(!confirm("Excluir esta tarefa?"))return;await supabase.from("tasks").delete().eq("id",t.id);await onReload();notify("Tarefa excluída.")}
  const open=tasks.filter((t:Task)=>t.status!=="done"),done=tasks.filter((t:Task)=>t.status==="done");
  return <div className="tasks-layout"><section className="card"><div className="section-head"><div><span className="eyebrow">CHECKLIST</span><h2>Tarefas abertas</h2></div><button className="btn primary" onClick={onNew}><Plus size={17}/> Nova tarefa</button></div><div className="task-list">{open.map((t:Task)=>{const r=reservations.find((x:Reservation)=>x.id===t.reservation_id);return <div key={t.id} className={t.due_date<localISO()?"late":""}><button className="task-check" onClick={()=>toggle(t)}><Check size={16}/></button><div><strong>{t.title}</strong><span>{formatDate(t.due_date)}{r?` · ${r.guest_name}`:""}</span>{t.notes&&<small>{t.notes}</small>}</div><button className="icon-btn small" onClick={()=>remove(t)}><Trash2 size={15}/></button></div>})}{!open.length&&<Empty text="Tudo concluído. Boa!" icon={Sparkles}/>}</div></section><section className="card"><div className="section-head"><div><span className="eyebrow">CONCLUÍDAS</span><h3>Histórico</h3></div></div><div className="task-list completed">{done.slice(0,12).map((t:Task)=><div key={t.id}><button className="task-check checked" onClick={()=>toggle(t)}><Check size={16}/></button><div><strong>{t.title}</strong><span>{formatDate(t.due_date)}</span></div><button className="icon-btn small" onClick={()=>remove(t)}><Trash2 size={15}/></button></div>)}{!done.length&&<Empty text="Nenhuma tarefa concluída ainda."/>}</div></section></div>;
}

function SettingsView({ household, property, role, user, onReload, notify }: any) {
  const [name,setName]=useState(property?.name??""); const [address,setAddress]=useState(property?.address??""); const [checkIn,setCheckIn]=useState((property?.check_in_time??"14:00").slice(0,5)); const [checkOut,setCheckOut]=useState((property?.check_out_time??"11:00").slice(0,5));
  async function save(){const {error}=await supabase.from("properties").update({name,address:address||null,check_in_time:checkIn,check_out_time:checkOut}).eq("id",property.id);if(error)notify(error.message);else{notify("Configurações salvas.");onReload();}}
  async function rotate(){if(!confirm("Gerar um novo código? O código antigo deixará de funcionar."))return;const {data,error}=await supabase.rpc("rotate_join_code",{p_household_id:household.id});if(error)notify(error.message);else{notify("Novo código gerado.");await onReload();}}
  async function copyCode(){await navigator.clipboard.writeText(household.join_code);notify("Código copiado.")}
  return <div className="settings-grid"><section className="card"><span className="eyebrow">PROPRIEDADE</span><h2>Dados da casa</h2><div className="form-grid"><label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Endereço<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Opcional"/></label><label>Horário de check-in<input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Horário de check-out<input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div><button className="btn primary" onClick={save}>Salvar alterações</button></section><section className="card"><span className="eyebrow">COMPARTILHAMENTO</span><h2>Acesso da família</h2><p className="muted">Outra pessoa cria a própria conta e usa este código uma única vez para entrar no mesmo espaço.</p><div className="share-code"><div><span>Código da casa</span><strong>{household.join_code}</strong></div><button className="icon-btn" onClick={copyCode}><Copy size={18}/></button></div>{household.owner_user_id===user?.id&&<button className="btn soft" onClick={rotate}><RefreshCw size={16}/> Gerar novo código</button>}<div className="info-box"><Users size={18}/><div><strong>Seu perfil: {role}</strong><span>{user?.email}</span></div></div></section><section className="card span-all"><span className="eyebrow">BACKUP</span><h3>Seus dados ficam no Supabase</h3><p className="muted">Reservas, pagamentos, despesas e tarefas são armazenados no banco online. Qualquer aparelho autenticado no mesmo espaço vê os mesmos dados.</p></section></div>;
}

function ReservationModal({ form, setForm, onClose, onSave, onDelete, busy, paid }: any) {
  const total=Number(String(form.total_amount).replace(",","."))||0; const balance=Math.max(0,total-paid);
  return <Modal title={form.id?"Editar reserva":"Nova reserva"} subtitle={form.id?`${form.guest_name} · ${formatDate(form.check_in)}`:"Cadastre os dados da hospedagem"} onClose={onClose}><div className="form-grid"><label className="span-2">Nome do hóspede *<input value={form.guest_name} onChange={e=>setForm({...form,guest_name:e.target.value})} placeholder="Nome completo"/></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(81) 99999-9999"/></label><label>Nº de hóspedes<input type="number" min="1" value={form.guests} onChange={e=>setForm({...form,guests:e.target.value})}/></label><label>Entrada *<input type="date" value={form.check_in} onChange={e=>setForm({...form,check_in:e.target.value})}/></label><label>Saída *<input type="date" value={form.check_out} onChange={e=>setForm({...form,check_out:e.target.value})}/></label><label>Valor total *<input type="number" min="0" step="0.01" value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})} placeholder="0,00"/></label><label>Origem<select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{sourceOptions.map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(statusLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="span-2">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Horário previsto, pedidos, informações importantes…"/></label></div>{form.id&&<div className="reservation-summary"><div><span>Recebido</span><strong>{money(paid)}</strong></div><div><span>Saldo</span><strong>{money(balance)}</strong></div><div><span>Diárias</span><strong>{form.check_out>form.check_in?nights(form.check_in,form.check_out):0}</strong></div></div>}<div className="modal-actions">{onDelete&&<button className="btn danger" onClick={onDelete}><Trash2 size={16}/> Excluir</button>}<div className="push"></div><button className="btn soft" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={onSave} disabled={busy}>{busy?"Salvando…":"Salvar reserva"}</button></div></Modal>;
}

function PaymentModal({ reservation, paid, householdId, onClose, onDone }: any) {
  const balance=Math.max(0,Number(reservation.total_amount)-paid); const [amount,setAmount]=useState(String(balance.toFixed(2))); const [date,setDate]=useState(localISO()); const [method,setMethod]=useState("Pix"); const [notes,setNotes]=useState(""); const [busy,setBusy]=useState(false);
  async function save(){setBusy(true);const {error}=await supabase.from("payments").insert({household_id:householdId,reservation_id:reservation.id,amount:Number(amount.replace(",",".")),paid_at:date,method,notes:notes||null});setBusy(false);if(!error)onDone();}
  return <Modal title="Registrar pagamento" subtitle={`${reservation.guest_name} · saldo ${money(balance)}`} onClose={onClose}><div className="form-grid"><label>Valor<input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Forma<select value={method} onChange={e=>setMethod(e.target.value)}>{["Pix","Dinheiro","Transferência","Cartão","Airbnb","Booking","Outro"].map(x=><option key={x}>{x}</option>)}</select></label><label>Observação<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></label></div><div className="modal-actions"><div className="push"></div><button className="btn soft" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={busy||Number(amount)<=0}>{busy?"Salvando…":"Registrar"}</button></div></Modal>;
}

function ExpenseModal({ householdId, onClose, onDone }: any) {
  const [amount,setAmount]=useState(""); const [date,setDate]=useState(localISO()); const [category,setCategory]=useState("Limpeza"); const [description,setDescription]=useState(""); const [busy,setBusy]=useState(false);
  async function save(){setBusy(true);const {error}=await supabase.from("expenses").insert({household_id:householdId,amount:Number(amount.replace(",",".")),spent_at:date,category,description});setBusy(false);if(!error)onDone();}
  return <Modal title="Nova despesa" subtitle="Registre um gasto da casa" onClose={onClose}><div className="form-grid"><label>Valor<input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{["Limpeza","Manutenção","Energia","Água","Internet","Condomínio","Enxoval","Comissão","Outro"].map(x=><option key={x}>{x}</option>)}</select></label><label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Limpeza pós-hospedagem"/></label></div><div className="modal-actions"><div className="push"></div><button className="btn soft" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={busy||!description||Number(amount)<=0}>Salvar despesa</button></div></Modal>;
}

function TaskModal({ householdId, reservations, onClose, onDone }: any) {
  const [title,setTitle]=useState("Limpeza da casa"); const [date,setDate]=useState(localISO()); const [reservation,setReservation]=useState(""); const [notes,setNotes]=useState("");
  async function save(){const {error}=await supabase.from("tasks").insert({household_id:householdId,title,due_date:date,reservation_id:reservation||null,notes:notes||null,status:"open"});if(!error)onDone();}
  return <Modal title="Nova tarefa" subtitle="Limpeza, manutenção ou qualquer pendência" onClose={onClose}><div className="form-grid"><label className="span-2">Tarefa<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Reserva relacionada<select value={reservation} onChange={e=>setReservation(e.target.value)}><option value="">Nenhuma</option>{reservations.filter((r:Reservation)=>r.check_out>=localISO()).map((r:Reservation)=><option key={r.id} value={r.id}>{r.guest_name} · {formatDate(r.check_in)}</option>)}</select></label><label className="span-2">Observação<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div><div className="modal-actions"><div className="push"></div><button className="btn soft" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={!title}>Criar tarefa</button></div></Modal>;
}

function Modal({ title, subtitle, onClose, children }: any) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">CASA PORTO</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>{children}</div></div> }
function Empty({ text, icon: Icon = MoreHorizontal }: any){return <div className="empty"><Icon size={24}/><span>{text}</span></div>}
function relativeDate(date:string){const today=parseDate(localISO()), target=parseDate(date); const diff=Math.round((target.getTime()-today.getTime())/86400000); if(diff===0)return"Hoje";if(diff===1)return"Amanhã";if(diff===-1)return"Ontem";if(diff>1&&diff<7)return`Em ${diff} dias`;return formatDate(date)}

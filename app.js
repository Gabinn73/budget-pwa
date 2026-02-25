// ======================
// Budget EUR - V1
// ======================

const $ = (id) => document.getElementById(id);

// --- Constantes métier
const CATEGORIES = ["Logement","Transport","Alimentation","Loisirs","Abonnements","Epargne"];
const STORAGE_KEY = "budget_eur_state_v1";

// PIN provisoire (plus tard: vrai PIN + chiffrement)
const PIN = "123456";

// --- State
let state = loadState();

// --- Utils dates
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function ymFromISO(dateISO) {
  return (dateISO || "").slice(0, 7); // YYYY-MM
}
function currentYM() {
  return new Date().toISOString().slice(0, 7);
}

// --- Persistance
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function defaultState() {
  return {
    locked: true,
    salaryNetChf: 4100,
    ratesByMonth: {}, // {"YYYY-MM": 0.95}
    transactions: [], // {id,dateISO,type,montantSaisi,deviseSaisie,montantEUR,categorie,note,meta?}
    recurring: defaultRecurring()
  };
}

// --- Récurrences plausibles (fenêtres)
function defaultRecurring() {
  return [
    { id: crypto.randomUUID(), libelle: "Loyer",      categorie: "Logement",    deviseSaisie: "EUR", montantSaisi: 1050, dayMin: 1,  dayMax: 5,  approxType: "fixed" },
    { id: crypto.randomUUID(), libelle: "Leasing",    categorie: "Transport",   deviseSaisie: "EUR", montantSaisi: 353,  dayMin: 5,  dayMax: 10, approxType: "fixed" },
    { id: crypto.randomUUID(), libelle: "Box/Forfait",categorie: "Abonnements", deviseSaisie: "EUR", montantSaisi: 75,   dayMin: 10, dayMax: 15, approxType: "fixed" },
    { id: crypto.randomUUID(), libelle: "Péage",      categorie: "Transport",   deviseSaisie: "EUR", montantSaisi: 300,  dayMin: 15, dayMax: 25, approxType: "approx" },
    // Essence en range 220–280 : on met une "prévision" au dayMin, et tu saisis les pleins au fil du mois
    { id: crypto.randomUUID(), libelle: "Essence (prévision)", categorie: "Transport", deviseSaisie: "EUR", montantSaisi: 250, dayMin: 20, dayMax: 28, approxType: "range", rangeMin: 220, rangeMax: 280 }
  ];
}

// --- Conversion
function getRateForMonth(ym) {
  const r = Number(state.ratesByMonth[ym]);
  return Number.isFinite(r) && r > 0 ? r : null;
}
function toEUR(amount, currency, ym) {
  const a = Number(amount);
  if (!Number.isFinite(a)) return 0;
  if (currency === "EUR") return a;

  // CHF -> EUR via taux mensuel
  const rate = getRateForMonth(ym);
  if (!rate) return 0; // on forcera l'utilisateur à entrer le taux
  return a * rate;
}

// ======================
// UI: init
// ======================

function initSelects() {
  // txCategory
  const txCategory = $("txCategory");
  txCategory.innerHTML = "";
  CATEGORIES.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    txCategory.appendChild(o);
  });

  // filterCategory
  const filterCategory = $("filterCategory");
  filterCategory.innerHTML = `<option value="">Toutes catégories</option>`;
  CATEGORIES.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    filterCategory.appendChild(o);
  });
}

function initDefaults() {
  $("txDate").value = todayISO();
  $("filterMonth").value = currentYM(); // input type="month" utilise YYYY-MM [web:355]
  $("salaryNetChf").value = state.salaryNetChf ?? 4100;

  // Rate input = taux du mois courant si dispo
  const ym = currentYM();
  $("rateChfEur").value = state.ratesByMonth[ym] ?? "";
}

// Tabs
function showView(viewId) {
  const views = ["viewDashboard","viewAdd","viewList","viewRecurring","viewSettings"];
  views.forEach(id => $(id).classList.add("hidden"));
  $(viewId).classList.remove("hidden");

  const tabs = [
    ["tabDashboard","viewDashboard"],
    ["tabAdd","viewAdd"],
    ["tabList","viewList"],
    ["tabRecurring","viewRecurring"],
    ["tabSettings","viewSettings"]
  ];
  tabs.forEach(([tab, vid]) => {
    $(tab).classList.toggle("active", vid === viewId);
  });
}

function setLocked(locked) {
  state.locked = locked;
  $("screenLock").classList.toggle("hidden", !locked);
  $("screenApp").classList.toggle("hidden", locked);
  saveState();
}

function bindEvents() {
  $("btnLock").addEventListener("click", () => setLocked(true));

  $("btnUnlock").addEventListener("click", () => {
    const pin = $("pinInput").value || "";
    if (pin === PIN) {
      $("lockMsg").textContent = "";
      setLocked(false);
      renderAll();
    } else {
      $("lockMsg").textContent = "PIN incorrect (essaie 123456 pour la V1).";
    }
  });

  // Tabs
  $("tabDashboard").addEventListener("click", () => { showView("viewDashboard"); renderDashboard(); });
  $("tabAdd").addEventListener("click", () => showView("viewAdd"));
  $("tabList").addEventListener("click", () => { showView("viewList"); renderTxList(); });
  $("tabRecurring").addEventListener("click", () => { showView("viewRecurring"); renderRecurring(); });
  $("tabSettings").addEventListener("click", () => showView("viewSettings"));

  // Save rate (mensuel)
  $("btnSaveRate").addEventListener("click", () => {
    const ym = currentYM();
    const r = Number($("rateChfEur").value);
    if (!Number.isFinite(r) || r <= 0) {
      alert("Entre un taux CHF→EUR valide (ex: 0.95).");
      return;
    }
    state.ratesByMonth[ym] = r;
    saveState();
    renderDashboard();
    alert(`Taux enregistré pour ${ym}: ${r}`);
  });

  // Save salary
  $("btnSaveSalary").addEventListener("click", () => {
    const v = Number($("salaryNetChf").value);
    if (!Number.isFinite(v) || v <= 0) {
      alert("Entre un salaire net CHF valide.");
      return;
    }
    state.salaryNetChf = v;
    saveState();
    alert("Salaire enregistré.");
    renderDashboard();
  });

  // Quick fuel
  $("btnQuickFuel").addEventListener("click", () => {
    $("txType").value = "depense";
    $("txCurrency").value = "EUR";
    $("txCategory").value = "Transport";
    $("txNote").value = "Essence (plein)";
    $("txAmount").focus();
  });

  // Add transaction
  $("btnAddTx").addEventListener("click", () => {
    const dateISO = $("txDate").value || todayISO();
    const ym = ymFromISO(dateISO);

    const type = $("txType").value;
    const montantSaisi = Number($("txAmount").value);
    const deviseSaisie = $("txCurrency").value;
    const categorie = $("txCategory").value;
    const note = $("txNote").value || "";

    if (!Number.isFinite(montantSaisi) || montantSaisi <= 0) {
      alert("Entre un montant > 0");
      return;
    }

    // CHF nécessite un taux
    if (deviseSaisie === "CHF" && !getRateForMonth(ym)) {
      alert(`Tu as saisi en CHF mais il manque le taux CHF→EUR pour ${ym}. Va sur Dashboard et enregistre le taux.`);
      return;
    }

    const montantEUR = round2(toEUR(montantSaisi, deviseSaisie, ym));

    const tx = {
      id: crypto.randomUUID(),
      dateISO,
      type,
      montantSaisi,
      deviseSaisie,
      montantEUR,
      categorie,
      note
    };

    state.transactions.push(tx);
    saveState();

    $("txAmount").value = "";
    $("txNote").value = "";
    renderAll();
    showView("viewDashboard");
  });

  // Filters
  $("btnApplyFilters").addEventListener("click", () => renderTxList());

  // Generate recurrences for month
  $("btnGenerateMonth").addEventListener("click", () => {
    const ym = currentYM();
    generateRecurringForMonth(ym);
    saveState();
    renderAll();
    alert("Récurrences générées (prévision).");
  });

  // Demo
  $("btnLoadDemo").addEventListener("click", () => {
    loadDemo();
    saveState();
    renderAll();
    alert("Démo chargée.");
  });

  // Export
  $("btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "budget-backup.json";
    a.click();
  });

  // Import
  $("importJson").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      state = JSON.parse(txt);
      state = { ...defaultState(), ...state };
      saveState();
      renderAll();
      alert("Import OK.");
    } catch {
      alert("Import impossible (fichier invalide).");
    }
  });

  // Wipe
  $("btnWipe").addEventListener("click", () => {
    if (!confirm("Tout effacer ?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
    setLocked(true);
    initDefaults();
    renderAll();
  });
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ======================
// Business logic
// ======================

function generateRecurringForMonth(ym) {
  const already = new Set(
    state.transactions
      .filter(t => ymFromISO(t.dateISO) === ym && t.note?.includes("(prévu)"))
      .map(t => `${t.note}|${t.categorie}|${t.type}|${t.montantEUR}`)
  );

  state.recurring.forEach(r => {
    const dateISO = `${ym}-${String(r.dayMin).padStart(2,"0")}`;

    // Montant prévision en EUR (ici, tout est en EUR pour ces récurrences)
    let montantEUR = Number(r.montantSaisi) || 0;

    const note =
      r.approxType === "range"
        ? `${r.libelle} (prévu range ${r.rangeMin}–${r.rangeMax})`
        : r.approxType === "approx"
          ? `${r.libelle} (prévu approx)`
          : `${r.libelle} (prévu)`;

    const key = `${note}|${r.categorie}|depense|${montantEUR}`;
    if (already.has(key)) return;

    state.transactions.push({
      id: crypto.randomUUID(),
      dateISO,
      type: "depense",
      montantSaisi: montantEUR,
      deviseSaisie: "EUR",
      montantEUR: round2(montantEUR),
      categorie: r.categorie,
      note,
      meta: { recurringId: r.id, status: "PREVU_A_CONFIRMER" }
    });
  });
}

function loadDemo() {
  state.transactions = [];
  // Ajoute un taux pour ce mois
  const ym = currentYM();
  if (!state.ratesByMonth[ym]) state.ratesByMonth[ym] = 0.95;

  // Revenu salaire net CHF converti
  const salaryEur = round2(toEUR(state.salaryNetChf, "CHF", ym));
  state.transactions.push({
    id: crypto.randomUUID(),
    dateISO: `${ym}-01`,
    type: "revenu",
    montantSaisi: state.salaryNetChf,
    deviseSaisie: "CHF",
    montantEUR: salaryEur,
    categorie: "Epargne",
    note: "Salaire (démo)"
  });

  // Quelques dépenses variables
  const add = (day, cat, amount, note) => state.transactions.push({
    id: crypto.randomUUID(),
    dateISO: `${ym}-${String(day).padStart(2,"0")}`,
    type: "depense",
    montantSaisi: amount,
    deviseSaisie: "EUR",
    montantEUR: round2(amount),
    categorie: cat,
    note
  });
  add(3, "Alimentation", 86.40, "Courses");
  add(8, "Loisirs", 25.00, "Cinéma");
  add(9, "Transport", 62.10, "Essence (plein)");
  add(16, "Abonnements", 12.99, "Streaming");
  add(23, "Transport", 58.70, "Essence (plein)");

  generateRecurringForMonth(ym);
}

// ======================
// Rendering
// ======================

function renderDashboard() {
  const ym = currentYM();

  const txs = state.transactions.filter(t => ymFromISO(t.dateISO) === ym);
  let income = 0, expense = 0;
  txs.forEach(t => {
    if (t.type === "revenu") income += Number(t.montantEUR) || 0;
    else expense += Number(t.montantEUR) || 0;
  });

  $("kpiIncome").textContent = round2(income).toFixed(2);
  $("kpiExpense").textContent = round2(expense).toFixed(2);
  $("kpiBalance").textContent = round2(income - expense).toFixed(2);

  // taux du mois
  $("rateChfEur").value = state.ratesByMonth[ym] ?? "";
}

function renderTxList() {
  const ym = $("filterMonth").value || currentYM(); // YYYY-MM [web:355]
  const cat = $("filterCategory").value || "";
  const q = ($("filterSearch").value || "").toLowerCase();

  const list = $("txList");
  list.innerHTML = "";

  const txs = state.transactions
    .filter(t => ymFromISO(t.dateISO) === ym)
    .filter(t => !cat || t.categorie === cat)
    .filter(t => !q || (t.note || "").toLowerCase().includes(q))
    .sort((a,b) => (a.dateISO < b.dateISO ? 1 : -1));

  if (txs.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<div><span class="tag">Aucune transaction pour ${ym}.</span></div><div></div>`;
    list.appendChild(li);
    return;
  }

  txs.forEach(t => {
    const li = document.createElement("li");
    const sign = t.type === "depense" ? "-" : "+";
    const badge = t.meta?.status ? `<span class="tag">• ${t.meta.status}</span>` : "";
    li.innerHTML = `
      <div>
        <div>${escapeHtml(t.note || "(sans note)")} <span class="tag">• ${t.categorie} • ${t.dateISO} ${badge}</span></div>
      </div>
      <div>${sign}${Number(t.montantEUR).toFixed(2)} €</div>
    `;
    list.appendChild(li);
  });
}

function renderRecurring() {
  const ul = $("recurringList");
  ul.innerHTML = "";

  state.recurring.forEach(r => {
    const li = document.createElement("li");
    const windowTxt = `J${r.dayMin}→J${r.dayMax}`;
    let amountTxt = "";
    if (r.approxType === "range") amountTxt = `${r.rangeMin}–${r.rangeMax} € (range)`;
    else if (r.approxType === "approx") amountTxt = `~${r.montantSaisi} € (approx)`;
    else amountTxt = `${r.montantSaisi} €`;

    li.innerHTML = `
      <div>
        <div>${escapeHtml(r.libelle)} <span class="tag">• ${r.categorie} • ${windowTxt}</span></div>
        <div class="tag">${amountTxt}</div>
      </div>
      <div></div>
    `;
    ul.appendChild(li);
  });
}

function renderAll() {
  initDefaults();
  renderDashboard();
  renderTxList();
  renderRecurring();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// ======================
// Start
// ======================

initSelects();
bindEvents();

if (state.locked) setLocked(true);
else setLocked(false);

renderAll();

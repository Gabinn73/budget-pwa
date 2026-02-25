window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const CATEGORIES = ["Logement","Transport","Alimentation","Loisirs","Abonnements","Epargne"];
  const STORAGE_KEY = "budget_eur_state_v1";
  const PIN = "123456";

  const defaultState = () => ({
    locked: true,
    salaryNetChf: 4100,
    ratesByMonth: {}, // { "YYYY-MM": 0.95 }
    transactions: [],
    recurring: [
      { id: rid(), libelle: "Loyer", categorie: "Logement", montantEUR: 1050, dayMin: 1,  dayMax: 5,  kind: "fixed" },
      { id: rid(), libelle: "Leasing", categorie: "Transport", montantEUR: 353, dayMin: 5,  dayMax: 10, kind: "fixed" },
      { id: rid(), libelle: "Box/Forfait", categorie: "Abonnements", montantEUR: 75, dayMin: 10, dayMax: 15, kind: "fixed" },
      { id: rid(), libelle: "Péage", categorie: "Transport", montantEUR: 300, dayMin: 15, dayMax: 25, kind: "approx" },
      { id: rid(), libelle: "Essence (prévision)", categorie: "Transport", montantEUR: 250, dayMin: 20, dayMax: 28, kind: "range", rangeMin: 220, rangeMax: 280 }
    ]
  });

  function rid() {
    return (crypto?.randomUUID?.() || String(Date.now()) + "-" + String(Math.random()).slice(2));
  }

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

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function ymFromISO(dateISO) {
    return (dateISO || "").slice(0, 7); // YYYY-MM
  }
  function currentYM() {
    return new Date().toISOString().slice(0, 7);
  }
  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  let state = loadState();

  // ---------- UI helpers ----------
  function setLocked(locked) {
    state.locked = locked;
    $("screenLock")?.classList.toggle("hidden", !locked);
    $("screenApp")?.classList.toggle("hidden", locked);
    saveState();
  }

  function showView(viewId) {
    const views = ["viewDashboard","viewAdd","viewList","viewRecurring","viewSettings"];
    views.forEach(id => $(id)?.classList.add("hidden"));
    $(viewId)?.classList.remove("hidden");

    const tabs = [
      ["tabDashboard","viewDashboard"],
      ["tabAdd","viewAdd"],
      ["tabList","viewList"],
      ["tabRecurring","viewRecurring"],
      ["tabSettings","viewSettings"]
    ];
    tabs.forEach(([tab, vid]) => {
      $(tab)?.classList.toggle("active", vid === viewId);
    });
  }

  function initSelects() {
    const txCategory = $("txCategory");
    if (txCategory) {
      txCategory.innerHTML = "";
      CATEGORIES.forEach(c => {
        const o = document.createElement("option");
        o.value = c; o.textContent = c;
        txCategory.appendChild(o);
      });
    }

    const filterCategory = $("filterCategory");
    if (filterCategory) {
      filterCategory.innerHTML = `<option value="">Toutes catégories</option>`;
      CATEGORIES.forEach(c => {
        const o = document.createElement("option");
        o.value = c; o.textContent = c;
        filterCategory.appendChild(o);
      });
    }
  }

  function initDefaults() {
    if ($("txDate")) $("txDate").value = todayISO();
    if ($("filterMonth")) $("filterMonth").value = currentYM();
    if ($("salaryNetChf")) $("salaryNetChf").value = state.salaryNetChf ?? 4100;

    const ym = currentYM();
    if ($("rateChfEur")) $("rateChfEur").value = state.ratesByMonth[ym] ?? "";
  }

  // ---------- CHF->EUR ----------
  function getRate(ym) {
    const r = Number(state.ratesByMonth[ym]);
    return Number.isFinite(r) && r > 0 ? r : null;
  }
  function convertToEUR(amount, currency, ym) {
    const a = Number(amount);
    if (!Number.isFinite(a)) return 0;
    if (currency === "EUR") return a;
    const rate = getRate(ym);
    if (!rate) return 0;
    return a * rate;
  }

  // ---------- Rendering ----------
  function renderDashboard() {
    const ym = currentYM();
    const txs = state.transactions.filter(t => ymFromISO(t.dateISO) === ym);

    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.type === "revenu") income += Number(t.montantEUR) || 0;
      else expense += Number(t.montantEUR) || 0;
    }

    if ($("kpiIncome")) $("kpiIncome").textContent = round2(income).toFixed(2);
    if ($("kpiExpense")) $("kpiExpense").textContent = round2(expense).toFixed(2);
    if ($("kpiBalance")) $("kpiBalance").textContent = round2(income - expense).toFixed(2);

    if ($("rateChfEur")) $("rateChfEur").value = state.ratesByMonth[ym] ?? "";
  }

  function renderTxList() {
    const ym = $("filterMonth")?.value || currentYM();
    const cat = $("filterCategory")?.value || "";
    const q = ($("filterSearch")?.value || "").toLowerCase();

    const ul = $("txList");
    if (!ul) return;
    ul.innerHTML = "";

    const txs = state.transactions
      .filter(t => ymFromISO(t.dateISO) === ym)
      .filter(t => !cat || t.categorie === cat)
      .filter(t => !q || (t.note || "").toLowerCase().includes(q))
      .sort((a,b) => (a.dateISO < b.dateISO ? 1 : -1));

    if (txs.length === 0) {
      const li = document.createElement("li");
      li.innerHTML = `<div><span class="tag">Aucune transaction pour ${ym}.</span></div><div></div>`;
      ul.appendChild(li);
      return;
    }

    for (const t of txs) {
      const li = document.createElement("li");
      const sign = t.type === "depense" ? "-" : "+";
      li.innerHTML = `
        <div>
          <div>${escapeHtml(t.note || "(sans note)")} <span class="tag">• ${t.categorie} • ${t.dateISO}</span></div>
        </div>
        <div>${sign}${Number(t.montantEUR).toFixed(2)} €</div>
      `;
      ul.appendChild(li);
    }
  }

  function renderRecurring() {
    const ul = $("recurringList");
    if (!ul) return;
    ul.innerHTML = "";

    for (const r of state.recurring) {
      const li = document.createElement("li");
      const windowTxt = `J${r.dayMin}→J${r.dayMax}`;
      let amountTxt = "";
      if (r.kind === "range") amountTxt = `${r.rangeMin}–${r.rangeMax} € (range)`;
      else if (r.kind === "approx") amountTxt = `~${r.montantEUR} € (approx)`;
      else amountTxt = `${r.montantEUR} €`;

      li.innerHTML = `
        <div>
          <div>${escapeHtml(r.libelle)} <span class="tag">• ${r.categorie} • ${windowTxt}</span></div>
          <div class="tag">${amountTxt}</div>
        </div>
        <div></div>
      `;
      ul.appendChild(li);
    }
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

  // ---------- Recurrences ----------
  function generateRecurringForMonth(ym) {
    for (const r of state.recurring) {
      const dateISO = `${ym}-${String(r.dayMin).padStart(2,"0")}`;
      const note =
        r.kind === "range" ? `${r.libelle} (prévu range ${r.rangeMin}–${r.rangeMax})` :
        r.kind === "approx" ? `${r.libelle} (prévu approx)` :
        `${r.libelle} (prévu)`;

      state.transactions.push({
        id: rid(),
        dateISO,
        type: "depense",
        montantSaisi: r.montantEUR,
        deviseSaisie: "EUR",
        montantEUR: round2(r.montantEUR),
        categorie: r.categorie,
        note
      });
    }
  }

  // ---------- Events ----------
  initSelects();

  $("btnLock")?.addEventListener("click", () => setLocked(true));

  $("btnUnlock")?.addEventListener("click", () => {
    const pin = $("pinInput")?.value || "";
    if (pin === PIN) {
      if ($("lockMsg")) $("lockMsg").textContent = "";
      setLocked(false);
      showView("viewDashboard");
      renderAll();
    } else {
      if ($("lockMsg")) $("lockMsg").textContent = "PIN incorrect (essaie 123456).";
    }
  });

  $("tabDashboard")?.addEventListener("click", () => { showView("viewDashboard"); renderDashboard(); });
  $("tabAdd")?.addEventListener("click", () => showView("viewAdd"));
  $("tabList")?.addEventListener("click", () => { showView("viewList"); renderTxList(); });
  $("tabRecurring")?.addEventListener("click", () => { showView("viewRecurring"); renderRecurring(); });
  $("tabSettings")?.addEventListener("click", () => showView("viewSettings"));

  $("btnSaveRate")?.addEventListener("click", () => {
    const ym = currentYM();
    const r = Number($("rateChfEur")?.value);
    if (!Number.isFinite(r) || r <= 0) return alert("Entre un taux CHF→EUR valide (ex: 0.95).");
    state.ratesByMonth[ym] = r;
    saveState();
    renderDashboard();
    alert(`Taux enregistré pour ${ym}.`);
  });

  $("btnSaveSalary")?.addEventListener("click", () => {
    const v = Number($("salaryNetChf")?.value);
    if (!Number.isFinite(v) || v <= 0) return alert("Entre un salaire net CHF valide.");
    state.salaryNetChf = v;
    saveState();
    alert("Salaire enregistré.");
  });

  $("btnQuickFuel")?.addEventListener("click", () => {
    if ($("txType")) $("txType").value = "depense";
    if ($("txCurrency")) $("txCurrency").value = "EUR";
    if ($("txCategory")) $("txCategory").value = "Transport";
    if ($("txNote")) $("txNote").value = "Essence (plein)";
    $("txAmount")?.focus();
  });

// Catégorie par défaut
$("txType")?.addEventListener("change", () => {
  const t = $("txType")?.value;
  if (t === "revenu") $("txCategory").value = "Revenus";
  if (t === "depense" && $("txCategory").value === "Revenus") $("txCategory").value = "Transport";
});
    const dateISO = $("txDate")?.value || todayISO();
    const ym = ymFromISO(dateISO);

    const type = $("txType")?.value || "depense";
    const montant = Number($("txAmount")?.value);
    const devise = $("txCurrency")?.value || "EUR";
    const categorie = $("txCategory")?.value || "Transport";
    const note = $("txNote")?.value || "";

    if (!Number.isFinite(montant) || montant <= 0) return alert("Entre un montant > 0.");

    if (devise === "CHF" && !getRate(ym)) {
      return alert(`Il manque le taux CHF→EUR pour ${ym}. Va sur Dashboard et enregistre le taux.`);
    }

    const eur = round2(convertToEUR(montant, devise, ym));

    state.transactions.push({
      id: rid(),
      dateISO,
      type,
      montantSaisi: montant,
      deviseSaisie: devise,
      montantEUR: eur,
      categorie,
      note
    });

    saveState();
    if ($("txAmount")) $("txAmount").value = "";
    if ($("txNote")) $("txNote").value = "";
    renderAll();
    showView("viewDashboard");
  });

  $("btnApplyFilters")?.addEventListener("click", renderTxList);

  $("btnGenerateMonth")?.addEventListener("click", () => {
    generateRecurringForMonth(currentYM());
    saveState();
    renderAll();
    alert("Récurrences ajoutées (prévisions).");
  });

  $("btnLoadDemo")?.addEventListener("click", () => {
    const ym = currentYM();
    if (!state.ratesByMonth[ym]) state.ratesByMonth[ym] = 0.95;

    // reset
    state.transactions = [];

    // salaire
    const salaryEur = round2(convertToEUR(state.salaryNetChf, "CHF", ym));
    state.transactions.push({
      id: rid(),
      dateISO: `${ym}-01`,
      type: "revenu",
      montantSaisi: state.salaryNetChf,
      deviseSaisie: "CHF",
      montantEUR: salaryEur,
      categorie: "Epargne",
      note: "Salaire (démo)"
    });

    // quelques dépenses
    state.transactions.push({ id: rid(), dateISO: `${ym}-03`, type:"depense", montantSaisi: 86.40, deviseSaisie:"EUR", montantEUR:86.40, categorie:"Alimentation", note:"Courses" });
    state.transactions.push({ id: rid(), dateISO: `${ym}-09`, type:"depense", montantSaisi: 62.10, deviseSaisie:"EUR", montantEUR:62.10, categorie:"Transport", note:"Essence (plein)" });

    generateRecurringForMonth(ym);
    saveState();
    renderAll();
    alert("Démo chargée.");
  });

  $("btnExportJson")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "budget-backup.json";
    a.click();
  });

  $("importJson")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      state = { ...defaultState(), ...parsed };
      saveState();
      renderAll();
      alert("Import OK.");
    } catch {
      alert("Import impossible (fichier invalide).");
    }
  });

  $("btnWipe")?.addEventListener("click", () => {
    if (!confirm("Tout effacer ?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
    setLocked(true);
    renderAll();
  });

  // start
  setLocked(Boolean(state.locked));
  showView("viewDashboard");
  renderAll();
});

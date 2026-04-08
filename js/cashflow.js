// ===== INIT DB =====
window.db = window.db || firebase.firestore();

// ===== GLOBAL CACHE =====
let BANKS = {};
let SOURCES = {};
let LIMITS = {};
let CASH = [];
let isSaving = false;

// ===== UTIL =====
function now() { return new Date(); }
function getUser() { return firebase.auth().currentUser?.email || "unknown"; }

function formatMoneyInput(el, isExpense = false) {
  let v = el.value.replace(/,/g, '').replace(/-/g, '').replace(/\D/g, '');
  if (!v) return el.value = "";
  el.value = (isExpense ? "-" : "") + Number(v).toLocaleString('en-US');
}

function getRawMoney(id) {
  return document.getElementById(id).value.replace(/,/g, '');
}

function formatMoney(v) {
  return v ? Number(v).toLocaleString('en-US') : '0';
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerText = msg;
  document.getElementById("toast").appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== COUNTER =====
async function getNextId(name, prefix) {
  const ref = db.collection("counters").doc(name);

  return db.runTransaction(async t => {
    const d = await t.get(ref);
    let c = d.exists ? (d.data().value || 0) : 0;
    c++;
    t.set(ref, { value: c });
    return prefix + String(c).padStart(2, '0');
  });
}

// ===== POPUP =====
function openCashPopup(type) {
  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  c.innerHTML = `
    <h3>${type === "income" ? "Thu tiền" : "Chi tiền"}</h3>

    <label>Ngân hàng</label>
    <select id="cashBank"></select>

    <label>Nguồn tiền</label>
    <select id="cashSource"></select>

    <input id="cashAmount" placeholder="Số tiền"
      oninput="formatMoneyInput(this, ${type === "expense"})">

    <input id="cashNote" placeholder="Nội dung">

    <button id="saveBtn" onclick="saveCash('${type}')">Lưu</button>
    <button onclick="closePopup()">Đóng</button>
  `;

  loadOptions();
}

function closePopup() {
  document.getElementById("popup").classList.add("hidden");
}

// ===== LOAD OPTIONS =====
function loadOptions() {
  let bankHTML = "", sourceHTML = "";

  Object.keys(BANKS).forEach(id => {
    if (!BANKS[id].isDeleted) {
      bankHTML += `<option value="${id}">${BANKS[id].name}</option>`;
    }
  });

  Object.keys(SOURCES).forEach(id => {
    if (!SOURCES[id].isDeleted) {
      sourceHTML += `<option value="${id}">${SOURCES[id].name}</option>`;
    }
  });

  document.getElementById("cashBank").innerHTML = bankHTML;
  document.getElementById("cashSource").innerHTML = sourceHTML;
}

// ===== SAVE =====
async function saveCash(type) {

  if (isSaving) return;

  const btn = document.getElementById("saveBtn");
  const amount = getRawMoney("cashAmount");
  if (!amount) return showToast("Nhập tiền");

  try {
    isSaving = true;

    btn.innerHTML = `<span class="loading-spinner"></span>Đang lưu`;
    btn.disabled = true;

    // OPTIMISTIC UI
    const tempData = {
      id: "temp-" + Date.now(),
      type,
      bankId: cashBank.value,
      sourceId: cashSource.value,
      amount: Number(amount),
      note: cashNote.value
    };

    CASH.unshift(tempData);
    renderAll();

    const id = await getNextId(
      type === "income" ? "income" : "expense",
      type === "income" ? "TT" : "CT"
    );

    await db.collection("cashflow").doc(id).set({
      ...tempData,
      id,
      createdAt: now(),
      createdBy: getUser()
    });

    showToast("Đã lưu");
    closePopup();

  } catch (err) {
    console.error(err);
    showToast("Lỗi khi lưu!");
  } finally {
    isSaving = false;
    btn.innerHTML = "Lưu";
    btn.disabled = false;
  }
}

// ===== LOAD STATIC =====
async function loadBanks() {
  const snap = await db.collection("banks").get();

  let html = `<option value="all">Tất cả ngân hàng</option>`;

  snap.forEach(d => {
    const data = d.data();
    BANKS[d.id] = data;
    html += `<option value="${d.id}">${data.short}</option>`;
  });

  document.getElementById("filterBank").innerHTML = html;
}

async function loadSources() {
  const snap = await db.collection("sources").get();

  let html = `
    <option value="all">Tất cả</option>
    <option value="GN">Ghi nợ</option>
    <option value="TD">Tín dụng</option>
  `;

  snap.forEach(d => {
    SOURCES[d.id] = d.data();
  });

  document.getElementById("filterSource").innerHTML = html;
}

async function loadLimits() {
  const snap = await db.collection("limits").get();

  snap.forEach(d => {
    const data = d.data();
    LIMITS[data.bankId] = {
      limit: Number(data.value),
      used: 0
    };
  });
}

// ===== FILTER =====
function getFilteredCash() {

  const bankFilter = document.getElementById("filterBank")?.value || "all";
  const sourceFilter = document.getElementById("filterSource")?.value || "all";

  return CASH.filter(d => {

    const source = SOURCES[d.sourceId]?.short;

    if (bankFilter !== "all" && d.bankId !== bankFilter) return false;

    if (sourceFilter !== "all" && source !== sourceFilter) return false;

    return true;
  });
}

// ===== REALTIME =====
function listenCashflow() {
  db.collection("cashflow")
    .orderBy("createdAt", "desc")
    .limit(200)
    .onSnapshot(snap => {

      CASH = [];

      snap.forEach(doc => {
        CASH.push(doc.data());
      });

      renderAll();
    });
}

// ===== RENDER =====
function renderAll() {
  const filtered = getFilteredCash();
  renderBalance(filtered);
  renderTables(filtered);
}

// ===== BALANCE =====
function renderBalance(data) {

  let html = `<tr>
    <th>Ngân hàng</th>
    <th>Loại</th>
    <th>Hạn mức</th>
    <th>Đã dùng</th>
    <th>Còn lại</th>
  </tr>`;

  let bankMap = {};

  data.forEach(d => {

    if (!bankMap[d.bankId]) {
      bankMap[d.bankId] = { debit: 0 };
    }

    const source = SOURCES[d.sourceId]?.short;

    if (source === "GN") {
      bankMap[d.bankId].debit += Number(d.amount);
    }
  });

  const bankFilter = document.getElementById("filterBank")?.value || "all";

  let allBankIds;
  
  if(bankFilter === "all"){
    allBankIds = new Set([
      ...Object.keys(BANKS),
      ...Object.keys(LIMITS),
      ...Object.keys(bankMap)
    ]);
  }else{
    allBankIds = new Set([bankFilter]);
  }

  allBankIds.forEach(bankId => {

    const bank = BANKS[bankId];
    const debit = bankMap[bankId]?.debit || 0;
    const credit = LIMITS[bankId];

    // GHI NỢ
    if (debit !== 0) {
      html += `
      <tr>
        <td>${bank?.name || ''}</td>
        <td>Ghi nợ</td>
        <td>-</td>
        <td>-</td>
        <td>${formatMoney(debit)}</td>
      </tr>`;
    }

    // TÍN DỤNG
    // TÍN DỤNG
    if (credit) {

      let used = 0;

      data.forEach(d => {
        if (d.bankId === bankId && SOURCES[d.sourceId]?.short === "TD") {
          used += Number(d.amount);
        }
      });

      // 👉 chỉ render nếu có phát sinh
      if (used !== 0) {
        html += `
    <tr>
      <td>${bank?.name || ''}</td>
      <td>Tín dụng</td>
      <td>${formatMoney(credit.limit)}</td>
      <td>${formatMoney(-used)}</td>
      <td>${formatMoney(credit.limit + used)}</td>
    </tr>`;
      }
    }

  });

  document.getElementById("balanceTable").innerHTML = html;
}

// ===== TABLE =====
function renderTables(data) {

  let incomeHTML = `<tr>
    <th>ID</th><th>Bank</th><th>Source</th><th>Tiền</th><th>Note</th>
  </tr>`;

  let expenseHTML = incomeHTML;

  data.forEach(d => {

    const row = `
    <tr>
      <td>${d.id}</td>
      <td>${BANKS[d.bankId]?.short || ''}</td>
      <td>${SOURCES[d.sourceId]?.short || ''}</td>
      <td>${formatMoney(d.amount)}</td>
      <td>${d.note || ''}</td>
    </tr>`;

    if (d.type === "income") incomeHTML += row;
    else expenseHTML += row;
  });

  document.getElementById("incomeTable").innerHTML = incomeHTML;
  document.getElementById("expenseTable").innerHTML = expenseHTML;
}

// ===== FILTER TRIGGER =====
function loadData() {
  renderAll();
}

// ===== INIT =====
async function initApp() {
  await Promise.all([
    loadBanks(),
    loadSources(),
    loadLimits()
  ]);

  listenCashflow();
}

initApp();
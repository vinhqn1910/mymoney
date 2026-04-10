// ===== INIT DB =====
window.db = window.db || firebase.firestore();

// ===== GLOBAL CACHE =====
let BANKS = {};
let SOURCES = {};
let LIMITS = {};
let CASH = [];
let isSaving = false;
let currentPageIncome = 1;
let currentPageExpense = 1;
const pageSize = 10;

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

<label class="checkbox-inline">
  <input type="checkbox" id="autoBankType"
    onchange="handleAutoBank('${type}')">
  <span>Dùng ${type === "income" ? "TK chuyên thu" : "TK chuyên trả"}</span>
</label>

  <div id="bankSuggestBox" style="display:none;margin:10px 0;"></div>

  <label>Ngân hàng</label>
  <select id="cashBank"></select>

  <label>Nguồn tiền</label>
  <select id="cashSource"></select>

  <input id="cashAmount" placeholder="Số tiền"
    oninput="formatMoneyInput(this, ${type === "expense"})">

  <input id="cashNote" placeholder="Nội dung">

  <div class="btn-group-center">
    <button id="saveBtn" class="btn-save" onclick="saveCash('${type}')">Lưu</button>
    <button class="btn-close" onclick="closePopup()">Đóng</button>
  </div>
`;

  loadOptions();
}

function handleAutoBank(type) {

  const checked = document.getElementById("autoBankType").checked;
  const box = document.getElementById("bankSuggestBox");
  const select = document.getElementById("cashBank");
  select.disabled = checked;
  if (!checked) {
    box.style.display = "none";
    return;
  }

  // xác định type
  const targetType = type === "income" ? "in" : "out";

  // lọc ngân hàng phù hợp
  const matchedBanks = Object.entries(BANKS)
    .filter(([id, b]) => !b.isDeleted && b.type === targetType);

  if (matchedBanks.length === 0) {
    showToast("Không có tài khoản phù hợp");
    return;
  }

  // nếu chỉ 1 TK → auto chọn
  if (matchedBanks.length === 1) {
    select.value = matchedBanks[0][0];
    box.style.display = "none";
    return;
  }

  // nếu nhiều → show select gợi ý
  let html = `<label>Chọn ${type === "income" ? "TK thu" : "TK trả"}:</label>`;
  html += `<select onchange="selectSuggestedBank(this)">`;

  matchedBanks.forEach(([id, b], index) => {
    html += `<option value="${id}" ${index === 0 ? 'selected' : ''}>${b.name}</option>`;
  });

  html += `</select>`;

  box.innerHTML = html;
  box.style.display = "block";


  // ✅ FIX: set mặc định theo bank đầu tiên đúng loại
  select.value = matchedBanks[0][0];
}

function selectSuggestedBank(el) {
  document.getElementById("cashBank").value = el.value;
}

function closePopup() {
  document.getElementById("popup").classList.add("hidden");
}

// ===== LOAD OPTIONS =====
function loadOptions() {
  let bankHTML = "", sourceHTML = "";

  Object.keys(BANKS).forEach(id => {
    const b = BANKS[id];

    if (!b.isDeleted) {

      const isDisabled = b.status === false;

      bankHTML += `
        <option value="${id}" 
          ${isDisabled ? "disabled" : ""}
          title="${isDisabled ? "Ngân hàng đang ngưng hoạt động, kiểm tra lại khai báo" : ""}"
          style="${isDisabled ? "color:#999;" : ""}">
          ${b.name}
        </option>
      `;
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

  // ===== LẤY DATA =====
  const bankId = document.getElementById("cashBank").value;
  const sourceId = document.getElementById("cashSource").value;
  const note = document.getElementById("cashNote").value;

  const bank = BANKS[bankId];
  const source = SOURCES[sourceId]?.short;

  // ===== CHECK BANK =====
  if (!bank || bank.status === false) {
    return showToast("Ngân hàng đang ngưng hoạt động!");
  }

  // ===== CHECK LIMIT (CHỈ TÍN DỤNG) =====
  if (source === "TD") {
    const limit = LIMITS[bankId];

    if (!limit || limit.status === false) {
      return showToast("Hạn mức tín dụng đang ngưng!");
    }
  }

  try {
    isSaving = true;

    btn.innerHTML = `<span class="loading-spinner"></span>Đang lưu`;
    btn.disabled = true;

    // ===== OPTIMISTIC UI =====
    const tempData = {
      id: "temp-" + Date.now(),
      type,
      bankId,
      sourceId,
      amount: Number(amount),
      note
    };

    CASH.unshift(tempData);
    renderAll();

    // ===== GENERATE ID =====
    const id = await getNextId(
      type === "income" ? "income" : "expense",
      type === "income" ? "TT" : "CT"
    );

    // ===== SAVE FIRESTORE =====
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
    html += `<option value="${d.id}">${data.name}</option>`;
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
      used: 0,
      status: data.status !== false // mặc định true nếu không có
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
  let grandTotal = 0;
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

  if (bankFilter === "all") {
    allBankIds = new Set([
      ...Object.keys(BANKS),
      ...Object.keys(LIMITS),
      ...Object.keys(bankMap)
    ]);
  } else {
    allBankIds = new Set([bankFilter]);
  }

  allBankIds.forEach(bankId => {

    const bank = BANKS[bankId];
    const debit = bankMap[bankId]?.debit || 0;
    const credit = LIMITS[bankId];

    // GHI NỢ
    if (debit !== 0) {

      grandTotal += debit; // ✅ cộng vào tổng

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

      if (used !== 0) {

        const remain = credit.limit + used;

        grandTotal += remain;

        html += `
    <tr>
      <td>${bank?.name || ''}</td>
      <td>Tín dụng</td>
      <td>${formatMoney(credit.limit)}</td>
      <td>${formatMoney(-used)}</td>
      <td>${formatMoney(remain)}</td>
    </tr>`;
      }
    }

  });
  html += `
  <tr style="font-weight:bold; background:#e8f5e9">
    <td colspan="4">Tổng cộng</td>
    <td>${formatMoney(grandTotal)}</td>
  </tr>
  `;
  document.getElementById("balanceTable").innerHTML = html;
}

// ===== TABLE =====
function renderTables(data) {

  const incomeData = data.filter(d => d.type === "income");
  const expenseData = data.filter(d => d.type === "expense");

  renderTableWithPaging(incomeData, "incomeTable", "income", currentPageIncome);
  renderTableWithPaging(expenseData, "expenseTable", "expense", currentPageExpense);
}

function formatDate(ts) {
  if (!ts) return '';
  const date = ts.seconds
    ? new Date(ts.seconds * 1000)
    : ts.toDate();

  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderTableWithPaging(data, tableId, type, currentPage) {

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = data.slice(start, end);

  let html = `<tr>
    <th>ID</th><th>Bank</th><th>Source</th><th>Amount</th><th>Time</th><th>Note</th>
  </tr>`;

  pageData.forEach(d => {
    html += `
    <tr>
      <td>${d.id}</td>
      <td>${BANKS[d.bankId]?.name || ''}</td>
      <td>${SOURCES[d.sourceId]?.short || ''}</td>
      <td>${formatMoney(d.amount)}</td>
      <td>${formatDate(d.createdAt)}</td>
      <td>${d.note || ''}</td>
    </tr>`;
  });


  // 👉 PAGINATION BUTTON
  const totalPages = Math.ceil(data.length / pageSize);

  let pagingHTML = `<tr><td colspan="5">`;

  for (let i = 1; i <= totalPages; i++) {
    pagingHTML += `
      <button onclick="changePage('${type}', ${i})"
        style="margin:2px; ${i === currentPage ? 'font-weight:bold' : ''}">
        ${i}
      </button>
    `;
  }

  pagingHTML += `</td></tr>`;

  document.getElementById(tableId).innerHTML = html + pagingHTML;
}

function changePage(type, page) {
  if (type === "income") {
    currentPageIncome = page;
  } else {
    currentPageExpense = page;
  }

  renderAll();
}

// ===== FILTER TRIGGER =====
function loadData() {
  currentPageIncome = 1;
  currentPageExpense = 1;
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
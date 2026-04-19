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
let EDIT_PERMISSION = null;

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

<label class="switch">
  <input type="checkbox" id="autoBankType"
    onchange="handleAutoBank('${type}')">
  <span class="slider"></span>
  <span class="switch-label">
    Dùng ${type === "income" ? "TK chuyên thu" : "TK chuyên trả"}
  </span>
</label>

${type === "expense" ? `

<label class="switch">
  <input type="checkbox" id="isWithdraw"
    onchange="handleWithdrawToggle()">
  <span class="slider"></span>
  <span class="switch-label">Rút tiền</span>
</label>

<label class="switch">
  <input type="checkbox" id="isInternal"
    onchange="handleInternalToggle()">
  <span class="slider"></span>
  <span class="switch-label">Hạch toán nội bộ</span>
</label>

<label class="switch">
  <input type="checkbox" id="isCreditPayment"
    onchange="handleCreditPaymentToggle()">
  <span class="slider"></span>
  <span class="switch-label">Thanh toán tín dụng</span>
</label>
  ` : ''}

  <div id="bankSuggestBox" style="display:none;margin:10px 0;"></div>

  <label>Ngân hàng</label>
  <select id="cashBank"></select>

  <label>Nguồn tiền</label>
  <select id="cashSource"></select>

  <!-- 👇 đặt xuống đây -->
<div id="internalBankBox" style="display:none;">
  <label>Ngân hàng nhận</label>
  <select id="cashBankTo" onchange="updateInternalNote()"></select>
</div>

<input 
  id="cashAmount" 
  type="text"
  inputmode="numeric"
  pattern="[0-9]*"
  placeholder="Số tiền"
  oninput="formatMoneyInput(this, ${type === 'expense'})">

  <input id="cashNote" placeholder="Nội dung">

  <div class="btn-group-center">
    <button id="saveBtn" class="btn-save" onclick="saveCash('${type}')">Lưu</button>
    <button class="btn-close" onclick="closePopup()">Đóng</button>
  </div>
`;

  loadOptions();

}

function handleCreditPaymentToggle() {
  const credit = document.getElementById("isCreditPayment");
  const withdraw = document.getElementById("isWithdraw");
  const internal = document.getElementById("isInternal");

  const noteInput = document.getElementById("cashNote");
  const internalBox = document.getElementById("internalBankBox");
  const bankTo = document.getElementById("cashBankTo");

  if (credit.checked) {

    withdraw.checked = false;
    internal.checked = false;
  
    if (internalBox) internalBox.style.display = "block";
  
    // ✅ LOAD ONLY CREDIT BANK
    loadBankToOptions("credit");
  
    const bankName = BANKS[bankTo?.value]?.name || "";
  
    noteInput.value = `Chi tiền TTTD ${bankName}`;
    noteInput.disabled = true;
  
  } else {
    if (internalBox) internalBox.style.display = "none";

    noteInput.value = "";
    noteInput.disabled = false;
  }
}

function loadBankToOptions(mode) {
  const bankToEl = document.getElementById("cashBankTo");
  if (!bankToEl) return;

  let html = "";

  Object.keys(BANKS).forEach(id => {
    const bank = BANKS[id];
    const limit = LIMITS[id];

    if (bank.isDeleted || bank.status === false) return;

    // ✅ HẠCH TOÁN NỘI BỘ → ALL BANK ACTIVE
    if (mode === "internal") {
      html += `<option value="${id}">${bank.name}</option>`;
    }

    // ✅ THANH TOÁN TÍN DỤNG → ONLY BANK CÓ LIMIT
    if (mode === "credit") {
      if (limit && limit.status !== false) {
        html += `<option value="${id}">${bank.name}</option>`;
      }
    }
  });

  bankToEl.innerHTML = html;
}

function updateInternalNote() {
  const internal = document.getElementById("isInternal");
  const credit = document.getElementById("isCreditPayment");

  const bankTo = document.getElementById("cashBankTo");
  const noteInput = document.getElementById("cashNote");

  const bankName = BANKS[bankTo.value]?.name || "";

  if (internal?.checked) {
    noteInput.value = `Hạch toán nội bộ đến NH ${bankName}`;
  }

  if (credit?.checked) {
    noteInput.value = `Chi tiền TTTD ${bankName}`;
  }
}

function handleInternalToggle() {
  const internal = document.getElementById("isInternal");
  const withdraw = document.getElementById("isWithdraw");
  const credit = document.getElementById("isCreditPayment");

  const noteInput = document.getElementById("cashNote");
  const internalBox = document.getElementById("internalBankBox");
  const bankTo = document.getElementById("cashBankTo");

  if (internal.checked) {

    withdraw.checked = false;
    credit.checked = false;
  
    if (internalBox) internalBox.style.display = "block";
  
    // ✅ LOAD ALL BANK
    loadBankToOptions("internal");
  
    const bankName = BANKS[bankTo?.value]?.name || "";
  
    noteInput.value = `Hạch toán nội bộ đến NH ${bankName}`;
    noteInput.disabled = true;
  
  } else {
    if (internalBox) internalBox.style.display = "none";

    noteInput.value = "";
    noteInput.disabled = false;
  }
}

function handleWithdrawToggle() {
  const withdraw = document.getElementById("isWithdraw");
  const internal = document.getElementById("isInternal");
  const credit = document.getElementById("isCreditPayment");

  const noteInput = document.getElementById("cashNote");
  const internalBox = document.getElementById("internalBankBox");

  if (withdraw.checked) {

    // ✅ tắt các mode khác
    internal.checked = false;
    credit.checked = false;

    if (internalBox) internalBox.style.display = "none";

    noteInput.value = "Rút tiền mặt";
    noteInput.disabled = true;

  } else {
    noteInput.value = "";
    noteInput.disabled = false;
  }
}
function toggleInternalTransfer() {
  const checked = document.getElementById("isInternal").checked;
  const box = document.getElementById("internalBankBox");

  box.style.display = checked ? "block" : "none";
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
  const bankToEl = document.getElementById("cashBankTo");
if (bankToEl) {
  let bankToHTML = "";

  Object.keys(BANKS).forEach(id => {
    const bank = BANKS[id];
    const limit = LIMITS[id];
  
    {
      bankToHTML += `<option value="${id}">${bank.name}</option>`;
    }
  });
  
  bankToEl.innerHTML = bankToHTML;
}
}
//load chỉnh sửa thu chi
async function loadEditPermission() {
  const doc = await db.collection("settings").doc("editPermission").get();
  if (doc.exists) {
    EDIT_PERMISSION = doc.data();
  }
}
// nút chỉnh sửa thu chi
function canEditCash(item) {

  if (!EDIT_PERMISSION || !EDIT_PERMISSION.enable) return false;

  const nowTime = new Date();

  const createdAt = item.createdAt?.seconds
    ? new Date(item.createdAt.seconds * 1000)
    : item.createdAt?.toDate?.();

  if (!createdAt) return false;

  const diffMs = nowTime - createdAt;
  const diffMinutes = diffMs / (1000 * 60);

  const allowMinutes = EDIT_PERMISSION.editTime * 60;

  if (diffMinutes > allowMinutes) return false;

  if (item.type === "income" && !EDIT_PERMISSION.allowIncome) return false;
  if (item.type === "expense" && !EDIT_PERMISSION.allowExpense) return false;

  return true;
}

function getEditTimeLeft(item) {

  if (!EDIT_PERMISSION?.enable) return "";

  const createdAt = item.createdAt?.seconds
    ? new Date(item.createdAt.seconds * 1000)
    : item.createdAt?.toDate?.();

  if (!createdAt) return "";

  const nowTime = new Date();
  const diffMs = nowTime - createdAt;

  const maxMs = EDIT_PERMISSION.editTime * 60 * 60 * 1000;
  const remain = maxMs - diffMs;

  if (remain <= 0) return "Hết hạn";

  const minutes = Math.floor(remain / (1000 * 60));
  return `${minutes}p`;
}

function editCash(id) {

  const item = CASH.find(x => x.id === id);
  if (!item) return showToast("Không tìm thấy dữ liệu");

  if (!canEditCash(item)) {
    return showToast("Đã hết thời gian chỉnh sửa!");
  }
  // mở popup giống create
  openCashPopup(item.type);

  setTimeout(() => {

    document.getElementById("cashBank").value = item.bankId;
    document.getElementById("cashSource").value = item.sourceId;
    document.getElementById("cashAmount").value =
      formatMoney(item.amount);

    document.getElementById("cashNote").value = item.note || "";

    // đổi nút save thành update
    const btn = document.getElementById("saveBtn");
    btn.innerText = "Cập nhật";
    btn.onclick = () => updateCash(id, item.type);

  }, 100);
}

async function updateCash(id, type) {

  if (isSaving) return;

  const btn = document.getElementById("saveBtn");

  const amount = getRawMoney("cashAmount");
  if (!amount) return showToast("Nhập tiền");

  const bankId = document.getElementById("cashBank").value;
  const sourceId = document.getElementById("cashSource").value;
  const note = document.getElementById("cashNote").value;

  const bank = BANKS[bankId];
  const source = SOURCES[sourceId]?.short;

  if (!bank || bank.status === false) {
    return showToast("Ngân hàng đang ngưng hoạt động!");
  }

  if (source === "TD") {
    const limit = LIMITS[bankId];
    if (!limit || limit.status === false) {
      return showToast("Hạn mức tín dụng đang ngưng!");
    }
  }

  try {
    isSaving = true;

    btn.innerHTML = `<span class="loading-spinner"></span>Đang cập nhật`;
    btn.disabled = true;

    await db.collection("cashflow").doc(id).update({
      bankId,
      sourceId,
      amount: Number(amount),
      note,
      updatedAt: now(),
      updatedBy: getUser()
    });

    showToast("Đã cập nhật");
    closePopup();

  } catch (err) {
    console.error(err);
    showToast("Lỗi khi cập nhật!");
  } finally {
    isSaving = false;
    btn.innerHTML = "Cập nhật";
    btn.disabled = false;
  }
}

// ===== SAVE =====
async function saveCash(type) {
  const isInternal = type === "expense" && document.getElementById("isInternal")?.checked;
  const bankToId = document.getElementById("cashBankTo")?.value;
  const isCredit = type === "expense" && document.getElementById("isCreditPayment")?.checked;
  if (isSaving) return;

  const btn = document.getElementById("saveBtn");

  const amount = getRawMoney("cashAmount");
  if (!amount) return showToast("Nhập tiền");

  const bankId = document.getElementById("cashBank").value;
  const sourceId = document.getElementById("cashSource").value;
  const note = document.getElementById("cashNote").value;

  const isWithdraw = type === "expense" && document.getElementById("isWithdraw")?.checked;

  const bank = BANKS[bankId];
  const source = SOURCES[sourceId]?.short;

  if (!bank || bank.status === false) {
    return showToast("Ngân hàng đang ngưng hoạt động!");
  }

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

    // ✅ NOTE FINAL
    let finalNote = note;

    if (isWithdraw) {
      finalNote = "Rút tiền mặt";
    }
    
    if (isInternal) {
      const bankToName = BANKS[bankToId]?.name || "";
      finalNote = `Hạch toán nội bộ đến NH ${bankToName}`;
    }

    if (isCredit) {
      const bankToName = BANKS[bankToId]?.name || "";
      finalNote = `Chi tiền TTTD ${bankToName}`;
    }

    // ✅ OPTIMISTIC UI
    const tempData = {
      id: "temp-" + Date.now(),
      type,
      bankId,
      sourceId,
      amount: Number(amount),
      note: finalNote
    };

    CASH.unshift(tempData);
    renderAll();

    // ===== ID CHI =====
    const expenseId = await getNextId("expense", "CT");

    // ===== SAVE CHI =====
    await db.collection("cashflow").doc(expenseId).set({
      ...tempData,
      id: expenseId,
      note: finalNote,
      createdAt: now(),
      createdBy: getUser()
    });

    // ===== NẾU RÚT TIỀN → TẠO THU =====
// ===== RÚT TIỀN =====
if (isWithdraw) {

  const incomeId = await getNextId("income", "TT");

  const cashBankId = Object.keys(BANKS).find(id => {
    const t = BANKS[id].type;
    return t && t.toLowerCase().trim() === "cash";
  });

  if (!cashBankId) {
    showToast("Không tìm thấy tài khoản tiền mặt!");
  } else {
    await db.collection("cashflow").doc(incomeId).set({
      id: incomeId,
      type: "income",
      bankId: cashBankId,
      sourceId,
      amount: Math.abs(Number(amount)),
      note: `Giao dịch rút tiền từ ID ${expenseId}`,
      createdAt: now(),
      createdBy: getUser()
    });
  }
}

// ===== HẠCH TOÁN NỘI BỘ =====
if (isInternal) {

  if (!bankToId) {
    showToast("Chưa chọn ngân hàng nhận!");
  } else {

    const incomeId = await getNextId("income", "TT");

    await db.collection("cashflow").doc(incomeId).set({
      id: incomeId,
      type: "income",
      bankId: bankToId,
      sourceId,
      amount: Math.abs(Number(amount)),
      note: `Nhận tiền từ ID ${expenseId}`,
      createdAt: now(),
      createdBy: getUser()
    });

  }
}


// ===== THANH TOÁN TÍN DỤNG =====
if (isCredit) {

  if (!bankToId) {
    showToast("Chưa chọn ngân hàng nhận!");
  } else {

    const incomeId = await getNextId("income", "TT");

    const bankToName = BANKS[bankToId]?.name || "";

    await db.collection("cashflow").doc(incomeId).set({
      id: incomeId,
      type: "income",

      // 🔥 QUAN TRỌNG: tiền về là tín dụng
      bankId: bankToId,
      sourceId: Object.keys(SOURCES).find(id => SOURCES[id].short === "TD"),

      amount: Math.abs(Number(amount)),

      note: `TTTD ${bankToName} bởi ID ${expenseId}`,

      createdAt: now(),
      createdBy: getUser()
    });

  }
}


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
    <th>ID</th><th>Bank</th><th>Source</th><th>Amount</th><th>Time</th><th>Note</th><th>Action</th>
  </tr>`;

  pageData.forEach(d => {

    const canEdit = canEditCash(d);
  
    html += `
    <tr>
      <td>${d.id}</td>
      <td>${BANKS[d.bankId]?.name || ''}</td>
      <td>${SOURCES[d.sourceId]?.short || ''}</td>
      <td>${formatMoney(d.amount)}</td>
      <td>${formatDate(d.createdAt)}</td>
      <td>${d.note || ''}</td>
<td>
  ${canEdit ? `<button onclick="editCash('${d.id}')">✏️</button>` : ''}
  <div style="font-size:11px;color:#888">
    ${getEditTimeLeft(d)}
  </div>
</td>
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
    loadLimits(),
    loadEditPermission()

  ]);

  listenCashflow();
}

initApp();
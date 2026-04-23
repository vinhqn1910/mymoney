window.db = window.db || firebase.firestore();
let dailyPage = 1;
const DAILY_LIMIT = 10;
// ===== UTIL =====
function now() { return new Date(); }
function getUser() { return firebase.auth().currentUser?.email || "unknown"; }

function baseData() {
  return {
    createdBy: getUser(),
    createdAt: now(),
    updatedAt: null,
    updatedBy: null,
    isDeleted: false,
    status: true
  }
}

function formatMoneyInput(el) {
  let v = el.value.replace(/,/g, '').replace(/\D/g, '');
  if (!v) return el.value = "";
  el.value = Number(v).toLocaleString('en-US');
}

function formatMoneyDisplay(v) {
  return v ? Number(v).toLocaleString('en-US') : '';
}

// ===== TOAST =====
function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerText = msg;
  document.getElementById("toast").appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== LOADING =====
let isSaving = false;
function startLoading() {
  if (isSaving) {
    showToast("Đang xử lý...", "warning");
    return false;
  }
  isSaving = true;
  return true;
}
function endLoading() { isSaving = false; }

// ===== POPUP =====
function closePopup() {
  document.getElementById("popup").classList.add("hidden");
  endLoading(); // 🔥 đảm bảo không bị kẹt
}

function openPopup(type) {
  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  if (type === "plan") {
    c.innerHTML = `
        <h3>Khai báo kế hoạch</h3>
  
        <select id="planType">
          <option value="once">Chi 1 lần</option>
          <option value="daily">Chi hằng ngày</option>
        </select>
  
        <input id="planTitle" placeholder="Tiêu đề">
        <input id="planNote" placeholder="Ghi chú">
  
        <input type="date" id="planDate">
        <input type="month" id="planMonth" style="display:none;">
  
        <div id="planItems"></div>
  
        <button onclick="addPlanItem()">+ Thêm nội dung</button>
  
        <div class="btn-group-center">
          <button onclick="savePlan()">Lưu</button>
          <button onclick="closePopup()">Đóng</button>
        </div>
      `;

    addPlanItem();

    // 🔥 toggle date/month
    setTimeout(() => {
      const typeEl = document.getElementById("planType");
      const dateEl = document.getElementById("planDate");
      const monthEl = document.getElementById("planMonth");

      function toggle() {
        if (typeEl.value === "daily") {
          dateEl.style.display = "none";
          monthEl.style.display = "block";
        } else {
          dateEl.style.display = "block";
          monthEl.style.display = "none";
        }
      }

      typeEl.addEventListener("change", toggle);
      toggle();
    }, 100);
  }
}
// ===== ADD ITEM =====
function addPlanItem() {
  const div = document.createElement("div");
  div.className = "plan-item";

  div.innerHTML = `
    <input placeholder="Nội dung">
    <input placeholder="Số tiền" oninput="formatMoneyInput(this)">
    <button onclick="this.parentElement.remove()">X</button>
  `;

  document.getElementById("planItems").appendChild(div);
}

// ===== SAVE =====
async function savePlan() {
  if (!startLoading()) return;

  try {
    const type = document.getElementById("planType").value;
    const title = document.getElementById("planTitle").value.trim();
    const note = document.getElementById("planNote").value;
    const date = document.getElementById("planDate").value;
    const month = document.getElementById("planMonth").value;

    if (!title) {
      return showToast("Nhập tiêu đề", "error");
    }

    if (type === "once" && !date) {
      return showToast("Chọn ngày", "error");
    }

    if (type === "daily" && !month) {
      return showToast("Chọn tháng", "error");
    }

    const items = [];

    document.querySelectorAll("#planItems .plan-item").forEach(row => {
      const inputs = row.querySelectorAll("input");

      const content = inputs[0].value.trim();
      const amount = inputs[1].value.replace(/,/g, '');

      if (content && amount) {
        items.push({
          content,
          amount: Number(amount)
        });
      }
    });

    if (items.length === 0) {
      return showToast("Nhập ít nhất 1 khoản", "error");
    }

    const id = await getNextId("plans", "PL");

    await db.collection("plans").doc(id).set({
      id,
      type,
      title,
      note,
      date: type === "once" ? date : "",
      month: type === "daily" ? month : "",
      items,
      totalUsed: 0,
      ...baseData()
    });

    showToast("Đã lưu");
    closePopup();
    loadPlans();

  } catch (e) {
    showToast(e.message, "error");
  }

  endLoading();
}


function formatMonth(m) {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return mo + "/" + y;
}
// ===== LOAD TABLE =====
async function loadPlans() {
  const snap = await db.collection("plans").get();

  let html = `<tr>
    <th>ID</th>
    <th>Tiêu đề</th>
    <th>Loại</th>
    <th>Ngày</th>
    <th>Tổng tiền</th>
    <th>Đã sử dụng</th>
    <th>Trạng thái</th>
    <th>Lý do</th>
    <th>Action</th>
  </tr>`;

  snap.forEach(doc => {
    const d = doc.data();
    if (d.isDeleted) return;

    const total = (d.items || []).reduce((s, x) => s + x.amount, 0);

    html += `
      <tr>
        <td>${d.id}</td>
        <td>${d.title}</td>
        <td>${d.type}</td>
<td>
  ${d.type === "once" ? d.date : formatMonth(d.month)}
</td>
        <td>${formatMoneyDisplay(total)}</td>
<td>${formatMoneyDisplay(d.totalUsed || 0)}</td>
        <td>${d.status ? 'Hoạt động' : 'Ngưng'}</td>
        <td>${d.reason || ''}</td>
        <td>
          <button onclick="viewPlan('${doc.id}')">Xem</button>
            <button onclick="editPlan('${doc.id}')">Sửa</button> <!-- ✅ thêm -->

          <button onclick="togglePlan('${doc.id}',${d.status})">
            ${d.status ? 'Ngưng' : 'Mở'}
          </button>
          <button onclick="deletePlan('${doc.id}')">Xóa</button>
        </td>
      </tr>
    `;
  });

  planTable.innerHTML = html;
}

async function loadDailyPlans() {
  const snap = await db.collection("plans")
    .where("type", "==", "daily")
    .where("isDeleted", "==", false)
    .get();

  let data = [];

  snap.forEach(doc => {
    data.push(doc.data());
  });

  // 🔥 sort ID mới nhất lên trên
  data.sort((a, b) => b.id.localeCompare(a.id));

  const start = (dailyPage - 1) * DAILY_LIMIT;
  const pageData = data.slice(start, start + DAILY_LIMIT);

  renderDailyTable(pageData);
  renderDailyPagination(data.length);
}

function renderDailyTable(list) {
  let html = `
    <tr>
      <th>ID</th>
      <th>Tiêu đề</th>
      <th>Tháng</th>
      <th>Tổng tiền</th>
      <th>Action</th>
    </tr>
  `;

  list.forEach(d => {
    const total = (d.items || []).reduce((s, x) => s + x.amount, 0);

    html += `
      <tr>
        <td>${d.id}</td>
        <td>${d.title}</td>
        <td>${formatMonth(d.month)}</td>
        <td>${formatMoneyDisplay(total)}</td>
        <td>
          <button onclick="viewDailyPlan('${d.id}')">Xem</button>
        </td>
      </tr>
    `;
  });

  dailyTable.innerHTML = html;
}

function renderDailyPagination(total) {
  const totalPage = Math.ceil(total / DAILY_LIMIT);

  let html = "";

  for (let i = 1; i <= totalPage; i++) {
    html += `
      <button onclick="changeDailyPage(${i})"
        class="${i === dailyPage ? 'active' : ''}">
        ${i}
      </button>
    `;
  }

  dailyPagination.innerHTML = html;
}

function changeDailyPage(p) {
  dailyPage = p;
  loadDailyPlans();
}

async function viewDailyPlan(id) {
  const planDoc = await db.collection("plans").doc(id).get();
  const plan = planDoc.data();

  const dailyLimit = (plan.items || []).reduce((s, x) => s + x.amount, 0);

  const today = new Date();
  const currentDay = today.getDate();

  const totalLimit = dailyLimit * currentDay;

  // ===== lấy cashflow =====
  const snap = await db.collection("cashflow")
    .where("type", "==", "expense")
    .where("planId", "==", null)
    .get();

  let flows = [];

  snap.forEach(doc => {
    const d = doc.data();
    const date = d.createdAt.toDate();
    const month = date.toISOString().slice(0, 7);

    if (month === plan.month) {
      flows.push(d);
    }
  });

  // ===== tổng chi =====
  let totalSpent = 0;

  flows.forEach(x => {
    totalSpent += Math.abs(x.amount);
  });

  // ===== group theo ngày =====
  const group = {};

  flows.forEach(f => {
    const d = f.createdAt.toDate();
    const key = d.toLocaleDateString("vi-VN");

    if (!group[key]) group[key] = [];

    group[key].push(f);
  });

  // sort ngày mới nhất
  const days = Object.keys(group).sort((a, b) => {
    return new Date(b.split("/").reverse().join("-")) -
      new Date(a.split("/").reverse().join("-"));
  });

  // ===== render ngày =====
  let htmlDays = "";

  days.forEach(day => {
    const list = group[day];

    let sum = 0;
    let rows = "";

    list.forEach(x => {
      const money = Math.abs(x.amount);
      sum += money;

      rows += `
        <div>Chi ${formatMoneyDisplay(money)}đ - ${x.note || ''}</div>
      `;
    });

    const remain = dailyLimit - sum;

    htmlDays += `
      <div style="margin-bottom:15px;">
        <b>Ngày ${day}</b>
        ${rows}
        <div><b>Tổng:</b> ${formatMoneyDisplay(sum)}đ</div>
        <div style="color:${remain < 0 ? 'red' : 'green'}">
          <b>Hạn mức còn lại:</b> ${formatMoneyDisplay(remain)}đ
        </div>
        ${remain < 0 ? `<div style="color:red;">⚠️ Vượt hạn mức ngày</div>` : ""}
        <hr>
      </div>
    `;
  });

  // ===== cảnh báo tổng =====
  const totalRemain = totalLimit - totalSpent;

  document.getElementById("popupContent").innerHTML = `
    <h3>${plan.title}</h3>

    <p><b>Tháng:</b> ${formatMonth(plan.month)}</p>

<p><b>Tổng hạn mức hiện tại:</b> ${formatMoneyDisplay(totalLimit)}đ</p>
<p><b>Tổng tiền đã chi:</b> ${formatMoneyDisplay(totalSpent)}đ</p>

<p style="color:${totalRemain < 0 ? 'red' : 'green'}">
  <b>Hạn mức còn lại:</b> ${formatMoneyDisplay(totalRemain)}đ
</p>
    ${totalRemain < 0
      ? `<p style="color:red;"><b>Cảnh báo đã chi âm ${formatMoneyDisplay(Math.abs(totalRemain))}đ</b></p>`
      : ""
    }

    <p><b>Ghi chú:</b> ${plan.note || ''}</p>

    <hr>

    <h4>Chi tiêu theo ngày</h4>

    ${htmlDays || "Chưa có chi tiêu"}

    <div class="btn-group-center">
      <button onclick="closePopup()">Đóng</button>
    </div>
  `;

  document.getElementById("popup").classList.remove("hidden");
}

function openReasonPopup(title, callback) {
  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  c.innerHTML = `
      <h3>${title}</h3>
  
      <textarea id="reasonInput" placeholder="Nhập lý do..." style="width:100%;height:80px;"></textarea>
  
      <div class="btn-group-center">
        <button class="btn-save" onclick="submitReason()">Xác nhận</button>
        <button class="btn-close" onclick="closePopup()">Hủy</button>
      </div>
    `;

  // lưu callback
  window._reasonCallback = callback;

  // ===== ✅ THÊM Ở ĐÂY =====

  // auto focus
  setTimeout(() => {
    document.getElementById("reasonInput").focus();
  }, 100);

  // Ctrl + Enter để submit
  document.getElementById("reasonInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) {
      submitReason();
    }
  });
}

function submitReason() {
  const reason = document.getElementById("reasonInput").value.trim();

  if (!reason) {
    showToast("Phải nhập lý do", "error");
    return;
  }

  closePopup();

  if (window._reasonCallback) {
    window._reasonCallback(reason);
  }
}

async function editPlan(id) {
  const doc = await db.collection("plans").doc(id).get();
  const d = doc.data();

  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  let itemsHTML = "";

  (d.items || []).forEach(x => {
    itemsHTML += `
        <div class="plan-item">
          <input value="${x.content}">
          <input value="${formatMoneyDisplay(x.amount)}" oninput="formatMoneyInput(this)">
          <button onclick="this.parentElement.remove()">X</button>
        </div>
      `;
  });

  c.innerHTML = `
      <h3>Sửa kế hoạch</h3>
  
      <select id="planType">
        <option value="once" ${d.type === "once" ? "selected" : ""}>Chi 1 lần</option>
        <option value="daily" ${d.type === "daily" ? "selected" : ""}>Chi hằng ngày</option>
      </select>
  
      <input id="planTitle" value="${d.title || ''}">
      <input id="planNote" value="${d.note || ''}">
  
      <input type="date" id="planDate" value="${d.date || ''}">
      <input type="month" id="planMonth" value="${d.month || ''}" style="display:none;">
  
      <div id="planItems">${itemsHTML}</div>
  
      <button onclick="addPlanItem()">+ Thêm nội dung</button>
  
      <div class="btn-group-center">
        <button onclick="updatePlan('${id}')">Lưu</button>
        <button onclick="closePopup()">Đóng</button>
      </div>
    `;

  // 🔥 toggle lại UI
  setTimeout(() => {
    const typeEl = document.getElementById("planType");
    const dateEl = document.getElementById("planDate");
    const monthEl = document.getElementById("planMonth");

    function toggle() {
      if (typeEl.value === "daily") {
        dateEl.style.display = "none";
        monthEl.style.display = "block";
      } else {
        dateEl.style.display = "block";
        monthEl.style.display = "none";
      }
    }

    typeEl.addEventListener("change", toggle);
    toggle();
  }, 100);
}

async function updatePlan(id) {
  if (!startLoading()) return;

  try {
    const type = document.getElementById("planType").value;
    const title = document.getElementById("planTitle").value.trim();
    const note = document.getElementById("planNote").value;
    const date = document.getElementById("planDate").value;
    const month = document.getElementById("planMonth").value;

    if (!title) {
      return showToast("Nhập tiêu đề", "error");
    }

    if (type === "once" && !date) {
      return showToast("Chọn ngày", "error");
    }

    if (type === "daily" && !month) {
      return showToast("Chọn tháng", "error");
    }

    const items = [];

    document.querySelectorAll("#planItems .plan-item").forEach(row => {
      const inputs = row.querySelectorAll("input");

      const content = inputs[0].value.trim();
      const amount = inputs[1].value.replace(/,/g, '');

      if (content && amount) {
        items.push({
          content,
          amount: Number(amount)
        });
      }
    });

    if (items.length === 0) {
      return showToast("Nhập ít nhất 1 khoản", "error");
    }

    await db.collection("plans").doc(id).update({
      type,
      title,
      note,
      date: type === "once" ? date : "",
      month: type === "daily" ? month : "",
      items,
      updatedAt: now(),
      updatedBy: getUser()
    });

    showToast("Đã cập nhật");
    closePopup();
    loadPlans();

  } catch (e) {
    showToast(e.message, "error");
  }

  endLoading();
}

// ===== VIEW =====
async function viewPlan(id) {
  const doc = await db.collection("plans").doc(id).get();
  const d = doc.data();

  const total = (d.items || []).reduce((s, x) => s + x.amount, 0);
  const used = d.totalUsed || 0;
  const remain = total - used;

  let rows = "";

  (d.items || []).forEach(x => {
    rows += `
      <tr>
        <td>${x.content}</td>
        <td>${formatMoneyDisplay(x.amount)}</td>
      </tr>
    `;
  });

  document.getElementById("popupContent").innerHTML = `
    <h3>${d.title}</h3>

    <p><b>Loại:</b> ${d.type === "once" ? "Chi 1 lần" : "Chi hằng ngày"}</p>
    <p><b>Ngày/Tháng:</b> ${d.type === "once" ? (d.date || '') : formatMonth(d.month)
    }</p>
    <p><b>Ghi chú:</b> ${d.note || ''}</p>

    <hr>

    <h4>Chi tiết khoản</h4>
    <table class="table">
      <tr>
        <th>Nội dung</th>
        <th>Tiền</th>
      </tr>
      ${rows}
    </table>

    <hr>

    <h4>Tổng hợp</h4>
    <p><b>Tổng kế hoạch:</b> ${formatMoneyDisplay(total)}</p>
    <p><b>Đã sử dụng:</b> ${formatMoneyDisplay(used)}</p>
    <p style="color:${remain < 0 ? 'red' : 'green'}">
      <b>Còn lại:</b> ${formatMoneyDisplay(remain)}
    </p>

    <hr>

    <p><b>Trạng thái:</b> ${d.status ? 'Hoạt động' : 'Ngưng'}</p>
    <p><b>Lý do:</b> ${d.reason || ''}</p>

    <div class="btn-group-center">
      <button onclick="editPlan('${id}')">Sửa</button>

      <button onclick="togglePlan('${id}',${d.status})">
        ${d.status ? 'Ngưng' : 'Mở'}
      </button>

      <button onclick="deletePlan('${id}')">Xóa</button>

      <button onclick="closePopup()">Đóng</button>
    </div>
  `;

  document.getElementById("popup").classList.remove("hidden");
}

// ===== TOGGLE =====
function togglePlan(id, status) {

  if (!startLoading()) return; // 🔥 chặn spam click

  // 👉 nếu đang bật → cần lý do
  if (status) {
    openReasonPopup("Nhập lý do ngưng", async (reason) => {
      await db.collection("plans").doc(id).update({
        status: false,
        reason,
        updatedAt: now(),
        updatedBy: getUser()
      });

      loadPlans();
      endLoading(); // 🔥 kết thúc
    });

    return;
  }

  // 👉 bật lại
  db.collection("plans").doc(id).update({
    status: true,
    reason: "",
    updatedAt: now(),
    updatedBy: getUser()
  }).then(() => {
    loadPlans();
    endLoading(); // 🔥 kết thúc
  });
}
// ===== DELETE =====
function deletePlan(id) {

  if (!startLoading()) return; // 🔥 chặn spam

  openReasonPopup("Nhập lý do xóa", async (reason) => {
    await db.collection("plans").doc(id).update({
      isDeleted: true,
      reason,
      updatedAt: now(),
      updatedBy: getUser()
    });

    loadPlans();
    endLoading(); // 🔥 kết thúc
  });
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

// INIT
loadPlans();
loadDailyPlans(); // 🔥 thêm dòng này
window.db = window.db || firebase.firestore();

// ================= UTIL =================
function now(){ return new Date(); }
function getUser(){ return firebase.auth().currentUser?.email || "unknown"; }

function baseData(){
  return {
    createdBy:getUser(),
    createdAt:now(),
    updatedAt:null,
    updatedBy:null,
    isDeleted:false,
    status:true,
    reason:""
  }
}

function cleanData(obj){
  return Object.fromEntries(Object.entries(obj).filter(([_,v])=>v!==undefined));
}

// ================= FORMAT MONEY =================
function formatMoneyInput(el){
  let v = el.value.replace(/,/g,'').replace(/\D/g,'');
  if(!v) return el.value="";
  el.value = Number(v).toLocaleString('en-US');
}

function getRawMoney(id){
  return document.getElementById(id).value.replace(/,/g,'');
}

function formatMoneyDisplay(v){
  return v ? Number(v).toLocaleString('en-US') : '';
}

// ================= TOAST =================
function showToast(msg,type="success"){
  const t=document.createElement("div");
  t.className="toast "+type;
  t.innerText=msg;
  document.getElementById("toast").appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// ================= LOADING =================
let isSaving=false;

function startLoading(){
  if(isSaving){
    showToast("Đang lưu dữ liệu, vui lòng chờ...", "warning");
    return false;
  }
  isSaving=true;
  return true;
}

function endLoading(){ isSaving=false; }

// ================= POPUP =================
function closePopup(){
  document.getElementById("popup").classList.add("hidden");
}

function openPopup(type){
  const c=document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");
  c.innerHTML="";

  if(type==="bank"){
    c.innerHTML=`
      <h3>Ngân hàng</h3>
      <input id="bankName" placeholder="Tên ngân hàng">
      <input id="bankShort" placeholder="Viết tắt">
  
      <label>Loại TK:</label>
      <select id="bankType">
        <option value="normal">TK bình thường</option>
        <option value="in">TK chuyên thu</option>
        <option value="out">TK chuyên trả</option>
      </select>
  
      <label>Màu:</label>
      <input type="color" id="bankColor" value="#ff0000">
  
      <button type="button" class="btn-save" onclick="saveBank()">Lưu</button>
      <button type="button" class="btn-close" onclick="closePopup()">Đóng</button>
    `;
  }

  if(type==="source"){
    c.innerHTML=`
      <h3>Nguồn tiền</h3>
      <input id="sourceName" placeholder="Tên">
      <input id="sourceShort" placeholder="Viết tắt">
      <label>Màu:</label>
      <input type="color" id="sourceColor">

      <button type="button" class="btn-save" onclick="saveSource()">Lưu</button>
      <button type="button" class="btn-close" onclick="closePopup()">Đóng</button>
    `;
  }

  if(type==="limit"){
    c.innerHTML=`
      <h3>Hạn mức</h3>
      <select id="limitBank"></select>
      <input id="limitValue" oninput="formatMoneyInput(this)" placeholder="Nhập số tiền">

      <button type="button" class="btn-save" onclick="saveLimit()">Lưu</button>
      <button type="button" class="btn-close" onclick="closePopup()">Đóng</button>
    `;
    setTimeout(loadBankOptions,100);
  }

  if(type==="user"){
    c.innerHTML=`
      <h3>User</h3>
  
      <input id="userEmailInput" placeholder="Email">
      <input id="userNameInput" placeholder="Tên">
  
      <label>Role:</label>
      <select id="userRole">
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </select>
  
      <div class="btn-group-center">
        <button class="btn-save" onclick="saveUser()">Lưu</button>
        <button class="btn-close" onclick="closePopup()">Đóng</button>
      </div>
    `;
  }
}

async function saveUser(){
  if(!startLoading()) return;

  try{
    const email = document.getElementById("userEmailInput").value.trim();
    if(!email) return showToast("Nhập email","error");

    const id = await getNextId("users","US");

    await db.collection("users").doc(id).set(cleanData({
      id,
      email,
      name: document.getElementById("userNameInput").value,
      role: document.getElementById("userRole").value,
      ...baseData()
    }));

    showToast("Đã thêm user");
    closePopup();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}
function renderUserRole(role){
  if(role==="admin") return `<span style="color:red;font-weight:bold">Admin</span>`;
  return `<span style="color:blue">User</span>`;
}
async function loadUsers(){
  const snap = await db.collection("users").get();

  let html = `<tr>
    <th>ID</th><th>Email</th><th>Tên</th><th>Role</th>
    <th>Trạng thái</th><th>Lý do</th><th>Action</th>
  </tr>`;

  snap.forEach(doc=>{
    const d = doc.data();
    if(d.isDeleted) return;

    html += `<tr>
      <td>${d.id || d.username}</td>
      <td>${d.email}</td>
      <td>${d.name || ''}</td>
      <td>${renderUserRole(d.role)}</td>
      <td>${d.status ? 'Hoạt động' : 'Ngưng'}</td>
      <td>${d.reason || ''}</td>
      <td>
        <button onclick="editUser('${doc.id}')">Sửa</button>
        <button onclick="toggleUser('${doc.id}',${d.status})">
          ${d.status?'Ngưng':'Mở'}
        </button>
        <button onclick="deleteUser('${doc.id}')">Xóa</button>
      </td>
    </tr>`;
  });

  userTable.innerHTML = html;
}

async function editUser(id){
  const doc = await db.collection("users").doc(id).get();
  const d = doc.data();

  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  c.innerHTML = `
    <h3>Sửa User</h3>

    <input id="userEmailInput" value="${d.email}" placeholder="Email">
    <input id="userNameInput" value="${d.name || ''}" placeholder="Tên">

    <label>Role:</label>
    <select id="userRole">
      <option value="user" ${d.role==="user"?"selected":""}>User</option>
      <option value="admin" ${d.role==="admin"?"selected":""}>Admin</option>
    </select>

    <div class="btn-group-center">
      <button class="btn-save" onclick="updateUser('${id}')">Lưu</button>
      <button class="btn-close" onclick="closePopup()">Đóng</button>
    </div>
  `;
}

async function updateUser(id){
  if(!startLoading()) return;

  try{
    const email = document.getElementById("userEmailInput").value.trim();
    if(!email) return showToast("Nhập email","error");

    await db.collection("users").doc(id).update({
      email,
      name: document.getElementById("userNameInput").value,
      role: document.getElementById("userRole").value,
      updatedAt: now(),
      updatedBy: getUser()
    });

    showToast("Đã cập nhật user");
    closePopup();
    loadUsers();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}

async function toggleUser(id,status){
  let reason="";
  if(status) reason = prompt("Lý do:");

  await db.collection("users").doc(id).update({
    status: !status,
    reason: status ? (reason || "") : "",
    updatedAt: now(),
    updatedBy: getUser()
  });

  loadUsers();
}

async function deleteUser(id){
  await db.collection("users").doc(id).update({
    isDeleted: true,
    updatedAt: now(),
    updatedBy: getUser()
  });

  loadUsers();
}
// ================= COUNTER =================
async function getNextId(name,prefix){
  const ref=db.collection("counters").doc(name);

  return db.runTransaction(async t=>{
    const d=await t.get(ref);
    let c=d.exists?(d.data().value||0):0;
    c++;
    t.set(ref,{value:c});
    return prefix+String(c).padStart(2,'0');
  });
}

// ================= BANK =================
async function saveBank(){
  if(!startLoading()) return;

  try{
    const name=document.getElementById("bankName").value.trim();
    if(!name) return showToast("Nhập tên ngân hàng","error");

    const id=await getNextId("banks","NH");

    await db.collection("banks").doc(id).set(cleanData({
      id,
      name,
      short:document.getElementById("bankShort").value,
      color:document.getElementById("bankColor").value,
      type: document.getElementById("bankType").value,
      ...baseData()
    }));

    showToast("Đã thêm ngân hàng");
    closePopup();
    loadBanks();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}

async function loadBanks(){

  const statusFilter = document.getElementById("filterStatus").value;

  let query = db.collection("banks");

  // 👉 ÁP DỤNG FILTER
  if(statusFilter !== "all"){
    query = query.where("status", "==", statusFilter === "true");
  }

  const snap = await query.get();

  let html=`<tr>
  <th>ID</th><th>Tên</th><th>Short</th><th>Loại TK</th><th>Màu</th><th>Trạng thái</th><th>Lý do</th><th>Action</th></tr>`;

  snap.forEach(doc=>{
    const d=doc.data();
    if(d.isDeleted) return;

    html+=`<tr>
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.short||''}</td>
      <td>${renderBankType(d.type)}</td>
      <td><div style="width:20px;height:20px;background:${d.color};margin:auto"></div></td>
      <td>${d.status?'Hoạt động':'Ngưng'}</td>
      <td>${d.reason||''}</td>
      <td>
        <button onclick="editBank('${doc.id}')">Sửa</button>
        <button onclick="toggleBank('${doc.id}',${d.status})">
          ${d.status?'Ngưng':'Mở'}
        </button>
        <button onclick="deleteBank('${doc.id}')">Xóa</button>
      </td>
    </tr>`;
  });

  bankTable.innerHTML=html;
}

function renderBankType(type){
  if(type==="in") return "TK chuyên thu";
  if(type==="out") return "TK chuyên trả";
  return "TK bình thường";
}

async function editBank(id){
  const doc = await db.collection("banks").doc(id).get();
  const d = doc.data();

  const c = document.getElementById("popupContent");
  document.getElementById("popup").classList.remove("hidden");

  c.innerHTML = `
    <h3>Sửa ngân hàng</h3>

    <input id="bankName" value="${d.name || ''}" placeholder="Tên ngân hàng">
    <input id="bankShort" value="${d.short || ''}" placeholder="Viết tắt">

    <label>Loại TK:</label>
    <select id="bankType">
      <option value="normal" ${(!d.type || d.type==="normal")?"selected":""}>TK bình thường</option>
      <option value="in" ${d.type==="in"?"selected":""}>TK chuyên thu</option>
      <option value="out" ${d.type==="out"?"selected":""}>TK chuyên trả</option>
    </select>

    <label>Màu:</label>
    <input type="color" id="bankColor" value="${d.color || '#ff0000'}">

    <button type="button" class="btn-save" onclick="updateBank('${id}')">Lưu</button>
    <button type="button" class="btn-close" onclick="closePopup()">Đóng</button>
  `;
}

async function updateBank(id){
  if(!startLoading()) return;

  try{
    const name = document.getElementById("bankName").value.trim();
    if(!name) return showToast("Nhập tên ngân hàng","error");

    await db.collection("banks").doc(id).update({
      name,
      short: document.getElementById("bankShort").value,
      type: document.getElementById("bankType").value,
      color: document.getElementById("bankColor").value,
      updatedAt: now(),
      updatedBy: getUser()
    });

    showToast("Đã cập nhật ngân hàng");
    closePopup();
    loadBanks();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}

async function toggleBank(id,status){
  let reason="";
  if(status){
    reason=prompt("Nhập lý do ngưng:");
  }

  await db.collection("banks").doc(id).update({
    status:!status,
    reason:status ? (reason||"") : "",
    updatedAt:now(),
    updatedBy:getUser()
  });

  loadBanks();
}

async function deleteBank(id){
  await db.collection("banks").doc(id).update({
    isDeleted:true,
    updatedAt:now(),
    updatedBy:getUser()
  });
  loadBanks();
}

// ================= SOURCE =================
async function saveSource(){
  if(!startLoading()) return;

  try{
    const name=document.getElementById("sourceName").value.trim();
    if(!name) return showToast("Nhập tên nguồn","error");

    const id=await getNextId("sources","NT");

    await db.collection("sources").doc(id).set(cleanData({
      id,
      name,
      short:document.getElementById("sourceShort").value,
      color:document.getElementById("sourceColor").value,
      ...baseData()
    }));

    showToast("Đã thêm nguồn");
    closePopup();
    loadSources();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}

async function loadSources(){
  const snap=await db.collection("sources").get();

  let html=`<tr>
  <th>ID</th><th>Tên</th><th>Short</th><th>Màu</th><th>Trạng thái</th><th>Lý do</th><th>Action</th></tr>`;

  snap.forEach(doc=>{
    const d=doc.data();
    if(d.isDeleted) return;

    html+=`<tr>
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.short||''}</td>
      <td><div style="width:20px;height:20px;background:${d.color};margin:auto"></div></td>
      <td>${d.status?'Hoạt động':'Ngưng'}</td>
      <td>${d.reason||''}</td>
      <td>
        <button onclick="editSource('${doc.id}')">Sửa</button>
        <button onclick="toggleSource('${doc.id}',${d.status})">
          ${d.status?'Ngưng':'Mở'}
        </button>
        <button onclick="deleteSource('${doc.id}')">Xóa</button>
      </td>
    </tr>`;
  });

  sourceTable.innerHTML=html;
}

async function editSource(id){
  const name=prompt("Tên mới:");
  if(!name) return;

  await db.collection("sources").doc(id).update({
    name,
    updatedAt:now(),
    updatedBy:getUser()
  });

  loadSources();
}

async function toggleSource(id,status){
  let reason="";
  if(status) reason=prompt("Lý do:");

  await db.collection("sources").doc(id).update({
    status:!status,
    reason:status?(reason||""):"",
    updatedAt:now(),
    updatedBy:getUser()
  });

  loadSources();
}

async function deleteSource(id){
  await db.collection("sources").doc(id).update({
    isDeleted:true,
    updatedAt:now(),
    updatedBy:getUser()
  });
  loadSources();
}

// ================= LIMIT =================
async function saveLimit(){
  if(!startLoading()) return;

  try{
    const id=await getNextId("limits","LM");

    await db.collection("limits").doc(id).set(cleanData({
      id,
      bankId:limitBank.value,
      value:getRawMoney("limitValue"),
      ...baseData()
    }));

    showToast("Đã thêm hạn mức");
    closePopup();
    loadLimits();

  }catch(e){
    showToast(e.message,"error");
  }

  endLoading();
}

async function loadLimits(){
  const bankMap={};
  const b=await db.collection("banks").get();
  b.forEach(x=>bankMap[x.id]=x.data());

  const snap=await db.collection("limits").get();

  let html=`<tr>
  <th>ID</th><th>Bank</th><th>Tiền</th><th>Trạng thái</th><th>Lý do</th><th>Action</th></tr>`;

  snap.forEach(doc=>{
    const d=doc.data();
    if(d.isDeleted) return;

    html+=`<tr>
      <td>${d.id}</td>
      <td>${bankMap[d.bankId]?.name||d.bankId}</td>
      <td>${formatMoneyDisplay(d.value)}</td>
      <td>${d.status?'Hoạt động':'Ngưng'}</td>
      <td>${d.reason||''}</td>
      <td>
        <button onclick="toggleLimit('${doc.id}',${d.status})">
          ${d.status?'Ngưng':'Mở'}
        </button>
        <button onclick="deleteLimit('${doc.id}')">Xóa</button>
      </td>
    </tr>`;
  });

  limitTable.innerHTML=html;
}

async function toggleLimit(id,status){
  let reason="";
  if(status) reason=prompt("Lý do:");

  await db.collection("limits").doc(id).update({
    status:!status,
    reason:status?(reason||""):"",
    updatedAt:now(),
    updatedBy:getUser()
  });

  loadLimits();
}

async function deleteLimit(id){
  await db.collection("limits").doc(id).update({
    isDeleted:true,
    updatedAt:now(),
    updatedBy:getUser()
  });
  loadLimits();
}

// ================= LOAD BANK OPTIONS =================
function loadBankOptions(){
  db.collection("banks").get().then(s=>{
    let h="";
    s.forEach(d=>{
      if(!d.data().isDeleted){
        h+=`<option value="${d.id}">${d.data().name}</option>`;
      }
    });
    limitBank.innerHTML=h;
  });
}

// INIT
loadBanks();
loadSources();
loadLimits();
loadUsers();
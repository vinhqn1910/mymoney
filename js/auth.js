const auth = firebase.auth();

// ================= INIT COUNTER =================
async function initCounter(){
  const ref = db.collection("settings").doc("counter");
  const doc = await ref.get();

  if(!doc.exists){
    await ref.set({ userCounter: 1000 });
  }
}

// ================= USERNAME AUTO =================
async function getNextUsername(){
  const ref = db.collection("settings").doc("counter");

  return db.runTransaction(async (t)=>{
    const doc = await t.get(ref);

    let current = doc.exists ? doc.data().userCounter : 1000;

    const next = current + 1;

    t.set(ref, { userCounter: next }, { merge: true });

    return next;
  });
}

// ================= LOGIN =================
function login(){
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  auth.signInWithEmailAndPassword(email, password)
  .then(()=> window.location.href = "index.html")
  .catch(err=> alert(err.message));
}

// ================= REGISTER =================
async function register(){
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  try{
    await initCounter();

    const userRef = db.collection("users").doc(email);

    // ✅ CHECK TRƯỚC
    const exist = await userRef.get();
    if(exist.exists){
      alert("Email đã tồn tại!");
      return;
    }

    const res = await auth.createUserWithEmailAndPassword(email, password);

    const username = await getNextUsername();

    await userRef.set({
      email,
      username,
      name: "",
      role: "user",

      createdBy: email,
      createdAt: new Date(),

      updatedBy: null,
      updatedAt: null,

      deletedAt: null,
      isDeleted: false,

      status: true,
      firstLogin: new Date()
    });

    alert("Đăng ký thành công! Username: " + username);

  }catch(err){
    alert(err.message);
  }
}

// ================= ADMIN CREATE USER =================
async function createUserByAdmin(email, name){
  email = email.trim().toLowerCase();

  const currentUser = auth.currentUser;

  if(!currentUser){
    alert("Chưa đăng nhập");
    return;
  }

  const adminDoc = await db.collection("users").doc(currentUser.email).get();

  if(!adminDoc.exists || adminDoc.data().role !== "admin"){
    alert("Chỉ admin mới được tạo user");
    return;
  }

  try{
    await initCounter();

    const userRef = db.collection("users").doc(email);

    // ✅ CHECK TRƯỚC
    const exist = await userRef.get();
    if(exist.exists){
      alert("Email đã tồn tại!");
      return;
    }

    const password = Math.random().toString(36).slice(-8);

    // 🔥 tránh tạo nhiều app
    let secondaryApp;
    try{
      secondaryApp = firebase.app("Secondary");
    }catch{
      secondaryApp = firebase.initializeApp(firebase.app().options, "Secondary");
    }

    const secondaryAuth = secondaryApp.auth();

    await secondaryAuth.createUserWithEmailAndPassword(email, password);

    const username = await getNextUsername();

    await userRef.set({
      email,
      name,
      username,
      role: "user",

      createdBy: currentUser.email,
      createdAt: new Date(),

      updatedBy: null,
      updatedAt: null,

      deletedAt: null,
      isDeleted: false,

      status: true
    });

    await secondaryAuth.signOut();

    alert(`Tạo user thành công\nEmail: ${email}\nPassword: ${password}`);

  }catch(err){
    alert(err.message);
  }
}

// ================= LOGOUT =================
function logout(){
  auth.signOut().then(()=>{
    window.location.href = "login.html";
  });
}

// ================= AUTH STATE =================
auth.onAuthStateChanged(async user=>{
  const isLoginPage = window.location.pathname.includes("login.html");

  if(!user && !isLoginPage){
    window.location.href = "login.html";
    return;
  }

  if(user){
    await initCounter();
    sessionStorage.removeItem("timeoutShown");

    if(!sessionStorage.getItem("loginAt")){
      sessionStorage.setItem("loginAt", Date.now());
    }
    await checkLoginTimeout();
    const email = user.email.toLowerCase();
    const userRef = db.collection("users").doc(email);
    const doc = await userRef.get();

    if(!doc.exists){
      const username = await getNextUsername();

      await userRef.set({
        email,
        username,
        name: "",
        role: "user",

        createdBy: email,
        createdAt: new Date(),

        updatedBy: null,
        updatedAt: null,

        deletedAt: null,
        isDeleted: false,

        status: true,
        firstLogin: new Date()
      });
    }

    // 🔒 block user
    if(doc.exists && doc.data().status === false){
      alert("Tài khoản bị khóa!");
      logout();
    }
  }

  if(user && isLoginPage){
    window.location.href = "index.html";
  }
});

async function checkLoginTimeout(){
  try{
    const doc = await db.collection("settings").doc("loginTime").get();

    let maxHours = 36; // default

    if(doc.exists){
      const d = doc.data();
      if(d.enable){
        maxHours = d.hours || 36;
      }
    }

    const loginAt = Number(sessionStorage.getItem("loginAt"));
    if(!loginAt) return;

    const nowTime = Date.now();
    const diffHours = (nowTime - loginAt) / (1000 * 60 * 60);

    if(diffHours > maxHours){

      if(sessionStorage.getItem("timeoutShown")) return;
    
      sessionStorage.setItem("timeoutShown", "1");
      sessionStorage.removeItem("loginAt");
    
      alert(`Đã hết thời gian đăng nhập (${maxHours} giờ).\nVui lòng đăng nhập lại!`);
    
      logout();
    }

  }catch(e){
    console.error("Timeout error:", e);
  }
}


setInterval(checkLoginTimeout, 60000); // mỗi 60s


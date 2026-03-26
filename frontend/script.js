/******************** CONFIG ********************/
const API = "https://ai-robot-te9n.onrender.com"; // replace with your actual backend Render URL
const TOKEN_KEY = "token";
const USER_KEY = () => `chats_current_user`;

/******************** STATE ********************/
let chats = JSON.parse(localStorage.getItem(USER_KEY())) || [];
let currentChatIndex = chats.length ? chats.length - 1 : null;
let lastUploadedFile = null;
let currentPlan = "free";
let freeLimitReached = false;
let questionsAsked = 0;
let uploadsDone = 0;
let lastAIReply = "";

let tempEmail = "";
let audioContext, analyser, dataArray, source, stream, animationId;
let finalTranscript = "";
let recognition;
let currentUtterance = null;
let isMuted = false;
let isInterviewMode = false;
/******************** DOM ********************/
const authBox = document.getElementById("auth-container");
const chatBox = document.getElementById("chat-container");
const messagesDiv = document.getElementById("messages");
const historyDiv = document.getElementById("chatHistory");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const otpInput = document.getElementById("otpInput");
const userInput = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
 const robot = document.getElementById("robotStatus");
 const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector("aside");
const robotText = document.getElementById("robotText");
const robotImg = document.getElementById("robot-img");
menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});


/******************** AUTH UI ********************/
/******************** AUTH UI ********************/
function showRegister() {
  document.getElementById("login-box").classList.add("hidden");
  document.getElementById("register-box").classList.remove("hidden");
  document.getElementById("verify-box").classList.add("hidden");
}

function showLogin() {
  document.getElementById("login-box").classList.remove("hidden");
  document.getElementById("register-box").classList.add("hidden");
  document.getElementById("verify-box").classList.add("hidden");
}

function showVerify() {
  document.getElementById("login-box").classList.add("hidden");
  document.getElementById("register-box").classList.add("hidden");
  document.getElementById("verify-box").classList.remove("hidden");
}

function showLoginPage() {
  authBox.classList.remove("hidden");
  chatBox.classList.add("hidden");
}

function showChatPage() {
  authBox.classList.add("hidden");
  chatBox.classList.remove("hidden");
}

/******************** LOGIN ACTION ********************/
async function login() {
  if (!loginEmail.value || !loginPassword.value) return alert("Fill all fields");

  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value })
    });

    const data = await res.json();

    if (!data.token) return alert("❌ Wrong email or password");

    // Save token
    localStorage.setItem(TOKEN_KEY, data.token);

    // ✅ Login successful
    alert("✅ Login successful");

    // ✅ Hide auth page & show chat page
    showChatPage();

   

    // Load user info & chat history
    await loadUserProfile();
    await loadChatHistory();
    await updateProfileInfo();

    // Clear login fields
    loginEmail.value = "";
    loginPassword.value = "";
  } catch (err) {
    console.error(err);
    alert("❌ Login failed, try again");
  }
}

/******************** LOGOUT ********************/
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  chats = [];
  currentChatIndex = null;
  authBox.classList.remove("hidden");
  chatBox.classList.add("hidden");

  const profileEmail = document.getElementById("profileEmail");
  const profilePlan = document.getElementById("profilePlan");
  const icon = document.getElementById("profileIcon");
  if (profileEmail) profileEmail.innerText = "";
  if (profilePlan) profilePlan.innerText = "";
  if (icon) icon.src = "avatar.png";

  currentPlan = "free";
  freeLimitReached = false;
  questionsAsked = 0;
  uploadsDone = 0;

  localStorage.removeItem(USER_KEY());
messagesDiv.innerHTML = "";
historyDiv.innerHTML = "";
}

/******************** PROFILE DROPDOWN ********************/
function toggleProfileDropdown() {
  const dropdown = document.getElementById("profileDropdown");
  if (dropdown) dropdown.classList.toggle("hidden");
}

function toggleUpgradeDropdown() {
  const dropdown = document.getElementById("upgradeDropdown");
  if (dropdown) dropdown.classList.toggle("hidden");
}
function safeRender(text) {
  if (!text) return "";

  // Remove markdown headings
  text = text.replace(/^#{1,6}\s*/gm, "");

  // Convert code blocks FIRST
  text = text.replace(/```(\w+)?([\s\S]*?)```/g, function(match, lang, code){
    lang = lang || "javascript";

    return `
      <div class="code-block">
        <button class="copy-btn">Copy</button>
        <pre><code class="language-${lang}">
${code.replace(/</g,"&lt;").replace(/>/g,"&gt;")}
        </code></pre>
      </div>
    `;
  });

  return text.replace(/\n/g, "<br>");
}
}
function showMap(lat, lng) {
  const mapDiv = document.getElementById("map");
  if (!mapDiv._leaflet_map) {
    const map = L.map(mapDiv).setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    mapDiv._leaflet_map = map; // store reference
  } else {
    mapDiv._leaflet_map.setView([lat, lng], 13);
  }
  L.marker([lat, lng]).addTo(mapDiv._leaflet_map);
}
/******************** PROFILE INFO ********************/
async function updateProfileInfo() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  try {
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const user = await res.json();

    const emailEl = document.getElementById("profileEmail");
    const planEl = document.getElementById("profilePlan");
    const iconEl = document.getElementById("profileIcon");

    if (emailEl) emailEl.innerText = user.email || "";
    if (planEl) {
      planEl.innerText = user.plan === "paid" ? "⭐ Premium" : "🆓 Free";
    }
    if (iconEl) {
      iconEl.src = user.avatar || "avatar.png";
    }

    currentPlan = user.plan || "free";
    checkFreeLimits();
  } catch (err) {
    console.error(err);
  }
}
/******************** STORAGE ********************/
function saveChats() {
  try {
    localStorage.setItem(USER_KEY(), JSON.stringify(chats));
  } catch (e) {
    console.warn("Storage full — trimming chat history");

    // Keep only last 5 chats
    chats = chats.slice(-5);

    localStorage.setItem(USER_KEY(), JSON.stringify(chats));
  }
}

/******************** AUTH ACTIONS ********************/
async function register() {
  if (!regEmail.value || !regPassword.value)
    return alert("Fill all fields");

  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: regEmail.value,
      password: regPassword.value
    })
  });

  const data = await res.json();

  alert(data.message);

  // ✅ Only move forward if OTP was actually sent
  if (data.message.includes("OTP sent")) {
    tempEmail = regEmail.value;
    showVerify();
  }
}

async function verifyOTP() {
  const res = await fetch(`${API}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: tempEmail, otp: otpInput.value })
  });
  const data = await res.json();
  alert(data.message);
  showLogin();
}

/******************** PROFILE LIMITS ********************/
async function loadUserProfile() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return logout();
  const user = await res.json();
  currentPlan = user.plan || "free";
  checkFreeLimits();
}

function checkFreeLimits() {
  const isFree = currentPlan === "free";

  fileInput.disabled = isFree;
  fileInput.title = isFree
    ? "Upgrade to Premium to upload images, PDFs, DOCs"
    : "";
}


/******************** CHAT ********************/
async function sendMessage() {
  if (currentPlan === "free" && freeLimitReached) return toggleUpgradeDropdown();
  const text = userInput.value.trim();
  if (!text) return;
  addMessage(text, "user");
  userInput.value = "";
  if (currentPlan === "free" && questionsAsked >= 3) {
  toggleUpgradeDropdown();
  return;
}

  const div = document.createElement("div");
  div.className = "message assistant";
  messagesDiv.appendChild(div);

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
     body: JSON.stringify({
  message: isInterviewMode
    ? `You are an interviewer. Ask me questions interactively like a real interview. Start now.\nUser: ${text}`
    : text,
  file: lastUploadedFile || null,
  lang: /[\u0600-\u06FF]/.test(text) ? "ar" : "en"
})
    });
    const data = await res.json();

if (data.image) {
  const img = document.createElement("img");
  img.src = `data:image/png;base64,${data.image}`;
  img.className = "ai-image";
 img.style.maxWidth = "250px";
img.style.borderRadius = "10px";
img.style.display = "block";
img.style.marginTop = "10px";
  messagesDiv.appendChild(img);
}



const cleanReply = (data.reply || data.message || "provided on request")
  .replace(/#+/g, "")          // remove unwanted hash marks
  .trim();

// Example: if AI gives image URLs, you can parse and render them


renderAIContent(cleanReply);
lastAIReply = cleanReply;

if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  speakText(cleanReply); // auto speak only on PC
}
if (window.Prism) Prism.highlightAll();
if (window.MathJax) {
  MathJax.typesetPromise();
}


questionsAsked++;
if (currentPlan === "free" && questionsAsked >= 3) {
  freeLimitReached = true;
  toggleUpgradeDropdown();
  checkFreeLimits();
}


    
  } catch (err) {
    console.error(err);
    addMessage("❌ AI error", "assistant");
  }
}
function renderAIContent(text) {
  const div = document.createElement("div");
  div.className = "message assistant";

  div.innerHTML = safeRender(text);
  messagesDiv.appendChild(div);

  // ✅ NEW MAP HANDLER
  const mapMatch = text.match(/\[SHOW_MAP:(.*?)\]/);

  if (mapMatch) {
    const place = mapMatch[1].trim();
    fetchLocation(place);
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
async function fetchLocation(place) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${place}`);
  const data = await res.json();

  if (data && data.length > 0) {
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    showMap(lat, lng);
  }
}

/******************** MESSAGE RENDER ********************/
function addMessage(text, role) {
  if (currentChatIndex === null) newChat();
  const chat = chats[currentChatIndex];

  if (!chat.title && role === "user") chat.title = text.slice(0, 30);
  chat.messages.push({ role, content: text });
  saveChats();

  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = safeRender(text); // <-- change from innerText to innerHTML

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  renderChatHistory();
}

function addCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.onclick = () => {
      const code = btn.nextElementSibling.innerText;
      navigator.clipboard.writeText(code);
      btn.innerText = "Copied!";
      setTimeout(() => btn.innerText = "Copy", 2000);
    };
  });
}

function newChat() {
  chats.push({ title: "", messages: [] });
  currentChatIndex = chats.length - 1;
  saveChats();
  renderChatHistory();
  renderMessages();
}

function renderChatHistory() {
  historyDiv.innerHTML = "";

  chats.forEach((chat, i) => {
    const div = document.createElement("div");
    div.className = "chat-item";

    div.innerHTML = `
      <span onclick="selectChat(${i})">${chat.title || "Chat"}</span>
      <button onclick="deleteChat(${i})">🗑</button>
    `;

    historyDiv.appendChild(div);
  });
}
function selectChat(i) {
  currentChatIndex = i;
  renderMessages();
}

function deleteChat(i) {
  if (!confirm("Delete this chat?")) return;

  chats.splice(i, 1);
  currentChatIndex = chats.length ? chats.length - 1 : null;

  saveChats();
  renderChatHistory();
  renderMessages();
}

function renderMessages() {
  messagesDiv.innerHTML = "";
  if (currentChatIndex === null) return;

  chats[currentChatIndex].messages.forEach(m => {
    const div = document.createElement("div");
    div.className = `message ${m.role}`;
    div.innerHTML = safeRender(m.content);
    messagesDiv.appendChild(div);
  });

  if (window.MathJax) MathJax.typesetPromise();
}
async function loadChatHistory() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  const res = await fetch(`${API}/history`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return;

  const data = await res.json();

  chats = data.map(c => ({
    title: c.title,
    messages: JSON.parse(c.messages)
  }));

  currentChatIndex = chats.length ? 0 : null;
  saveChats();
  renderChatHistory();
  renderMessages();
}
function toggleInterview() {
  isInterviewMode = !isInterviewMode;
  alert(isInterviewMode ? "Interview Mode ON" : "Interview Mode OFF");
}


/******************** FILE UPLOAD ********************/
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return alert("Select a file");
  const fd = new FormData();
  fd.append("image", file);

  const res = await fetch(`${API}/vision`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
  });

  if (!res.ok) return alert("Upload failed");
  const data = await res.json();
const imgDiv = document.createElement("div");
imgDiv.innerHTML = `<img src="${data.url}" style="max-width:20%; margin-bottom:10px;"><br>${data.aiReply}`;
messagesDiv.appendChild(imgDiv);

lastUploadedFile = { type: file.type, url: data.url };
}  // <-- close uploadFile here

/******************** SPEECH RECOGNITION ********************/
async function startSpeechRecognition(lang = "en-US") {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    return alert("Browser does not support speech recognition.");
  }

  // Stop any previous recognition
  stopSpeechRecognition();

  // Get mic stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    return alert("Microphone access denied.");
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);

  // Draw waveform
  const canvas = document.getElementById("micWave");
  const ctx = canvas.getContext("2d");

  function drawWave() {
    if (!analyser) return;
    animationId = requestAnimationFrame(drawWave);
    analyser.getByteTimeDomainData(dataArray);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#4caf50";
    ctx.beginPath();
    const sliceWidth = canvas.width / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }
  drawWave();

  // Start recognition
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;

  finalTranscript = "";
  userInput.placeholder = "🎤 Listening...";
  recognition.start();

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t;
      else interim += t;
    }
    userInput.value = finalTranscript + interim;
  };

  recognition.onerror = (e) => console.error("SpeechRecognition error:", e);
}

function stopSpeechRecognition() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  cleanupAudio();

  userInput.placeholder = "Ask anything...";
  if (finalTranscript.trim()) {
    if (confirm("Send this message?\n\n" + finalTranscript)) {
      userInput.value = finalTranscript;
      sendMessage();
    } else {
      userInput.value = "";
    }
  }
}

function cancelSpeechRecognition() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  cleanupAudio();
  finalTranscript = "";
  userInput.value = "";
}

function cleanupAudio() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (audioContext) {
    if (audioContext.state !== "closed") audioContext.close();
    audioContext = null;
  }
  const canvas = document.getElementById("micWave");
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}


/******************** TEXT-TO-SPEECH ********************/
let isSpeakingEnabled = true; // default ON

function toggleSpeechMute() {
  isMuted = !isMuted;

  if (isMuted) {
    speechSynthesis.pause();
    robotText.innerText = "🤖 Muted";
    document.getElementById("robot-img").classList.remove("robot-speaking");
  } else {
    robotText.innerText = "🤖 Speaking...";
    speechSynthesis.resume();
    document.getElementById("robot-img").classList.add("robot-speaking");
  }
}

function speakText(text) {
  if (!text || isMuted) return;

  speechSynthesis.cancel();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = /[\u0600-\u06FF]/.test(text) ? "ar-SA" : "en-US";

  currentUtterance.onstart = () => {
    robotText.innerText = "🤖 Speaking...";
    robotImg.classList.add("robot-speaking");
  };

  currentUtterance.onend = () => {
    robotText.innerText = "🤖 Idle";
    robotImg.classList.remove("robot-speaking");
  };

  speechSynthesis.speak(currentUtterance);
}
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = userInput.scrollHeight + "px";
});

function speakLast() {
    if (!lastAIReply) return;
    speakText(lastAIReply);
}
/******************** FLUTTERWAVE ********************/
async function startFlutterwaveUpgrade() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return alert("Login first");

  try {
    const res = await fetch(`${API}/flutterwave/pay`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` }
});


    if (!res.ok) throw new Error("Failed to get payment link");

    const data = await res.json();
    if (data.link) {
      window.open(data.link, "_blank");
    } else alert("No payment link returned");
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}
const params = new URLSearchParams(window.location.search);
const tx_ref = params.get("tx_ref");
const verified = sessionStorage.getItem("payment_verified");

if (tx_ref && !verified && localStorage.getItem(TOKEN_KEY)) {
  sessionStorage.setItem("payment_verified", "yes");

  fetch(`${API}/flutterwave/verify/ref/${tx_ref}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`
    }
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      updateProfileInfo();
      loadUserProfile();
      history.replaceState({}, document.title, location.pathname);
    })
    .catch(console.error);
}

/******************** PWA INSTALL ********************/
let deferredPrompt;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;

  const installBtn = document.createElement("button");
  installBtn.id = "installAppBtn";
  installBtn.innerText = "📲 Install App";

  installBtn.style.position = "fixed";
  installBtn.style.bottom = "20px";
  installBtn.style.right = "20px";
  installBtn.style.zIndex = "9999";

  installBtn.onclick = async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.remove();
  };

  document.body.appendChild(installBtn);
});

/******************** AUTO LOGIN ********************/

/******************** SINGLE AUTO LOGIN ********************/
(function initApp() {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    showLoginPage();
    return;
  }

  showChatPage();
  loadUserProfile()
    .then(loadChatHistory)
    .then(updateProfileInfo)
    .catch(() => {
      logout();
      showLoginPage();
    });
})();

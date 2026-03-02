// ================== IMPORTS ==================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

// ================== APP SETUP ==================
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;


// ================== CORS ==================
const corsOptions = {
  origin: "https://ai-robot-te9n.onrender.com", // your frontend URL
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
};
app.use(cors(corsOptions));

app.use(cors(corsOptions)); // ✅ use configured CORS
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "frontend")));


// ================== CONSTANTS ==================
const FREE_LIMIT = 3; // free chat questions per user
const FREE_DAILY_UPLOAD_LIMIT = 3;

// ================== SUPABASE ==================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ================== EMAIL ==================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // MUST be true
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Gmail SMTP error:", error);
  } else {
    console.log("✅ Gmail SMTP ready");
  }
});


function isNewMonth(lastReset) {
  if (!lastReset) return true;

  const now = new Date();
  const last = new Date(lastReset);

  return (
    now.getMonth() !== last.getMonth() ||
    now.getFullYear() !== last.getFullYear()
  );
}


// ================== STORAGE ==================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (_, file, cb) =>
      cb(null, Date.now() + "-" + file.originalname)
  })
});

// ================== AUTH MIDDLEWARE ==================
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// ================== REGISTER ==================
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: exists, error } = await supabase
  .from("users")
  .select("id")
  .eq("email", email)
  .maybeSingle();

if (exists) return res.json({ message: "Email already registered" });
    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await supabase.from("users").insert({
      email,
      password: hashed,
      verified: false,
      plan: "free",
      questions_used: 0
    });

    await supabase.from("otp_codes").insert({
      email,
      otp,
      expires_at: new Date(Date.now() + 10 * 60 * 1000)
    });

    await transporter.sendMail({
      to: email,
      subject: "AI Robot OTP Verification",
      html: `<h2>Your OTP Code</h2><h1>${otp}</h1>`
    });

    res.json({ message: "OTP sent to email 📧" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});



// ================== VERIFY OTP ==================
app.post("/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
const { data: otpRow, error } = await supabase
  .from("otp_codes")
  .select("*")
  .eq("email", email)
  .eq("otp", otp)
  .gt("expires_at", new Date().toISOString())
  .maybeSingle();

if (!otpRow)
  return res.status(400).json({ message: "Invalid or expired OTP" });

await supabase.from("users").update({ verified: true }).eq("email", email);
await supabase.from("otp_codes").delete().eq("email", email);

res.json({ message: "Email verified successfully ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Verification failed" });
  }
});


// ================== LOGIN ==================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user || !user.verified)
    return res.json({ message: "Invalid login" });

  if (!(await bcrypt.compare(password, user.password)))
    return res.json({ message: "Wrong password" });

  res.json({
  token: jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  ),
  plan: user.plan
});
});


// ================== CHAT ==================
app.post("/chat", auth, async (req, res) => {
  try {
    const { message, file } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (user.plan === "free" && user.questions_used >= FREE_LIMIT) {
      return res.json({ reply: "❌ Free limit reached. Upgrade to continue." });
    }

    const { data: lastChat } = await supabase
      .from("chats")
      .select("messages")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let conversation = [
  {
    role: "system",
   content: `
You are an AI assistant in a web app.

When user asks to draw or sketch:
- Prefer SVG diagrams using <svg>
- OR use [GENERATE_IMAGE: description]

For maps respond ONLY:
LAT:xx.xxxx, LNG:yy.yyyy

Do NOT use markdown headers (#).
`
  },
  ...(lastChat ? JSON.parse(lastChat.messages) : [])
];

    conversation.push({ role: "user", content: message });

    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: conversation
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const reply = ai.data.choices[0].message.content;
    let imageBase64 = null;

// Detect image request
const imgMatch = reply.match(/\[GENERATE_IMAGE:(.*?)\]/);

if (imgMatch) {
  const imagePrompt = imgMatch[1].trim();
  imageBase64 = await generateImage(imagePrompt);
}

    // ✅ SAVE MEMORY
    conversation.push({ role: "assistant", content: reply });

    await supabase.from("chats").insert({
      user_id: user.id,
      title: message.slice(0, 40),
      messages: JSON.stringify(conversation)
    });

    await supabase
      .from("users")
      .update({ questions_used: user.questions_used + 1 })
      .eq("id", user.id);

    res.json({
  reply: reply.replace(/\[GENERATE_IMAGE:.*?\]/, "").trim(),
  image: imageBase64
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "❌ AI error" });
  }

  async function generateImage(prompt) {
  const img = await axios.post(
    "https://api.openai.com/v1/images/generations",
    {
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return img.data.data[0].b64_json; // base64 image
}
});
// ================== UPLOAD ==================
app.post("/vision", auth, upload.single("image"), async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", req.user.id)
    .single();

  if (user.plan === "free") {
    const today = new Date().toISOString().split("T")[0];

    const { count } = await supabase
      .from("uploads")
      .select("*", { count: "exact" })
      .eq("user_id", req.user.id)
      .gte("created_at", today);

    if (count >= FREE_DAILY_UPLOAD_LIMIT)
      return res.status(403).json({ message: "Daily upload limit reached" });
  }

  await supabase.from("uploads").insert({
    user_id: req.user.id,
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    mimetype: req.file.mimetype
  });

  res.json({
    message: "Uploaded",
    url: `${BASE_URL}/uploads/${req.file.filename}` // ✅ FIXED
  });
});

// ================== FLUTTERWAVE PAY ==================
app.post("/flutterwave/pay", auth, async (req, res) => {
  try {
    const tx_ref = "AIROBOT-" + Date.now();

    await supabase.from("payments").insert({
      user_id: req.user.id,
      tx_ref,
      status: "pending"
    });

    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("id", req.user.id)
      .single();

 const fw = await axios.post(
  "https://api.flutterwave.com/v3/payments",
  {
        tx_ref,
        amount: 2000,
        currency: "NGN",
        redirect_url: `${process.env.BASE_URL}/payment-success?tx_ref=${tx_ref}`,
        customer: { email: user.email },
        customizations: {
          title: "AI Robot Premium",
          description: "Unlimited access"
        }
      },
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
    );

    res.json({ link: fw.data.data.link });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ message: "Flutterwave initiation failed" });
  }
});

app.get("/flutterwave/verify/ref/:tx_ref", auth, async (req, res) => {
  try {
    const { tx_ref } = req.params;

    // 1️⃣ Verify payment with Flutterwave
    const verifyRes = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    const tx = verifyRes.data.data;

    if (tx.status !== "successful") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    // 2️⃣ Get payment record
    const { data: payment } = await supabase
      .from("payments")
      .select("user_id")
      .eq("tx_ref", tx_ref)
      .single();

    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // 3️⃣ Update payment status
    await supabase
      .from("payments")
      .update({
        status: "success",
        flw_ref: tx.id
      })
      .eq("tx_ref", tx_ref);

    // 4️⃣ Upgrade user plan ✅
    await supabase
      .from("users")
      .update({
        plan: "paid",
        questions_used: 0
      })
      .eq("id", payment.user_id);

    res.json({ message: "✅ Premium activated successfully" });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ message: "Verification failed" });
  }
});



// ================== CHAT HISTORY ==================
app.get("/history", auth, async (req, res) => {
  try {
    const { data = [] } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// ================== CURRENT USER INFO ==================
app.get("/me", auth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, plan, questions_used, subscription_expires_at, last_reset")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    let plan = user.plan;
    let questions_used = user.questions_used || 0;

    // 🔁 Subscription expired → downgrade
    if (
      plan === "paid" &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) < new Date()
    ) {
      plan = "free";
      questions_used = 0;

      await supabase.from("users").update({
        plan: "free",
        questions_used: 0
      }).eq("id", user.id);
    }

    // 🔄 Monthly reset
    if (isNewMonth(user.last_reset)) {
      questions_used = 0;

      await supabase.from("users").update({
        questions_used: 0,
        last_reset: new Date()
      }).eq("id", user.id);
    }

    res.json({
      email: user.email,
      plan,
      questions_used,
      limit: plan === "free" ? 3 : "unlimited"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not fetch user info" });
  }
});
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend/index.html"));
});



// ================== START SERVER ==================
app.listen(PORT, () =>
  console.log(`🤖 Server running on ${BASE_URL}`)
);

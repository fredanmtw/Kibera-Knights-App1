// Kibera Knights Chess Club - zero-dependency Node.js server (Node 18+).
// Storage: data/db.json. Auth: scrypt-hashed passwords + HttpOnly session cookies.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUB = path.join(__dirname, "public");
const COLS = ["players", "coaches", "tournaments", "results"];
const ROLES = ["admin", "coach", "member"]; // admin: everything; coach: edit club data; member: read-only

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: [], players: [], coaches: [], tournaments: [], results: [] };
if (fs.existsSync(DB_FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
function save() { // atomic write
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE);
}
const uid = () => crypto.randomBytes(8).toString("hex");
const hash = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
const verify = (pw, stored) => {
  const [salt, h] = stored.split(":"); const a = Buffer.from(hash(pw, salt).split(":")[1], "hex");
  return crypto.timingSafeEqual(a, Buffer.from(h, "hex"));
};
const sessions = new Map(); // token -> {userId, exp}
const attempts = new Map(); // ip -> {n, until}
const CONTACT = ["phone", "email", "guardianName", "guardianPhone"]; // hidden from view-only members
const clientIp = (req) => (process.env.TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;
const SESSION_MS = 1000 * 60 * 60 * 12;

const send = (res, code, obj, headers = {}) => {
  res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((ok, no) => {
  let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e6) { req.destroy(); no(); } });
  req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error("bad json")); } });
});
const cookie = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((s) => s.trim().split("=")).filter((p) => p[0]));
const currentUser = (req) => {
  const s = sessions.get(cookie(req).sid);
  if (!s || s.exp < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
};
const pub = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, mustChange: !!u.mustChange, email: u.email || "", phone: u.phone || "" });
const clean = (o) => { // keep only simple scalar fields
  const r = {};
  for (const [k, v] of Object.entries(o || {})) if (/^[a-zA-Z]{1,30}$/.test(k) && ["string", "number"].includes(typeof v)) r[k] = typeof v === "string" ? v.slice(0, 200) : v;
  delete r.id; return r;
};
const startSession = (res, user) => {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { userId: user.id, exp: Date.now() + SESSION_MS });
  return { "Set-Cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${process.env.COOKIE_SECURE ? "; Secure" : ""}` };
};

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean).slice(1); // after "api"
  const m = req.method, user = currentUser(req);
  if (m !== "GET" && req.headers["x-requested-with"] !== "fetch") return send(res, 403, { error: "Forbidden" }); // CSRF guard
  const body = ["POST", "PUT"].includes(m) ? await readBody(req) : {};

  if (parts[0] === "health") return send(res, 200, { ok: true });
  if (parts[0] === "status") return send(res, 200, { needsSetup: db.users.length === 0 });
  if (parts[0] === "setup" && m === "POST") { // first-run admin creation
    if (db.users.length) return send(res, 400, { error: "Already set up" });
    if (!body.username || !body.password || body.password.length < 8) return send(res, 400, { error: "Username and a password of 8+ characters required" });
    const u = { id: uid(), username: String(body.username).trim().toLowerCase(), name: body.name || body.username, role: "admin", pw: hash(body.password) };
    db.users.push(u); save();
    return send(res, 200, pub(u), startSession(res, u));
  }
  if (parts[0] === "login" && m === "POST") {
    const ip = clientIp(req), a = attempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) return send(res, 429, { error: "Too many attempts. Try again in a few minutes." });
    const u = db.users.find((x) => x.username === String(body.username || "").trim().toLowerCase());
    if (!u || !verify(String(body.password || ""), u.pw)) {
      console.log(`[login] failed for "${String(body.username || "")}"`);
      a.n++; if (a.n >= 5) { a.n = 0; a.until = Date.now() + 5 * 60000; } attempts.set(ip, a);
      return send(res, 401, { error: "Wrong username or password" });
    }
    attempts.delete(ip);
    console.log(`[login] ${u.username} signed in`);
    return send(res, 200, pub(u), startSession(res, u));
  }
  if (parts[0] === "logout" && m === "POST") {
    sessions.delete(cookie(req).sid);
    return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; Max-Age=0; Path=/" });
  }
  if (!user) return send(res, 401, { error: "Login required" });
  if (user.mustChange && !["me", "password", "logout"].includes(parts[0])) return send(res, 403, { error: "Please change your temporary password first", mustChange: true });

  if (parts[0] === "me") return send(res, 200, pub(user));
  if (parts[0] === "password" && m === "POST") {
    if (!verify(String(body.current || ""), user.pw)) return send(res, 400, { error: "Current password is wrong" });
    if (!body.next || body.next.length < 8) return send(res, 400, { error: "New password must be 8+ characters" });
    if (body.next === body.current) return send(res, 400, { error: "Choose a different password" });
    user.pw = hash(body.next); user.mustChange = false; save(); return send(res, 200, { ok: true });
  }
  if (parts[0] === "data" && m === "GET") {
    const strip = (c, rows) => user.role !== "member" || !["players", "coaches"].includes(c) ? rows : rows.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !CONTACT.includes(k))));
    return send(res, 200, Object.fromEntries(COLS.map((c) => [c, strip(c, db[c])])));
  }

  if (parts[0] === "users") { // admin only
    if (user.role !== "admin") return send(res, 403, { error: "Admins only" });
    if (m === "GET") return send(res, 200, db.users.map(pub));
    if (m === "POST") {
      const un = String(body.username || "").trim().toLowerCase();
      if (!un || !body.password || body.password.length < 8 || !ROLES.includes(body.role)) return send(res, 400, { error: "Username, role and a password of 8+ characters required" });
      if (db.users.some((x) => x.username === un)) return send(res, 400, { error: "Username taken" });
      const email = String(body.email || "").trim().slice(0, 120), phone = String(body.phone || "").trim().slice(0, 40);
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { error: "That email address does not look right" });
      const u = { id: uid(), username: un, name: body.name || un, role: body.role, email, phone, pw: hash(body.password), mustChange: true };
      db.users.push(u); save(); return send(res, 200, pub(u));
    }
    if (m === "DELETE" && parts[1]) {
      if (parts[1] === user.id) return send(res, 400, { error: "You cannot delete yourself" });
      db.users = db.users.filter((x) => x.id !== parts[1]); save(); return send(res, 200, { ok: true });
    }
  }

  if (COLS.includes(parts[0])) {
    if (m !== "GET" && user.role === "member") return send(res, 403, { error: "Your account is view-only" });
    const col = db[parts[0]];
    if (m === "POST") { const r = { id: uid(), ...clean(body) }; col.push(r); save(); return send(res, 200, r); }
    const i = col.findIndex((x) => x.id === parts[1]);
    if (i < 0) return send(res, 404, { error: "Not found" });
    if (m === "PUT") { col[i] = { id: col[i].id, ...clean(body) }; save(); return send(res, 200, col[i]); }
    if (m === "DELETE") {
      if (user.role !== "admin") return send(res, 403, { error: "Only admins can delete" });
      col.splice(i, 1); // also clean up dependants
      const id = parts[1];
      if (parts[0] === "players") db.results = db.results.filter((r) => r.playerId !== id);
      if (parts[0] === "tournaments") db.results = db.results.filter((r) => r.tournamentId !== id);
      if (parts[0] === "coaches") db.players.forEach((p) => { if (p.coachId === id) p.coachId = ""; });
      save(); return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: "Not found" });
}

const TYPES = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".css": "text/css", ".js": "text/javascript" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const f = path.join(PUB, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error("[error]", req.method, url.pathname, e && e.message); send(res, 400, { error: (e && e.message) || "Bad request" }); }
}).on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is already in use. Close the other copy of the app, or use another port, e.g. PORT=3001 node server.js` : e.message);
  process.exit(1);
}).listen(...(process.env.HOST ? [PORT, process.env.HOST] : [PORT]), () => console.log(`Kibera Knights app running at http://localhost:${PORT}`));

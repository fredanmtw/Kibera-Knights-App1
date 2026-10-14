// Create (or reset) an admin account. Usage: node create-admin.js [username] [password]
// With no password, a random temporary one is generated and must be changed at first login.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data"), DB_FILE = path.join(DATA_DIR, "db.json");
const username = (process.argv[2] || "admin").trim().toLowerCase();
const pw = process.argv[3] || crypto.randomBytes(9).toString("base64url");
if (pw.length < 8) { console.error("Password must be 8+ characters"); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : { users: [], players: [], coaches: [], tournaments: [], results: [] };
const salt = crypto.randomBytes(16).toString("hex");
const stored = salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
const u = db.users.find((x) => x.username === username);
if (u) { u.pw = stored; u.role = "admin"; u.mustChange = true; }
else db.users.push({ id: crypto.randomBytes(8).toString("hex"), username, name: "Club Administrator", role: "admin", pw: stored, mustChange: true });
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`Admin ready.\nUsername: ${username}\nTemporary password: ${pw}\nYou will be asked to choose a new password at first login.`);

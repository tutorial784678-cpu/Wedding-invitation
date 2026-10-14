require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { Pool } = require("pg");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const production = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;
if (production && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  console.warn("WARNING: Set a strong JWT_SECRET (32+ characters) in production.");
}
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
}) : null;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const cloudinaryReady = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"), { maxAge: production ? "1h" : 0 }));

const defaultSettings = {
  brideName: "Bride Name", groomName: "Groom Name",
  brideParents: "Daughter of [Parents’ Names]", groomParents: "Son of [Parents’ Names]",
  guestGreeting: "Dear Guest",
  intro: "With the blessings of Allah Almighty and the prayers of our families, we cordially invite you to celebrate our blessed Nikah.",
  date: "2027-01-01", time: "12:00", reception: "Nikah Ceremony & Reception",
  venue: "Your Wedding Venue", address: "Full venue address goes here",
  mapsUrl: "https://maps.google.com/", rsvpEmail: "", bismillah: true,
  musicEnabled: false, musicUrl: "", musicVolume: 0.35,
  artworkUrl: "/assets/nikah-artwork.jpg",
  backgroundColor: "#fffdf7", goldColor: "#b88632", accentColor: "#d4af62",
  textColor: "#68451c", showParticles: true, countdown: true, published: true
};

async function ensureSchemaAndAdmin() {
  if (!pool) return;
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const count = await pool.query("SELECT COUNT(*)::int AS n FROM admins");
  if (count.rows[0].n === 0 && email && password) {
    if (password.length < 12) console.warn("ADMIN_PASSWORD should be at least 12 characters.");
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING", [email, hash]);
    console.log("Initial admin created for", email);
  }
}
let schemaPromise;
function ready() {
  if (!pool) throw Object.assign(new Error("Database not configured. Set DATABASE_URL."), { status: 503 });
  if (!schemaPromise) schemaPromise = ensureSchemaAndAdmin();
  return schemaPromise;
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function auth(req, res, next) {
  const token = req.cookies.nikah_admin;
  if (!token || !JWT_SECRET) return res.status(401).json({ error: "Please sign in." });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Session expired. Please sign in again." }); }
}
function slugify(s) {
  return String(s || "").toLowerCase().trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
function safeSettings(data) {
  const out = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings)) {
    if (data && Object.prototype.hasOwnProperty.call(data, key)) out[key] = data[key];
  }
  return out;
}
function validateSettings(input) {
  const allowed = Object.keys(defaultSettings);
  const out = {};
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(input || {}, k)) out[k] = input[k];
  for (const k of ["brideName","groomName","brideParents","groomParents","guestGreeting","intro","date","time","reception","venue","address","mapsUrl","rsvpEmail","artworkUrl","musicUrl","backgroundColor","goldColor","accentColor","textColor"]) {
    if (out[k] !== undefined) out[k] = String(out[k]).slice(0, k === "intro" || k === "address" ? 3000 : 1000);
  }
  for (const k of ["bismillah","musicEnabled","showParticles","countdown","published"]) {
    if (out[k] !== undefined) out[k] = Boolean(out[k]);
  }
  if (out.musicVolume !== undefined) out.musicVolume = Math.min(1, Math.max(0, Number(out.musicVolume) || 0));
  return out;
}

app.get("/api/health", (req, res) => res.json({ ok: true, databaseConfigured: Boolean(pool), cloudStorageConfigured: cloudinaryReady }));

app.get("/api/settings", asyncRoute(async (req, res) => {
  await ready();
  const { rows } = await pool.query("SELECT data FROM invitation_settings WHERE id=1");
  const settings = safeSettings(rows[0]?.data || {});
  if (!settings.published) return res.status(404).json({ error: "Invitation is not published yet." });
  const guestSlug = slugify(req.query.guest || "");
  if (guestSlug) {
    const guestResult = await pool.query("SELECT display_name, enabled FROM guests WHERE slug=$1", [guestSlug]);
    if (guestResult.rows[0] && !guestResult.rows[0].enabled) {
      return res.status(404).json({ error: "This invitation link has been disabled. Please contact the host." });
    }
    if (guestResult.rows[0] && guestResult.rows[0].enabled) {
      settings.guestGreeting = "A warm welcome, " + guestResult.rows[0].display_name;
    }
  }
  res.set("Cache-Control", "no-store");
  res.json(settings);
}));

app.post("/api/rsvp", asyncRoute(async (req, res) => {
  await ready();
  const guestName = String(req.body.guestName || "").trim().slice(0, 120);
  const attendance = String(req.body.attendance || "");
  const partySize = Math.max(1, Math.min(20, parseInt(req.body.partySize, 10) || 1));
  const message = String(req.body.message || "").trim().slice(0, 1000);
  const guestSlug = slugify(req.body.guestSlug || "");
  if (!guestName || !["yes","no","maybe"].includes(attendance)) return res.status(400).json({ error: "Please enter your name and choose an RSVP response." });
  await pool.query("INSERT INTO rsvps(guest_name,guest_slug,attendance,party_size,message) VALUES($1,$2,$3,$4,$5)",
    [guestName, guestSlug || null, attendance, partySize, message]);
  res.status(201).json({ ok: true, message: "Thank you. Your RSVP has been received." });
}));

app.post("/api/admin/login", asyncRoute(async (req, res) => {
  await ready();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const { rows } = await pool.query("SELECT id,email,password_hash FROM admins WHERE email=$1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (!JWT_SECRET || JWT_SECRET.length < 32) return res.status(503).json({ error: "Server JWT_SECRET is missing or too short." });
  const token = jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie("nikah_admin", token, { httpOnly: true, secure: production, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" });
  res.json({ ok: true, email: user.email });
}));
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("nikah_admin", { httpOnly: true, secure: production, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});
app.get("/api/admin/me", auth, (req, res) => res.json({ ok: true, email: req.admin.email }));

app.get("/api/admin/settings", auth, asyncRoute(async (req, res) => {
  await ready();
  const { rows } = await pool.query("SELECT data,updated_at FROM invitation_settings WHERE id=1");
  res.json({ settings: safeSettings(rows[0]?.data || {}), updatedAt: rows[0]?.updated_at });
}));
app.put("/api/admin/settings", auth, asyncRoute(async (req, res) => {
  await ready();
  const patch = validateSettings(req.body);
  const { rows } = await pool.query("SELECT data FROM invitation_settings WHERE id=1");
  const current = safeSettings(rows[0]?.data || {});
  const next = { ...current, ...patch };
  await pool.query("BEGIN");
  try {
    await pool.query("INSERT INTO settings_versions(data) VALUES($1::jsonb)", [JSON.stringify(current)]);
    await pool.query("UPDATE invitation_settings SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(next)]);
    await pool.query("COMMIT");
  } catch (e) { await pool.query("ROLLBACK"); throw e; }
  res.json({ ok: true, settings: next });
}));
app.post("/api/admin/restore", auth, asyncRoute(async (req, res) => {
  await ready();
  const { rows } = await pool.query("SELECT data FROM settings_versions ORDER BY id DESC LIMIT 1");
  if (!rows[0]) return res.status(404).json({ error: "No previous version is available yet." });
  const current = await pool.query("SELECT data FROM invitation_settings WHERE id=1");
  await pool.query("INSERT INTO settings_versions(data) VALUES($1::jsonb)", [JSON.stringify(current.rows[0].data)]);
  await pool.query("UPDATE invitation_settings SET data=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify(rows[0].data)]);
  res.json({ ok: true, settings: safeSettings(rows[0].data) });
}));
app.get("/api/admin/rsvps", auth, asyncRoute(async (req, res) => {
  await ready();
  const { rows } = await pool.query("SELECT id,guest_name AS \"guestName\",guest_slug AS \"guestSlug\",attendance,party_size AS \"partySize\",message,created_at AS \"createdAt\" FROM rsvps ORDER BY created_at DESC LIMIT 500");
  res.json(rows);
}));
app.get("/api/admin/guests", auth, asyncRoute(async (req, res) => {
  await ready();
  const { rows } = await pool.query("SELECT id,slug,display_name AS \"displayName\",enabled,created_at AS \"createdAt\" FROM guests ORDER BY id DESC");
  res.json(rows);
}));
app.post("/api/admin/guests", auth, asyncRoute(async (req, res) => {
  await ready();
  const displayName = String(req.body.displayName || "").trim().slice(0, 120);
  const slug = slugify(req.body.slug || displayName);
  if (!displayName || !slug) return res.status(400).json({ error: "Guest name and a valid URL slug are required." });
  const { rows } = await pool.query("INSERT INTO guests(slug,display_name) VALUES($1,$2) RETURNING id,slug,display_name AS \"displayName\",enabled", [slug, displayName]);
  res.status(201).json(rows[0]);
}));
app.patch("/api/admin/guests/:id", auth, asyncRoute(async (req, res) => {
  await ready();
  const enabled = Boolean(req.body.enabled);
  const { rows } = await pool.query("UPDATE guests SET enabled=$1 WHERE id=$2 RETURNING id,slug,display_name AS \"displayName\",enabled", [enabled, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Guest link not found." });
  res.json(rows[0]);
}));

app.post("/api/admin/upload", auth, asyncRoute(async (req, res) => {
  if (!cloudinaryReady) return res.status(503).json({ error: "Cloudinary is not configured. Add CLOUDINARY_* environment variables." });
  const dataUrl = String(req.body.dataUrl || "");
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl)) return res.status(400).json({ error: "Upload a PNG, JPG, or WebP image." });
  if (dataUrl.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Image is too large. Please keep it under about 6 MB." });
  const result = await cloudinary.uploader.upload(dataUrl, { folder: "nikah-invitation", resource_type: "image" });
  res.status(201).json({ url: result.secure_url, publicId: result.public_id });
}));

app.get("/invite/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? "A server error occurred. Check server logs." : err.message });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Nikah invitation running on http://localhost:${port}`));
}
module.exports = app;

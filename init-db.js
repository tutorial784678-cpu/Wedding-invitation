require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
    await pool.query(sql);
    console.log("Database schema initialized.");
  } finally { await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });

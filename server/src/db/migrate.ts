import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = await readFile(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("Schema aplicado correctamente.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Error aplicando el schema:", err);
  process.exit(1);
});

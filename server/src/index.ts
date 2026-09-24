import "dotenv/config";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { MulterError } from "multer";
import type { ErrorRequestHandler } from "express";
import { pool } from "./db/pool.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { UPLOADS_DIR } from "./middleware/upload.js";
import { registerRouter } from "./routes/register.js";
import { adminRouter } from "./routes/admin.js";
import { adminTeamsRouter } from "./routes/adminTeams.js";
import { crmRouter } from "./routes/crm.js";
import { webhooksRouter } from "./routes/webhooks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

mkdirSync(UPLOADS_DIR, { recursive: true });

// Aplica schema.sql al arrancar (CREATE ... IF NOT EXISTS, idempotente) para que el
// deploy nunca dependa de correr una migración aparte contra la base de producción.
async function ensureSchema() {
  const sql = await readFile(path.join(__dirname, "db/schema.sql"), "utf-8");
  await pool.query(sql);
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ROOT_DIR = process.cwd();

// Railway está detrás de un proxy/balanceador: sin esto, req.ip sería siempre la IP
// del proxy y el rate limiting agruparía a todos los visitantes como uno solo.
app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false, // requeriría auditar cada script/worker/blob: del bundle; ver reporte de seguridad
    frameguard: { action: "deny" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }),
);
app.use(compression());

const DEFAULT_ALLOWED_ORIGINS = [
  "https://retovirgendelapaz.com",
  "https://www.retovirgendelapaz.com",
  "http://localhost:5173",
  "http://localhost:4000",
];
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : DEFAULT_ALLOWED_ORIGINS;

// Railway asigna un dominio temporal nuevo (*.up.railway.app) cada vez que se
// recrea el servicio; en vez de hardcodearlo, se permite cualquier subdominio
// de up.railway.app automáticamente para que los assets nunca queden bloqueados
// por CORS tras un redeploy.
function isRailwayTemporaryDomain(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "up.railway.app" || hostname.endsWith(".up.railway.app");
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      // Sin header Origin (curl, apps móviles, same-origin) o en la lista permitida.
      if (!origin || allowedOrigins.includes(origin) || isRailwayTemporaryDomain(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origen no permitido por política CORS."));
    },
  }),
);

app.use(globalLimiter);
app.use(
  express.json({
    // Conserva el body crudo para poder validar la firma X-Hub-Signature-256 de Meta
    // en el webhook de WhatsApp (metaWhatsAppService.verifySignature necesita los
    // bytes exactos recibidos, no el objeto ya parseado).
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    // Los archivos ya están validados por firma de bytes (solo JPEG/PNG/PDF reales),
    // pero forzamos "inline" y confiamos en X-Content-Type-Options (helmet) como
    // segunda capa para que el navegador nunca intente ejecutar el contenido servido.
    setHeaders: (res) => {
      res.setHeader("Content-Disposition", "inline");
    },
  }),
);

app.use("/api/register", registerRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/teams", adminTeamsRouter);
app.use("/api/admin/crm", crmRouter);
app.use("/api", webhooksRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(ROOT_DIR, "dist");
  // Los assets de /assets llevan hash en el nombre (Vite), así que pueden cachearse
  // de forma permanente; el resto (index.html, etc.) no debe cachearse tan agresivo.
  app.use(
    express.static(distDir, {
      immutable: true,
      maxAge: "1y",
      setHeaders: (res, filePath) => {
        if (!filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  // Catch-all SPA fallback (Express 5 dropped bare "*" route patterns).
  app.use((_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

// Captura errores de multer (tipo de archivo inválido, límite de tamaño, etc.)
// antes de que lleguen al handler HTML por defecto de Express y filtren stack traces.
// Express solo reconoce middleware de error si la función declara 4 parámetros (function.length).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.message === "Origen no permitido por política CORS.") {
    res.status(403).json({ error: err.message });
    return;
  }

  console.error("Error no manejado:", err);

  // En producción nunca reenviamos err.message al cliente: puede ser un mensaje crudo
  // de Postgres, una ruta de archivo del servidor, etc. Solo en desarrollo ayuda a depurar.
  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    res.status(500).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Error interno del servidor." });
};
app.use(errorHandler);

ensureSchema()
  .catch((err) => {
    console.error("Error aplicando el schema al arrancar:", err);
    process.exit(1);
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor Reto Virgen de la Paz escuchando en el puerto ${PORT}`);
    });
  });

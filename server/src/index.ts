import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import compression from "compression";
import cors from "cors";
import express from "express";
import { MulterError } from "multer";
import type { ErrorRequestHandler } from "express";
import { UPLOADS_DIR } from "./middleware/upload.js";
import { registerRouter } from "./routes/register.js";
import { adminRouter } from "./routes/admin.js";

mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ROOT_DIR = process.cwd();

app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/register", registerRouter);
app.use("/api/admin", adminRouter);

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
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error("Error no manejado:", err);
  res.status(500).json({ error: "Error interno del servidor." });
};
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Servidor Reto Virgen de la Paz escuchando en el puerto ${PORT}`);
});

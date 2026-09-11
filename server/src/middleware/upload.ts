import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import type { FileFilterCallback } from "multer";
import type { Request } from "express";

export const UPLOADS_DIR = path.resolve(process.cwd(), "server/uploads");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Formato no soportado. Sube una imagen JPG/PNG o un PDF."));
  }
}

export const uploadProof = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

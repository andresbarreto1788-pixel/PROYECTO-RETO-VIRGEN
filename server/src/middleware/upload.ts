import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

export const UPLOADS_DIR = path.resolve(process.cwd(), "server/uploads");

// El mimetype/extensión que manda el cliente son triviales de falsificar (un .svg o
// .html renombrado a .jpg pasa cualquier filtro basado solo en esos campos). Por eso
// solo confiamos en la firma real de bytes del archivo, detectada después de subirlo
// a memoria, y nosotros mismos elegimos la extensión final — nunca la del cliente.
const ALLOWED_MAGIC_BYTES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

export const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export async function persistValidatedProof(req: Request, res: Response, next: NextFunction) {
  if (!req.file) {
    next();
    return;
  }

  try {
    const detected = await fileTypeFromBuffer(req.file.buffer);
    const ext = detected ? ALLOWED_MAGIC_BYTES[detected.mime] : undefined;
    if (!ext) {
      res.status(400).json({ error: "Formato no soportado. Sube una imagen JPG/PNG o un PDF real." });
      return;
    }

    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOADS_DIR, filename), req.file.buffer);
    req.file.filename = filename;
    next();
  } catch (err) {
    next(err);
  }
}

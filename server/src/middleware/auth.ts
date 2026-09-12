import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const MIN_SECRET_LENGTH = 32;
const rawSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === "production" && (!rawSecret || rawSecret.length < MIN_SECRET_LENGTH)) {
  throw new Error(`JWT_SECRET debe estar definido en producción con al menos ${MIN_SECRET_LENGTH} caracteres.`);
}

const JWT_SECRET = rawSecret && rawSecret.length >= MIN_SECRET_LENGTH ? rawSecret : "dev-secret-change-me-dev-secret-change-me";

// Compara en tiempo constante para no filtrar por cuánto tarda la respuesta cuántos
// caracteres iniciales coinciden (timing attack) — usado para ADMIN_PASSWORD.
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Comparación dummy para no retornar antes de tiempo según la longitud.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function signAdminToken(): string {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h", algorithm: "HS256" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Falta el token de autenticación." });
    return;
  }

  try {
    // Restringe explícitamente el algoritmo aceptado: sin esto, jsonwebtoken confía en
    // el campo "alg" del propio token, lo que permite un ataque de confusión de
    // algoritmo (incluido "none") si un atacante arma un token a mano.
    jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado." });
  }
}

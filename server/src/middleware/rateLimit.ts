import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
});

// Sin `skipSuccessfulRequests`: cada intento cuenta, exitoso o no, para que un atacante
// no pueda usar logins correctos de prueba para resetear su propio contador.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intenta de nuevo más tarde." },
});

// Consulta de saldo por cédula + teléfono/correo: limita los intentos para que nadie pueda
// adivinar datos de otros atletas probando combinaciones.
export const balanceLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas consultas desde esta red. Intenta de nuevo en unos minutos." },
});

export const balancePayLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pagos enviados desde esta red. Intenta de nuevo más tarde." },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas inscripciones desde esta red. Intenta de nuevo más tarde." },
});

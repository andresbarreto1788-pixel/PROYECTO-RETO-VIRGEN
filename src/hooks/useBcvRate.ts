import { useCallback, useEffect, useState } from "react";
import type { BcvRateState } from "../types/race";

/**
 * FALLBACK_BCV_RATE se usa solo si ninguna fuente en vivo responde. No es
 * editable desde el cliente: la tasa BCV es siempre de solo lectura para el
 * usuario. Actualiza este valor de referencia periódicamente.
 */
const FALLBACK_BCV_RATE = 832.49;

interface BcvSource {
  url: string;
  extractPrice: (payload: unknown) => number | null;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

const SOURCES: BcvSource[] = [
  {
    // https://bcv.today/api/ — estático (GitHub Pages), sin autenticación ni límites de uso.
    url: "https://bcv.today/api/v1/rate.json",
    extractPrice: (payload) => {
      const data = asRecord(payload);
      const price = data?.USD;
      return typeof price === "number" ? price : null;
    },
  },
  {
    url: "https://pydolarve.org/api/v1/dollar?page=bcv",
    extractPrice: (payload) => {
      const data = asRecord(payload);
      if (!data) return null;

      const direct = data.price;
      if (typeof direct === "number") return direct;

      const monitors = asRecord(data.monitors);
      const bcv = monitors ? asRecord(monitors.bcv) : null;
      if (bcv && typeof bcv.price === "number") return bcv.price;

      return null;
    },
  },
];

async function fetchFromSource(source: BcvSource): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(source.url, { signal: controller.signal });
    if (!res.ok) return null;

    const json = await res.json();
    const price = source.extractPrice(json);
    return price && price > 0 ? price : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function useBcvRate() {
  const [state, setState] = useState<BcvRateState>({
    rate: FALLBACK_BCV_RATE,
    source: "fallback",
    loading: true,
    error: null,
    updatedAt: null,
  });

  const fetchRate = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    for (const source of SOURCES) {
      const price = await fetchFromSource(source);
      if (price) {
        setState({
          rate: price,
          source: "api",
          loading: false,
          error: null,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
    }

    setState({
      rate: FALLBACK_BCV_RATE,
      source: "fallback",
      loading: false,
      error: "No se pudo consultar la tasa BCV en vivo. Usando valor de referencia.",
      updatedAt: null,
    });
  }, []);

  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  return { ...state, refetch: fetchRate };
}

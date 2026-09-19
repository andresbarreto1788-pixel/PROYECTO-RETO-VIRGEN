const FALLBACK_BCV_RATE = 832.49;

export async function fetchBcvRate(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://bcv.today/api/v1/rate.json", { signal: controller.signal });
    if (!res.ok) return FALLBACK_BCV_RATE;
    const data = (await res.json()) as { USD?: number };
    return typeof data.USD === "number" && data.USD > 0 ? data.USD : FALLBACK_BCV_RATE;
  } catch {
    return FALLBACK_BCV_RATE;
  } finally {
    clearTimeout(timeout);
  }
}

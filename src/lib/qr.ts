import QRCode from "qrcode";
import type { RegistrationData } from "../types/race";

export async function generateAthleteQr(data: RegistrationData): Promise<string> {
  const payload = `RVP-VERIFY:${data.athleteId}:${data.qrCodeToken}`;

  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 320,
    color: {
      dark: "#0B0D0E",
      light: "#CCFF00",
    },
  });
}

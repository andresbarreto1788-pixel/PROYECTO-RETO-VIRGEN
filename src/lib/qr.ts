import QRCode from "qrcode";

export async function generateAthleteQr(data: { athleteId: string; qrCodeToken: string }): Promise<string> {
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

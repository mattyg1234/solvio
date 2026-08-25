import QRCode from "qrcode";

export async function showOpsTicketQrSvg(ticketUrl: string): Promise<string> {
  return QRCode.toString(ticketUrl, {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

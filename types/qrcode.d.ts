// Minimale Typen für das Paket "qrcode" (ohne @types/qrcode zu installieren) – nur was wir nutzen.
declare module "qrcode" {
  const QRCode: {
    toDataURL(text: string, options?: { margin?: number; width?: number }): Promise<string>;
  };
  export default QRCode;
}

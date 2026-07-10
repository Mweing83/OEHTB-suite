import crypto from "crypto";

// Symmetrische Verschluesselung (AES-256-GCM) fuer sensible Werte wie
// API-Keys, die in der Datenbank gespeichert werden ("at rest").
// Der Schluessel kommt aus ENCRYPTION_KEY (genau 32 Zeichen).

const ALGORITHMUS = "aes-256-gcm";

function getSchluessel(): Buffer {
  const key = process.env.ENCRYPTION_KEY ?? "";
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY muss genau 32 Zeichen lang sein (aktuell: " +
        key.length +
        ")."
    );
  }
  return Buffer.from(key, "utf-8");
}

export function verschluesseln(klartext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHMUS, getSchluessel(), iv);
  const verschluesselt = Buffer.concat([
    cipher.update(klartext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (alle base64)
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    verschluesselt.toString("base64"),
  ].join(":");
}

export function entschluesseln(gespeichert: string): string {
  const [ivB64, tagB64, dataB64] = gespeichert.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const daten = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHMUS, getSchluessel(), iv);
  decipher.setAuthTag(authTag);
  const klartext = Buffer.concat([
    decipher.update(daten),
    decipher.final(),
  ]);
  return klartext.toString("utf-8");
}

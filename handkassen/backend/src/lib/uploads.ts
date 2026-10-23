import path from "node:path";
import fs from "node:fs";

// Lokales Verzeichnis der Belegdateien (Upload und BMD-ZIP-Export).
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve("uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

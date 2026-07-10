// Lädt OpenCV.js und jscanify einmalig nach (für die Belegkanten-Erkennung).
// Beide laufen vollständig im Browser – es wird kein Bild an einen Server gesendet.
//
// Offline-Betrieb: Beide Bibliotheken werden lokal aus dem Ordner public/scanner/
// geladen – ohne Internet/CDN. Die Dateien müssen dort einmalig abgelegt werden:
//   frontend/public/scanner/opencv.js
//   frontend/public/scanner/jscanify.min.js
// (Soll doch wieder vom CDN geladen werden, hier die URLs entsprechend setzen:
//  https://docs.opencv.org/4.7.0/opencv.js bzw. die jscanify-CDN-URL.)

const OPENCV_URL = "/scanner/opencv.js";
const JSCANIFY_URL = "/scanner/jscanify.min.js";

declare global {
  interface Window {
    cv?: any;
    jscanify?: any;
  }
}

let geladen: Promise<{ cv: any; jscanify: any }> | null = null;

function skriptLaden(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Komponente konnte nicht geladen werden: ${src}`));
    document.head.appendChild(s);
  });
}

function warteAuf(pruef: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      let ok = false;
      try {
        ok = pruef();
      } catch {
        ok = false;
      }
      if (ok) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Zeitüberschreitung beim Laden der Beleg-Erkennung."));
      setTimeout(check, 100);
    })();
  });
}

// Lädt (einmalig) OpenCV.js und jscanify und liefert beide zurück.
// Bei Fehler wird der Cache geleert, sodass ein erneuter Versuch möglich ist.
export function ladeScanner(): Promise<{ cv: any; jscanify: any }> {
  if (geladen) return geladen;
  geladen = (async () => {
    await skriptLaden(OPENCV_URL);
    await warteAuf(() => !!(window.cv && window.cv.Mat), 30000);
    await skriptLaden(JSCANIFY_URL);
    await warteAuf(() => typeof window.jscanify === "function", 10000);
    return { cv: window.cv, jscanify: window.jscanify };
  })();
  geladen.catch(() => {
    geladen = null;
  });
  return geladen;
}

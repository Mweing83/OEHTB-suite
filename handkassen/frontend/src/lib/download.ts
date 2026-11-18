// Datei über einen temporären Link herunterladen (statt sie im Tab zu öffnen).
// Ohne `dateiname` gilt der vom Server gesetzte Name (Content-Disposition).
export function herunterladen(href: string, dateiname = ""): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

import { useEffect } from "react";
import { createRoot } from "react-dom/client";

// Gestylte Ersatzfunktionen fuer window.confirm / window.alert – einheitlich in
// allen drei Werkzeugen (bewusst dupliziert, kein geteiltes Paket).
// Nutzung:  if (!(await bestaetigen("Wirklich loeschen?"))) return;
//           await hinweis("Export fehlgeschlagen.");
export type DialogOptionen = {
  titel?: string;
  bestaetigenText?: string;
  abbrechenText?: string;
  gefahr?: boolean; // rote Bestaetigen-Taste (Loeschen o. Ae.)
};

function DialogRahmen({
  titel,
  text,
  knoepfe,
  abbrechen,
}: {
  titel: string;
  text: string;
  knoepfe: React.ReactNode;
  abbrechen: () => void;
}) {
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") abbrechen();
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [abbrechen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) abbrechen();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-base font-semibold text-slate-900">{titel}</h2>
        <p className="mb-5 whitespace-pre-line text-sm text-slate-600">{text}</p>
        <div className="flex justify-end gap-2">{knoepfe}</div>
      </div>
    </div>
  );
}

function mounten(bauen: (schliessen: () => void) => React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const schliessen = () => {
    root.unmount();
    el.remove();
  };
  root.render(bauen(schliessen));
}

const knopfBasis = "rounded-md px-4 py-2 text-sm font-medium";

export function bestaetigen(
  text: string,
  opt: DialogOptionen = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    mounten((schliessen) => {
      const fertig = (wert: boolean) => {
        schliessen();
        resolve(wert);
      };
      return (
        <DialogRahmen
          titel={opt.titel ?? "Bestätigen"}
          text={text}
          abbrechen={() => fertig(false)}
          knoepfe={
            <>
              <button
                className={`${knopfBasis} border border-slate-300 text-slate-700 hover:bg-slate-50`}
                onClick={() => fertig(false)}
              >
                {opt.abbrechenText ?? "Abbrechen"}
              </button>
              <button
                autoFocus
                className={`${knopfBasis} text-white ${
                  opt.gefahr
                    ? "bg-gefahr-600 hover:bg-gefahr-700"
                    : "bg-marke-600 hover:bg-marke-700"
                }`}
                onClick={() => fertig(true)}
              >
                {opt.bestaetigenText ?? "Bestätigen"}
              </button>
            </>
          }
        />
      );
    });
  });
}

export function hinweis(text: string, titel = "Hinweis"): Promise<void> {
  return new Promise((resolve) => {
    mounten((schliessen) => {
      const fertig = () => {
        schliessen();
        resolve();
      };
      return (
        <DialogRahmen
          titel={titel}
          text={text}
          abbrechen={fertig}
          knoepfe={
            <button
              autoFocus
              className={`${knopfBasis} bg-marke-600 text-white hover:bg-marke-700`}
              onClick={fertig}
            >
              OK
            </button>
          }
        />
      );
    });
  });
}

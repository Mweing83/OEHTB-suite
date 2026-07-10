import { spawn } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Sicherheitsnetz gegen haengende Installationen (z. B. UAC ohne Bestaetigung).
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Ollama-Installation auf dem SERVER (der Maschine, auf der das Backend laeuft).
//
// SICHERHEIT: Es werden ausschliesslich FEST verdrahtete Befehle je Betriebs-
// system ausgefuehrt. Es fliesst KEINE Eingabe aus dem Request in die Shell –
// damit ist keine Command-Injection moeglich. Ausserdem sind die zugehoerigen
// Routen auf die Rolle ADMIN beschraenkt.
// ---------------------------------------------------------------------------

const OLLAMA_ENDPOINT = "http://localhost:11434/api/version";

// Fester Installationsbefehl je Plattform (oder null = nicht unterstuetzt).
function installBefehl(): string | null {
  switch (process.platform) {
    case "win32":
      // Winget installiert Ollama pro Benutzer (keine Adminrechte noetig).
      return "winget install --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements";
    case "linux":
      // Offizielles Installationsskript von Ollama.
      return "curl -fsSL https://ollama.com/install.sh | sh";
    default:
      // macOS/unbekannt: keine zuverlaessige stille CLI-Installation.
      return null;
  }
}

export function installBar(): boolean {
  return installBefehl() !== null;
}

// Prueft, ob der lokale Ollama-Dienst antwortet (installiert UND gestartet).
async function ollamaErreichbar(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(OLLAMA_ENDPOINT, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const daten = (await res.json()) as { version?: string };
    return daten.version ?? "unbekannt";
  } catch {
    return null;
  }
}

// Prueft die CLI (ollama --version). Faengt fehlende Binary/PATH sauber ab.
function ollamaCliVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const p = spawn("ollama", ["--version"], { shell: true });
      let out = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (out += d.toString()));
      p.on("close", (code) => resolve(code === 0 ? out.trim() : null));
      p.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

export interface OllamaStatus {
  installiert: boolean;
  laeuft: boolean;
  version: string | null;
  plattform: string;
  installBar: boolean;
  install: InstallLauf | null;
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  const [endpointVersion, cliVersion] = await Promise.all([
    ollamaErreichbar(),
    ollamaCliVersion(),
  ]);
  return {
    installiert: endpointVersion !== null || cliVersion !== null,
    laeuft: endpointVersion !== null,
    version: endpointVersion ?? cliVersion,
    plattform: process.platform,
    installBar: installBar(),
    install: installLauf,
  };
}

// ---------------------------------------------------------------------------
// Laufende/letzte Installation (im Speicher gehalten, damit das Frontend den
// Fortschritt pollen kann).
// ---------------------------------------------------------------------------
interface InstallLauf {
  status: "laeuft" | "fertig" | "fehler";
  log: string;
  startAm: number;
  endeAm?: number;
}

let installLauf: InstallLauf | null = null;

export function installLaeuft(): boolean {
  return installLauf?.status === "laeuft";
}

export function installStarten(): { ok: boolean; grund?: string } {
  if (installLaeuft()) {
    return { ok: false, grund: "Installation läuft bereits." };
  }
  if (!installBar()) {
    return {
      ok: false,
      grund:
        "Automatische Installation auf diesem Betriebssystem nicht unterstützt.",
    };
  }

  const lauf: InstallLauf = { status: "laeuft", log: "", startAm: Date.now() };
  installLauf = lauf;

  // Immer mit erhoehten Rechten (Windows: UAC/RunAs, Linux: sudo).
  if (process.platform === "win32") {
    starteWindowsElevated(lauf);
  } else {
    starteLinuxElevated(lauf);
  }
  return { ok: true };
}

function begrenzen(s: string): string {
  return s.length > 20000 ? s.slice(-20000) : s;
}

function abschliessen(lauf: InstallLauf, code: number | null) {
  if (lauf.status === "laeuft") {
    lauf.status = code === 0 ? "fertig" : "fehler";
    lauf.endeAm = Date.now();
  }
}

// Windows: winget in einer ELEVIERTEN PowerShell (Start-Process -Verb RunAs).
// Die Ausgabe der elevierten Instanz laesst sich nicht direkt zurueckleiten,
// daher schreibt sie in eine Logdatei, die wir laufend einlesen.
function starteWindowsElevated(lauf: InstallLauf) {
  const stempel = Date.now();
  const logDatei = join(tmpdir(), `ollama-install-${stempel}.log`);
  const skriptDatei = join(tmpdir(), `ollama-install-${stempel}.ps1`);

  // Skript, das ELEVIERT laeuft: winget ausfuehren, alle Streams in die Logdatei.
  const skript =
    `$ErrorActionPreference = 'Continue'\r\n` +
    `winget install --id Ollama.Ollama --silent ` +
    `--accept-package-agreements --accept-source-agreements *> "${logDatei}"\r\n` +
    `exit $LASTEXITCODE\r\n`;

  try {
    writeFileSync(logDatei, "");
    writeFileSync(skriptDatei, skript, "utf8");
  } catch (err) {
    lauf.status = "fehler";
    lauf.log += `[Fehler] Temporaerdatei konnte nicht angelegt werden: ${
      err instanceof Error ? err.message : String(err)
    }`;
    lauf.endeAm = Date.now();
    return;
  }

  lauf.log =
    "Starte Installation mit erhöhten Rechten – bitte die UAC-Abfrage am " +
    "Server bestätigen …\n";

  // Aeussere (nicht-elevierte) PowerShell startet den elevierten Prozess (UAC),
  // wartet und gibt dessen Exitcode zurueck. Keine Nutzereingabe -> keine Injection.
  const outer =
    `$p = Start-Process powershell -Verb RunAs -Wait -PassThru ` +
    `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${skriptDatei}'; ` +
    `exit $p.ExitCode`;

  const kind = spawn(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", outer],
    { windowsHide: true }
  );

  const leser = setInterval(() => {
    try {
      if (existsSync(logDatei)) {
        const inhalt = readFileSync(logDatei, "utf8");
        if (inhalt.trim()) {
          lauf.log = begrenzen(
            "Elevierte Installation läuft …\n\n" + inhalt
          );
        }
      }
    } catch {
      // Datei evtl. gerade gesperrt – naechster Tick.
    }
  }, 1500);

  const timeout = setTimeout(() => {
    kind.kill();
    lauf.status = "fehler";
    lauf.log += "\n[Zeitüberschreitung] Installation abgebrochen.";
    lauf.endeAm = Date.now();
  }, INSTALL_TIMEOUT_MS);

  kind.stderr.on("data", (d) => {
    lauf.log = begrenzen(lauf.log + d.toString());
  });
  kind.on("close", (code) => {
    clearInterval(leser);
    clearTimeout(timeout);
    try {
      if (existsSync(logDatei)) {
        const inhalt = readFileSync(logDatei, "utf8");
        if (inhalt.trim()) lauf.log = begrenzen(lauf.log + "\n\n" + inhalt);
      }
    } catch {
      // ignorieren
    }
    if (code !== 0) {
      lauf.log +=
        "\n[Hinweis] Abbruch der UAC-Abfrage oder fehlende Rechte führen " +
        "ebenfalls zu einem Fehler.";
    }
    abschliessen(lauf, code);
  });
  kind.on("error", (err) => {
    clearInterval(leser);
    clearTimeout(timeout);
    lauf.status = "fehler";
    lauf.log += `\n[Fehler beim Start] ${err.message}`;
    lauf.endeAm = Date.now();
  });
}

// Linux: offizielles Skript mit sudo (nicht-interaktiv). Ohne passwortloses
// sudo schlaegt es klar erkennbar fehl (Meldung landet im Log).
function starteLinuxElevated(lauf: InstallLauf) {
  const cmd = `sudo -n sh -c 'curl -fsSL https://ollama.com/install.sh | sh'`;
  lauf.log = "Starte Installation mit sudo …\n";

  const kind = spawn(cmd, { shell: true });
  const timeout = setTimeout(() => {
    kind.kill();
    lauf.status = "fehler";
    lauf.log += "\n[Zeitüberschreitung] Installation abgebrochen.";
    lauf.endeAm = Date.now();
  }, INSTALL_TIMEOUT_MS);

  const anhaengen = (d: Buffer) => {
    lauf.log = begrenzen(lauf.log + d.toString());
  };
  kind.stdout.on("data", anhaengen);
  kind.stderr.on("data", anhaengen);
  kind.on("close", (code) => {
    clearTimeout(timeout);
    abschliessen(lauf, code);
  });
  kind.on("error", (err) => {
    clearTimeout(timeout);
    lauf.status = "fehler";
    lauf.log += `\n[Fehler beim Start] ${err.message}`;
    lauf.endeAm = Date.now();
  });
}

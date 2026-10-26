import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { useT } from "@/i18n/useT";
import { createDemoProject, useProjectStore } from "@/stores/useProjectStore";
import { TARGETS, pairs, type LabReport } from "./picker/lab";
import { usePicker } from "./picker/usePicker";
import { FIGHTER_ORDER } from "./roster";
import { goTo } from "./route";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The balance lab (#/pk/lab): every pair on the current song and the demo, many seeds each,
 * summed into a win-rate table and the director's numbers, each against its target.
 */
export function PkLab() {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const [seeds, setSeeds] = useState(200);
  const [report, setReport] = useState<LabReport | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const { lab } = usePicker();
  const demo = createDemoProject();
  const songs = project.name === demo.name ? [project] : [project, demo];
  const total = pairs().length * songs.length * seeds;

  const run = async () => {
    setProgress([0, pairs().length * songs.length]);
    const r = await lab(songs, seeds, (done, all) => setProgress([done, all]));
    setProgress(null);
    setReport(r);
  };

  const metric = (key: keyof typeof t.pkLabMetrics, value: number, ok: boolean | null, target: string) => (
    <li key={key} className={ok === null ? "" : ok ? "is-ok" : "is-off"}>
      <span>{t.pkLabMetrics[key]}</span>
      <strong>{pct(value)}</strong>
      {target && <em>{t.pkLabTarget(target)}</em>}
    </li>
  );

  return (
    <div className="pk pk--lab" role="region" aria-label={t.pkLab}>
      <header className="pk__head">
        <IconButton label={t.pkTitle} variant="quiet" onClick={() => goTo("pk")} disabled={progress !== null}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1>{t.pkLab}</h1>
        <span />
      </header>
      <div className="pk-lab">
        <p className="pk-intro">{t.pkLabIntro}</p>
        <p className="pk-song">♪ {songs.map((s) => s.name).join(" · ")}</p>
        <div className="pk-row">
          <label>
            <span>{t.pkLabSeeds}</span>
            <input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={seeds}
              onChange={(e) => setSeeds(Math.min(1000, Math.max(10, Math.floor(Number(e.currentTarget.value) || 10))))}
              disabled={progress !== null}
            />
          </label>
          <button type="button" className="pk-btn" onClick={() => void run()} disabled={progress !== null}>
            {progress ? t.pkLabRunning(progress[0], progress[1]) : t.pkLabRun(total)}
          </button>
        </div>
        {report && (
          <>
            <h2>{t.pkLabMatrix}</h2>
            <table className="pk-matrix">
              <thead>
                <tr>
                  <th />
                  {FIGHTER_ORDER.map((m) => (
                    <th key={m} scope="col">
                      {t.memberName[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIGHTER_ORDER.map((a) => (
                  <tr key={a}>
                    <th scope="row">{t.memberName[a]}</th>
                    {FIGHTER_ORDER.map((b) => {
                      const v = report.wins[a][b];
                      const ok = v === undefined || (v >= TARGETS.winRate[0] && v <= TARGETS.winRate[1]);
                      return (
                        <td key={b} className={v === undefined ? "" : ok ? "is-ok" : "is-off"}>
                          {v === undefined ? "–" : pct(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pk-hint">
              {t.pkLabFights(report.fights)} · {t.pkLabTarget(`${pct(TARGETS.winRate[0])}–${pct(TARGETS.winRate[1])}`)}
            </p>
            <ul className="pk-metrics">
              {metric("songPairsInRange", report.songPairsInRange, report.songPairsInRange > TARGETS.songPairsInRange, `> ${pct(TARGETS.songPairsInRange)}`)}
              {metric("koInWindow", report.koInWindow, report.koInWindow > TARGETS.koInWindow, `> ${pct(TARGETS.koInWindow)}`)}
              {metric("timeUpRate", report.timeUpRate, report.timeUpRate < TARGETS.timeUpRate, `< ${pct(TARGETS.timeUpRate)}`)}
              {metric("comebackRate", report.comebackRate, report.comebackRate > TARGETS.comebackRate, `> ${pct(TARGETS.comebackRate)}`)}
              {metric("bothSpecials", report.bothSpecials, report.bothSpecials > TARGETS.bothSpecials, `> ${pct(TARGETS.bothSpecials)}`)}
              {metric("meanKoShare", report.meanKoShare, null, "")}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

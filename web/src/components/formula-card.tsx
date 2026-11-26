import { Card, CardBody, CardHeader } from "./ui";
import { RANKING_RULES } from "@/lib/domain/metrics";

export function FormulaCard() {
  return (
    <Card>
      <CardHeader title="How the scores are calculated" />
      <CardBody>
        <dl className="grid gap-4 text-[13px] text-ink-2 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="font-medium text-ink">Present days</dt>
            <dd>Σ presence from Calendar View: blank / Working / WFH = 1, any half-day leave = 0.5, leave / LoP = 0. Week Off and Public Holiday are not counted.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Target-days earned</dt>
            <dd>For each User Input quantity in a targeted process: quantity ÷ that process&apos;s target per day (Settings → Productivity targets; the upper end of the range, e.g. 12 Ext FQC = 1 target-day for 10-12).</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Productivity %</dt>
            <dd>Target-days earned ÷ present days × 100. 100% = one full day of target work per present day. Output logged on an off-day still counts.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Target coverage & ranking</dt>
            <dd>
              Coverage = share of a person&apos;s output in processes that have a target. Only people with coverage ≥ {RANKING_RULES.minCoveragePct}% and ≥ {RANKING_RULES.minPresentDays} present days are ranked, so untargeted work (Critical Review, uploads…) never makes someone look unproductive.
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}


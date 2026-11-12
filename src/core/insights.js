export function generateInsights(project, series) {
  if (!series.length) return { insights: [], summary: 'Add a progress update to begin tracking project performance.' };
  const current = series.at(-1);
  const { metrics: m } = current;
  const add = (id, severity, title, message, evidence, action) => insights.push({ id, severity, title, message, evidence, action });
  const insights = [];
  if (m.cpi >= 1 && m.spi >= 1) add('quadrant', 'positive', 'Ahead of schedule and under budget', 'Performance is favourable on both cost and schedule.', { cpi: m.cpi, spi: m.spi }, 'Maintain the current controls.');
  else if (m.cpi >= 1) add('quadrant', 'warning', 'Under budget but behind schedule', 'Cost efficiency is good, but delivery is late.', { cpi: m.cpi, spi: m.spi }, 'Consider adding resources or reviewing the critical path.');
  else if (m.spi >= 1) add('quadrant', 'warning', 'Ahead of schedule but over budget', 'Delivery is ahead, but cost efficiency needs attention.', { cpi: m.cpi, spi: m.spi }, 'Check for overtime or scope creep.');
  else add('quadrant', 'critical', 'Over budget and behind schedule', 'Both cost and schedule performance require recovery action.', { cpi: m.cpi, spi: m.spi }, 'Trigger a recovery plan.');
  for (const [label, value] of [['CPI', m.cpi], ['SPI', m.spi]]) {
    if (value === null) {
      add(`${label.toLowerCase()}-status`, 'info', `${label} status unavailable`, `${label} cannot be calculated because its denominator is zero.`, {}, 'Add a valid cumulative value for the next period.');
      continue;
    }
    const severity = value >= project.green ? 'positive' : value >= project.amber ? 'warning' : 'critical';
    add(`${label.toLowerCase()}-status`, severity, `${label} status: ${severity}`, `${label} is ${value.toFixed(2)} against thresholds.`, { [label.toLowerCase()]: value }, 'Review the latest cost and schedule drivers.');
  }
  if (m.vac < 0) add('forecast', Math.abs(m.vac / project.bac) >= 0.05 ? 'critical' : 'warning', 'Projected cost overrun', `Projected overrun of PKR ${Math.abs(m.vac).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${Math.abs(m.vac / project.bac * 100).toFixed(1)}% of BAC).`, { vac: m.vac }, 'Reforecast scope and corrective actions.');
  else add('forecast', 'positive', 'Forecast within budget', 'The current forecast is within the approved budget.', { vac: m.vac }, 'Continue monitoring CPI.');
  if (m.tcpi !== null) add('tcpi', m.tcpi <= 1 ? 'positive' : m.tcpi <= 1.1 ? 'warning' : 'critical', 'To-complete efficiency', m.tcpi <= 1 ? 'Achievable at the current pace.' : m.tcpi <= 1.1 ? 'Requires slight efficiency improvement.' : 'Unrealistic without a scope, budget or schedule change.', { tcpi: m.tcpi }, 'Compare required efficiency with recent performance.');
  else add('tcpi', 'critical', 'Budget feasibility', m.tcpiLabel || 'Cannot be met.', {}, 'Escalate the budget position.');
  if (series.length >= 3) {
    const cpis = series.slice(-3).map((x) => x.metrics.cpi);
    const spis = series.slice(-3).map((x) => x.metrics.spi);
    if (cpis[0] > cpis[1] && cpis[1] > cpis[2] || spis[0] > spis[1] && spis[1] > spis[2]) add('trend', 'warning', 'Deteriorating performance', 'CPI or SPI has declined for three consecutive periods.', { cpi: cpis, spi: spis }, 'Investigate the cause before the next reporting period.');
    if (cpis[0] < cpis[1] && cpis[1] < cpis[2] || spis[0] < spis[1] && spis[1] < spis[2]) add('recovery', 'positive', 'Recovering performance', 'CPI or SPI has improved for three consecutive periods.', { cpi: cpis, spi: spis }, 'Protect the recovery actions already in place.');
  }
  if (m.ev === project.bac) add('complete', 'positive', 'Project complete', `Final CPI is ${m.cpi?.toFixed(2) ?? 'N/A'} with a total variance of PKR ${m.vac?.toFixed(2) ?? 'N/A'}.`, { ev: m.ev }, 'Complete the close-out review.');
  const priority = { critical: 0, warning: 1, positive: 2, info: 3 };
  const sorted = insights.sort((a, b) => priority[a.severity] - priority[b.severity]);
  const summary = `As of ${current.date}, the project is ${(m.actualPercent * 100).toFixed(1)}% complete against ${(m.plannedPercent * 100).toFixed(1)}% planned, PKR ${Math.abs(m.cv).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.cv < 0 ? 'over budget' : 'under budget'} and PKR ${Math.abs(m.sv).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.sv < 0 ? 'behind schedule' : 'ahead of schedule'}.`;
  return { insights: sorted, summary };
}

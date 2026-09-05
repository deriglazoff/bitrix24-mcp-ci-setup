import fs from 'fs';

const dir = 'c:/repos/bitrix24-mcp-ci-setup/.tmp-audit';
const tasks = JSON.parse(fs.readFileSync(dir + '/created-all.json', 'utf8'));
const finalPath = dir + '/final-report.json';
const final = JSON.parse(fs.readFileSync(finalPath, 'utf8'));

function strip(s) {
  return String(s || '')
    .replace(/\[\/?\w[^\]]*\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «Результат» или эквивалент «Критерий/Критерии приемки» */
function hasResultSection(text) {
  const low = text.toLowerCase().replace(/ё/g, 'е');
  if (low.includes('результат')) return true;
  // критерий / критерии / критерия приемки|выполнения (кириллица не в \w)
  if (/критери(?:й|и|я)?\s*(?:приемк|выполнен)/.test(low)) return true;
  if (/acceptance\s*criteria/.test(low)) return true;
  if (/definition\s*of\s*done|\bdod\b/.test(low)) return true;
  return false;
}

function hasGoalSection(text) {
  const low = text.toLowerCase().replace(/ё/g, 'е');
  return low.includes('цель');
}

function validate(t) {
  const text = strip(t.description);
  const issues = [];
  if (!hasGoalSection(text)) issues.push('нет «Цель»');
  if (!hasResultSection(text)) issues.push('нет «Результат»');
  if (!t.deadline) issues.push('нет крайнего срока');
  return issues;
}

const violations = [];
const ok = [];
const cleared = [];
for (const t of tasks) {
  const issues = validate(t);
  const row = {
    id: t.id,
    title: t.title,
    deadline: t.deadline || null,
    createdDate: t.createdDate,
    responsible: t.responsible?.name || t.responsibleId,
    issues,
    descLen: strip(t.description).length,
  };
  if (issues.length) violations.push(row);
  else ok.push(row);
}

// Compare with previous violations to show who was cleared
const prev = new Set(
  (final.created?.violations || []).map((v) => String(v.id)),
);
const nowBad = new Set(violations.map((v) => String(v.id)));
for (const id of prev) {
  if (!nowBad.has(id)) {
    const t = tasks.find((x) => String(x.id) === id);
    cleared.push({
      id,
      title: t?.title,
      reason: 'засчитан «Критерий(и) приемки» как «Результат» (или перепроверка)',
    });
  }
}

const summary = {
  total: tasks.length,
  ok: ok.length,
  violations: violations.length,
  byIssue: {
    noGoal: violations.filter((v) => v.issues.includes('нет «Цель»')).length,
    noResult: violations.filter((v) => v.issues.includes('нет «Результат»')).length,
    noDeadline: violations.filter((v) => v.issues.includes('нет крайнего срока')).length,
  },
  clearedFromPrevious: cleared,
};

fs.writeFileSync(dir + '/created-violations.json', JSON.stringify(violations, null, 2));
fs.writeFileSync(dir + '/created-summary.json', JSON.stringify(summary, null, 2));

final.created = {
  total: summary.total,
  ok: summary.ok,
  violationsCount: summary.violations,
  byIssue: summary.byIssue,
  violations,
  note: '«Результат» засчитывается также при «Критерий/Критерии приемки|выполнения» (и acceptance criteria / DoD).',
};
fs.writeFileSync(finalPath, JSON.stringify(final, null, 2));

// Refresh REPORT.md created section briefly via rewrite of key stats
console.log(JSON.stringify({
  summary,
  cleared,
  sampleStillNoResult: violations
    .filter((v) => v.issues.includes('нет «Результат»'))
    .slice(0, 5)
    .map((v) => ({ id: v.id, title: v.title, issues: v.issues })),
}, null, 2));

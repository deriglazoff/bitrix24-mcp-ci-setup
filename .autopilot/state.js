window.STATE =
{
  "slug": "windows-exe-launcher",
  "title": "Файл запуска проекта .exe",
  "mode": "full",
  "depth": "normal",
  "polish": null,
  "tier": "T0",
  "briefFile": "2026-08-17-brief.md",
  "memoryFile": "AGENTS.md",
  "startedAt": "2026-08-17T10:17:19+03:00",
  "updatedAt": "2026-08-17T10:25:39+03:00",
  "finishedAt": null,
  "stages": [
    { "id": "preflight", "status": "done", "startedAt": "2026-08-17T10:17:19+03:00", "finishedAt": "2026-08-17T10:18:28+03:00" },
    { "id": "manifest",  "status": "done", "startedAt": "2026-08-17T10:18:28+03:00", "finishedAt": "2026-08-17T10:19:22+03:00" },
    { "id": "briefing",  "status": "skipped", "startedAt": "2026-08-17T10:19:22+03:00", "finishedAt": "2026-08-17T10:23:16+03:00", "note": "полный автомат — самобрифинг" },
    { "id": "spec",      "status": "done", "startedAt": "2026-08-17T10:23:16+03:00", "finishedAt": "2026-08-17T10:25:39+03:00" },
    { "id": "plan",      "status": "skipped", "startedAt": "2026-08-17T10:25:39+03:00", "finishedAt": "2026-08-17T10:25:39+03:00", "note": "ярус T0 — без разбивки на таски" },
    { "id": "build",     "status": "active", "startedAt": "2026-08-17T10:25:39+03:00" },
    { "id": "review",    "status": "pending" },
    { "id": "final",     "status": "pending" }
  ],
  "requirements": {
    "total": 6, "done": 0, "inTicket": 0, "inSpec": 6,
    "placeholder": 0, "deferred": 0, "dropped": 0
  },
  "tickets": [],
  "singlePass": {
    "startedAt": "2026-08-17T10:25:39+03:00",
    "finishedAt": null,
    "files": [],
    "tests": null,
    "commit": null
  },
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [
      "R01: двойной клик по .exe поднимает HTTP-шлюз и держит консоль",
      "R03: настоящий Windows PE .exe, сборка встроенным csc без новых npm-пакетов",
      "R04i: запускается node server-http.js, не stdio MCP",
      "R06i: файл называется Bitrix24-MCP.exe и лежит в корне репо"
    ],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "missing": 0,
    "halfCovered": 0,
    "extra": 24,
    "action": "лишнее — углубления R##.n и ASSUMPTION самобрифинга, уже с родителем; ничего не добавлял и не вырезал"
  },
  "blind": null
}

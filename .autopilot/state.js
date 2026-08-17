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
  "updatedAt": "2026-08-17T10:33:32+03:00",
  "finishedAt": "2026-08-17T10:33:32+03:00",
  "stages": [
    { "id": "preflight", "status": "done", "startedAt": "2026-08-17T10:17:19+03:00", "finishedAt": "2026-08-17T10:18:28+03:00" },
    { "id": "manifest",  "status": "done", "startedAt": "2026-08-17T10:18:28+03:00", "finishedAt": "2026-08-17T10:19:22+03:00" },
    { "id": "briefing",  "status": "skipped", "startedAt": "2026-08-17T10:19:22+03:00", "finishedAt": "2026-08-17T10:23:16+03:00", "note": "полный автомат — самобрифинг" },
    { "id": "spec",      "status": "done", "startedAt": "2026-08-17T10:23:16+03:00", "finishedAt": "2026-08-17T10:25:39+03:00" },
    { "id": "plan",      "status": "skipped", "startedAt": "2026-08-17T10:25:39+03:00", "finishedAt": "2026-08-17T10:25:39+03:00", "note": "ярус T0 — без разбивки на таски" },
    { "id": "build",     "status": "done", "startedAt": "2026-08-17T10:25:39+03:00", "finishedAt": "2026-08-17T10:28:45+03:00" },
    { "id": "review",    "status": "done", "startedAt": "2026-08-17T10:28:00+03:00", "finishedAt": "2026-08-17T10:28:45+03:00", "note": "T0 — три оси, чисто" },
    { "id": "final",     "status": "done", "startedAt": "2026-08-17T10:28:45+03:00", "finishedAt": "2026-08-17T10:33:32+03:00" }
  ],
  "requirements": {
    "total": 6, "done": 6, "inTicket": 0, "inSpec": 0,
    "placeholder": 0, "deferred": 0, "dropped": 0
  },
  "tickets": [],
  "singlePass": {
    "startedAt": "2026-08-17T10:25:39+03:00",
    "finishedAt": "2026-08-17T10:28:45+03:00",
    "files": ["Bitrix24-MCP.exe", "scripts/launcher/Program.cs", "scripts/build-launcher.ps1", "test/launcher.test.mjs", "README.md"],
    "tests": { "passed": 61, "failed": 0 },
    "commit": "b75f15a"
  },
  "tests": { "passed": 61, "failed": 0 },
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
  "blind": {
    "agreed": 1,
    "drift": 0,
    "notes": "бриф: файл запуска .exe — реализовано; запуск поднял HTTP-шлюз, GET /ping вернул pong"
  }
}

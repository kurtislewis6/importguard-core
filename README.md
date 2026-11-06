# importguard-core

Deterministic CSV import validation that runs where your code runs (browser or Node). No network calls, no telemetry, no install scripts, no dependencies.

- **Schema mapping**: map incoming headers to your columns with `aliases` (reported in `report.mapping`).
- **Strict dates**: `DD/MM/YYYY`, `MM/DD/YYYY` or `YYYY-MM-DD`, declared per column. No guessing, no rollover (31/04 is an error).
- **Types and rules**: string, integer, number, boolean, email, date; `required`, `unique` (duplicate flags), `enum`, `pattern`, `min`/`max`, `maxLength`.
- **CSV parsing**: quoted commas, embedded newlines, CRLF/CR/LF, BOM. Errors for unclosed quotes, stray quotes, text after a closing quote and row-width mismatches. Quoted empty records (`""`) are kept.
- **Encodings**: UTF-8 (with or without BOM), UTF-16LE/BE with BOM, Windows-1252 fallback with a warning. Size cap (`maxBytes`, default 5 MiB) counts bytes. Pass a `Uint8Array`/`Buffer` for byte-level checks.
- **Reports**: sorted, byte-stable JSON (`reportJSON`) and formula-safe CSV (`reportCSV`). Values are never coerced or modified.
- Tested against a 139-case malformed-file corpus.

```js
const IG = require("importguard-core");
const report = IG.validate(fileBytes, {
  name: "customers",
  columns: [
    { name: "email", type: "email", required: true, unique: true, aliases: ["Email Address"] },
    { name: "start_date", type: "date", format: "DD/MM/YYYY", required: true }
  ]
});
console.log(IG.reportJSON(report));
```

Do not use it for payment-card, bank-credential, payroll or health data.

## Known limitations

- No Unicode normalisation: `é` (U+00E9) and `e` + U+0301 are different values, so they are not flagged as duplicates. `unique` is exact and case-sensitive.
- UTF-16 without a BOM is rejected (`NUL_BYTE`), not decoded. No other encodings are detected; non-UTF-8 input is read as Windows-1252 with a warning.
- A single delimiter per schema (default comma); no auto-detection.
- Unquoted blank lines at the end of a file are ignored; blank lines mid-file are reported as row-width errors.
- Lookalike detection flags non-ASCII header characters only; it does not identify which script they come from.
- The whole file is held in memory (bounded by `maxBytes`/`maxRows`).
- This package processes data only where you run it. Your own application's data handling is outside its control.

Maintained with AI-assisted tooling.

Made by Autofold. MIT licensed (see LICENSE). Provided as is, without warranty.

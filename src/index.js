/* IG-CORE-START */
var IG = (function () {
  "use strict";
  var DEFAULT_MAX_BYTES = 5 * 1024 * 1024, DEFAULT_MAX_ROWS = 50000;

  var CP1252 = {128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376};
  function utf8(b, start) {
    var s = "", i = start, n = b.length;
    while (i < n) {
      var c = b[i], cp, need;
      if (c < 0x80) { s += String.fromCharCode(c); i++; continue; }
      if (c >= 0xC2 && c <= 0xDF) { cp = c & 0x1F; need = 1; }
      else if (c >= 0xE0 && c <= 0xEF) { cp = c & 0x0F; need = 2; }
      else if (c >= 0xF0 && c <= 0xF4) { cp = c & 0x07; need = 3; }
      else return null;
      if (i + need >= n) return null;
      for (var k = 1; k <= need; k++) { var x = b[i + k]; if (x === undefined || (x & 0xC0) !== 0x80) return null; cp = (cp << 6) | (x & 0x3F); }
      if ((need === 2 && (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF))) || (need === 3 && (cp < 0x10000 || cp > 0x10FFFF))) return null;
      s += String.fromCodePoint(cp); i += need + 1;
    }
    return s;
  }
  function utf16(b, start, le) {
    var s = "", i = start;
    if ((b.length - start) % 2) return null;
    for (; i < b.length; i += 2) s += String.fromCharCode(le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
    return s;
  }
  function decode(b) {
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { var u = utf8(b, 3); return u === null ? { text: null, encoding: "utf-8-bom", error: "Invalid UTF-8 after UTF-8 BOM" } : { text: u, encoding: "utf-8-bom", warnings: [] }; }
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) { var l = utf16(b, 2, true); return l === null ? { text: null, encoding: "utf-16le", error: "Odd byte count for UTF-16LE" } : { text: l, encoding: "utf-16le", warnings: [] }; }
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) { var g = utf16(b, 2, false); return g === null ? { text: null, encoding: "utf-16be", error: "Odd byte count for UTF-16BE" } : { text: g, encoding: "utf-16be", warnings: [] }; }
    var t = utf8(b, 0); if (t !== null) return { text: t, encoding: "utf-8", warnings: [] };
    var w = ""; for (var i = 0; i < b.length; i++) w += String.fromCharCode(CP1252[b[i]] || b[i]);
    return { text: w, encoding: "windows-1252", warnings: ["Not valid UTF-8; decoded as Windows-1252. Check accented characters before importing."] };
  }
  function utf8Len(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0x80) n++; else if (c < 0x800) n += 2; else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; } else n += 3; } return n; }
  var INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00A0]/;
  function parseCSV(text, delim) {
    delim = delim || ",";
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], blank = [], row = [], f = "", q = false, after = false, rq = false, i = 0, n = text.length, line = 1, errs = [];
    function endRow() { row.push(f); blank.push(row.length === 1 && row[0] === "" && !rq); rows.push(row); row = []; f = ""; after = false; rq = false; line++; }
    while (i < n) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; after = true; i++; continue; }
        if (c === "\n") line++;
        f += c; i++; continue;
      }
      if (c === delim) { row.push(f); f = ""; after = false; i++; continue; }
      if (c === "\r") { i++; if (text[i] === "\n") i++; endRow(); continue; }
      if (c === "\n") { i++; endRow(); continue; }
      if (after) { errs.push({ line: line, code: "CSV_TEXT_AFTER_QUOTE", message: "Text after a closing quote" }); after = false; }
      if (c === '"') {
        if (f.length === 0) { q = true; rq = true; i++; continue; }
        errs.push({ line: line, code: "CSV_STRAY_QUOTE", message: "Quote inside unquoted field" }); f += c; i++; continue;
      }
      f += c; i++;
    }
    if (q) errs.push({ line: line, code: "CSV_UNCLOSED_QUOTE", message: "File ends inside a quoted field" });
    if (f.length || row.length || rq) { row.push(f); blank.push(row.length === 1 && row[0] === "" && !rq); rows.push(row); }
    return { rows: rows, blank: blank, errors: errs };
  }
  var DATE_RE = {
    "DD/MM/YYYY": [/^(\d{2})\/(\d{2})\/(\d{4})$/, 1, 2, 3],
    "MM/DD/YYYY": [/^(\d{2})\/(\d{2})\/(\d{4})$/, 2, 1, 3],
    "YYYY-MM-DD": [/^(\d{4})-(\d{2})-(\d{2})$/, 3, 2, 1]
  };
  function checkDate(v, fmt) {
    var d = DATE_RE[fmt]; if (!d) return "Unsupported date format in schema: " + fmt;
    var m = d[0].exec(v); if (!m) return "Not a " + fmt + " date (no guessing applied)";
    var day = +m[d[1]], mon = +m[d[2]], yr = +m[d[3]];
    if (mon < 1 || mon > 12) return "Month out of range for " + fmt;
    var dim = [31, (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mon - 1];
    if (day < 1 || day > dim) return "Day out of range for " + fmt;
    return null;
  }
  function checkType(v, col) {
    switch (col.type) {
      case "string": return null;
      case "integer": return /^-?\d+$/.test(v) ? null : "Not an integer";
      case "number": return /^-?\d+(\.\d+)?$/.test(v) ? null : "Not a plain number (no commas/currency/exponent)";
      case "boolean": return /^(true|false)$/.test(v) ? null : "Not true/false";
      case "email": return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v) ? null : "Not an email address";
      case "date": return checkDate(v, col.format || "YYYY-MM-DD");
      default: return "Unknown type in schema: " + col.type;
    }
  }
  function validateSchema(s) {
    var e = [];
    if (!s || typeof s !== "object" || !Array.isArray(s.columns) || !s.columns.length) return ["Schema needs a non-empty 'columns' array"];
    var seen = {};
    s.columns.forEach(function (c, i) {
      if (!c || typeof c.name !== "string" || !c.name) e.push("Column " + (i + 1) + " needs a name");
      else if (seen[c.name]) e.push("Duplicate schema column: " + c.name); else seen[c.name] = 1;
      if (["string", "integer", "number", "boolean", "email", "date"].indexOf(c.type) < 0) e.push("Column " + c.name + ": bad type " + c.type);
      if (c.pattern) { try { new RegExp(c.pattern); } catch (x) { e.push("Column " + c.name + ": bad pattern"); } }
    });
    return e;
  }
  function validate(input, schema) {
    var out = { tool: "ImportGuard demo", version: "0.1.0", schema: schema && schema.name || "", encoding: "", bytes: 0, warnings: [], summary: {}, errors: [] };
    function add(r, c, code, msg) { out.errors.push({ row: r, column: c, code: code, message: msg }); }
    var se = validateSchema(schema);
    if (se.length) { se.forEach(function (m) { add(0, "", "SCHEMA_INVALID", m); }); return finish(out, 0); }
    var maxB = schema.maxBytes || DEFAULT_MAX_BYTES, maxR = schema.maxRows || DEFAULT_MAX_ROWS;
    var csvText;
    if (typeof input === "string") { out.encoding = "string"; out.bytes = utf8Len(input); csvText = input; }
    else { out.bytes = input.length; }
    if (out.bytes > maxB) { add(0, "", "FILE_TOO_LARGE", "File exceeds " + maxB + " bytes"); return finish(out, 0); }
    if (typeof input !== "string") {
      var d = decode(input); out.encoding = d.encoding;
      if (d.text === null) { add(0, "", "ENCODING_INVALID", d.error); return finish(out, 0); }
      out.warnings = d.warnings; csvText = d.text;
    }
    if (csvText.indexOf("\u0000") >= 0) { add(0, "", "NUL_BYTE", "File contains NUL characters (binary or wrong encoding)"); return finish(out, 0); }
    var p = parseCSV(csvText, schema.delimiter);
    p.errors.forEach(function (x) { add(0, "", x.code, x.message + " (physical line " + x.line + ")"); });
    var rows = p.rows;
    var blank = p.blank;
    while (rows.length && blank[rows.length - 1]) rows.pop();
    if (!rows.length) { add(0, "", "EMPTY_FILE", "No header row"); return finish(out, 0); }
    var alias = {};
    schema.columns.forEach(function (c) { (c.aliases || []).forEach(function (a) { alias[a.trim().toLowerCase()] = c.name; }); });
    var mapping = [];
    var header = rows[0].map(function (h) { var t = h.trim(), m = alias[t.toLowerCase()]; if (m && m !== t) { mapping.push({ from: t, to: m }); return m; } return t; }), idx = {};
    out.mapping = mapping;
    header.forEach(function (h, i) {
      if (h === "") add(1, "#" + (i + 1), "HEADER_EMPTY", "Blank header name");
      if (/[^\x20-\x7E]/.test(h)) add(1, h, "HEADER_NONASCII", "Header has non-ASCII/lookalike or invisible characters");
      if (idx[h] !== undefined) add(1, h, "HEADER_DUPLICATE", "Header appears more than once");
      else idx[h] = i;
    });
    schema.columns.forEach(function (c) { if (idx[c.name] === undefined) add(1, c.name, "HEADER_MISSING", "Required column missing from header"); });
    if (schema.allowExtraColumns !== true) header.forEach(function (h) {
      if (!schema.columns.some(function (c) { return c.name === h; })) add(1, h, "HEADER_UNKNOWN", "Column not in schema");
    });
    var data = rows.slice(1);
    if (data.length > maxR) { add(0, "", "TOO_MANY_ROWS", "More than " + maxR + " data rows"); data = data.slice(0, maxR); }
    var uniq = {};
    data.forEach(function (r, k) {
      var rn = k + 2;
      if (r.length !== header.length) add(rn, "", "ROW_WIDTH", "Expected " + header.length + " fields, found " + r.length);
      schema.columns.forEach(function (c) {
        var i = idx[c.name]; if (i === undefined) return;
        var v = r[i] === undefined ? "" : r[i];
        if (v !== v.trim()) add(rn, c.name, "WHITESPACE", "Leading/trailing whitespace (not trimmed)");
        if (INVISIBLE.test(v)) add(rn, c.name, "INVISIBLE_CHAR", "Contains zero-width/non-breaking space or BOM character");
        if (v === "") { if (c.required) add(rn, c.name, "REQUIRED", "Value is required"); return; }
        if (/^[=+\-@\t\r]/.test(v) && c.type === "string") add(rn, c.name, "FORMULA_RISK", "Starts with a spreadsheet formula character");
        var te = checkType(v, c); if (te) add(rn, c.name, "TYPE_" + c.type.toUpperCase(), te);
        if (!te && (c.type === "integer" || c.type === "number")) {
          if (c.min !== undefined && +v < c.min) add(rn, c.name, "MIN", "Below minimum " + c.min);
          if (c.max !== undefined && +v > c.max) add(rn, c.name, "MAX", "Above maximum " + c.max);
        }
        if (c.maxLength && v.length > c.maxLength) add(rn, c.name, "MAX_LENGTH", "Longer than " + c.maxLength);
        if (c.enum && c.enum.indexOf(v) < 0) add(rn, c.name, "ENUM", "Not one of: " + c.enum.join("|"));
        if (c.pattern && !new RegExp(c.pattern).test(v)) add(rn, c.name, "PATTERN", "Does not match " + c.pattern);
        if (c.unique) {
          var key = c.name + "\u0000" + v; uniq[key] = uniq[key] || [];
          if (uniq[key].length) add(rn, c.name, "DUPLICATE", "Duplicate of row " + uniq[key][0]);
          uniq[key].push(rn);
        }
      });
    });
    return finish(out, data.length);
  }
  function finish(out, n) {
    out.errors.sort(function (a, b) { return a.row - b.row || (a.column < b.column ? -1 : a.column > b.column ? 1 : 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0); });
    var bad = {}; out.errors.forEach(function (e) { if (e.row > 1) bad[e.row] = 1; });
    out.summary = { dataRows: n, errorCount: out.errors.length, rowsWithErrors: Object.keys(bad).length, pass: out.errors.length === 0 };
    return out;
  }
  function cell(v) { v = String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function reportCSV(rep) {
    return ["row,column,code,message"].concat(rep.errors.map(function (e) { return [e.row, e.column, e.code, e.message].map(cell).join(","); })).join("\r\n") + "\r\n";
  }
  function reportJSON(rep) { return JSON.stringify(rep, null, 2) + "\n"; }
  return { decode: decode, utf8Len: utf8Len, parseCSV: parseCSV, validate: validate, reportCSV: reportCSV, reportJSON: reportJSON };
})();
if (typeof module !== "undefined") module.exports = IG;
/* IG-CORE-END */

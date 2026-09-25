/* Oak Joinery — Stock In helpers (pure functions, no Firebase/DOM).
 * Turns pasted text, Excel rows, PDF text and OCR text into lines
 * {code, desc, size, job, material, notes, qty, qtyL, text}, and matches
 * each line to an item in Board Stock, Consumables or Stock List.
 * Loaded by stock-in/index.html; also require()-able in node for tests. */
(function (global) {
  "use strict";

  // ---------- text helpers ----------
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/[×]/g, "x")
      .replace(/(\d)\s*x\s*(\d)/g, "$1x$2")
      .replace(/(\d),(\d{3})\b/g, "$1$2")
      .replace(/[^a-z0-9.x]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  var SYN = {
    supawood: "mdf", mdf: "mdf", "m.d.f": "mdf",
    chipboard: "chip", particleboard: "chip", pb: "chip", chip: "chip",
    melamine: "mel", mel: "mel", mfc: "mel", mf: "mel",
    wht: "white", wh: "white", blk: "black",
    ply: "plywood", plywood: "plywood",
    pr: "pair", prs: "pair", pairs: "pair",
    pk: "pack", pkt: "pack", pkts: "pack", packs: "pack",
    ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
    screws: "screw", hinges: "hinge", runners: "runner", handles: "handle"
  };
  // Board sheet sizes in mm → the ft names used in Board Stock ("9x6").
  var SHEET = { "2750x1830": "9x6", "2745x1830": "9x6", "2800x1830": "9x6", "2440x1220": "8x4", "2440x1830": "8x6", "3660x1830": "12x6", "3050x1830": "10x6", "1830x2750": "9x6", "1830x3660": "12x6" };
  function tokens(s) {
    var out = [];
    norm(s).split(" ").forEach(function (t) {
      if (!t) return;
      if (SHEET[t]) { out.push(SHEET[t]); return; }
      var m = t.match(/^(\d+(?:\.\d+)?)(mm|m|l|ml|kg|g|x)$/);
      if (m) { out.push(m[1]); if (m[2] !== "x") out.push(m[2]); return; }
      if (SYN[t]) { out.push(SYN[t]); return; }
      out.push(t);
    });
    return out;
  }
  function isNum(t) { return /^\d+(\.\d+)?$/.test(t); }

  var STOP = /\b(total|sub ?total|vat|tax|invoice|tel|fax|page|bank|account|acc no|branch|email|e-mail|www|http|reg no|registration|balance|amount due|terms|signature|signed|received by|driver|deliver to|delivery address|order no|date|customer|vat no|thank you|delivery note|credit note|quotation|quote no|purchase order|po no|p\/o)\b/i;

  // Header words → field
  var HEAD = {
    code: ["code", "item code", "product code", "stock code", "sku", "part no", "part number", "item no", "article", "ref", "board code"],
    desc: ["description", "item", "product", "desc", "item description", "product description", "details", "name", "board"],
    qty: ["qty", "quantity", "qty delivered", "qty supplied", "delivered", "supplied", "qty shipped", "units", "qty r", "qty right", "count", "qty ordered"],
    qtyL: ["qty l", "qty left", "left"],
    size: ["size", "dimensions", "dimension"],
    job: ["job", "category", "cat", "category / job"],
    material: ["material"],
    notes: ["notes", "note", "comment", "comments"]
  };
  function headField(h) {
    var n = String(h || "").trim().toLowerCase().replace(/[:.]/g, "").replace(/\s+/g, " ");
    for (var f in HEAD) if (HEAD[f].indexOf(n) >= 0) return f;
    return null;
  }

  function toQty(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
    var m = s.match(/^-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // ---------- table rows (Excel / pasted tab-separated) ----------
  // rows: array of arrays. Returns lines, or null if no header row found.
  function linesFromTable(rows) {
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? "" : c).trim() !== ""; }); });
    var hi = -1, map = null;
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var m = {}, hits = 0;
      rows[i].forEach(function (c, j) { var f = headField(c); if (f && m[f] === undefined) { m[f] = j; hits++; } });
      if (hits >= 2 && (m.qty !== undefined) && (m.desc !== undefined || m.code !== undefined)) { hi = i; map = m; break; }
    }
    if (hi < 0) return null;
    var out = [];
    rows.slice(hi + 1).forEach(function (r) {
      var get = function (f) { return map[f] === undefined ? "" : String(r[map[f]] == null ? "" : r[map[f]]).trim(); };
      var line = { code: get("code"), desc: get("desc"), size: get("size"), job: get("job"), material: get("material"), notes: get("notes"),
        qty: toQty(map.qty === undefined ? null : r[map.qty]), qtyL: map.qtyL === undefined ? null : toQty(r[map.qtyL]) };
      if (!line.code && !line.desc) return;
      if (STOP.test(line.desc) && !line.code) return;
      line.text = [line.code, line.desc, line.size].filter(Boolean).join("  ");
      out.push(line);
    });
    return out;
  }

  // ---------- free text lines (PDF text / OCR / pasted text) ----------
  function parseTextLine(raw) {
    var text = String(raw || "").replace(/\t/g, "  ").replace(/[|]/g, " ").trim();
    if (!text || text.length < 3) return null;
    if (!/[a-z]/i.test(text) || !/\d/.test(text)) return null;
    if (STOP.test(text)) return null;
    var toks = text.split(/\s+/);
    var info = toks.map(function (t, i) {
      var clean = t.replace(/^[^\w]+|[^\w.,]+$/g, "");
      var plainInt = /^\d{1,5}([.,]00?)?$/.test(clean);
      var price = /^\d{1,3}([ ,]\d{3})*[.,]\d{2}$/.test(clean) && !/[.,]00?$/.test(clean);
      var money = /^R\d/i.test(t) || /%$/.test(t);
      var code = /[a-z]/i.test(clean) && /\d/.test(clean) && clean.length >= 3 && clean.length <= 20 && !/^\d+(mm|m|l|ml|kg|g)$/i.test(clean) && !/^\d+x\d+/i.test(clean);
      return { t: t, clean: clean, i: i, plainInt: plainInt && !money, strictInt: /^\d{1,5}$/.test(clean) && !money, price: price || money, code: code, alpha: /^[a-z][a-z&'/-]*$/i.test(clean) };
    });
    var qtyIdx = -1;
    // "... x 8" or "qty 8" at the end of the line
    var L = info.length;
    if (L > 2 && info[L - 1].plainInt && /^(x|qty|qty:)$/i.test(info[L - 2].clean || info[L - 2].t)) qtyIdx = L - 1;
    // Delivery-note style: "10  CH16  16mm chipboard" — leading number.
    if (qtyIdx < 0 && info.length > 1 && info[0].plainInt && !info[1].plainInt) qtyIdx = 0;
    if (qtyIdx < 0) {
      // Invoice style: CODE DESCRIPTION QTY PRICE ... TOTAL — first plain
      // integer after some description words, preferring one followed by a price.
      var UNITW = /^(ea|each|pcs|pc|no|nos|units?|sheets?|pr|prs|pairs?|box|boxes|pk|pkt|packs?|rolls?|m|l|ltr|kg|lengths?|bags?)$/i;
      var seenWord = false, firstAfter = -1, withPrice = -1, looseFirst = -1;
      for (var k = 0; k < info.length; k++) {
        if (info[k].alpha) seenWord = true;
        if (seenWord && info[k].plainInt && !info[k].strictInt) { if (looseFirst < 0) looseFirst = k; continue; }
        if (seenWord && info[k].strictInt) {
          var prev = info[k - 1] && info[k - 1].clean.toLowerCase();
          var next = info[k + 1] && info[k + 1].clean.toLowerCase();
          if (next && /^(mm|m|x|ml|l|kg|g|mic|micron)$/.test(next)) continue; // "16 mm"
          if (prev === "x" || (next === "x")) continue;
          if (firstAfter < 0) firstAfter = k;
          var j = k + 1; while (info[j] && UNITW.test(info[j].clean)) j++;
          var nx = info[j];
          if (withPrice < 0 && nx && (nx.price || /^R?\d[\d ,]*[.,]\d{2}$/i.test(nx.clean))) withPrice = k;
        }
      }
      qtyIdx = withPrice >= 0 ? withPrice : (firstAfter >= 0 ? firstAfter : looseFirst);
    }
    if (qtyIdx < 0) return null;
    var qty = toQty(info[qtyIdx].clean);
    if (!qty || qty <= 0 || qty > 100000) return null;
    var codeTok = info.find(function (x) { return x.i !== qtyIdx && x.code && x.i < (qtyIdx === 0 ? 3 : qtyIdx); });
    var descEnd = qtyIdx === 0 ? info.length : qtyIdx;
    var desc = info.filter(function (x) { return x.i < descEnd && !(qtyIdx === L - 1 && x.i === L - 2 && /^(x|qty:?)$/i.test(x.t)) && x.i !== qtyIdx && (!codeTok || x.i !== codeTok.i) && !x.price; })
      .map(function (x) { return x.t; }).join(" ").replace(/\s+/g, " ").trim();
    // Drop trailing unit words ("EA", "each") from the description
    desc = desc.replace(/\s+(ea|each|pcs|pc|no|unit|units|sheets?)$/i, "");
    if (!desc && !codeTok) return null;
    return { code: codeTok ? codeTok.clean : "", desc: desc, size: "", job: "", material: "", notes: "", qty: qty, qtyL: null, text: text.replace(/\s{2,}/g, "  ") };
  }

  function linesFromText(text) {
    var rows = String(text || "").split(/\r?\n/);
    // Tab-separated paste with a header row → treat as a table.
    if (rows.some(function (r) { return r.indexOf("\t") >= 0; })) {
      var t = linesFromTable(rows.map(function (r) { return r.split("\t"); }));
      if (t && t.length) return t;
    }
    return rows.map(parseTextLine).filter(Boolean);
  }

  // PDF.js text items → text lines (grouped by y, gaps kept as double spaces).
  function pdfItemsToText(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var x = it.transform[4], y = it.transform[5];
      var row = rows.find(function (r) { return Math.abs(r.y - y) < 3; });
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, w: it.width || 0, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = "", end = null;
      r.parts.forEach(function (p) {
        if (end !== null) out += (p.x - end > 8 ? "  " : (p.x - end > 1 ? " " : ""));
        out += p.s; end = p.x + p.w;
      });
      return out;
    }).join("\n");
  }

  // ---------- matching ----------
  // items: [{id, label, code, text, job, desc, size}]
  function aliasKey(line) {
    var k = norm(line.code) || norm(line.desc + " " + (line.size || ""));
    return k.replace(/[.#$\[\]\/]/g, "_").slice(0, 120);
  }
  function score(lineToks, itemToks) {
    if (!lineToks.length || !itemToks.length) return 0;
    var lw = lineToks.filter(function (t) { return !isNum(t); }), iw = itemToks.filter(function (t) { return !isNum(t); });
    var ln = lineToks.filter(isNum), inum = itemToks.filter(isNum);
    var inter = iw.filter(function (t) { return lw.indexOf(t) >= 0; }).length;
    var wordScore = iw.length ? inter / iw.length : 0;
    var extra = lw.length ? inter / lw.length : 0;
    if (!inum.length) return wordScore * 0.8 + extra * 0.2; // no numbers to compare on
    var numScore = 1;
    if (inum.length) {
      var hit = inum.filter(function (n) { return ln.indexOf(n) >= 0; }).length;
      numScore = hit / inum.length;
      if (hit === 0) return wordScore * 0.25; // 16mm vs 22mm: different item
    }
    return wordScore * 0.55 + extra * 0.15 + numScore * 0.30;
  }
  // Returns {itemId, how: 'alias'|'code'|'exact'|'fuzzy'|null, score}
  function matchLine(line, items, aliases) {
    aliases = aliases || {};
    var ak = aliasKey(line);
    if (ak && aliases[ak] && items.some(function (i) { return i.id === aliases[ak].itemId; })) return { itemId: aliases[ak].itemId, how: "alias", score: 1 };
    var nc = norm(line.code);
    if (nc) {
      var byCode = items.find(function (i) { return i.code && norm(i.code) === nc; });
      if (byCode) return { itemId: byCode.id, how: "code", score: 1 };
    }
    // Stock List: same job + item + size
    if (line.desc) {
      var nd = norm(line.desc), ns = norm(line.size), nj = norm(line.job);
      var exact = items.find(function (i) { return i.desc !== undefined && norm(i.desc) === nd && norm(i.size) === ns && (!nj || norm(i.job) === nj); });
      if (exact) return { itemId: exact.id, how: "exact", score: 1 };
    }
    var lt = tokens([line.code, line.desc, line.size].join(" "));
    var best = null, bestS = 0, second = 0;
    items.forEach(function (i) {
      var s = score(lt, i._toks || (i._toks = tokens(i.text)));
      if (s > bestS) { second = bestS; bestS = s; best = i; } else if (s > second) second = s;
    });
    if (best && bestS >= 0.5 && bestS - second > 0.02) return { itemId: best.id, how: "fuzzy", score: bestS };
    return { itemId: null, how: null, score: bestS };
  }

  var api = { norm: norm, tokens: tokens, toQty: toQty, linesFromTable: linesFromTable, parseTextLine: parseTextLine,
    linesFromText: linesFromText, pdfItemsToText: pdfItemsToText, matchLine: matchLine, aliasKey: aliasKey, score: score };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.StockInLib = api;
})(typeof window !== "undefined" ? window : this);

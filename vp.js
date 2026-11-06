/* ════════════════════════════════════════════════════════════════
   VP DASHBOARD  —  OS · TA · Visit
   Self-contained module for the "VP" menu option in index.html.
   • Reads the two published-CSV tabs of the leads spreadsheet
       tlos   → branch-wise OS (count + amount), CE name, paid TA, month-wise
       Sheet1 → field lead / visit / call entries
   • Injects its own CSS (all rules are scoped under #tab-vp) and keeps every
     variable private, so nothing in the existing page is touched.
   • Password is checked in the browser, same as the SBL tab. Change VP_PASS below.
════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ───────── CONFIG (edit here) ───────── */
var VP_PASS   = 'vp123';
var TLOS_CSV  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVsWPB-TdY99_DunQrRe4HLDWMsPLFYvbY4n_ZBjbm40TYQXoeln7O-o3o9RcmZAnkP-D3NAl0nA7Y/pub?gid=485030439&single=true&output=csv';
var SHEET1_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVsWPB-TdY99_DunQrRe4HLDWMsPLFYvbY4n_ZBjbm40TYQXoeln7O-o3o9RcmZAnkP-D3NAl0nA7Y/pub?gid=0&single=true&output=csv';

/* Official branch names (same list as the backend). Anything spelled slightly
   differently in a sheet is mapped onto these automatically. */
var CANON = ['KUNNAMKULAM','PARAVOOR','HARIPPAD','KATTAPPANA','MATTANCHERY','PATHANAMTHITTA','KOTTAYAM',
  'ALATHUR','ANGAMALY','CHENGANNOOR','EDAPPALLY','KODUVAYOOR','MAVELIKKARA','MUVATTUPUZHA','NEDUMKANDOM',
  'NENMARA','THIRUVILAMALAI','KUZHALMANNAM','THIRUVALLA','THODUPUZHA','PERUMBAVOOR'];
/* Manual spelling fixes (letters only, upper-case). Add a line if a new variant appears.
   e.g. if PALLURUTHY is really MATTANCHERY, add  'PALLURUTHY':'MATTANCHERY'  */
var BRANCH_ALIAS = { 'CHENGANNUR':'CHENGANNOOR','HARIPAD':'HARIPPAD','KODUVAYUR':'KODUVAYOOR',
  'MAVELIKARA':'MAVELIKKARA','THIRUVILWAMALA':'THIRUVILAMALAI','NEDUKANDAM':'NEDUMKANDOM' };

/* ───────── tiny helpers ───────── */
var MON = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
var MONN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DAYN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function p2(n){ return (n < 10 ? '0' : '') + n; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function $(id){ return document.getElementById(id); }
function sum(a, f){ var t = 0; for (var i = 0; i < a.length; i++) t += f ? f(a[i]) : a[i]; return t; }
function uniq(a){ var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }
function titleCase(s){                          /* 'ROHITH NR' → 'Rohith NR' (1–2 letter tokens are initials) */
  return String(s).toLowerCase().replace(/[a-z]+/g, function (w) { return w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1); });
}

/* day numbers (days since 1970-01-01, timezone-proof) */
function dayNum(y, m, d){ return Math.floor(Date.UTC(y, m - 1, d) / 864e5); }
function dayParts(n){ var d = new Date(n * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() }; }
function dayIso(n){ var p = dayParts(n); return p.y + '-' + p2(p.m) + '-' + p2(p.d); }
function dayDMY(n){ var p = dayParts(n); return p2(p.d) + ' ' + MONN[p.m - 1] + ' ' + p.y; }
function dayShort(n){ var p = dayParts(n); return p2(p.d) + ' ' + MONN[p.m - 1]; }
function isoToDay(s){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? dayNum(+m[1], +m[2], +m[3]) : NaN; }
function todayNum(){ var d = new Date(); return dayNum(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function monthStart(y, m){ return dayNum(y, m, 1); }
function monthEnd(y, m){ return dayNum(y, m + 1, 1) - 1; }
function monthLabel(y, m){ return MONN[m - 1] + '-' + String(y).slice(2); }

/* number parsing / formatting (Indian style) */
function num(s){
  if (s == null) return null;
  s = String(s).replace(/[₹,\s]/g, '');
  if (s === '' || s === '-' || s === '--') return null;
  var neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '');
  var v = parseFloat(s);
  return isNaN(v) ? null : (neg ? -v : v);
}
function nfmt(v){ return (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('en-IN'); }
function inr(v){                       /* ₹ 4.52 Cr / ₹ 45.07 L / ₹ 12,345 */
  if (v == null || isNaN(v)) return '—';
  var a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e7) return s + '₹ ' + (a / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return s + '₹ ' + (a / 1e5).toFixed(2) + ' L';
  return s + '₹ ' + Math.round(a).toLocaleString('en-IN');
}
function lakh(v){ return (v == null || isNaN(v)) ? '—' : (v / 1e5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function growth(cur, prev){ return (prev == null || prev <= 0 || cur == null) ? null : (cur - prev) / prev * 100; }
function chip(p, opt){
  opt = opt || {};
  if (p == null || isNaN(p)) return opt.isNew ? '<span class="vp-chip vp-new">NEW</span>' : '<span class="vp-chip vp-na">—</span>';
  var up = p > 0.05, dn = p < -0.05, inv = opt.invert;       /* invert: increase is bad */
  var cls = (up ? (inv ? 'vp-dn' : 'vp-up') : dn ? (inv ? 'vp-up' : 'vp-dn') : 'vp-flat');
  return '<span class="vp-chip ' + cls + '">' + (up ? '▲' : dn ? '▼' : '■') + ' ' + Math.abs(p).toFixed(1) + '%</span>';
}

/* ───────── CSV ───────── */
function parseCSV(t){
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  var rows = [], row = [], f = '', q = false, i = 0, n = t.length, c;
  while (i < n) {
    c = t.charAt(i);
    if (q) {
      if (c === '"') { if (t.charAt(i + 1) === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function fetchCSV(url){
  var u = url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now();
  return fetch(u, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function (t) {
    if (/^\s*<(!doctype|html)/i.test(t)) throw new Error('Sheet is not published as CSV (got a web page)');
    return parseCSV(t);
  });
}

/* ───────── date parsing ───────── */
function detectDateOrder(samples){               /* 'dmy' (default) or 'mdy' */
  var dm = 0, md = 0, m;
  for (var i = 0; i < samples.length; i++) {
    m = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(samples[i] || '');
    if (!m) continue;
    if (+m[1] > 12) dm++; else if (+m[2] > 12) md++;
  }
  return md > dm ? 'mdy' : 'dmy';
}
function parseDay(s, order){
  s = String(s == null ? '' : s).trim();
  if (!s) return NaN;
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return dayNum(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s);
  if (m) {
    var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    var d = order === 'mdy' ? b : a, mo = order === 'mdy' ? a : b;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
    return dayNum(y, mo, d);
  }
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3,})[a-z]*[\s\-,]+(\d{2,4})/.exec(s);        /* 1 Apr 2026 */
  if (m) { var mi = MON.indexOf(m[2].slice(0, 3).toLowerCase()); if (mi > -1) { var yy = +m[3]; if (yy < 100) yy += 2000; return dayNum(yy, mi + 1, +m[1]); } }
  m = /^([A-Za-z]{3,})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/.exec(s);                /* Apr 1, 2026 */
  if (m) { var mj = MON.indexOf(m[1].slice(0, 3).toLowerCase()); if (mj > -1) return dayNum(+m[3], mj + 1, +m[2]); }
  return NaN;
}
function parseMonthLabel(s, order){                                              /* → {y,m} | null */
  s = String(s == null ? '' : s).trim();
  if (!s) return null;
  var m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i.exec(s);
  if (m) {
    var mi = MON.indexOf(m[1].toLowerCase()) + 1, ys = s.match(/\d{4}/), y;
    if (ys) y = +ys[0]; else { var t = s.match(/(\d{2})(?!.*\d)/); if (t) y = 2000 + +t[1]; }
    return y ? { y: y, m: mi } : null;
  }
  m = /^(\d{4})-(\d{1,2})/.exec(s); if (m) return { y: +m[1], m: +m[2] };
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (m) {                                         /* header cells are always the 1st of a month */
    var a = +m[1], b = +m[2], yr = +m[3]; if (yr < 100) yr += 2000;
    var mo = (a === 1 && b !== 1) ? b : (b === 1 && a !== 1) ? a : (order === 'mdy' ? a : b);
    return (mo >= 1 && mo <= 12) ? { y: yr, m: mo } : null;
  }
  m = /^(\d{1,2})[\/\-](\d{4})$/.exec(s); if (m) return { y: +m[2], m: +m[1] };
  return null;
}

/* ───────── branch / staff / mobile normalisers ───────── */
function osa(a, b){                                /* Damerau–Levenshtein (optimal string alignment) */
  var la = a.length, lb = b.length, d = [], i, j, c;
  for (i = 0; i <= la; i++) { d[i] = [i]; }
  for (j = 1; j <= lb; j++) d[0][j] = j;
  for (i = 1; i <= la; i++) for (j = 1; j <= lb; j++) {
    c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[la][lb];
}
var BR_KEY = {}, BR_CACHE = {}, EXTRA_BRANCHES = {};
CANON.forEach(function (b) { BR_KEY[b.replace(/[^A-Z]/g, '')] = b; });
Object.keys(BRANCH_ALIAS).forEach(function (k) { BR_KEY[k.replace(/[^A-Z]/g, '')] = BRANCH_ALIAS[k]; });
function canonBranch(s){
  var raw = String(s == null ? '' : s), k = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return '';
  if (BR_CACHE[k] !== undefined) return BR_CACHE[k];
  var out = BR_KEY[k];
  if (!out && k.length >= 6) {
    var best = 99, cand = [];
    CANON.forEach(function (c) { var d = osa(k, c.replace(/[^A-Z]/g, '')); if (d < best) { best = d; cand = [c]; } else if (d === best) cand.push(c); });
    if (best <= 2 && cand.length === 1) out = cand[0];
  }
  if (!out) { out = raw.toUpperCase().trim().replace(/\s+/g, ' '); EXTRA_BRANCHES[out] = 1; }
  BR_CACHE[k] = out; return out;
}
function allBranchNames(){ return uniq(CANON.concat(Object.keys(EXTRA_BRANCHES))).sort(); }

function nameKey(s){ return String(s || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function squash(s){ return String(s || '').toUpperCase().replace(/[^A-Z]/g, ''); }

/* Valid Indian mobile, not a dummy like 1234567890 / 9400000000 / 0000000000 */
function cleanMobile(s){
  var d = String(s == null ? '' : s).replace(/\D/g, '');
  if (d.length > 10) d = d.slice(-10);
  if (d.length !== 10) return { n: d, ok: false };
  if (!/^[6-9]/.test(d)) return { n: d, ok: false };
  var cnt = {}, mx = 0; for (var i = 0; i < 10; i++) { cnt[d[i]] = (cnt[d[i]] || 0) + 1; if (cnt[d[i]] > mx) mx = cnt[d[i]]; }
  if (mx >= 7) return { n: d, ok: false };
  if (/^(0123456789|1234567890|9876543210|987654321)/.test(d) || d === '9876543210') return { n: d, ok: false };
  return { n: d, ok: true };
}

/* ───────── csv download ───────── */
function downloadCSV(name, rows){
  var csv = rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ════════════════════════════════════════
   LOADER 1 — tlos  (OS + TA, month blocks)
   Row 1 : month labels (merged cells)   Row 2 : OS NO | OS AMOUNT | CE NAME | PAID TA  (repeats per month)
════════════════════════════════════════ */
function splitCE(s){
  s = String(s == null ? '' : s).trim();
  if (!s || /^(0|-|na|n\/a|nil|none|no)$/i.test(s)) return [];
  return s.split(/\s*(?:&|,|\/|\+|\band\b)\s*/i).map(function (x) { return x.trim(); })
    .filter(function (x) { return x && !/^(0|-|na)$/i.test(x); });
}
function buildTlos(rows){
  var hi = -1, r, c;
  for (r = 0; r < Math.min(rows.length, 8); r++) {
    if (rows[r].some(function (x) { return /^\s*os\s*no/i.test(x); })) { hi = r; break; }
  }
  if (hi < 0) throw new Error('tlos tab: could not find the "OS NO / OS AMOUNT" header row');
  var hdr = rows[hi], lab = hi > 0 ? rows[hi - 1] : [], bc = 0;
  hdr.forEach(function (x, i) { if (/^\s*branch/i.test(x)) bc = i; });
  var starts = []; hdr.forEach(function (x, i) { if (/^\s*os\s*no/i.test(x)) starts.push(i); });

  var order = detectDateOrder(lab), blocks = [];
  starts.forEach(function (st, bi) {
    var lo = bi ? starts[bi - 1] : -1, label = '';
    for (var j = st; j > lo; j--) { if (String(lab[j] || '').trim()) { label = lab[j]; break; } }
    var cols = { n: st, amt: st + 1, ce: st + 2, ta: st + 3 };
    for (var k = st; k < Math.min(hdr.length, st + 5); k++) {
      var h = String(hdr[k] || '');
      if (/os\s*amount|amount/i.test(h)) cols.amt = k; else if (/ce\s*name|^name/i.test(h)) cols.ce = k; else if (/paid\s*ta|^ta$/i.test(h)) cols.ta = k;
    }
    blocks.push({ ym: parseMonthLabel(label, order), cols: cols });
  });
  /* make months complete + strictly increasing (fall back to "next month" when a label is unreadable) */
  var ok = true, i;
  for (i = 0; i < blocks.length; i++) {
    if (!blocks[i].ym) { var pv = blocks[i - 1] && blocks[i - 1].ym; if (pv) blocks[i].ym = { y: pv.y + (pv.m === 12 ? 1 : 0), m: pv.m === 12 ? 1 : pv.m + 1 }; }
    if (!blocks[i].ym) { ok = false; break; }
    if (i && blocks[i].ym.y * 12 + blocks[i].ym.m <= blocks[i - 1].ym.y * 12 + blocks[i - 1].ym.m) { ok = false; break; }
  }
  if (!ok) {
    var f = blocks.filter(function (b) { return b.ym; })[0];
    if (!f) throw new Error('tlos tab: month labels in row ' + hi + ' could not be read');
    var fi = blocks.indexOf(f);
    blocks.forEach(function (b, k) { var t = f.ym.y * 12 + (f.ym.m - 1) + (k - fi); b.ym = { y: Math.floor(t / 12), m: t % 12 + 1 }; });
  }
  var months = blocks.map(function (b) {
    return { y: b.ym.y, m: b.ym.m, key: b.ym.y + '-' + p2(b.ym.m), label: monthLabel(b.ym.y, b.ym.m),
             start: monthStart(b.ym.y, b.ym.m), end: monthEnd(b.ym.y, b.ym.m) };
  });

  var os = {}, taRaw = [], nameCount = {}, taFilled = months.map(function () { return 0; }), osRep = months.map(function () { return 0; });
  for (r = hi + 1; r < rows.length; r++) {
    var row = rows[r], br = canonBranch(row[bc]);
    if (!br || /^(grand\s*)?total/i.test(String(row[bc]).trim())) continue;
    if (!os[br]) os[br] = months.map(function () { return null; });
    blocks.forEach(function (b, mi) {
      var n = num(row[b.cols.n]), a = num(row[b.cols.amt]);
      if (n != null || a != null) {
        var cur = os[br][mi] || { n: 0, amt: 0 };
        cur.n += n || 0; cur.amt += a || 0; os[br][mi] = cur;
      }
      if (n != null || a != null) osRep[mi]++;
      if (String(row[b.cols.ta] == null ? '' : row[b.cols.ta]).trim() !== '') taFilled[mi]++;      /* blank = not updated yet, 0 = no TA paid */
      var ta = num(row[b.cols.ta]), names = splitCE(row[b.cols.ce]);
      if (ta && ta > 0) {
        taRaw.push({ b: br, mi: mi, ta: ta, names: names });
        names.forEach(function (nm) { var sq = squash(nm); if (sq) { nameCount[sq] = nameCount[sq] || { n: 0, raw: {} }; nameCount[sq].n++; nameCount[sq].raw[nm] = (nameCount[sq].raw[nm] || 0) + 1; } });
      }
    });
  }
  /* staff name clean-up: merge spelling variants (case, spaces, "RAHUL" vs "Rahul M R", "DEUV" vs "DEVU") */
  var keys = Object.keys(nameCount).sort(function (a, b) { return nameCount[b].n - nameCount[a].n; }), clusters = [], map = {};
  keys.forEach(function (sq) {
    var hit = null;
    for (var k = 0; k < clusters.length && !hit; k++) {
      var ck = clusters[k].key, mn = Math.min(sq.length, ck.length);
      if (sq === ck || (mn >= 5 && (ck.indexOf(sq) === 0 || sq.indexOf(ck) === 0)) || (mn >= 6 && osa(sq, ck) <= 1)) hit = clusters[k];
    }
    if (!hit) { hit = { key: sq, members: [] }; clusters.push(hit); }
    hit.members.push(sq); map[sq] = hit;
  });
  clusters.forEach(function (cl) {
    var best = '', bl = 0;
    cl.members.forEach(function (sq) { Object.keys(nameCount[sq].raw).forEach(function (raw) { var l = squash(raw).length; if (l > bl) { bl = l; best = raw; } }); });
    cl.display = titleCase(best.replace(/\s+/g, ' ').trim());
  });
  var recs = [];
  taRaw.forEach(function (t) {
    if (!t.names.length) { recs.push({ b: t.b, mi: t.mi, amt: t.ta, staff: '', name: 'Not tagged', shared: false }); return; }
    var cls = uniq(t.names.map(function (n) { return map[squash(n)].key; })), share = t.ta / cls.length;
    cls.forEach(function (k) { recs.push({ b: t.b, mi: t.mi, amt: share, staff: k, name: map[k].display, shared: cls.length > 1 }); });
  });
  return { months: months, os: os, ta: recs, branches: Object.keys(os).sort(), taFilled: taFilled, osRep: osRep };
}

/* ════════════════════════════════════════
   LOADER 2 — Sheet1  (visits / calls)
════════════════════════════════════════ */
function buildVisits(rows){
  if (rows.length < 2) throw new Error('Sheet1 is empty');
  var hdr = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  function ix(n){ var k = hdr.indexOf(n); return k; }
  var C = { ts: ix('timestamp'), date: ix('date'), br: ix('branch'), ex: ix('exec name'), ec: ix('emp code'), act: ix('activity'),
            prod: ix('product'), st: ix('status'), mob: ix('owner number'), shop: ix('shop name'), own: ix('owner name') };
  if (C.date < 0 || C.br < 0 || C.mob < 0) throw new Error('Sheet1: Date / Branch / Owner Number columns not found');
  function g(r, k){ return k < 0 ? '' : String(r[k] == null ? '' : r[k]); }

  var samples = [], i, r;
  for (i = 1; i < rows.length && samples.length < 4000; i++) samples.push(g(rows[i], C.date));
  var order = detectDateOrder(samples), today = todayNum(), dropped = 0;

  /* pass A — reliable 4-digit codes (appear alone in the Emp Code cell at least twice) */
  var rel = {};
  for (i = 1; i < rows.length; i++) { var e = g(rows[i], C.ec).trim(); if (/^\d{4}$/.test(e)) rel[e] = (rel[e] || 0) + 1; }
  Object.keys(rel).forEach(function (k) { if (rel[k] < 2) delete rel[k]; });
  var relKeys = Object.keys(rel);

  function codesOf(ec, ex){
    var out = [], runs = (ec + ' | ' + ex).match(/\d+/g) || [];
    runs.forEach(function (d) {
      var k;
      if (d.length === 4) out.push(d);
      else if (d.length >= 8 && d.length % 4 === 0) { for (k = 0; k < d.length; k += 4) out.push(d.substr(k, 4)); }  /* "48004801" = 4800 + 4801 */
      else if ((d.length === 5 || d.length === 6) && rel[d.slice(0, 4)]) out.push(d.slice(0, 4));
      else if (d.length === 3) { var m = relKeys.filter(function (x) { return x.indexOf(d) === 0; }); if (m.length === 1) out.push(m[0]); }
    });
    return uniq(out);
  }
  function nameOf(ec, ex){                          /* the cell that actually holds a name (fields are sometimes swapped) */
    var a = nameKey(ex), b = nameKey(ec);
    if (a.replace(/\s/g, '').length >= 2) return a;
    if (b.replace(/\s/g, '').length >= 2) return b;
    return '';
  }

  /* pass B — build rows, learn code → name (only from clean single-person rows) */
  var list = [], nm = {}, jn = {};   /* nm[code][nameKey]=count · jn[code][joint label]=count */
  function isJoint(txt){ return /[,&@\/+]|\band\b/i.test(String(txt || '')) && nameKey(txt).split(' ').length > 1; }
  for (i = 1; i < rows.length; i++) {
    r = rows[i];
    var day = parseDay(g(r, C.date), order), tsd = parseDay(g(r, C.ts), order);
    if (isNaN(day)) day = tsd;
    if (!isNaN(day) && day > today && !isNaN(tsd) && tsd <= today) day = tsd;       /* typo'd future date → use entry timestamp */
    var br = canonBranch(g(r, C.br));
    if (isNaN(day) || day > today || !br) { dropped++; continue; }
    var ec = g(r, C.ec), ex = g(r, C.ex), codes = codesOf(ec, ex), name = nameOf(ec, ex);
    var jointName = isJoint(ex) || (!/[A-Za-z]/.test(ex) && isJoint(ec));
    if (codes.length === 1 && name && !jointName) { var o = nm[codes[0]] = nm[codes[0]] || {}; o[name] = (o[name] || 0) + 1; }
    if (codes.length > 1 && jointName) {
      var lbl = (isJoint(ex) ? ex : ec).split(/[,&@\/+]|\band\b/i).map(function (p) { return nameKey(p); }).filter(Boolean).sort().map(titleCase).join(' / ');
      codes.forEach(function (c) { var j = jn[c] = jn[c] || {}; j[lbl] = (j[lbl] || 0) + 1; });
    }
    var act = g(r, C.act).trim().toLowerCase(), pr = g(r, C.prod).trim().toUpperCase(), st = g(r, C.st).trim().toLowerCase(), mb = cleanMobile(g(r, C.mob));
    list.push({ i: i, day: day, ts: tsd, b: br, codes: codes, name: jointName ? '' : name, jointName: jointName, ec: ec, ex: ex,
      act: act === 'call' ? 'Call' : 'Visit', tagged: !!act, prod: (pr === 'BL' || pr === 'SBL') ? pr : '',
      st: /^interested/.test(st) ? 'int' : /follow/.test(st) ? 'fu' : /not\s*interested/.test(st) ? 'ni' : 'ot',
      mob: mb.n, mobOk: mb.ok, shop: g(r, C.shop).trim(), own: g(r, C.own).trim(), s: [] });
  }
  function topKey(obj){ var best = '', bc = 0; Object.keys(obj || {}).forEach(function (k) { if (obj[k] > bc) { bc = obj[k]; best = k; } }); return best; }

  /* merge one-off mistyped codes (4051 → 4751, 6471 → 4671 …) into the real code of the same person in the same branch */
  var cnt = {}, hb = {};
  list.forEach(function (x) { x.codes.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; var h = hb[c] = hb[c] || {}; h[x.b] = (h[x.b] || 0) + 1; }); });
  var remap = {}, named = Object.keys(nm);
  named.forEach(function (X) {
    if (cnt[X] > 8) return;
    var nx = topKey(nm[X]), fx = nx.split(' ')[0], hx = topKey(hb[X]), best = null;
    named.forEach(function (Y) {
      if (Y === X || cnt[Y] < Math.max(3, 3 * cnt[X]) || topKey(hb[Y]) !== hx) return;
      var ny = topKey(nm[Y]), fy = ny.split(' ')[0], sx = squash(nx), sy = squash(ny);
      var nameOk = fx === fy || (fx.length >= 4 && fy.length >= 4 && osa(fx, fy) <= 1) || sy.indexOf(sx) === 0 || sx.indexOf(sy) === 0;
      var codeOk = osa(X, Y) <= 2;
      if (nameOk && (codeOk || sx === sy || sy.indexOf(sx) === 0 || sx.indexOf(sy) === 0) && (!best || cnt[Y] > cnt[best])) best = Y;
    });
    if (best) remap[X] = best;
  });
  list.forEach(function (x) { if (x.codes.length) x.codes = uniq(x.codes.map(function (c) { return remap[c] || c; })); });
  Object.keys(remap).forEach(function (X) { delete nm[X]; });
  Object.keys(remap).forEach(function (X) { var Y = remap[X]; if (!nm[Y]) nm[Y] = {}; });

  /* staff master */
  var staff = {}, byBranchName = {}, n2 = {};
  list.forEach(function (x) { x.codes.forEach(function (c) { n2[c] = (n2[c] || 0) + 1; }); });
  var codeSet = {}; list.forEach(function (x) { x.codes.forEach(function (c) { codeSet[c] = 1; }); });
  Object.keys(codeSet).forEach(function (code) {
    var nmTop = topKey(nm[code]), jTop = topKey(jn[code]);
    staff[code] = { key: code, code: code, name: nmTop ? titleCase(nmTop) : (jTop || 'Code ' + code), joint: !nmTop && !!jTop, branches: {}, n: 0, first: 1e9, last: 0 };
  });
  list.forEach(function (x) {                       /* name → code index per branch (for rows with no usable code) */
    if (x.codes.length === 1 && x.name) { var fw = x.name.split(' ')[0]; if (fw.length >= 3) { var bb = byBranchName[x.b] = byBranchName[x.b] || {}; (bb[fw] = bb[fw] || {})[x.codes[0]] = 1; } }
  });
  function pickOne(hits){
    hits = uniq(hits); if (hits.length === 1) return hits[0];
    if (hits.length > 1) {                          /* take the dominant code when one clearly outweighs the rest */
      hits.sort(function (a, b) { return (n2[b] || 0) - (n2[a] || 0); });
      if ((n2[hits[0]] || 0) >= 5 * (n2[hits[1]] || 1)) return hits[0];
    }
    return null;
  }
  function byName(br, txt){
    var out = [], bb = byBranchName[br] || {};
    String(txt || '').split(/[,&@\/+]|\band\b/i).forEach(function (part) {
      var fw = nameKey(part).split(' ')[0];
      if (!fw || fw.length < 3) return;
      var hits = bb[fw] ? Object.keys(bb[fw]) : [];
      if (!hits.length && fw.length >= 4) Object.keys(bb).forEach(function (k) { if (k.length >= 4 && osa(fw, k) <= 1) hits = hits.concat(Object.keys(bb[k])); });
      var one = pickOne(hits.map(function (h) { return remap[h] || h; })); if (one) out.push(one);
    });
    return uniq(out);
  }
  list.forEach(function (x) {
    var codes = x.codes.slice();
    if (!codes.length) codes = byName(x.b, x.ex).concat(byName(x.b, x.ec));
    codes = uniq(codes);
    if (!codes.length) {
      var nk = (x.name.split(' ')[0] || 'UNKNOWN'), key = 'NA|' + x.b + '|' + nk;
      if (!staff[key]) staff[key] = { key: key, code: '', name: x.name ? titleCase(x.name) : 'Unknown', noCode: true, branches: {}, n: 0, first: 1e9, last: 0 };
      codes = [key];
    }
    codes.forEach(function (k) {
      if (!staff[k]) staff[k] = { key: k, code: k, name: 'Code ' + k, branches: {}, n: 0, first: 1e9, last: 0 };
      var s = staff[k]; s.branches[x.b] = (s.branches[x.b] || 0) + 1; s.n++;
      if (x.day < s.first) s.first = x.day; if (x.day > s.last) s.last = x.day;
    });
    x.s = codes; x.joint = codes.length > 1;
  });
  list.sort(function (a, b) { return a.day - b.day || a.i - b.i; });
  var minDay = list.length ? list[0].day : today, maxDay = list.length ? list[list.length - 1].day : today;
  var actStart = NaN; for (var q = 0; q < list.length; q++) { if (list[q].tagged) { actStart = list[q].day; break; } }
  var branches = uniq(list.map(function (x) { return x.b; })).sort();
  Object.keys(staff).forEach(function (k) {                                     /* home branch = where most entries were logged */
    var s = staff[k], best = '', bc = -1; Object.keys(s.branches).forEach(function (b) { if (s.branches[b] > bc) { bc = s.branches[b]; best = b; } });
    s.home = best;
    s.label = s.name + (s.code ? ' · ' + s.code : ' · no code');
  });
  return { rows: list, staff: staff, minDay: minDay, maxDay: maxDay, branches: branches, dropped: dropped, order: order, actStart: actStart };
}

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
var S = { ok: false, tab: 'os', branch: 'All', from: NaN, to: NaN, staff: 'All', ta: 'total', dupScope: 'range',
          T: null, V: null, errT: '', errV: '', loading: false, loaded: false, loadedAt: null,
          sort: { os: { k: 'amt', d: -1 }, bvis: { k: 'total', d: -1 }, svis: { k: 'total', d: -1 }, tast: { k: 'total', d: -1 }, tabr: { k: 'total', d: -1 } },
          dupShown: 25, dupOpen: {}, dateShown: 31 };

var COLORS = { blue: '#1a73e8', navy: '#0b3d91', green: '#188038', red: '#d93025', amber: '#f29900', purple: '#8430ce', teal: '#00897b', grey: '#9aa0a6', call: '#f29900' };

/* ════════════════════════════════════════
   CSS  (scoped to #tab-vp)
════════════════════════════════════════ */
var CSS = '\
#tab-vp{--ink:#202124;--mut:#5f6368;--line:#e6e9ef;--card:#fff;--blue:#1a73e8;--navy:#0b3d91;--up:#137333;--upbg:#e6f4ea;--dn:#c5221f;--dnbg:#fce8e6;--amb:#b06000;--ambbg:#fef3e0;color:var(--ink)}\
#tab-vp .vp{max-width:1280px;margin:0 auto}\
#tab-vp .vp *{box-sizing:border-box}\
#tab-vp .vp-login{max-width:380px;margin:40px auto;background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 8px 30px rgba(11,61,145,.14);text-align:center}\
#tab-vp .vp-login .vp-lock{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#0b3d91,#1a73e8);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}\
#tab-vp .vp-login b{font-size:19px;display:block;margin-bottom:4px}\
#tab-vp .vp-login p{font-size:13px;color:var(--mut);margin-bottom:16px}\
#tab-vp .vp-login input{text-align:center;letter-spacing:2px;margin-bottom:10px}\
#tab-vp .vp-err{background:var(--dnbg);color:var(--dn);padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;margin-top:10px}\
#tab-vp .vp-btn{border:none;background:var(--blue);color:#fff;border-radius:8px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}\
#tab-vp .vp-btn:hover{background:#1557b0}\
#tab-vp .vp-btn.ghost{background:#fff;color:var(--mut);border:1px solid #dadce0;font-weight:600;padding:8px 14px;font-size:12px}\
#tab-vp .vp-btn.ghost:hover{background:#f1f3f4}\
#tab-vp .vp-btn.sm{padding:7px 12px;font-size:12px}\
#tab-vp .vp-top{background:linear-gradient(120deg,#0b3d91 0%,#1a73e8 70%,#4f9bff 100%);color:#fff;border-radius:16px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}\
#tab-vp .vp-top h1{font-size:20px;font-weight:800;letter-spacing:.2px;margin:0}\
#tab-vp .vp-top small{display:block;opacity:.85;font-size:12px;margin-top:3px}\
#tab-vp .vp-top .vp-tact{display:flex;gap:8px;flex-wrap:wrap}\
#tab-vp .vp-top .vp-btn.ghost{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.35)}\
#tab-vp .vp-top .vp-btn.ghost:hover{background:rgba(255,255,255,.26)}\
#tab-vp .vp-tabs{display:flex;gap:6px;background:#fff;border:1px solid var(--line);padding:5px;border-radius:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(16,24,40,.05)}\
#tab-vp .vp-tabs button{flex:1;border:none;background:transparent;border-radius:10px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--mut);cursor:pointer;font-family:inherit}\
#tab-vp .vp-tabs button.on{background:var(--blue);color:#fff;box-shadow:0 3px 10px rgba(26,115,232,.35)}\
#tab-vp .vp-tabs button small{display:block;font-weight:500;font-size:10px;opacity:.8;margin-top:1px}\
#tab-vp .vp-filters{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(16,24,40,.05)}\
#tab-vp .vp-fgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}\
@media(min-width:760px){#tab-vp .vp-fgrid{grid-template-columns:repeat(4,1fr)}}\
#tab-vp .vp-fgrid label{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);margin-bottom:4px;font-weight:700}\
#tab-vp .vp-fgrid input,#tab-vp .vp-fgrid select{padding:9px 10px;font-size:13px;background:#fff}\
#tab-vp .vp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}\
#tab-vp .vp-chips button,#tab-vp .vp-seg button{border:1px solid #dadce0;background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--mut);cursor:pointer;font-family:inherit}\
#tab-vp .vp-chips button:hover,#tab-vp .vp-seg button:hover{background:#f1f3f4}\
#tab-vp .vp-seg{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}\
#tab-vp .vp-seg button.on{background:#e8f0fe;color:var(--blue);border-color:#aecbfa}\
#tab-vp .vp-ctx{font-size:12px;color:var(--mut);margin:0 2px 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}\
#tab-vp .vp-ctx span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px 10px}\
#tab-vp .vp-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(16,24,40,.05)}\
#tab-vp .vp-card>.vp-h{font-size:15px;font-weight:800;margin-bottom:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}\
#tab-vp .vp-card>.vp-sub,#tab-vp .vp-sub{font-size:12px;color:var(--mut);margin-bottom:12px}\
#tab-vp .vp-hero{background:linear-gradient(135deg,#0b3d91,#1a73e8);color:#fff;border-radius:16px;padding:18px;margin-bottom:12px;box-shadow:0 8px 24px rgba(26,115,232,.28)}\
#tab-vp .vp-hero .vp-hl{font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:.8px;font-weight:700}\
#tab-vp .vp-hero .vp-hv{font-size:34px;font-weight:800;margin:4px 0 8px;line-height:1.1}\
#tab-vp .vp-hero .vp-hrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\
#tab-vp .vp-hero .vp-hnote{font-size:12px;opacity:.9;margin-top:10px}\
#tab-vp .vp-hero .vp-pill{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:5px 11px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px}\
#tab-vp .vp-hero .vp-pill .vp-chip{background:#fff}\
#tab-vp .vp-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}\
@media(min-width:640px){#tab-vp .vp-kpis{grid-template-columns:repeat(4,1fr)}}\
@media(min-width:1100px){#tab-vp .vp-kpis.k5{grid-template-columns:repeat(5,1fr)}}\
#tab-vp .vp-kpi{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;box-shadow:0 1px 3px rgba(16,24,40,.05);border-top:3px solid var(--blue);min-width:0}\
#tab-vp .vp-kpi.c-call{border-top-color:var(--call,#f29900)}#tab-vp .vp-kpi.c-green{border-top-color:#188038}#tab-vp .vp-kpi.c-purple{border-top-color:#8430ce}#tab-vp .vp-kpi.c-red{border-top-color:#d93025}#tab-vp .vp-kpi.c-teal{border-top-color:#00897b}\
#tab-vp .vp-kpi .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);font-weight:700}\
#tab-vp .vp-kpi .v{font-size:22px;font-weight:800;margin:4px 0 4px;line-height:1.15;word-break:break-word}\
#tab-vp .vp-kpi .s{font-size:11.5px;color:var(--mut);display:flex;gap:6px;align-items:center;flex-wrap:wrap}\
#tab-vp .vp-chip{display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;white-space:nowrap}\
#tab-vp .vp-chip.vp-up{background:var(--upbg);color:var(--up)}#tab-vp .vp-chip.vp-dn{background:var(--dnbg);color:var(--dn)}\
#tab-vp .vp-chip.vp-flat{background:#f1f3f4;color:var(--mut)}#tab-vp .vp-chip.vp-na{background:#f1f3f4;color:#9aa0a6}#tab-vp .vp-chip.vp-new{background:#e8f0fe;color:var(--blue)}\
#tab-vp .vp-chip.warn{background:var(--ambbg);color:var(--amb)}\
#tab-vp .vp-two{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}\
#tab-vp .vp-two>*{min-width:0}\
@media(min-width:900px){#tab-vp .vp-two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}\
#tab-vp .vp-three{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}\
#tab-vp .vp-three>*{min-width:0}\
@media(min-width:1000px){#tab-vp .vp-three{grid-template-columns:repeat(3,minmax(0,1fr))}}\
#tab-vp .vp-three .vp-bars{gap:2px}\
#tab-vp .vp-three .vp-bc{flex:1 0 34px;min-width:34px}\
#tab-vp .vp-three .vp-bb{width:70%}\
#tab-vp .vp-three .vp-chip{padding:1px 3px;font-size:9px;gap:1px}\
#tab-vp .vp-three .vp-bv,#tab-vp .vp-three .vp-bl{font-size:10px}\
#tab-vp .vp-bars{display:flex;gap:6px;align-items:flex-end;overflow-x:auto;padding-bottom:4px}\
#tab-vp .vp-bc{flex:1 0 46px;min-width:46px;text-align:center}\
#tab-vp .vp-bplot{height:150px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-top:18px}\
#tab-vp .vp-bv{font-size:11px;font-weight:700;color:var(--ink);margin-bottom:3px;white-space:nowrap}\
#tab-vp .vp-bb{width:62%;max-width:44px;min-height:2px;border-radius:7px 7px 2px 2px;background:linear-gradient(180deg,#4f9bff,#1a73e8)}\
#tab-vp .vp-bb.last{background:linear-gradient(180deg,#1a73e8,#0b3d91)}\
#tab-vp .vp-bb.alt{background:linear-gradient(180deg,#ffbf5e,#f29900)}\
#tab-vp .vp-bl{font-size:11px;color:var(--mut);margin-top:5px;font-weight:600}\
#tab-vp .vp-bs{min-height:20px;margin-top:2px}\
#tab-vp .vp-ins{list-style:none;padding:0;margin:0;display:grid;gap:8px}\
#tab-vp .vp-ins li{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;padding:10px 12px;border-radius:10px;background:#f8f9fb;border:1px solid #eef0f4}\
#tab-vp .vp-ins li i{font-style:normal;font-size:16px;line-height:1.3;flex:none}\
#tab-vp .vp-ins li.g{background:#f1faf4;border-color:#d6eedd}#tab-vp .vp-ins li.r{background:#fff4f2;border-color:#fbd9d4}#tab-vp .vp-ins li.a{background:#fff8ec;border-color:#fbe6bd}\
#tab-vp .vp-tw{overflow:auto;max-height:560px;border:1px solid var(--line);border-radius:10px}\
#tab-vp .vp-tw.nomax{max-height:none}\
#tab-vp table.vp-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}\
#tab-vp table.vp-t th{position:sticky;top:0;z-index:2;background:#f1f4f9;color:#3c4043;text-align:right;padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;border-bottom:1px solid var(--line);font-weight:800}\
#tab-vp table.vp-t th:first-child,#tab-vp table.vp-t td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:#fff}\
#tab-vp table.vp-t th:first-child{z-index:3;background:#f1f4f9}\
#tab-vp table.vp-t th.l,#tab-vp table.vp-t td.l{text-align:left}\
#tab-vp table.vp-t th[data-act=sort]{cursor:pointer}\
#tab-vp table.vp-t th[data-act=sort]:hover{background:#e6ecf6}\
#tab-vp table.vp-t th .ar{opacity:.55;font-size:9px;margin-left:2px}\
#tab-vp table.vp-t td{padding:8px 10px;text-align:right;border-bottom:1px solid #f0f2f5;white-space:nowrap;background:#fff}\
#tab-vp table.vp-t tr:nth-child(even) td{background:#fafbfd}\
#tab-vp table.vp-t td.name{font-weight:700}\
#tab-vp table.vp-t td a.vp-lnk,#tab-vp .vp-lnk{color:var(--blue);cursor:pointer;font-weight:700;text-decoration:none;border-bottom:1px dashed #9ec1f5}\
#tab-vp table.vp-t tr.tot td{background:#e8f0fe;font-weight:800;position:sticky;bottom:0}\
#tab-vp table.vp-t tr.sub td{background:#f8f9fb;font-size:12px}\
#tab-vp table.vp-t td .bar{display:inline-block;height:7px;border-radius:4px;background:#8ab4f8;vertical-align:middle;margin-left:6px}\
#tab-vp .vp-tag{display:inline-block;border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:800;letter-spacing:.3px}\
#tab-vp .vp-tag.g{background:var(--upbg);color:var(--up)}#tab-vp .vp-tag.r{background:var(--dnbg);color:var(--dn)}#tab-vp .vp-tag.n{background:#e8f0fe;color:var(--blue)}#tab-vp .vp-tag.s{background:#f1f3f4;color:var(--mut)}#tab-vp .vp-tag.a{background:var(--ambbg);color:var(--amb)}\
#tab-vp .vp-hb{display:grid;gap:7px}\
#tab-vp .vp-hb .row{display:grid;grid-template-columns:minmax(70px,130px) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12.5px}\
#tab-vp .vp-hb .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#tab-vp .vp-hb .tr{background:#eef2f9;border-radius:6px;height:12px;overflow:hidden}\
#tab-vp .vp-hb .fl{height:100%;border-radius:6px;background:linear-gradient(90deg,#4f9bff,#1a73e8)}\
#tab-vp .vp-hb .vl{max-width:150px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:12px;white-space:normal}\
#tab-vp .vp-empty{text-align:center;padding:34px 12px;color:var(--mut);font-size:14px}\
#tab-vp .vp-empty b{display:block;color:var(--ink);font-size:16px;margin-bottom:6px}\
#tab-vp .vp-load{text-align:center;padding:60px 12px;color:var(--mut)}\
#tab-vp .vp-load .sp{width:42px;height:42px;border:4px solid #e8eaed;border-top-color:var(--blue);border-radius:50%;animation:vpspin .8s linear infinite;margin:0 auto 12px}\
@keyframes vpspin{to{transform:rotate(360deg)}}\
#tab-vp .vp-warn{background:var(--ambbg);border:1px solid #fbe6bd;color:#7a4b00;border-radius:10px;padding:9px 12px;font-size:12.5px;margin-bottom:12px;line-height:1.5}\
#tab-vp .vp-note{font-size:11.5px;color:var(--mut);margin-top:8px;line-height:1.5}\
#tab-vp .vp-verdict{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800}\
#tab-vp .vp-verdict.up{background:var(--upbg);color:var(--up)}#tab-vp .vp-verdict.dn{background:var(--dnbg);color:var(--dn)}#tab-vp .vp-verdict.fl{background:#f1f3f4;color:var(--mut)}\
#tab-vp .vp-chart{position:relative;height:190px;margin:6px 0 0;border-left:1px solid var(--line);border-bottom:1px solid var(--line)}\
#tab-vp .vp-chart svg{position:absolute;inset:0;width:100%;height:100%}\
#tab-vp .vp-chart .mx{position:absolute;left:6px;top:2px;font-size:10.5px;color:var(--mut);font-weight:700}\
#tab-vp .vp-xl{display:flex;justify-content:space-between;font-size:10.5px;color:var(--mut);margin-top:4px}\
#tab-vp .vp-leg{display:flex;gap:14px;font-size:11.5px;color:var(--mut);margin-top:8px;flex-wrap:wrap}\
#tab-vp .vp-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}\
#tab-vp .vp-dup{border-left:5px solid #d93025}\
#tab-vp .vp-x{color:var(--blue);cursor:pointer;font-weight:700;font-size:12px;border:none;background:none;font-family:inherit;padding:0}\
#tab-vp .vp-sec{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);font-weight:800;margin:18px 2px 8px;display:flex;align-items:center;gap:8px}\
#tab-vp .vp-sec:after{content:"";flex:1;height:1px;background:var(--line)}\
#tab-vp .vp-sec.red{color:#c5221f}\
#tab-vp .vp-prof{display:flex;gap:12px;align-items:center;flex-wrap:wrap}\
#tab-vp .vp-av{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#0b3d91,#4f9bff);color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;flex:none}\
';

function injectCSS(){
  if ($('vp-style')) return;
  var st = document.createElement('style'); st.id = 'vp-style'; st.textContent = CSS; document.head.appendChild(st);
}

/* ════════════════════════════════════════
   SMALL VIEW HELPERS
════════════════════════════════════════ */
function kpi(label, val, sub, cls){ return '<div class="vp-kpi ' + (cls || '') + '"><div class="l">' + label + '</div><div class="v">' + val + '</div><div class="s">' + (sub || '') + '</div></div>'; }
function card(title, sub, body, extra){ return '<div class="vp-card ' + (extra || '') + '"><div class="vp-h">' + title + '</div>' + (sub ? '<div class="vp-sub">' + sub + '</div>' : '') + body + '</div>'; }
function empty(t, s){ return '<div class="vp-card"><div class="vp-empty"><b>' + t + '</b>' + (s || '') + '</div></div>'; }
function insights(list){
  if (!list.length) return '<div class="vp-sub">Not enough data for insights in this selection.</div>';
  return '<ul class="vp-ins">' + list.map(function (x) { return '<li class="' + (x.c || '') + '"><i>' + x.i + '</i><span>' + x.t + '</span></li>'; }).join('') + '</ul>';
}
function spark(vals, w, h){
  w = w || 84; h = h || 24;
  var pts = [], mn = Infinity, mx = -Infinity;
  vals.forEach(function (v) { if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } });
  if (mn === Infinity) return '';
  var rng = (mx - mn) || 1, n = vals.length, first = null, last = null;
  vals.forEach(function (v, i) { if (v == null) return; var x = n > 1 ? i / (n - 1) * (w - 4) + 2 : w / 2, y = h - 3 - (v - mn) / rng * (h - 6); pts.push(x.toFixed(1) + ',' + y.toFixed(1)); if (first == null) first = v; last = v; });
  var col = last > first ? COLORS.green : last < first ? COLORS.red : COLORS.grey, lp = pts[pts.length - 1].split(',');
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/><circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="2.4" fill="' + col + '"/></svg>';
}
/* HTML column chart:  items = [{label, value, text, sub, cls}] */
function bars(items){
  var mx = 0; items.forEach(function (i) { if (i.value > mx) mx = i.value; });
  return '<div class="vp-bars">' + items.map(function (i, k) {
    var hgt = mx ? Math.max(1.5, i.value / mx * 100) : 0;
    return '<div class="vp-bc" title="' + esc(i.title || (i.label + ': ' + i.text)) + '"><div class="vp-bplot"><div class="vp-bv">' + i.text + '</div><div class="vp-bb ' + (i.cls || (k === items.length - 1 ? 'last' : '')) + '" style="height:' + hgt.toFixed(1) + '%"></div></div><div class="vp-bl">' + i.label + '</div><div class="vp-bs">' + (i.sub || '') + '</div></div>';
  }).join('') + '</div>';
}
/* horizontal ranking bars */
function hbars(items, fmt){
  var mx = 0; items.forEach(function (i) { if (i.v > mx) mx = i.v; });
  return '<div class="vp-hb">' + items.map(function (i) {
    return '<div class="row"><div class="nm" title="' + esc(i.n) + '">' + esc(i.n) + '</div><div class="tr"><div class="fl" style="width:' + (mx ? i.v / mx * 100 : 0).toFixed(1) + '%"></div></div><div class="vl">' + fmt(i.v) + (i.x ? ' <span style="color:#5f6368;font-weight:500">' + i.x + '</span>' : '') + '</div></div>';
  }).join('') + '</div>';
}
function th(label, key, tbl, cur, left){
  var on = cur && cur.k === key;
  return '<th' + (left ? ' class="l"' : '') + ' data-act="sort" data-tbl="' + tbl + '" data-k="' + key + '">' + label + '<span class="ar">' + (on ? (cur.d < 0 ? ' ▼' : ' ▲') : '') + '</span></th>';
}
function sortBy(rows, cur){
  var k = cur.k, d = cur.d;
  return rows.slice().sort(function (a, b) {
    var x = a[k], y = b[k];
    if (typeof x === 'string' || typeof y === 'string') return d * String(x == null ? '' : x).localeCompare(String(y == null ? '' : y));
    if (x == null) x = -Infinity; if (y == null) y = -Infinity;
    return d * (x - y);
  });
}
function heat(v, mx){ if (!v || !mx) return ''; var a = Math.min(.55, .08 + v / mx * .47); return ' style="background:rgba(26,115,232,' + a.toFixed(2) + ')"'; }

/* ════════════════════════════════════════
   OS  —  outstanding (count + amount), tlos tab
════════════════════════════════════════ */
function monthIdxInRange(){
  var T = S.T, out = [];
  if (!T) return out;
  T.months.forEach(function (m, i) {
    if (m.end < S.from || m.start > S.to) return;
    var has = scopeBranches().some(function (b) { return T.os[b] && T.os[b][i]; });
    if (has) out.push(i);
  });
  return out;
}
function scopeBranches(){
  var T = S.T; if (!T) return [];
  return S.branch === 'All' ? T.branches : (T.os[S.branch] ? [S.branch] : []);
}
function osAt(brs, mi){
  var n = 0, a = 0, c = 0, T = S.T;
  if (mi == null || mi < 0 || mi >= T.months.length) return null;
  brs.forEach(function (b) { var r = T.os[b] && T.os[b][mi]; if (r && (r.amt || r.n)) { n += r.n; a += r.amt; c++; } });
  return c ? { n: n, amt: a, c: c, tk: n ? a / n : null } : null;
}
function fyQ(m){ var q = m.m >= 4 && m.m <= 6 ? 1 : m.m >= 7 && m.m <= 9 ? 2 : m.m >= 10 ? 3 : 4, fy = m.m >= 4 ? m.y + 1 : m.y; return 'Q' + q + ' FY' + String(fy).slice(2); }

function renderOS(){
  var T = S.T;
  if (S.errT) return '<div class="vp-card"><div class="vp-empty"><b>OS / TA data could not be loaded</b>' + esc(S.errT) + '</div></div>';
  var idxs = monthIdxInRange();
  if (!idxs.length) {
    var lastM = T.months[T.months.length - 1];
    return empty('No OS data in the selected dates' + (S.branch !== 'All' ? ' for ' + esc(S.branch) : ''),
      'OS data is available for ' + T.months[0].label + ' → ' + lastM.label + '.<br><br><button class="vp-btn sm" data-act="latest">Show available months</button>');
  }
  var brs = scopeBranches(), first = idxs[0], last = idxs[idxs.length - 1], M = T.months;
  var cur = osAt(brs, last), prev = osAt(brs, last - 1), q3 = osAt(brs, last - 3), st = osAt(brs, first);
  var momA = cur && prev ? growth(cur.amt, prev.amt) : null, momN = cur && prev ? growth(cur.n, prev.n) : null;
  var qoqA = cur && q3 ? growth(cur.amt, q3.amt) : null;
  var sinceA = (cur && st && first !== last) ? growth(cur.amt, st.amt) : null;
  var sinceN = (cur && st && first !== last) ? growth(cur.n, st.n) : null;

  /* contribution of brand-new branches (no OS in the previous month) */
  var newAmt = 0, newN = 0, newList = [];
  if (prev && S.branch === 'All') brs.forEach(function (b) { var r = T.os[b][last], p = T.os[b][last - 1]; if (r && r.amt && !(p && p.amt)) { newAmt += r.amt; newN += r.n; newList.push(b); } });

  /* branch rows */
  var rows = brs.map(function (b) {
    var a = T.os[b], r = a[last], p = a[last - 1], q = a[last - 3], s0 = a[first];
    if (!r || !(r.amt || r.n)) return null;
    var series = idxs.map(function (i) { return a[i] ? a[i].amt : null; });
    var mom = r && p && p.amt ? growth(r.amt, p.amt) : null, since = (s0 && s0.amt && first !== last) ? growth(r.amt, s0.amt) : null;
    var streak = 0; for (var i = last; i > 0 && a[i] && a[i - 1] && a[i].amt < a[i - 1].amt; i--) streak++;
    var isNew = !(p && p.amt), tag = isNew ? ['NEW', 'n'] : (since != null && since <= -20) ? ['RUN-OFF', 'r'] : (mom != null && mom >= 2) ? ['GROWING', 'g'] : (mom != null && mom <= -2) ? ['DECLINING', 'r'] : ['STABLE', 's'];
    return { b: b, n: r.n, amt: r.amt, tk: r.n ? r.amt / r.n : null, dAmt: p ? r.amt - p.amt : null, mom: mom, momN: p && p.n ? growth(r.n, p.n) : null,
             qoq: q && q.amt ? growth(r.amt, q.amt) : null, since: since, series: series, streak: streak, isNew: isNew, tag: tag, tagS: tag[0], share: cur ? r.amt / cur.amt * 100 : 0 };
  }).filter(Boolean);

  var h = '';
  if (M[last].end < S.from || M[last].start > S.to) h += '';
  /* partial coverage notice */
  var lastDataM = M[M.length - 1];
  if (S.to > lastDataM.end + 1 && idxs[idxs.length - 1] === M.length - 1) h += '<div class="vp-warn">ℹ️ OS data is available up to <b>' + lastDataM.label + '</b>. Later months have not been entered in the sheet yet.</div>';

  /* HERO */
  h += '<div class="vp-hero"><div class="vp-hl">Outstanding (OS) · as of ' + M[last].label + (S.branch === 'All' ? ' · ' + cur.c + ' branches' : ' · ' + esc(S.branch)) + '</div>' +
       '<div class="vp-hv">' + inr(cur.amt) + '</div><div class="vp-hrow">' +
       '<span class="vp-pill">MoM ' + chip(momA, { isNew: !prev }) + '</span>' +
       '<span class="vp-pill">QoQ ' + chip(qoqA) + '<span style="opacity:.8">' + (q3 ? 'vs ' + M[last - 3].label : 'n/a') + '</span></span>' +
       (first !== last ? '<span class="vp-pill">Since ' + M[first].label + ' ' + chip(sinceA) + '</span>' : '') +
       '</div>' +
       (prev ? '<div class="vp-hnote">' + (cur.amt >= prev.amt ? '▲ Added ' : '▼ Lost ') + inr(Math.abs(cur.amt - prev.amt)) + ' vs ' + M[last - 1].label + (newAmt ? ' &nbsp;·&nbsp; of which <b>' + inr(newAmt) + '</b> from newly reporting branch' + (newList.length > 1 ? 'es' : '') + ' (' + newList.map(titleCase).join(', ') + ') &nbsp;·&nbsp; like-for-like ' + chip(growth(cur.amt - newAmt, prev.amt)) : '') + '</div>' : '') + '</div>';

  /* KPIs */
  h += '<div class="vp-kpis">' +
    kpi('OS accounts (no.)', nfmt(cur.n), prev ? chip(momN) + ' <span>vs ' + M[last - 1].label + '</span>' : '') +
    kpi('Average ticket', inr(cur.tk), prev && prev.tk ? chip(growth(cur.tk, prev.tk)) + ' <span>MoM</span>' : '', 'c-purple') +
    kpi('QoQ accounts', q3 ? chip(growth(cur.n, q3.n)) : '—', q3 ? '<span>' + nfmt(q3.n) + ' → ' + nfmt(cur.n) + ' accts</span>' : '', 'c-teal') +
    kpi('Net change vs ' + (prev ? M[last - 1].label : 'prev'), prev ? (cur.amt - prev.amt >= 0 ? '+' : '−') + inr(Math.abs(cur.amt - prev.amt)).replace('-', '') : '—', prev ? '<span>' + (cur.n - prev.n >= 0 ? '+' : '−') + Math.abs(cur.n - prev.n) + ' accounts</span>' : '', cur.amt >= (prev ? prev.amt : 0) ? 'c-green' : 'c-red') + '</div>';

  /* CHARTS */
  var itA = idxs.map(function (i, k) { var r = osAt(brs, i), p = osAt(brs, i - 1), g = r && p ? growth(r.amt, p.amt) : null; return { label: M[i].label, value: r ? r.amt : 0, text: r ? lakh(r.amt) : '—', sub: g != null ? chip(g) : '', title: M[i].label + ': ' + inr(r && r.amt) }; });
  var itN = idxs.map(function (i, k) { var r = osAt(brs, i), p = osAt(brs, i - 1), g = r && p ? growth(r.n, p.n) : null; return { label: M[i].label, value: r ? r.n : 0, text: r ? nfmt(r.n) : '—', sub: g != null ? chip(g) : '', cls: k === idxs.length - 1 ? 'alt' : 'alt', title: M[i].label + ': ' + (r && r.n) + ' accounts' }; });
  h += '<div class="vp-two">' + card('OS amount trend', '₹ lakh at month-end · chip = growth over previous month', bars(itA)) +
       card('OS accounts trend', 'Number of outstanding loan accounts · chip = growth over previous month', bars(itN)) + '</div>';

  /* INSIGHTS */
  var ins = [];
  if (prev) ins.push({ i: cur.amt >= prev.amt ? '📈' : '📉', c: cur.amt >= prev.amt ? 'g' : 'r',
    t: '<b>' + (S.branch === 'All' ? 'Group' : titleCase(S.branch)) + ' OS</b> is ' + inr(cur.amt) + ' in ' + M[last].label + ' — <b>' + (momA >= 0 ? 'up ' : 'down ') + Math.abs(momA).toFixed(1) + '% MoM</b> (' + (cur.amt >= prev.amt ? '+' : '−') + inr(Math.abs(cur.amt - prev.amt)).replace('-', '') + ')' + (qoqA != null ? ' and <b>' + (qoqA >= 0 ? 'up ' : 'down ') + Math.abs(qoqA).toFixed(1) + '% QoQ</b> versus ' + M[last - 3].label + (M[last].m % 3 === 0 ? ' (' + fyQ(M[last]) + ' vs ' + fyQ(M[last - 3]) + ')' : '') : '') + '.' });
  if (cur && prev && momN != null && momA != null && Math.abs(momA - momN) >= 2)
    ins.push({ i: '🧮', c: 'a', t: 'Accounts ' + (momN >= 0 ? 'grew ' : 'fell ') + Math.abs(momN).toFixed(1) + '% while amount ' + (momA >= 0 ? 'grew ' : 'fell ') + Math.abs(momA).toFixed(1) + '% — average ticket ' + (momA > momN ? 'is rising' : 'is shrinking') + ' (' + inr(prev.tk) + ' → ' + inr(cur.tk) + ').' });
  if (S.branch === 'All') {
    var withD = rows.filter(function (r) { return r.dAmt != null && !r.isNew; });
    if (withD.length) {
      var up = withD.slice().sort(function (a, b) { return b.dAmt - a.dAmt; })[0], dn = withD.slice().sort(function (a, b) { return a.dAmt - b.dAmt; })[0];
      if (up.dAmt > 0) ins.push({ i: '🚀', c: 'g', t: '<b>Biggest gainer MoM:</b> ' + titleCase(up.b) + ' added ' + inr(up.dAmt) + ' (' + (up.mom >= 0 ? '+' : '') + (up.mom || 0).toFixed(1) + '%).' });
      if (dn.dAmt < 0) ins.push({ i: '⚠️', c: 'r', t: '<b>Biggest drop MoM:</b> ' + titleCase(dn.b) + ' lost ' + inr(Math.abs(dn.dAmt)) + ' (' + (dn.mom || 0).toFixed(1) + '%).' });
    }
    var streaks = rows.filter(function (r) { return r.streak >= 2; }).sort(function (a, b) { return b.streak - a.streak; }).slice(0, 4);
    if (streaks.length) ins.push({ i: '🔻', c: 'r', t: '<b>Consecutive decline:</b> ' + streaks.map(function (r) { return titleCase(r.b) + ' (' + r.streak + ' months)'; }).join(', ') + ' — OS has fallen every month; needs recovery focus.' });
    var runoff = rows.filter(function (r) { return r.since != null && r.since <= -20; });
    if (runoff.length) ins.push({ i: '🧯', c: 'r', t: '<b>Run-off alert:</b> ' + runoff.map(function (r) { return titleCase(r.b) + ' (' + r.since.toFixed(0) + '% since ' + M[first].label + ')'; }).join(', ') + '.' });
    var top3 = rows.slice().sort(function (a, b) { return b.amt - a.amt; }).slice(0, 3);
    if (top3.length === 3) ins.push({ i: '🏛️', t: '<b>Concentration:</b> top 3 branches (' + top3.map(function (r) { return titleCase(r.b); }).join(', ') + ') hold ' + sum(top3, function (r) { return r.share; }).toFixed(0) + '% of group OS.' });
    if (newList.length) ins.push({ i: '🌱', c: 'g', t: '<b>Newly reporting:</b> ' + newList.map(titleCase).join(', ') + ' started showing OS in ' + M[last].label + ' (' + inr(newAmt) + '). Without them OS moved ' + (growth(cur.amt - newAmt, prev.amt) >= 0 ? '+' : '') + growth(cur.amt - newAmt, prev.amt).toFixed(1) + '% MoM.' });
    var gcnt = rows.filter(function (r) { return r.mom != null && r.mom > 0; }).length, dcnt = rows.filter(function (r) { return r.mom != null && r.mom < 0; }).length;
    if (prev) ins.push({ i: '🗺️', t: '<b>Breadth:</b> ' + gcnt + ' branches grew, ' + dcnt + ' declined, ' + (rows.length - gcnt - dcnt) + ' flat/new in ' + M[last].label + '.' });
  } else if (rows.length) {
    var all = S.branch, grp = osAt(T.branches, last), rk = T.branches.map(function (b) { return { b: b, a: (T.os[b][last] || {}).amt || 0 }; }).sort(function (x, y) { return y.a - x.a; }), pos = rk.findIndex(function (x) { return x.b === all; }) + 1;
    var gp = osAt(T.branches, last - 1), gm = grp && gp ? growth(grp.amt, gp.amt) : null;
    ins.push({ i: '🏅', t: 'Ranks <b>#' + pos + ' of ' + rk.filter(function (x) { return x.a > 0; }).length + '</b> branches by OS; holds ' + (grp ? (cur.amt / grp.amt * 100).toFixed(1) : '—') + '% of group OS.' });
    if (gm != null && momA != null) ins.push({ i: momA >= gm ? '✅' : '⚠️', c: momA >= gm ? 'g' : 'a', t: 'MoM ' + (momA >= 0 ? '+' : '') + momA.toFixed(1) + '% vs group ' + (gm >= 0 ? '+' : '') + gm.toFixed(1) + '% — ' + (momA >= gm ? 'outperforming' : 'lagging') + ' the group.' });
    if (rows[0].streak >= 2) ins.push({ i: '🔻', c: 'r', t: 'OS has declined for <b>' + rows[0].streak + ' consecutive months</b>.' });
    if (grp && grp.tk) ins.push({ i: '🎟️', t: 'Average ticket ' + inr(cur.tk) + ' vs group ' + inr(grp.tk) + '.' });
  }
  h += card('💡 Insights', 'Auto-generated from the selected branch and dates', insights(ins));

  /* BRANCH TABLE */
  if (S.branch === 'All') {
    var sorted = sortBy(rows, S.sort.os), tot = cur, mxA = Math.max.apply(null, rows.map(function (r) { return r.amt; }));
    var body = sorted.map(function (r) {
      return '<tr><td class="name"><a class="vp-lnk" data-act="branch" data-v="' + esc(r.b) + '">' + esc(titleCase(r.b)) + '</a></td><td>' + nfmt(r.n) + '</td><td>' + lakh(r.amt) + '<span class="bar" style="width:' + Math.max(2, r.amt / mxA * 46).toFixed(0) + 'px"></span></td><td>' + r.share.toFixed(1) + '%</td><td>' + (r.dAmt == null ? '—' : (r.dAmt >= 0 ? '+' : '') + lakh(r.dAmt)) + '</td><td>' + chip(r.mom, { isNew: r.isNew }) + '</td><td>' + chip(r.qoq, { isNew: false }) + '</td><td>' + chip(r.since) + '</td><td>' + (r.tk ? lakh(r.tk) : '—') + '</td><td>' + spark(r.series) + '</td><td class="l"><span class="vp-tag ' + r.tag[1] + '">' + r.tag[0] + '</span></td></tr>';
    }).join('');
    h += card('Branch-wise OS · ' + M[last].label, 'Tap a branch to drill down · tap a column to sort · ₹ in lakh', '<div class="vp-tw"><table class="vp-t"><thead><tr>' +
      th('Branch', 'b', 'os', S.sort.os, 1) + th('Accts', 'n', 'os', S.sort.os) + th('OS (₹ L)', 'amt', 'os', S.sort.os) + th('Share', 'share', 'os', S.sort.os) + th('Δ ₹ L MoM', 'dAmt', 'os', S.sort.os) + th('MoM', 'mom', 'os', S.sort.os) + th('QoQ', 'qoq', 'os', S.sort.os) + th('Since ' + M[first].label, 'since', 'os', S.sort.os) + th('Ticket (₹ L)', 'tk', 'os', S.sort.os) + th('Trend', 'amt', 'os', S.sort.os) + th('Status', 'tagS', 'os', S.sort.os, 1) + '</tr></thead><tbody>' + body +
      '<tr class="tot"><td>TOTAL</td><td>' + nfmt(tot.n) + '</td><td>' + lakh(tot.amt) + '</td><td>100%</td><td>' + (prev ? (tot.amt - prev.amt >= 0 ? '+' : '') + lakh(tot.amt - prev.amt) : '—') + '</td><td>' + chip(momA) + '</td><td>' + chip(qoqA) + '</td><td>' + chip(sinceA) + '</td><td>' + lakh(tot.tk) + '</td><td>' + spark(idxs.map(function (i) { var r = osAt(brs, i); return r ? r.amt : null; })) + '</td><td></td></tr></tbody></table></div>');
  }

  /* QUARTER-END SNAPSHOT */
  var qIdx = []; M.forEach(function (m, i) { if (m.m % 3 === 0 && i <= last) qIdx.push(i); });
  if (qIdx.length >= 2) {
    var qb = (S.branch === 'All' ? T.branches : brs).slice().sort(function (a, b) { return ((T.os[b][last] || {}).amt || 0) - ((T.os[a][last] || {}).amt || 0); });
    var qrows = qb.map(function (b) {
      var cells = qIdx.map(function (i, k) { var r = T.os[b][i], p = k ? T.os[b][qIdx[k - 1]] : null; return '<td>' + (r ? lakh(r.amt) : '—') + '</td>' + (k ? '<td>' + (r && p && p.amt ? chip(growth(r.amt, p.amt)) : (r && !(p && p.amt) ? '<span class="vp-chip vp-new">NEW</span>' : '—')) + '</td>' : ''); }).join('');
      return (T.os[b][last]) ? '<tr><td class="name">' + esc(titleCase(b)) + '</td>' + cells + '</tr>' : '';
    }).join('');
    var tq = qIdx.map(function (i, k) { var r = osAt(brs, i), p = k ? osAt(brs, qIdx[k - 1]) : null; return '<td>' + (r ? lakh(r.amt) : '—') + '</td>' + (k ? '<td>' + chip(r && p ? growth(r.amt, p.amt) : null) + '</td>' : ''); }).join('');
    h += card('Quarter-end snapshot (QoQ)', 'OS at each quarter-end (₹ L) with growth over the previous quarter-end · Indian FY quarters',
      '<div class="vp-tw"><table class="vp-t"><thead><tr><th>Branch</th>' + qIdx.map(function (i, k) { return '<th>' + M[i].label + '<br><span style="font-weight:600;opacity:.7">' + fyQ(M[i]) + '</span></th>' + (k ? '<th>QoQ</th>' : ''); }).join('') + '</tr></thead><tbody>' + (S.branch === 'All' ? qrows : '') + '<tr class="tot"><td>' + (S.branch === 'All' ? 'TOTAL' : esc(titleCase(S.branch))) + '</td>' + tq + '</tr></tbody></table></div>');
  }

  /* MONTH-WISE TABLE */
  var mrows = idxs.slice().reverse().map(function (i) {
    var r = osAt(brs, i), p = osAt(brs, i - 1), q = osAt(brs, i - 3);
    return '<tr><td class="name">' + M[i].label + '</td><td>' + nfmt(r.n) + '</td><td>' + lakh(r.amt) + '</td><td>' + (p ? (r.amt - p.amt >= 0 ? '+' : '') + lakh(r.amt - p.amt) : '—') + '</td><td>' + chip(p ? growth(r.amt, p.amt) : null) + '</td><td>' + chip(p ? growth(r.n, p.n) : null) + '</td><td>' + chip(q ? growth(r.amt, q.amt) : null) + '</td><td>' + lakh(r.tk) + '</td><td>' + r.c + '</td></tr>';
  }).join('');
  h += card('Month-wise OS', 'Growth is measured against the actual previous month, even when it falls outside the selected dates',
    '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Month</th><th>Accts</th><th>OS (₹ L)</th><th>Δ ₹ L</th><th>MoM ₹</th><th>MoM accts</th><th>QoQ ₹</th><th>Ticket (₹ L)</th><th>Branches</th></tr></thead><tbody>' + mrows + '</tbody></table></div>');
  return h;
}

/* ════════════════════════════════════════
   TA  —  paid travel allowance, tlos tab
════════════════════════════════════════ */
function renderTA(){
  var T = S.T;
  if (S.errT) return '<div class="vp-card"><div class="vp-empty"><b>OS / TA data could not be loaded</b>' + esc(S.errT) + '</div></div>';
  var idxs = monthIdxInRange(), M = T.months;
  if (!idxs.length) return empty('No TA data in the selected dates' + (S.branch !== 'All' ? ' for ' + esc(S.branch) : ''),
      'TA data is available for ' + M[0].label + ' → ' + M[M.length - 1].label + '.<br><br><button class="vp-btn sm" data-act="latest">Show available months</button>');
  var set = {}; idxs.forEach(function (i) { set[i] = 1; });
  var recs = T.ta.filter(function (r) { return set[r.mi] && (S.branch === 'All' || r.b === S.branch); });
  var views = [['total', 'Total'], ['month', 'Month-wise'], ['staff', 'Staff-wise'], ['branch', 'Branch-wise'], ['impact', '⚡ Impact']];
  var h = '<div class="vp-seg">' + views.map(function (v) { return '<button data-act="taview" data-v="' + v[0] + '" class="' + (S.ta === v[0] ? 'on' : '') + '">' + v[1] + '</button>'; }).join('') + '</div>';

  /* data-completeness warning: blank ≠ 0, so a mostly blank month means "not entered yet" */
  var partial = idxs.filter(function (i) { return T.osRep[i] > 0 && T.taFilled[i] < T.osRep[i] * 0.5; });
  if (partial.length) h += '<div class="vp-warn">⚠️ TA columns look <b>only partly filled</b> for ' + partial.map(function (i) { return '<b>' + M[i].label + '</b> (' + T.taFilled[i] + ' of ' + T.osRep[i] + ' branches)'; }).join(', ') + '. Totals for these months may be understated until the sheet is completed.</div>';

  if (S.ta === 'impact') return h + impactHTML(idxs, recs);
  var total = sum(recs, function (r) { return r.amt; });
  var byM = {}; idxs.forEach(function (i) { byM[i] = 0; }); recs.forEach(function (r) { byM[r.mi] += r.amt; });
  var brPaid = uniq(recs.map(function (r) { return r.b; })), stPaid = uniq(recs.filter(function (r) { return r.staff; }).map(function (r) { return r.staff; }));
  var pairs = uniq(recs.map(function (r) { return r.b + '|' + r.mi; })).length;
  var lastI = idxs[idxs.length - 1], prevI = idxs.length > 1 ? idxs[idxs.length - 2] : null;

  if (S.ta === 'total') {
    var peak = idxs.slice().sort(function (a, b) { return byM[b] - byM[a]; })[0];
    h += '<div class="vp-hero"><div class="vp-hl">Total TA paid · ' + M[idxs[0]].label + (idxs.length > 1 ? ' → ' + M[lastI].label : '') + (S.branch !== 'All' ? ' · ' + esc(S.branch) : '') + '</div>' +
         '<div class="vp-hv">' + inr(total) + '</div><div class="vp-hrow"><span class="vp-pill">📅 ' + idxs.length + ' month' + (idxs.length > 1 ? 's' : '') + '</span><span class="vp-pill">🏢 ' + brPaid.length + ' branch' + (brPaid.length === 1 ? '' : 'es') + ' paid</span><span class="vp-pill">👤 ' + stPaid.length + ' staff paid</span>' +
         (prevI != null ? '<span class="vp-pill">' + M[lastI].label + ' vs ' + M[prevI].label + ' ' + chip(growth(byM[lastI], byM[prevI])) + '</span>' : '') + '</div></div>';
    h += '<div class="vp-kpis">' + kpi('Average per month', inr(total / idxs.length), '<span>across ' + idxs.length + ' month' + (idxs.length > 1 ? 's' : '') + '</span>') +
      kpi('Avg per branch-month', pairs ? inr(total / pairs) : '—', '<span>' + pairs + ' payments</span>', 'c-purple') +
      kpi('Peak month', byM[peak] ? M[peak].label : '—', '<span>' + inr(byM[peak]) + '</span>', 'c-green') +
      kpi('Branches covered', brPaid.length + ' / ' + (S.branch === 'All' ? uniq(idxs.reduce(function (a, i) { return a.concat(T.branches.filter(function (b) { return T.os[b][i]; })); }, [])).length : 1), '<span>received TA in this period</span>', 'c-teal') + '</div>';
    var it = idxs.map(function (i) { var g = prevOf(i, byM, idxs); return { label: M[i].label, value: byM[i], text: byM[i] ? nfmt(byM[i]) : '0', sub: (T.osRep[i] && T.taFilled[i] < T.osRep[i] * .5 ? '<span class="vp-chip warn">partial</span>' : (g != null ? chip(g) : '')), cls: '', title: M[i].label + ': ' + inr(byM[i]) }; });
    h += card('Monthly TA paid', '₹ per month · chip = change over previous month', bars(it));

    var brAgg = aggBy(recs, function (r) { return r.b; }), stAgg = aggBy(recs.filter(function (r) { return r.staff; }), function (r) { return r.staff; }, function (r) { return r.name; });
    var tb = Object.keys(brAgg).map(function (k) { return { n: titleCase(k), v: brAgg[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    var ts = Object.keys(stAgg.v).map(function (k) { return { n: stAgg.n[k], v: stAgg.v[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    h += '<div class="vp-two">' + card('Top branches by TA', 'Share of total TA in the period', total ? hbars(tb.map(function (x) { x.x = (x.v / total * 100).toFixed(0) + '%'; return x; }), inr) : '<div class="vp-sub">No TA paid.</div>') +
         card('Top staff by TA', 'Joint payments are split equally between the named staff', total ? hbars(ts.map(function (x) { x.x = (x.v / total * 100).toFixed(0) + '%'; return x; }), inr) : '<div class="vp-sub">No TA paid.</div>') + '</div>';

    /* effectiveness: OS movement of TA-paid vs not-paid branches */
    if (S.branch === 'All' && idxs.length >= 2) {
      var f = idxs[0], paid = {}; brPaid.forEach(function (b) { paid[b] = 1; });
      var g = { p: { a0: 0, a1: 0, n: 0 }, u: { a0: 0, a1: 0, n: 0 } };
      T.branches.forEach(function (b) { var r0 = T.os[b][f], r1 = T.os[b][lastI]; if (!r0 || !r1 || !r0.amt) return; var o = paid[b] ? g.p : g.u; o.a0 += r0.amt; o.a1 += r1.amt; o.n++; });
      if (g.p.n && g.u.n) {
        var gp = growth(g.p.a1, g.p.a0), gu = growth(g.u.a1, g.u.a0), added = g.p.a1 - g.p.a0;
        h += card('TA vs OS growth <span class="vp-chip warn">indicative</span>', 'OS movement from ' + M[f].label + ' to ' + M[lastI].label + ' — branches that received TA vs those that did not (branches present in both months)',
          '<div class="vp-kpis" style="margin-bottom:0">' + kpi('TA-paid branches (' + g.p.n + ')', chip(gp), '<span>' + inr(g.p.a0) + ' → ' + inr(g.p.a1) + '</span>', 'c-green') + kpi('No-TA branches (' + g.u.n + ')', chip(gu), '<span>' + inr(g.u.a0) + ' → ' + inr(g.u.a1) + '</span>', 'c-call') +
          kpi('TA spent', inr(total), '<span>on paid branches</span>') + kpi('TA per ₹ 1 L OS added', added > 0 ? '₹ ' + nfmt(total / (added / 1e5)) : '—', '<span>' + (added > 0 ? inr(added) + ' net OS added' : 'OS did not grow') + '</span>', 'c-purple') + '</div><div class="vp-note">Correlation only — branch size, season and recovery drives also move OS. Use it as a prompt for review, not proof.</div>');
      }
    }
    /* insights */
    var ins = [];
    if (total) {
      var topB = tb[0], topS = ts[0];
      ins.push({ i: '💰', t: '<b>' + inr(total) + '</b> TA paid over ' + idxs.length + ' month(s); average <b>' + inr(total / idxs.length) + '</b> per month.' });
      if (topB && S.branch === 'All') ins.push({ i: '🏢', t: '<b>' + topB.n + '</b> received the most TA (' + inr(topB.v) + ', ' + (topB.v / total * 100).toFixed(0) + '% of total).' });
      if (topS) ins.push({ i: '👤', t: '<b>' + esc(topS.n) + '</b> is the highest TA earner (' + inr(topS.v) + ').' });
      if (prevI != null && byM[prevI]) {
        var gg = growth(byM[lastI], byM[prevI]);
        ins.push({ i: gg >= 0 ? '📈' : '📉', c: (partial.indexOf(lastI) > -1 ? 'a' : (gg >= 0 ? '' : 'a')), t: M[lastI].label + ' TA is ' + inr(byM[lastI]) + ' (' + (gg >= 0 ? '▲ ' : '▼ ') + Math.abs(gg).toFixed(1) + '% vs ' + M[prevI].label + ')' + (partial.indexOf(lastI) > -1 ? ' — <b>but this month is only partly entered</b>, so the drop is likely incomplete data.' : '.') });
      }
      var nt = recs.filter(function (r) { return !r.staff; }), ntA = sum(nt, function (r) { return r.amt; });
      if (ntA) ins.push({ i: '🏷️', c: 'a', t: '<b>' + inr(ntA) + '</b> of TA has no CE name against it (' + uniq(nt.map(function (r) { return r.b; })).map(titleCase).join(', ') + ') — tag the staff in the sheet.' });
      var multi = {}; recs.forEach(function (r) { if (r.staff) { (multi[r.staff] = multi[r.staff] || {})[r.b] = 1; } });
      var mv = Object.keys(multi).filter(function (k) { return Object.keys(multi[k]).length > 1; }).map(function (k) { return stAgg.n[k] + ' (' + Object.keys(multi[k]).map(titleCase).join(' + ') + ')'; });
      if (mv.length) ins.push({ i: '🔀', t: '<b>Moved between branches:</b> ' + mv.join('; ') + '.' });
    } else ins.push({ i: 'ℹ️', t: 'No TA was paid in the selected months.' });
    h += card('💡 Insights', '', insights(ins));
    return h;
  }

  if (S.ta === 'month') {
    var rowsM = idxs.slice().reverse().map(function (i) {
      var rr = recs.filter(function (r) { return r.mi === i; }), pv = prevOf(i, byM, idxs);
      var cp = T.osRep[i] ? T.taFilled[i] + '/' + T.osRep[i] : '—', bad = T.osRep[i] && T.taFilled[i] < T.osRep[i] * .5;
      return '<tr><td class="name">' + M[i].label + '</td><td>' + nfmt(byM[i]) + '</td><td>' + chip(pv) + '</td><td>' + uniq(rr.map(function (r) { return r.b; })).length + '</td><td>' + uniq(rr.filter(function (r) { return r.staff; }).map(function (r) { return r.staff; })).length + '</td><td>' + (rr.length ? nfmt(byM[i] / uniq(rr.map(function (r) { return r.b; })).length) : '—') + '</td><td>' + (bad ? '<span class="vp-chip warn">' + cp + '</span>' : cp) + '</td></tr>';
    }).join('');
    h += card('Month-wise TA', 'Month range follows the dates you picked above', '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Month</th><th>TA paid (₹)</th><th>MoM</th><th>Branches paid</th><th>Staff paid</th><th>Avg / branch (₹)</th><th>Sheet filled</th></tr></thead><tbody>' + rowsM +
      '<tr class="tot"><td>TOTAL</td><td>' + nfmt(total) + '</td><td></td><td>' + brPaid.length + '</td><td>' + stPaid.length + '</td><td></td><td></td></tr></tbody></table></div><div class="vp-note">“Sheet filled” = branches whose PAID TA cell is not blank. A blank means not entered yet; a 0 means no TA paid.</div>');
    h += matrix(recs, idxs, function (r) { return r.b; }, function (k) { return titleCase(k); }, 'Branch × month TA (₹)', 'Darker = higher payout');
    return h;
  }
  if (S.ta === 'staff') {
    var sa = {}; recs.forEach(function (r) { var k = r.staff || '~NT'; var o = sa[k] = sa[k] || { k: k, name: r.name, br: {}, m: {}, total: 0, shared: false }; o.br[r.b] = 1; o.m[r.mi] = (o.m[r.mi] || 0) + r.amt; o.total += r.amt; if (r.shared) o.shared = true; });
    var list = Object.keys(sa).map(function (k) { var o = sa[k]; o.mp = Object.keys(o.m).length; o.avg = o.mp ? o.total / o.mp : 0; o.bs = Object.keys(o.br).map(titleCase).join(', '); return o; });
    list = sortBy(list, S.sort.tast);
    var mxc = 0; list.forEach(function (o) { Object.keys(o.m).forEach(function (i) { if (o.m[i] > mxc) mxc = o.m[i]; }); });
    var body = list.map(function (o) {
      return '<tr><td class="name">' + esc(o.name) + (o.shared ? ' <span class="vp-chip warn" title="Payment shared with another staff; split equally">½</span>' : '') + '</td><td class="l">' + esc(o.bs) + '</td>' + idxs.map(function (i) { return '<td' + heat(o.m[i], mxc) + '>' + (o.m[i] ? nfmt(o.m[i]) : '·') + '</td>'; }).join('') + '<td><b>' + nfmt(o.total) + '</b></td><td>' + o.mp + '</td><td>' + nfmt(o.avg) + '</td></tr>';
    }).join('');
    h += card('Staff-wise TA', stPaid.length + ' staff · tap a column to sort · ½ = payment shared and split equally', '<div class="vp-tw nomax"><table class="vp-t"><thead><tr>' + th('Staff', 'name', 'tast', S.sort.tast, 1) + th('Branch', 'bs', 'tast', S.sort.tast, 1) + idxs.map(function (i) { return '<th>' + M[i].label + '</th>'; }).join('') + th('Total (₹)', 'total', 'tast', S.sort.tast) + th('Months', 'mp', 'tast', S.sort.tast) + th('Avg / paid month', 'avg', 'tast', S.sort.tast) + '</tr></thead><tbody>' + body +
      '<tr class="tot"><td>TOTAL</td><td></td>' + idxs.map(function (i) { return '<td>' + nfmt(byM[i]) + '</td>'; }).join('') + '<td>' + nfmt(total) + '</td><td></td><td></td></tr></tbody></table></div><div class="vp-note">Spelling variants (e.g. “DEUV PRASAD” / “DEVU PRASAD”, “Rohith NR” / “ROHITH N R”) are merged automatically.</div>');
    return h;
  }
  /* branch-wise */
  var ba = {}; recs.forEach(function (r) { var o = ba[r.b] = ba[r.b] || { b: r.b, m: {}, total: 0, st: {} }; o.m[r.mi] = (o.m[r.mi] || 0) + r.amt; o.total += r.amt; if (r.staff) o.st[r.name] = 1; });
  var bl = Object.keys(ba).map(function (k) {
    var o = ba[k]; o.mp = Object.keys(o.m).length; o.share = total ? o.total / total * 100 : 0;
    var osSum = 0; Object.keys(o.m).forEach(function (i) { var r = T.os[k][i]; if (r) osSum += r.amt; });
    o.per = osSum ? o.total / (osSum / 1e5) : null; o.staff = Object.keys(o.st).join(', '); o.name = titleCase(k); return o;
  });
  bl = sortBy(bl, S.sort.tabr);
  var mxb = 0; bl.forEach(function (o) { Object.keys(o.m).forEach(function (i) { if (o.m[i] > mxb) mxb = o.m[i]; }); });
  h += card('Branch-wise TA', bl.length + ' branch' + (bl.length === 1 ? '' : 'es') + ' paid · tap a column to sort', '<div class="vp-tw nomax"><table class="vp-t"><thead><tr>' + th('Branch', 'name', 'tabr', S.sort.tabr, 1) + idxs.map(function (i) { return '<th>' + M[i].label + '</th>'; }).join('') + th('Total (₹)', 'total', 'tabr', S.sort.tabr) + th('Share', 'share', 'tabr', S.sort.tabr) + th('Months', 'mp', 'tabr', S.sort.tabr) + th('₹ / ₹1L OS', 'per', 'tabr', S.sort.tabr) + th('CE paid', 'staff', 'tabr', S.sort.tabr, 1) + '</tr></thead><tbody>' +
    bl.map(function (o) { return '<tr><td class="name">' + esc(o.name) + '</td>' + idxs.map(function (i) { return '<td' + heat(o.m[i], mxb) + '>' + (o.m[i] ? nfmt(o.m[i]) : '·') + '</td>'; }).join('') + '<td><b>' + nfmt(o.total) + '</b></td><td>' + o.share.toFixed(1) + '%</td><td>' + o.mp + '</td><td>' + (o.per == null ? '—' : nfmt(o.per)) + '</td><td class="l" style="white-space:normal;min-width:140px">' + esc(o.staff || '—') + '</td></tr>'; }).join('') +
    '<tr class="tot"><td>TOTAL</td>' + idxs.map(function (i) { return '<td>' + nfmt(byM[i]) + '</td>'; }).join('') + '<td>' + nfmt(total) + '</td><td>100%</td><td></td><td></td><td></td></tr></tbody></table></div><div class="vp-note">“₹ / ₹1L OS” = TA paid per ₹ 1 lakh of OS in the months TA was paid (cost of TA relative to branch size).</div>');
  return h;
}
function prevOf(i, byM, idxs){ var k = idxs.indexOf(i); return k > 0 ? growth(byM[i], byM[idxs[k - 1]]) : null; }
function aggBy(recs, kf, nf){
  if (!nf) { var o = {}; recs.forEach(function (r) { var k = kf(r); o[k] = (o[k] || 0) + r.amt; }); return o; }
  var v = {}, n = {}; recs.forEach(function (r) { var k = kf(r); v[k] = (v[k] || 0) + r.amt; n[k] = nf(r); }); return { v: v, n: n };
}
function matrix(recs, idxs, kf, nf, title, sub){
  var M = S.T.months, a = {}, mx = 0;
  recs.forEach(function (r) { var k = kf(r); a[k] = a[k] || { m: {}, t: 0 }; a[k].m[r.mi] = (a[k].m[r.mi] || 0) + r.amt; a[k].t += r.amt; });
  var keys = Object.keys(a).sort(function (x, y) { return a[y].t - a[x].t; });
  keys.forEach(function (k) { Object.keys(a[k].m).forEach(function (i) { if (a[k].m[i] > mx) mx = a[k].m[i]; }); });
  if (!keys.length) return '';
  return card(title, sub, '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Branch</th>' + idxs.map(function (i) { return '<th>' + M[i].label + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
    keys.map(function (k) { return '<tr><td class="name">' + esc(nf(k)) + '</td>' + idxs.map(function (i) { return '<td' + heat(a[k].m[i], mx) + '>' + (a[k].m[i] ? nfmt(a[k].m[i]) : '·') + '</td>'; }).join('') + '<td><b>' + nfmt(a[k].t) + '</b></td></tr>'; }).join('') + '</tbody></table></div>');
}

/* ════════════════════════════════════════
   TA → IMPACT  (monthly TA · monthly OS · monthly visits, side by side)
════════════════════════════════════════ */
function matchVisitStaff(branch, name){
  var V = S.V, fw = squash(String(name).split(' ')[0]), best = null, bn = -1;
  if (!V || fw.length < 3) return null;
  Object.keys(V.staff).forEach(function (k) {
    var s = V.staff[k]; if (!s.branches[branch]) return;
    var sf = squash(s.name.split(' ')[0]);
    var ok = sf === fw || (Math.min(sf.length, fw.length) >= 4 && (sf.indexOf(fw) === 0 || fw.indexOf(sf) === 0)) || (fw.length >= 5 && osa(fw, sf) <= 1);
    if (ok && s.branches[branch] > bn) { bn = s.branches[branch]; best = k; }
  });
  return best;
}
function monthOfDay(day){ var M = S.T.months; for (var i = 0; i < M.length; i++) if (day >= M[i].start && day <= M[i].end) return i; return -1; }
function avgOf(a){ return a.length ? sum(a) / a.length : null; }

function impactHTML(idxs, recs){
  var T = S.T, M = T.months, V = S.V;
  if (S.errV || !V) return card('Impact needs the Visit data', '', '<div class="vp-empty">' + esc(S.errV || 'Visit data not loaded') + '</div>');
  if (!recs.length) return empty('No TA was paid in the selected months', 'Pick a wider date range to see its impact.');
  /* months we can judge: TA column filled, and visit data exists for that month */
  var okTA = {}, okVis = {};
  idxs.forEach(function (i) { okTA[i] = !(T.osRep[i] > 0 && T.taFilled[i] < T.osRep[i] * .5); okVis[i] = M[i].end >= V.minDay && M[i].start <= V.maxDay; });
  var st = {};
  recs.forEach(function (r) {
    if (!r.staff) return;
    var o = st[r.staff] = st[r.staff] || { key: r.staff, name: r.name, ta: {}, brs: {}, total: 0, shared: false };
    o.ta[r.mi] = (o.ta[r.mi] || 0) + r.amt; o.total += r.amt; o.brs[r.b] = (o.brs[r.b] || 0) + 1; if (r.shared) o.shared = true;
  });
  var list = Object.keys(st).map(function (k) {
    var o = st[k]; o.home = Object.keys(o.brs).sort(function (a, b) { return o.brs[b] - o.brs[a]; })[0];
    o.vk = uniq(Object.keys(o.brs).map(function (b) { return matchVisitStaff(b, o.name); }).filter(Boolean));
    o.act = {}; o.visit = {}; return o;
  });
  var byV = {}; list.forEach(function (o) { o.vk.forEach(function (k) { (byV[k] = byV[k] || []).push(o); }); });
  V.rows.forEach(function (x) {
    var mi = monthOfDay(x.day); if (mi < 0) return;
    x.s.forEach(function (k) { if (byV[k]) byV[k].forEach(function (o) { o.act[mi] = (o.act[mi] || 0) + 1; }); });
  });
  var allIdx = idxs;
  list.forEach(function (o) {
    o.os = {}; allIdx.forEach(function (i) { var r = T.os[o.home] && T.os[o.home][i], p = T.os[o.home] && T.os[o.home][i - 1]; o.os[i] = r ? r.amt : null; o['m' + i] = (r && p && p.amt) ? growth(r.amt, p.amt) : null; });
    var pa = [], un = [], op = [], ou = [];
    allIdx.forEach(function (i) {
      if (!okTA[i]) return;
      var paid = !!o.ta[i];
      if (o.vk.length && okVis[i]) (paid ? pa : un).push(o.act[i] || 0);
      if (o['m' + i] != null) (paid ? op : ou).push(o['m' + i]);
    });
    o.aP = avgOf(pa); o.aU = avgOf(un); o.oP = avgOf(op); o.oU = avgOf(ou);
    o.aD = (o.aP != null && o.aU != null && o.aU > 0) ? growth(o.aP, o.aU) : null;
    o.oD = (o.oP != null && o.oU != null) ? o.oP - o.oU : null;
    var pos = (o.aD != null && o.aD >= 10 ? 1 : 0) + (o.oD != null && o.oD > 0 ? 1 : 0);
    o.verdict = (o.aD == null && o.oD == null) ? ['NOT ENOUGH DATA', 's'] : pos === 2 ? ['POSITIVE', 'g'] : pos === 1 ? ['MIXED', 'a'] : ['NO LIFT', 'r'];
    o.tot = sum(allIdx, function (i) { return o.act[i] || 0; });
    o.osCh = (function () { var f = allIdx.filter(function (i) { return o.os[i] != null; }); return f.length > 1 ? growth(o.os[f[f.length - 1]], o.os[f[0]]) : null; })();
  });
  list.sort(function (a, b) { return b.total - a.total; });

  var matched = list.filter(function (o) { return o.vk.length; }).length, h = '';
  /* overall side-by-side monthly charts */
  var tM = {}, aM = {}, oM = {}, homes = uniq(list.map(function (o) { return o.home; }));
  allIdx.forEach(function (i) {
    tM[i] = sum(list, function (o) { return o.ta[i] || 0; });
    aM[i] = okVis[i] ? sum(list, function (o) { return o.act[i] || 0; }) : null;
    oM[i] = sum(homes, function (b) { return (T.os[b] && T.os[b][i]) ? T.os[b][i].amt : 0; });
  });
  function mk(map, fmtv, cls, chipOn){ return bars(allIdx.map(function (i, k) { var pv = k ? map[allIdx[k - 1]] : null, v = map[i]; return { label: M[i].label, value: v || 0, text: v == null ? 'n/a' : fmtv(v), sub: (chipOn && v != null && pv ? chip(growth(v, pv)) : ''), cls: cls, title: M[i].label + ': ' + (v == null ? 'no data' : fmtv(v)) }; })); }
  h += '<div class="vp-three">' +
    card('Monthly TA', '₹ paid to these ' + list.length + ' staff', mk(tM, nfmt, 'alt', true)) +
    card('Monthly OS', '₹ lakh · branches of the staff above (' + homes.length + ')', mk(oM, lakh, '', true)) +
    card('Monthly visit + call', 'Activities by the matched staff (' + matched + ' of ' + list.length + ')', mk(aM, nfmt, 'last', true)) + '</div>';

  /* aggregate impact KPIs */
  var both = list.filter(function (o) { return o.aD != null; }), osb = list.filter(function (o) { return o.oD != null; });
  var avgAP = avgOf(both.map(function (o) { return o.aP; })), avgAU = avgOf(both.map(function (o) { return o.aU; }));
  var avgOP = avgOf(osb.map(function (o) { return o.oP; })), avgOU = avgOf(osb.map(function (o) { return o.oU; }));
  var lift = both.filter(function (o) { return o.aD >= 10; }).length, osUp = osb.filter(function (o) { return o.oD > 0; }).length;
  h += '<div class="vp-kpis">' +
    kpi('Activity / month · TA months', avgAP == null ? '—' : avgAP.toFixed(0), avgAU == null ? '<span>no non-TA months to compare</span>' : chip(growth(avgAP, avgAU)) + ' <span>vs ' + avgAU.toFixed(0) + ' in non-TA months</span>', 'c-green') +
    kpi('Staff with higher activity', both.length ? lift + ' / ' + both.length : '—', '<span>when TA was paid (≥ +10%)</span>', 'c-teal') +
    kpi('Branch OS growth · TA months', avgOP == null ? '—' : (avgOP >= 0 ? '+' : '') + avgOP.toFixed(1) + '%', avgOU == null ? '<span>avg MoM</span>' : '<span>avg MoM vs ' + (avgOU >= 0 ? '+' : '') + avgOU.toFixed(1) + '% in non-TA months</span>', 'c-purple') +
    kpi('Staff whose OS grew faster', osb.length ? osUp + ' / ' + osb.length : '—', '<span>in TA months than in others</span>', 'c-call') + '</div>';

  /* impact table */
  var tb = list.map(function (o) {
    return '<tr><td class="name">' + esc(o.name) + (o.shared ? ' <span class="vp-chip warn" title="TA shared and split equally">½</span>' : '') + '</td><td class="l">' + esc(titleCase(o.home)) + '</td><td>' + Object.keys(o.ta).length + '</td><td>' + nfmt(o.total) + '</td><td>' + (o.vk.length ? nfmt(o.tot) : '<span class="vp-chip vp-na">no match</span>') + '</td><td>' + (o.aP == null ? '—' : o.aP.toFixed(0)) + '</td><td>' + (o.aU == null ? '—' : o.aU.toFixed(0)) + '</td><td>' + chip(o.aD) + '</td><td>' + (o.oP == null ? '—' : (o.oP >= 0 ? '+' : '') + o.oP.toFixed(1) + '%') + '</td><td>' + (o.oU == null ? '—' : (o.oU >= 0 ? '+' : '') + o.oU.toFixed(1) + '%') + '</td><td>' + chip(o.osCh) + '</td><td class="l"><span class="vp-tag ' + o.verdict[1] + '">' + o.verdict[0] + '</span></td></tr>';
  }).join('');
  h += card('Impact by staff', 'Compares each staff member’s months <b>with TA</b> against months <b>without TA</b> · activity = visits + calls · OS = branch MoM growth',
    '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Staff</th><th class="l">Branch</th><th>TA months</th><th>TA ₹</th><th>Activity (period)</th><th>Act/mo with TA</th><th>Act/mo no TA</th><th>Activity lift</th><th>OS MoM with TA</th><th>OS MoM no TA</th><th>OS since start</th><th class="l">Verdict</th></tr></thead><tbody>' + tb + '</tbody></table></div>' +
    '<div class="vp-note">Months where the TA column is still blank, or where no visit data exists (before Apr-26), are left out of both groups so they do not distort the comparison. This shows association, not proof — season, recovery drives and branch size also move OS.</div>');

  /* month-by-month, side by side per staff */
  var mxT = 0; list.forEach(function (o) { Object.keys(o.ta).forEach(function (i) { if (o.ta[i] > mxT) mxT = o.ta[i]; }); });
  var rows = list.map(function (o) {
    var amx = 0; allIdx.forEach(function (i) { if ((o.act[i] || 0) > amx) amx = o.act[i]; });
    function bg(i){ return o.ta[i] ? ' style="background:#fff3dc"' : ''; }
    return '<tr class="grp"><td class="name" rowspan="3" style="vertical-align:top;border-top:2px solid #dfe3ea">' + esc(o.name) + '<div style="font-weight:500;font-size:11px;color:#5f6368">' + esc(titleCase(o.home)) + '</div></td><td class="l" style="border-top:2px solid #dfe3ea"><span class="vp-tag a">TA ₹</span></td>' + allIdx.map(function (i) { return '<td' + heat(o.ta[i], mxT).replace('style="', 'style="border-top:2px solid #dfe3ea;') + '>' + (o.ta[i] ? nfmt(o.ta[i]) : '·') + '</td>'; }).join('') + '</tr>' +
      '<tr><td class="l"><span class="vp-tag n">OS ₹ L</span></td>' + allIdx.map(function (i) { return '<td' + bg(i) + '>' + (o.os[i] == null ? '—' : lakh(o.os[i])) + (o['m' + i] != null ? ' ' + chip(o['m' + i]) : '') + '</td>'; }).join('') + '</tr>' +
      '<tr><td class="l"><span class="vp-tag g">Visit+Call</span></td>' + allIdx.map(function (i) { return '<td' + bg(i) + '>' + (!o.vk.length || !okVis[i] ? '—' : (o.act[i] || 0)) + '</td>'; }).join('') + '</tr>';
  }).join('');
  h += card('Month by month — TA · OS · Visit', 'Shaded cells = months in which the staff received TA',
    '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Staff</th><th class="l">Metric</th>' + allIdx.map(function (i) { return '<th>' + M[i].label + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>');

  /* insights */
  var ins = [];
  ins.push({ i: '👥', t: '<b>' + list.length + ' staff</b> received TA in this period; <b>' + matched + '</b> could be matched to their visit entries by branch and name' + (matched < list.length ? ' (unmatched: ' + list.filter(function (o) { return !o.vk.length; }).map(function (o) { return esc(o.name); }).join(', ') + ')' : '') + '.' });
  if (both.length) ins.push({ i: avgAP >= avgAU ? '📈' : '📉', c: avgAP >= avgAU ? 'g' : 'r', t: 'Across staff, average activity was <b>' + avgAP.toFixed(0) + '</b> per month when TA was paid vs <b>' + avgAU.toFixed(0) + '</b> when it was not (' + (growth(avgAP, avgAU) >= 0 ? '+' : '') + growth(avgAP, avgAU).toFixed(0) + '%). ' + lift + ' of ' + both.length + ' staff did ≥10% more.' });
  var top = both.slice().sort(function (a, b) { return b.aD - a.aD; }), pos = top.filter(function (o) { return o.aD >= 10; }).slice(0, 3), neg = top.slice().reverse().filter(function (o) { return o.aD <= -10; }).slice(0, 3);
  if (pos.length) ins.push({ i: '🚀', c: 'g', t: '<b>Biggest activity lift with TA:</b> ' + pos.map(function (o) { return esc(o.name) + ' (+' + o.aD.toFixed(0) + '%, ' + o.aU.toFixed(0) + ' → ' + o.aP.toFixed(0) + ')'; }).join(', ') + '.' });
  if (neg.length) ins.push({ i: '⚠️', c: 'r', t: '<b>Activity did not rise with TA:</b> ' + neg.map(function (o) { return esc(o.name) + ' (' + o.aD.toFixed(0) + '%)'; }).join(', ') + ' — worth reviewing whether TA is being used for field work.' });
  var osTop = osb.slice().sort(function (a, b) { return b.oD - a.oD; }).filter(function (o) { return o.oD > 0; }).slice(0, 3);
  if (osTop.length) ins.push({ i: '🏦', c: 'g', t: '<b>OS grew faster in TA months:</b> ' + osTop.map(function (o) { return esc(o.name) + ' / ' + titleCase(o.home) + ' (+' + o.oD.toFixed(1) + ' pts)'; }).join(', ') + '.' });
  var nl = list.filter(function (o) { return o.verdict[0] === 'NO LIFT'; });
  if (nl.length) ins.push({ i: '🔎', c: 'a', t: '<b>No visible lift (activity and OS both flat or lower in TA months):</b> ' + nl.map(function (o) { return esc(o.name); }).join(', ') + '.' });
  var onlyAll = list.filter(function (o) { return Object.keys(o.ta).length >= allIdx.filter(function (i) { return okTA[i]; }).length && o.aU == null; });
  if (onlyAll.length) ins.push({ i: 'ℹ️', t: '<b>Paid TA in every month, so no “without TA” comparison exists:</b> ' + onlyAll.map(function (o) { return esc(o.name); }).join(', ') + '. Their trend is shown month by month above.' });
  return h + card('💡 Insights', 'Auto-generated from the selected branch and dates', insights(ins));
}

/* ════════════════════════════════════════
   VISIT  —  Sheet1 (visits / calls / products / duplicates)
════════════════════════════════════════ */
var LAST = { dateRows: [], dupRows: [] };

function brOK(x){ return S.branch === 'All' || x.b === S.branch; }
function stOK(x){ return S.staff === 'All' || x.s.indexOf(S.staff) > -1; }
function agg(rows){
  var o = { t: 0, v: 0, c: 0, bl: 0, sbl: 0, un: 0, int: 0, fu: 0, ni: 0, days: {}, mob: {}, st: {}, rp: 0, last: 0 };
  rows.forEach(function (x) {
    o.t++; if (x.act === 'Call') o.c++; else o.v++;
    if (x.prod === 'BL') o.bl++; else if (x.prod === 'SBL') o.sbl++; else o.un++;
    if (x.st === 'int') o.int++; else if (x.st === 'fu') o.fu++; else if (x.st === 'ni') o.ni++;
    o.days[x.day] = 1; if (x.mobOk) o.mob[x.mob] = 1; x.s.forEach(function (k) { o.st[k] = 1; }); if (x._rp) o.rp++; if (x.day > o.last) o.last = x.day;
  });
  o.nd = Object.keys(o.days).length; o.nm = Object.keys(o.mob).length; o.ns = Object.keys(o.st).length; return o;
}
function weekStart(d){ return d - ((d + 3) % 7); }           /* Monday-based */
function staffName(k){ var s = S.V.staff[k]; return s ? s.name + (s.code ? ' · ' + s.code : '') : k; }

function renderVisit(){
  var V = S.V;
  if (S.errV) return '<div class="vp-card"><div class="vp-empty"><b>Visit data could not be loaded</b>' + esc(S.errV) + '</div></div>';
  var from = S.from, to = S.to, i, x, win = [], view = [];
  for (i = 0; i < V.rows.length; i++) { x = V.rows[i]; x._rp = 0; if (x.day < from || x.day > to) continue; win.push(x); if (brOK(x) && stOK(x)) view.push(x); }
  var ctx = '<div class="vp-ctx"><span>📍 ' + (S.branch === 'All' ? 'All branches' : esc(titleCase(S.branch))) + '</span><span>👤 ' + (S.staff === 'All' ? 'All staff' : esc(staffName(S.staff))) + '</span><span>📅 ' + dayDMY(from) + ' → ' + dayDMY(to) + ' (' + (to - from + 1) + ' days)</span></div>';
  if (!view.length) return ctx + empty('No visits or calls match these filters', 'Try a wider date range, or another branch / staff.<br><br><button class="vp-btn sm" data-act="range" data-v="all">Reset dates to all data</button>');

  /* effective window = where data exists */
  var effFrom = Math.max(from, V.minDay), effTo = Math.min(to, V.maxDay), nDays = effTo - effFrom + 1;
  var dup = computeDups(view);                       /* marks x._rp on repeat entries */
  var A = agg(view);

  /* previous equal-length window (only when it lies inside the data) */
  var len = to - from + 1, pf = from - len, pt = from - 1, P = null;
  if (pf >= V.minDay) { var pv = []; for (i = 0; i < V.rows.length; i++) { x = V.rows[i]; if (x.day >= pf && x.day <= pt && brOK(x) && stOK(x)) pv.push(x); } if (pv.length) P = agg(pv); }
  var pl = '<span>vs prev ' + len + 'd</span>';
  function dl(cur, prv){ return P ? chip(growth(cur, prv)) + ' ' + pl : ''; }

  var h = ctx;
  /* staff profile card */
  if (S.staff !== 'All') {
    var sf = V.staff[S.staff], brsTxt = sf ? Object.keys(sf.branches).sort(function (a, b) { return sf.branches[b] - sf.branches[a]; }).map(function (b) { return titleCase(b) + ' (' + sf.branches[b] + ')'; }).join(', ') : '';
    var peers = agg(win.filter(function (x) { return brOK(x); })), perStaff = peers.ns ? peers.t / peers.ns : 0;
    h += '<div class="vp-card"><div class="vp-prof"><div class="vp-av">' + esc((sf.name || '?').charAt(0).toUpperCase()) + '</div><div style="flex:1;min-width:200px"><div style="font-size:17px;font-weight:800">' + esc(sf.name) + '</div><div class="vp-sub" style="margin:2px 0 0">' + (sf.code ? 'Emp code <b>' + esc(sf.code) + '</b> · ' : '<b>No emp code recorded</b> · ') + esc(brsTxt) + '</div></div>' +
         '<div style="font-size:12px;color:#5f6368;line-height:1.7">First entry <b>' + dayDMY(sf.first) + '</b><br>Last entry <b>' + dayDMY(sf.last) + '</b>' + (S.branch !== 'All' && perStaff ? '<br>Branch avg / staff <b>' + nfmt(perStaff) + '</b> · this staff ' + chip(growth(A.t, perStaff)) : '') + '</div></div>' +
         (view.some(function (x) { return x.joint; }) ? '<div class="vp-note">ℹ️ Includes ' + view.filter(function (x) { return x.joint; }).length + ' joint entries where two staff logged the visit together — each is credited in full to both.</div>' : '') + '</div>';
  }

  /* KPIs */
  h += '<div class="vp-kpis">' +
    kpi('Total activities', nfmt(A.t), dl(A.t, P && P.t) || '<span>' + nfmt(A.nm) + ' unique mobiles</span>') +
    kpi('Visits', nfmt(A.v), (P ? dl(A.v, P.v) : '<span>' + (A.t ? (A.v / A.t * 100).toFixed(0) : 0) + '% of activity</span>'), 'c-green') +
    kpi('Calls', nfmt(A.c), (P ? dl(A.c, P.c) : '<span>' + (A.t ? (A.c / A.t * 100).toFixed(0) : 0) + '% of activity</span>'), 'c-call') +
    kpi('Interested leads', nfmt(A.int), '<span>' + (A.t ? (A.int / A.t * 100).toFixed(1) : 0) + '% conversion</span>', 'c-teal') +
    kpi('BL (Business Loan)', nfmt(A.bl), P ? dl(A.bl, P.bl) : '<span>product tagged</span>', 'c-purple') +
    kpi('SBL', nfmt(A.sbl), P ? dl(A.sbl, P.sbl) : '<span>product tagged</span>', 'c-purple') +
    kpi('Active days', nfmt(A.nd), '<span>' + (A.nd ? (A.t / A.nd).toFixed(1) : 0) + ' per active day</span>') +
    kpi(S.staff === 'All' ? 'Active staff' : 'Repeat entries', S.staff === 'All' ? nfmt(A.ns) : nfmt(A.rp), S.staff === 'All' ? '<span>' + (A.ns ? (A.t / A.ns).toFixed(0) : 0) + ' entries / staff</span>' : '<span>' + (A.t ? (A.rp / A.t * 100).toFixed(1) : 0) + '% of entries</span>', 'c-red') + '</div>';
  if (A.un && A.un > 0 && !isNaN(V.actStart)) h += '<div class="vp-note" style="margin:-4px 2px 12px">ℹ️ Activity (Visit / Call) and Product (BL / SBL) are captured from <b>' + dayDMY(V.actStart) + '</b> onwards. Earlier entries are counted as Visits and have no product (' + nfmt(A.un) + ' untagged in this selection).</div>';

  /* ---- time series ---- */
  var gran = nDays <= 45 ? 'day' : nDays <= 400 ? 'week' : 'month', buckets = [], bmap = {}, d;
  function bkey(dn){ if (gran === 'day') return dn; if (gran === 'week') return weekStart(dn); var p = dayParts(dn); return monthStart(p.y, p.m); }
  for (d = effFrom; d <= effTo; d++) { var k = bkey(d); if (bmap[k] == null) { bmap[k] = buckets.length; buckets.push({ k: k, v: 0, c: 0, days: 0 }); } buckets[bmap[k]].days++; }
  view.forEach(function (x) { if (x.day < effFrom || x.day > effTo) return; var b = buckets[bmap[bkey(x.day)]]; if (x.act === 'Call') b.c++; else b.v++; });
  buckets.forEach(function (b) { b.t = b.v + b.c; });
  function blabel(b){ if (gran === 'day') return dayShort(b.k); if (gran === 'week') return dayShort(b.k) + '–' + dayShort(b.k + 6); var p = dayParts(b.k); return monthLabel(p.y, p.m); }
  /* verdict: per-calendar-day rate, 2nd half vs 1st half */
  var verdict = null, mid = effFrom + Math.floor(nDays / 2), c1 = 0, c2 = 0;
  view.forEach(function (x) { if (x.day < effFrom || x.day > effTo) return; if (x.day < mid) c1++; else c2++; });
  var r1 = nDays >= 14 ? c1 / (mid - effFrom) : 0, r2 = nDays >= 14 ? c2 / (effTo - mid + 1) : 0, tp = r1 > 0 ? growth(r2, r1) : null;
  if (nDays >= 14 && tp != null) verdict = tp >= 8 ? ['up', '📈 Increasing'] : tp <= -8 ? ['dn', '📉 Decreasing'] : ['fl', '➖ Stable'];
  var mw = gran === 'day' ? 7 : gran === 'week' ? 3 : 0, ma = [];
  buckets.forEach(function (b, ix) { if (!mw) return; var s = 0, n = 0; for (var j = Math.max(0, ix - mw + 1); j <= ix; j++) { s += buckets[j].t / (gran === 'day' ? 1 : 1); n++; } ma.push(s / n); });
  var mxT = Math.max.apply(null, buckets.map(function (b) { return b.t; }).concat(1)), W = 100 / buckets.length, svg = '';
  buckets.forEach(function (b, ix) {
    var x0 = ix * W + W * 0.11, bw = W * 0.78, hv = b.v / mxT * 92, hc = b.c / mxT * 92;
    svg += '<rect x="' + x0.toFixed(2) + '" y="' + (100 - hv).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + hv.toFixed(2) + '" fill="#1a73e8" shape-rendering="crispEdges"/>';
    if (b.c) svg += '<rect x="' + x0.toFixed(2) + '" y="' + (100 - hv - hc).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + hc.toFixed(2) + '" fill="#f29900" shape-rendering="crispEdges"/>';
    svg += '<rect x="' + (ix * W).toFixed(2) + '" y="0" width="' + W.toFixed(2) + '" height="100" fill="transparent"><title>' + esc(blabel(b) + ' — ' + b.t + ' total (' + b.v + ' visits, ' + b.c + ' calls)') + '</title></rect>';
  });
  if (mw && buckets.length > 2) svg += '<polyline fill="none" stroke="#202124" stroke-width="1.6" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" points="' + ma.map(function (v, ix) { return ((ix + .5) * W).toFixed(2) + ',' + (100 - v / mxT * 92).toFixed(2); }).join(' ') + '"/>';
  var chart = '<div class="vp-chart"><span class="mx">' + nfmt(mxT) + '</span><svg viewBox="0 0 100 100" preserveAspectRatio="none">' + svg + '</svg></div><div class="vp-xl"><span>' + blabel(buckets[0]) + '</span><span>' + (buckets.length > 4 ? blabel(buckets[Math.floor(buckets.length / 2)]) : '') + '</span><span>' + blabel(buckets[buckets.length - 1]) + '</span></div>' +
    '<div class="vp-leg"><span><i style="background:#1a73e8"></i>Visits</span><span><i style="background:#f29900"></i>Calls</span>' + (mw ? '<span><i style="background:#202124;height:2px;vertical-align:3px"></i>' + mw + (gran === 'day' ? '-day' : '-week') + ' moving average</span>' : '') + '<span>per ' + gran + '</span></div>';
  h += card('Activity trend ' + (verdict ? '<span class="vp-verdict ' + verdict[0] + '">' + verdict[1] + (tp != null ? ' ' + (tp >= 0 ? '+' : '') + tp.toFixed(0) + '%' : '') + '</span>' : (nDays < 14 ? '<span class="vp-verdict fl">Range too short to judge</span>' : '')),
    nDays >= 14 && tp != null ? 'Daily average moved from <b>' + r1.toFixed(1) + '</b> (' + dayShort(effFrom) + ' – ' + dayShort(mid - 1) + ') to <b>' + r2.toFixed(1) + '</b> (' + dayShort(mid) + ' – ' + dayShort(effTo) + ')' : 'Day-wise / week-wise / month-wise buckets are picked automatically from the date range', chart);

  /* ---- month-over-month ---- */
  var mm = {}, mk = [];
  view.forEach(function (x) { var p = dayParts(x.day), k = p.y * 100 + p.m; if (!mm[k]) { mm[k] = { y: p.y, m: p.m, rows: [] }; mk.push(k); } mm[k].rows.push(x); });
  mk.sort(function (a, b) { return a - b; });
  var mrows = mk.map(function (k, ix) {
    var o = mm[k], a = agg(o.rows), s = monthStart(o.y, o.m), e = monthEnd(o.y, o.m), full = s >= Math.max(from, V.minDay) && e <= Math.min(to, V.maxDay, todayNum() - 1 + 1) && e <= V.maxDay;
    o.a = a; o.full = full; o.label = monthLabel(o.y, o.m); o.perDay = a.t / (Math.min(e, effTo) - Math.max(s, effFrom) + 1); return o;
  });
  var mt = mrows.map(function (o, ix) {
    var pv = ix ? mrows[ix - 1] : null, g = pv ? growth(o.perDay, pv.perDay) : null;
    return '<tr><td class="name">' + o.label + (o.full ? '' : ' <span class="vp-chip warn">partial</span>') + '</td><td>' + nfmt(o.a.v) + '</td><td>' + nfmt(o.a.c) + '</td><td><b>' + nfmt(o.a.t) + '</b></td><td>' + chip(g) + '</td><td>' + o.perDay.toFixed(1) + '</td><td>' + nfmt(o.a.bl) + '</td><td>' + nfmt(o.a.sbl) + '</td><td>' + o.a.nd + '</td><td>' + (o.a.nd ? (o.a.t / o.a.nd).toFixed(1) : '—') + '</td><td>' + nfmt(o.a.int) + '</td></tr>';
  }).join('');

  /* ---- insights ---- */
  var ins = [];
  if (verdict) ins.push({ i: tp >= 8 ? '📈' : tp <= -8 ? '📉' : '➖', c: tp >= 8 ? 'g' : tp <= -8 ? 'r' : '', t: 'Activity is <b>' + (tp >= 8 ? 'increasing' : tp <= -8 ? 'decreasing' : 'stable') + '</b> — daily average ' + r1.toFixed(1) + ' → ' + r2.toFixed(1) + ' (' + (tp >= 0 ? '+' : '') + tp.toFixed(0) + '%) comparing the two halves of the period.' });
  var fullM = mrows.filter(function (o) { return o.full; });
  if (fullM.length >= 2) { var l1 = fullM[fullM.length - 1], l0 = fullM[fullM.length - 2], gm = growth(l1.a.t, l0.a.t); if (gm != null) ins.push({ i: gm >= 0 ? '🗓️' : '🗓️', c: gm >= 0 ? 'g' : 'r', t: '<b>Latest full month ' + l1.label + '</b>: ' + nfmt(l1.a.t) + ' activities, ' + (gm >= 0 ? '▲ ' : '▼ ') + Math.abs(gm).toFixed(1) + '% vs ' + l0.label + ' (' + nfmt(l0.a.t) + ').' }); }
  var byDay = {}; view.forEach(function (x) { byDay[x.day] = (byDay[x.day] || 0) + 1; });
  var bestD = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
  if (bestD) ins.push({ i: '🏆', t: '<b>Best day:</b> ' + dayDMY(+bestD) + ' (' + DAYN[dayParts(+bestD).w] + ') with ' + byDay[bestD] + ' activities.' });
  var wd = [0, 0, 0, 0, 0, 0, 0], wc = [0, 0, 0, 0, 0, 0, 0]; Object.keys(byDay).forEach(function (k) { var w = dayParts(+k).w; wd[w] += byDay[k]; wc[w]++; });
  var bw = -1, bwv = 0; wd.forEach(function (v, w) { if (wc[w] >= 3 && v / wc[w] > bwv) { bwv = v / wc[w]; bw = w; } });
  if (bw > -1) ins.push({ i: '📆', t: '<b>Most productive weekday:</b> ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][bw] + ' (avg ' + bwv.toFixed(1) + ' per active day).' });
  if (A.c) ins.push({ i: '📞', t: '<b>Calls</b> are ' + (A.c / A.t * 100).toFixed(0) + '% of tagged activity (' + nfmt(A.c) + ' calls vs ' + nfmt(A.v) + ' visits).' });
  if (A.bl + A.sbl) ins.push({ i: '🏷️', t: 'Product mix: <b>BL ' + nfmt(A.bl) + '</b> (' + (A.bl / (A.bl + A.sbl) * 100).toFixed(0) + '%) · <b>SBL ' + nfmt(A.sbl) + '</b> (' + (A.sbl / (A.bl + A.sbl) * 100).toFixed(0) + '%).' });

  /* ---- drill-down table (branch-wise or staff-wise) ---- */
  var dimHTML = '';
  if (S.staff === 'All') {
    var byBranch = S.branch === 'All', gmap = {}, wkList = []; buckets.length && (function () { for (d = effFrom; d <= effTo; d++) { var w = weekStart(d); if (wkList[wkList.length - 1] !== w) wkList.push(w); } })();
    var wIdx = {}; wkList.forEach(function (w, ix) { wIdx[w] = ix; });
    view.forEach(function (x) {
      var keys = byBranch ? [x.b] : x.s;
      keys.forEach(function (k) {
        var o = gmap[k] = gmap[k] || { key: k, rows: [], ser: wkList.map(function () { return 0; }), h1: 0, h2: 0 };
        o.rows.push(x); if (x.day >= effFrom && x.day <= effTo) { o.ser[wIdx[weekStart(x.day)]]++; if (x.day < mid) o.h1++; else o.h2++; }
      });
    });
    var dl2 = Object.keys(gmap).map(function (k) {
      var o = gmap[k], a = agg(o.rows), r1_ = nDays >= 14 ? o.h1 / (mid - effFrom) : 0, r2_ = nDays >= 14 ? o.h2 / (effTo - mid + 1) : 0;
      return { key: k, name: byBranch ? titleCase(k) : (V.staff[k] ? V.staff[k].name : k), code: byBranch ? '' : (V.staff[k] ? V.staff[k].code : ''), br: byBranch ? '' : (V.staff[k] ? titleCase(V.staff[k].home) : ''), total: a.t, v: a.v, c: a.c, bl: a.bl, sbl: a.sbl, nd: a.nd, avg: a.nd ? a.t / a.nd : 0, intp: a.t ? a.int / a.t * 100 : 0, ns: a.ns, rp: a.rp, last: a.last,
               trend: (nDays >= 14 && o.h1 >= 10) ? growth(r2_, r1_) : null, newish: nDays >= 14 && o.h1 < 10 && o.h2 >= 10, ser: o.ser };
    });
    var cur = S.sort[byBranch ? 'bvis' : 'svis'], tkey = byBranch ? 'bvis' : 'svis';
    dl2 = sortBy(dl2, cur);
    var mxTot = Math.max.apply(null, dl2.map(function (r) { return r.total; }).concat(1));
    /* extra insights from the table */
    if (dl2.length > 1) {
      var tops = dl2.slice().sort(function (a, b) { return b.total - a.total; });
      ins.push({ i: '🥇', t: '<b>Top ' + (byBranch ? 'branch' : 'staff') + ':</b> ' + esc(tops[0].name) + (tops[0].code ? ' (' + tops[0].code + ')' : '') + ' with ' + nfmt(tops[0].total) + ' activities (' + (tops[0].total / A.t * 100).toFixed(0) + '% of total).' });
      var tr = dl2.filter(function (r) { return r.trend != null && r.total >= 20; }).sort(function (a, b) { return b.trend - a.trend; });
      if (tr.length > 1) {
        if (tr[0].trend >= 8) ins.push({ i: '🚀', c: 'g', t: '<b>Rising:</b> ' + tr.slice(0, 3).filter(function (r) { return r.trend >= 8; }).map(function (r) { return esc(r.name) + ' (+' + r.trend.toFixed(0) + '%)'; }).join(', ') + ' — 2nd-half daily rate vs 1st half.' });
        var fall = tr.slice().reverse().filter(function (r) { return r.trend <= -8; }).slice(0, 3);
        if (fall.length) ins.push({ i: '🔻', c: 'r', t: '<b>Slowing down:</b> ' + fall.map(function (r) { return esc(r.name) + ' (' + r.trend.toFixed(0) + '%)'; }).join(', ') + '.' });
      }
      var quiet = dl2.filter(function (r) { return r.total >= 10 && r.last < effTo - 6 && effTo - effFrom >= 14; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
      if (quiet.length) ins.push({ i: '🔕', c: 'a', t: '<b>Gone quiet (no entry in the last 7 days of the period):</b> ' + quiet.map(function (r) { return esc(r.name) + ' (last ' + dayShort(r.last) + ')'; }).join(', ') + '.' });
      var cv = dl2.filter(function (r) { return r.total >= 30; }).sort(function (a, b) { return b.intp - a.intp; })[0];
      if (cv) ins.push({ i: '🎯', t: '<b>Best conversion:</b> ' + esc(cv.name) + ' — ' + cv.intp.toFixed(1) + '% of entries marked Interested (group ' + (A.t ? (A.int / A.t * 100).toFixed(1) : 0) + '%).' });
    }
    dimHTML = card((byBranch ? 'Branch-wise activity' : 'Staff-wise activity') + ' <span class="vp-chip vp-na">' + dl2.length + '</span>', (byBranch ? 'Tap a branch to see its staff' : 'Tap a staff name to see their date-wise activity') + ' · trend = 2nd-half vs 1st-half daily rate',
      '<div class="vp-tw"><table class="vp-t"><thead><tr>' + th(byBranch ? 'Branch' : 'Staff', 'name', tkey, cur, 1) + (byBranch ? th('Staff', 'ns', tkey, cur) : th('Branch', 'br', tkey, cur, 1)) + th('Total', 'total', tkey, cur) + th('Visits', 'v', tkey, cur) + th('Calls', 'c', tkey, cur) + th('BL', 'bl', tkey, cur) + th('SBL', 'sbl', tkey, cur) + th('Active days', 'nd', tkey, cur) + th('Avg/day', 'avg', tkey, cur) + th('Interested', 'intp', tkey, cur) + th('Repeat', 'rp', tkey, cur) + th('Trend', 'trend', tkey, cur) + '<th>Weekly</th>' + th('Last active', 'last', tkey, cur) + '</tr></thead><tbody>' +
      dl2.map(function (r) {
        return '<tr><td class="name"><a class="vp-lnk" data-act="' + (byBranch ? 'branch' : 'staff') + '" data-v="' + esc(r.key) + '">' + esc(r.name) + '</a>' + (r.code ? ' <span style="color:#9aa0a6;font-weight:500;font-size:11px">' + esc(r.code) + '</span>' : '') + '</td>' + (byBranch ? '<td>' + r.ns + '</td>' : '<td class="l">' + esc(r.br) + '</td>') + '<td><b>' + nfmt(r.total) + '</b><span class="bar" style="width:' + Math.max(2, r.total / mxTot * 40).toFixed(0) + 'px"></span></td><td>' + nfmt(r.v) + '</td><td>' + nfmt(r.c) + '</td><td>' + nfmt(r.bl) + '</td><td>' + nfmt(r.sbl) + '</td><td>' + r.nd + '</td><td>' + r.avg.toFixed(1) + '</td><td>' + r.intp.toFixed(1) + '%</td><td>' + nfmt(r.rp) + '</td><td>' + (r.newish ? '<span class="vp-chip vp-new">NEW</span>' : chip(r.trend)) + '</td><td>' + spark(r.ser) + '</td><td>' + dayShort(r.last) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (!byBranch && view.some(function (x) { return x.joint; }) ? '<div class="vp-note">Joint entries (two staff on one visit) are credited to both staff, so staff rows can add up to slightly more than the branch total.</div>' : ''));
  }

  h += card('💡 Insights', 'Auto-generated from the current filters', insights(ins));
  h += card('Month-over-month', 'MoM compares <b>average per day</b> so part-months are fair · partial = month not fully inside the selected dates / data', '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Month</th><th>Visits</th><th>Calls</th><th>Total</th><th>MoM (per day)</th><th>Per day</th><th>BL</th><th>SBL</th><th>Active days</th><th>Avg / active day</th><th>Interested</th></tr></thead><tbody>' + mt + '</tbody></table></div>');
  h += dimHTML;

  /* ---- date-wise ---- */
  var dm = {}; view.forEach(function (x) { var o = dm[x.day] = dm[x.day] || []; o.push(x); });
  var dkeys = Object.keys(dm).map(Number).sort(function (a, b) { return b - a; });
  var drows = dkeys.map(function (k) { var a = agg(dm[k]); return { day: k, a: a }; });
  var mxd = Math.max.apply(null, drows.map(function (r) { return r.a.t; }).concat(1)), showUn = A.un > 0 && A.un < A.t;
  LAST.dateRows = [['Date', 'Day', 'Visits', 'Calls', 'BL', 'SBL', 'Untagged product', 'Total', 'Interested', 'Repeat (duplicate) entries']].concat(drows.map(function (r) { return [dayIso(r.day), DAYN[dayParts(r.day).w], r.a.v, r.a.c, r.a.bl, r.a.sbl, r.a.un, r.a.t, r.a.int, r.a.rp]; }));
  var shown = drows.slice(0, S.dateShown);
  h += card('Date-wise activity <span class="vp-chip vp-na">' + drows.length + ' active days</span>', 'Newest first · no individual entries, only the day totals' +
    ' &nbsp;<button class="vp-x" data-act="csv" data-v="date">⬇ CSV</button>',
    '<div class="vp-tw"><table class="vp-t"><thead><tr><th>Date</th><th>Day</th><th>Visits</th><th>Calls</th><th>BL</th><th>SBL</th>' + (showUn ? '<th>No product</th>' : '') + '<th>Total</th><th>Interested</th><th>Repeat</th></tr></thead><tbody>' +
    shown.map(function (r) { var a = r.a; return '<tr><td class="name">' + dayDMY(r.day) + '</td><td>' + DAYN[dayParts(r.day).w] + '</td><td>' + a.v + '</td><td>' + a.c + '</td><td>' + a.bl + '</td><td>' + a.sbl + '</td>' + (showUn ? '<td>' + a.un + '</td>' : '') + '<td><b>' + a.t + '</b><span class="bar" style="width:' + Math.max(2, a.t / mxd * 50).toFixed(0) + 'px"></span></td><td>' + a.int + '</td><td>' + (a.rp ? '<span class="vp-chip warn">' + a.rp + '</span>' : '·') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    (drows.length > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="vp-btn ghost" data-act="moredates">Show 31 more days (' + (drows.length - shown.length) + ' left)</button></div>' : ''));

  h += dupSection(view, dup, A);
  return h;
}

/* ════════════════════════════════════════
   DUPLICATES — same mobile number logged more than once
════════════════════════════════════════ */
function computeDups(view){
  var V = S.V, from = S.from, to = S.to, map = {}, i, x, groups = [], hist = S.dupScope === 'hist';
  for (i = 0; i < V.rows.length; i++) {
    x = V.rows[i]; if (!x.mobOk || x.day > to) continue; if (!hist && x.day < from) continue;
    (map[x.mob] = map[x.mob] || []).push(x);
  }
  var inView = {}; view.forEach(function (r) { inView[r.i] = 1; });
  Object.keys(map).forEach(function (m) {
    var g = map[m]; if (g.length < 2) return;
    var iv = g.filter(function (r) { return inView[r.i]; });
    if (!iv.length) return;
    iv.forEach(function (r) { if (r !== g[0]) r._rp = 1; });
    var brs = uniq(g.map(function (r) { return r.b; })), sts = uniq(g.reduce(function (a, r) { return a.concat(r.s); }, []));
    var shopC = {}; g.forEach(function (r) { var k = (r.shop || r.own || '').toUpperCase(); if (k) shopC[k] = (shopC[k] || 0) + 1; });
    var topShop = Object.keys(shopC).sort(function (a, b) { return shopC[b] - shopC[a]; })[0] || '';
    var shopRaw = ''; for (var q = 0; q < g.length; q++) { if ((g[q].shop || g[q].own || '').toUpperCase() === topShop) { shopRaw = g[q].shop || g[q].own; break; } }
    groups.push({ mob: m, rows: g, n: g.length, brs: brs, sts: sts, v: g.filter(function (r) { return r.act === 'Visit'; }).length, c: g.filter(function (r) { return r.act === 'Call'; }).length,
      first: g[0].day, last: g[g.length - 1].day, shop: shopRaw, st: g[g.length - 1].st,
      type: brs.length > 1 ? 'branch' : sts.length > 1 ? 'staff' : 'same' });
  });
  groups.sort(function (a, b) { return b.n - a.n || b.last - a.last; });
  return groups;
}
var ST_TXT = { int: 'Interested', fu: 'Follow-up', ni: 'Not interested', ot: '—' };
var TYPE_TAG = { same: ['SAME STAFF', 's'], staff: ['CROSS-STAFF', 'a'], branch: ['CROSS-BRANCH', 'r'] };

function dupSection(view, groups, A){
  var V = S.V, rp = view.filter(function (x) { return x._rp; }), bad = view.filter(function (x) { return !x.mobOk; }).length;
  var cnt = { same: 0, staff: 0, branch: 0 }; groups.forEach(function (g) { cnt[g.type]++; });
  var ra = agg(rp);
  LAST.dupRows = [['Mobile', 'Date', 'Branch', 'Staff', 'Activity', 'Product', 'Status', 'Shop', 'Owner', 'Times logged', 'Repeat entry?']];
  groups.forEach(function (g) { g.rows.forEach(function (r, ix) { LAST.dupRows.push([g.mob, dayIso(r.day), r.b, r.s.map(staffName).join(' + '), r.act, r.prod, ST_TXT[r.st], r.shop, r.own, g.n, ix ? 'Yes' : 'First']); }); });
  var h = '<div class="vp-sec red">Duplicate activity · same mobile number logged more than once</div>';
  var scope = '<div class="vp-seg" style="margin-bottom:10px"><button data-act="dupscope" data-v="range" class="' + (S.dupScope === 'range' ? 'on' : '') + '">Within selected dates</button><button data-act="dupscope" data-v="hist" class="' + (S.dupScope === 'hist' ? 'on' : '') + '">Also match earlier history</button></div>';
  if (!groups.length) return h + '<div class="vp-card vp-dup">' + scope + '<div class="vp-empty" style="padding:18px"><b>No repeated mobile numbers</b>in this selection' + (bad ? '<br><span style="font-size:12px">' + bad + ' entries with dummy / invalid numbers were ignored.</span>' : '') + '</div></div>';
  h += '<div class="vp-card vp-dup"><div class="vp-h">Repeat-entry summary</div><div class="vp-sub">A repeat entry is any 2nd, 3rd… time the same valid mobile number is logged' + (S.dupScope === 'hist' ? ' (earlier history also checked)' : ' within the selected dates') + '. Dummy numbers such as 1234567890 / 0000000000 are excluded.</div>' + scope +
    '<div class="vp-kpis k5" style="margin-bottom:0">' + kpi('Mobiles repeated', nfmt(groups.length), '<span>' + nfmt(groups.reduce(function (s, g) { return s + g.n; }, 0)) + ' entries in total</span>', 'c-red') +
    kpi('Repeat entries', nfmt(rp.length), '<span>' + (A.t ? (rp.length / A.t * 100).toFixed(1) : 0) + '% of all entries</span>', 'c-red') +
    kpi('Repeat visits / calls', nfmt(ra.v) + ' / ' + nfmt(ra.c), '<span>BL ' + nfmt(ra.bl) + ' · SBL ' + nfmt(ra.sbl) + '</span>', 'c-call') +
    kpi('Same-staff re-logs', nfmt(cnt.same), '<span>one staff, same number again</span>', 'c-purple') +
    kpi('Overlap: staff / branch', cnt.staff + ' / ' + cnt.branch, '<span>different staff · different branches</span>', 'c-teal') + '</div>' +
    (bad ? '<div class="vp-note">' + bad + ' entries in this selection carry a dummy / invalid mobile number and are not counted as duplicates — worth correcting at source.</div>' : '') + '</div>';

  /* who logs the most repeats */
  var byB = S.branch === 'All', dm = {}, tot = {};
  view.forEach(function (x) { (byB ? [x.b] : x.s).forEach(function (k) { tot[k] = (tot[k] || 0) + 1; if (x._rp) dm[k] = (dm[k] || 0) + 1; }); });
  var dl = Object.keys(dm).map(function (k) { return { n: byB ? titleCase(k) : staffName(k), v: dm[k], x: (dm[k] / tot[k] * 100).toFixed(0) + '% of entries' }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
  /* repeats by date */
  var dd = {}; rp.forEach(function (x) { (dd[x.day] = dd[x.day] || []).push(x); });
  var dk = Object.keys(dd).map(Number).sort(function (a, b) { return b - a; });
  h += '<div class="vp-two">' + card('Where repeats come from', byB ? 'Branches with most repeat entries' : 'Staff with most repeat entries', dl.length ? hbars(dl, nfmt) : '<div class="vp-sub">None.</div>', 'vp-dup') +
    card('Repeat entries by date', 'Latest 12 days with repeats · separate from the main date-wise table', '<div class="vp-tw nomax"><table class="vp-t"><thead><tr><th>Date</th><th>Repeats</th><th>Visits</th><th>Calls</th><th>BL</th><th>SBL</th></tr></thead><tbody>' +
      dk.slice(0, 12).map(function (k) { var a = agg(dd[k]); return '<tr><td class="name">' + dayDMY(k) + '</td><td><b>' + a.t + '</b></td><td>' + a.v + '</td><td>' + a.c + '</td><td>' + a.bl + '</td><td>' + a.sbl + '</td></tr>'; }).join('') + '</tbody></table></div>', 'vp-dup') + '</div>';

  h += '<div class="vp-card vp-dup"><div class="vp-h">Repeated mobile numbers <span class="vp-chip vp-na">' + groups.length + '</span> <button class="vp-x" data-act="csv" data-v="dup">⬇ CSV (all occurrences)</button></div><div class="vp-sub">Most repeated first · tap ▸ to see each occurrence</div>' +
    '<div class="form-group" style="margin-bottom:10px"><input id="vp-dupq" type="search" inputmode="numeric" placeholder="Search a mobile number…" value="' + esc(S.dupQ || '') + '" style="max-width:280px;padding:8px 10px;font-size:13px"></div><div id="vp-duplist">' + dupList(groups) + '</div></div>';
  S._groups = groups;
  return h;
}
function dupList(groups){
  var q = String(S.dupQ || '').replace(/\D/g, ''), list = q ? groups.filter(function (g) { return g.mob.indexOf(q) > -1; }) : groups;
  if (!list.length) return '<div class="vp-sub">No repeated number matches “' + esc(q) + '”.</div>';
  var shown = list.slice(0, S.dupShown);
  return '<div class="vp-tw"><table class="vp-t"><thead><tr><th>Mobile</th><th>Times</th><th>Type</th><th class="l">Branch(es)</th><th class="l">Staff</th><th>First</th><th>Last</th><th>V / C</th><th class="l">Shop / owner</th><th>Last status</th></tr></thead><tbody>' +
    shown.map(function (g) {
      var open = S.dupOpen[g.mob], tg = TYPE_TAG[g.type];
      var row = '<tr><td class="name"><button class="vp-x" data-act="dupopen" data-v="' + g.mob + '">' + (open ? '▾' : '▸') + ' ' + g.mob + '</button></td><td><b>' + g.n + '</b></td><td><span class="vp-tag ' + tg[1] + '">' + tg[0] + '</span></td><td class="l" style="white-space:normal;min-width:110px">' + g.brs.map(titleCase).join(', ') + '</td><td class="l" style="white-space:normal;min-width:130px">' + esc(g.sts.slice(0, 3).map(function (k) { return S.V.staff[k] ? S.V.staff[k].name : k; }).join(', ') + (g.sts.length > 3 ? ' +' + (g.sts.length - 3) : '')) + '</td><td>' + dayShort(g.first) + '</td><td>' + dayShort(g.last) + '</td><td>' + g.v + ' / ' + g.c + '</td><td class="l" style="white-space:normal;min-width:120px">' + esc(g.shop || '—') + '</td><td>' + ST_TXT[g.st] + '</td></tr>';
      if (open) row += '<tr class="sub"><td colspan="10" style="text-align:left;padding:8px 14px 12px 34px;white-space:normal"><table class="vp-t" style="font-size:12px"><thead><tr><th class="l" style="position:static">Date</th><th class="l">Branch</th><th class="l">Staff</th><th class="l">Activity</th><th class="l">Product</th><th class="l">Status</th><th class="l">Shop</th></tr></thead><tbody>' +
        g.rows.map(function (r, ix) { return '<tr><td class="l" style="position:static">' + dayDMY(r.day) + (ix ? '' : ' <span class="vp-tag n">FIRST</span>') + '</td><td class="l">' + titleCase(r.b) + '</td><td class="l">' + esc(r.s.map(function (k) { return S.V.staff[k] ? S.V.staff[k].name : k; }).join(' + ')) + '</td><td class="l">' + r.act + '</td><td class="l">' + (r.prod || '—') + '</td><td class="l">' + ST_TXT[r.st] + '</td><td class="l">' + esc(r.shop || '—') + '</td></tr>'; }).join('') + '</tbody></table></td></tr>';
      return row;
    }).join('') + '</tbody></table></div>' + (list.length > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="vp-btn ghost" data-act="moredups">Show 25 more (' + (list.length - shown.length) + ' left)</button></div>' : '');
}

/* ════════════════════════════════════════
   SHELL — login, filters, tabs, events
════════════════════════════════════════ */
function mount(){
  var root = $('vp-root'); if (!root) return;
  injectCSS();
  root.innerHTML = '<div class="vp"><div class="vp-login"><div class="vp-lock">🔒</div><b>VP Dashboard</b><p>Enter the VP password to view OS, TA and Visit insights.</p>' +
    '<input type="password" id="vp-pass" placeholder="Password" autocomplete="off"><button class="vp-btn" style="width:100%" data-act="login">Unlock</button><div id="vp-loginerr" class="vp-err" style="display:none"></div></div></div>';
  var pw = $('vp-pass'); if (pw) pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
}
function doLogin(){
  var v = $('vp-pass').value.trim(), err = $('vp-loginerr');
  if (v === VP_PASS) { S.ok = true; renderApp(); load(); }
  else { err.textContent = '❌ Incorrect password.'; err.style.display = 'block'; $('vp-pass').select(); }
}
function renderApp(){
  $('vp-root').innerHTML = '<div class="vp"><div class="vp-top"><div><h1>📈 VP Dashboard</h1><small id="vp-meta">Loading data…</small></div><div class="vp-tact"><button class="vp-btn ghost" data-act="refresh">⟳ Refresh</button><button class="vp-btn ghost" data-act="logout">Logout</button></div></div>' +
    '<div class="vp-tabs"><button data-act="tab" data-v="os">🏦 OS<small>Outstanding</small></button><button data-act="tab" data-v="ta">🚗 TA<small>Travel allowance</small></button><button data-act="tab" data-v="visit">📍 Visit<small>Visits · calls · duplicates</small></button></div>' +
    '<div class="vp-filters" id="vp-filters"></div><div id="vp-body"><div class="vp-load"><div class="sp"></div>Loading…</div></div></div>';
  buildFilters();
}
function branchList(){
  var l = CANON.slice(); if (S.T) l = l.concat(S.T.branches); if (S.V) l = l.concat(S.V.branches);
  return uniq(l).sort();
}
function staffOptions(){
  var V = S.V, ok = false, html = '<option value="All">All staff</option>';
  if (!V) return html;
  Object.keys(V.staff).map(function (k) { return V.staff[k]; })
    .filter(function (s) { return S.branch === 'All' || s.branches[S.branch]; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (s) {
      if (s.key === S.staff) ok = true;
      html += '<option value="' + esc(s.key) + '"' + (s.key === S.staff ? ' selected' : '') + '>' + esc(s.label) + (S.branch === 'All' ? ' — ' + titleCase(s.home) : ' (' + s.branches[S.branch] + ')') + '</option>';
    });
  if (!ok) S.staff = 'All';
  return html;
}
function buildFilters(){
  var f = $('vp-filters'); if (!f) return;
  var bo = '<option value="All">All branches</option>' + branchList().map(function (b) { return '<option value="' + esc(b) + '"' + (b === S.branch ? ' selected' : '') + '>' + esc(titleCase(b)) + '</option>'; }).join('');
  f.innerHTML = '<div class="vp-fgrid"><div><label>Branch</label><select id="vp-branch">' + bo + '</select></div>' +
    '<div><label>From</label><input type="date" id="vp-from" value="' + (isNaN(S.from) ? '' : dayIso(S.from)) + '"></div>' +
    '<div><label>To</label><input type="date" id="vp-to" value="' + (isNaN(S.to) ? '' : dayIso(S.to)) + '"></div>' +
    '<div id="vp-staffwrap"><label>Staff (tagged)</label><select id="vp-staff">' + staffOptions() + '</select></div></div>' +
    '<div class="vp-chips"><button data-act="range" data-v="month">This month</button><button data-act="range" data-v="last">Last month</button><button data-act="range" data-v="l3">Last 3 months</button><button data-act="range" data-v="fy">FY to date</button><button data-act="range" data-v="all">All data</button></div>';
}
function syncFilters(){
  var b = $('vp-branch'), s = $('vp-staff'), a = $('vp-from'), z = $('vp-to');
  if (b) b.value = S.branch;
  if (s) s.innerHTML = staffOptions();
  if (a) a.value = isNaN(S.from) ? '' : dayIso(S.from);
  if (z) z.value = isNaN(S.to) ? '' : dayIso(S.to);
}
function dataBounds(){
  var mn = [], mx = [], t = todayNum();
  if (S.V && S.V.rows.length) { mn.push(S.V.minDay); mx.push(S.V.maxDay); }
  if (S.T) { mn.push(S.T.months[0].start); mx.push(S.T.months[S.T.months.length - 1].end); }
  return { min: mn.length ? Math.min.apply(null, mn) : t - 90, max: Math.min(t, mx.length ? Math.max.apply(null, mx) : t) };
}
function setRange(kind){
  var t = todayNum(), p = dayParts(t), b = dataBounds(), a, z;
  if (kind === 'month') { a = monthStart(p.y, p.m); z = t; }
  else if (kind === 'last') { var py = p.m === 1 ? p.y - 1 : p.y, pm = p.m === 1 ? 12 : p.m - 1; a = monthStart(py, pm); z = monthEnd(py, pm); }
  else if (kind === 'l3') { var t3 = p.y * 12 + p.m - 1 - 2; a = monthStart(Math.floor(t3 / 12), t3 % 12 + 1); z = t; }
  else if (kind === 'fy') { a = monthStart(p.m >= 4 ? p.y : p.y - 1, 4); z = t; }
  else { a = b.min; z = b.max; }
  S.from = a; S.to = z; syncFilters();
}
function paint(){
  var body = $('vp-body'); if (!body) return;
  var meta = $('vp-meta');
  document.querySelectorAll('#vp-root .vp-tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === S.tab); });
  var sw = $('vp-staffwrap'); if (sw) sw.style.display = S.tab === 'visit' ? '' : 'none';
  if (meta) {
    var parts = [];
    if (S.T) parts.push('OS / TA: ' + S.T.months[0].label + ' → ' + S.T.months[S.T.months.length - 1].label);
    if (S.V) parts.push('Visits: ' + dayDMY(S.V.minDay) + ' → ' + dayDMY(S.V.maxDay) + ' · ' + nfmt(S.V.rows.length) + ' entries');
    meta.textContent = S.loading ? 'Loading data…' : (parts.join('  ·  ') || 'No data') + (S.loadedAt ? '  ·  updated ' + p2(S.loadedAt.getHours()) + ':' + p2(S.loadedAt.getMinutes()) : '');
  }
  if (S.loading) { body.innerHTML = '<div class="vp-load"><div class="sp"></div>Fetching the latest sheet data…</div>'; return; }
  try { body.innerHTML = S.tab === 'os' ? renderOS() : S.tab === 'ta' ? renderTA() : renderVisit(); }
  catch (e) { console.error('VP render error', e); body.innerHTML = '<div class="vp-card"><div class="vp-empty"><b>Something went wrong while building this view</b>' + esc(e.message || e) + '</div></div>'; }
}
function load(){
  S.loading = true; paint();
  var p1 = fetchCSV(TLOS_CSV).then(buildTlos).then(function (t) { S.T = t; S.errT = ''; }).catch(function (e) { S.T = null; S.errT = 'tlos tab: ' + (e.message || e); console.error(e); });
  var p2_ = fetchCSV(SHEET1_CSV).then(buildVisits).then(function (v) { S.V = v; S.errV = ''; }).catch(function (e) { S.V = null; S.errV = 'Sheet1 tab: ' + (e.message || e); console.error(e); });
  Promise.all([p1, p2_]).then(function () {
    S.loading = false; S.loadedAt = new Date();
    if (isNaN(S.from) || isNaN(S.to)) setRange('all');
    buildFilters(); paint();
  });
}

/* ───── events (delegated) ───── */
function onClick(e){
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el || !$('vp-root').contains(el)) return;
  var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
  switch (act) {
    case 'login': doLogin(); break;
    case 'logout': S.ok = false; S.T = S.V = null; S.loaded = false; S.branch = 'All'; S.staff = 'All'; S.from = S.to = NaN; mount(); break;
    case 'refresh': load(); break;
    case 'tab': S.tab = v; paint(); break;
    case 'taview': S.ta = v; paint(); break;
    case 'range': setRange(v); paint(); break;
    case 'latest': if (S.T) { var m = S.T.months[S.T.months.length - 1]; S.from = m.start; S.to = m.end; syncFilters(); paint(); } break;
    case 'branch': S.branch = v; S.staff = 'All'; syncFilters(); paint(); scrollTop_(); break;
    case 'staff': S.staff = v; syncFilters(); paint(); scrollTop_(); break;
    case 'sort': {
      var tb = el.getAttribute('data-tbl'), k = el.getAttribute('data-k'), cur = S.sort[tb], asc = ['name', 'b', 'br', 'tagS', 'bs', 'staff'].indexOf(k) > -1;
      S.sort[tb] = (cur.k === k) ? { k: k, d: -cur.d } : { k: k, d: asc ? 1 : -1 }; paint(); break;
    }
    case 'moredates': S.dateShown += 31; paint(); break;
    case 'moredups': S.dupShown += 25; $('vp-duplist').innerHTML = dupList(S._groups || []); break;
    case 'dupopen': S.dupOpen[v] = !S.dupOpen[v]; $('vp-duplist').innerHTML = dupList(S._groups || []); break;
    case 'dupscope': S.dupScope = v; S.dupShown = 25; S.dupOpen = {}; paint(); break;
    case 'csv': downloadCSV(v === 'dup' ? 'VP_duplicate_mobiles.csv' : 'VP_date_wise_activity.csv', v === 'dup' ? LAST.dupRows : LAST.dateRows); break;
  }
}
function scrollTop_(){ var f = $('vp-filters'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function onChange(e){
  var id = e.target.id;
  if (id === 'vp-branch') { S.branch = e.target.value; S.staff = 'All'; syncFilters(); paint(); }
  else if (id === 'vp-staff') { S.staff = e.target.value; paint(); }
  else if (id === 'vp-from' || id === 'vp-to') {
    var a = isoToDay($('vp-from').value), z = isoToDay($('vp-to').value);
    if (isNaN(a) || isNaN(z)) return;
    if (a > z) { var t = a; a = z; z = t; }
    S.from = a; S.to = z; syncFilters(); paint();
  }
}
function onInput(e){
  if (e.target.id === 'vp-dupq') { S.dupQ = e.target.value; S.dupShown = 25; $('vp-duplist').innerHTML = dupList(S._groups || []); }
}

var root = $('vp-root');
if (root) {
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  mount();
}
})();
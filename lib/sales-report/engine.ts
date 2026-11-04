// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* Sale report engine – pure logic, shared by the web tool and the test harness. */
const SaleEngine = (() => {
  'use strict';
  const EPOCH = Date.UTC(1899, 11, 30);
  const DAY = 86400000;
  const isoToSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY); };
  const serialToDate = (s) => new Date(EPOCH + s * DAY);
  const serialToISO = (s) => serialToDate(s).toISOString().slice(0, 10);
  const weekday = (s) => serialToDate(s).getUTCDay(); // 0 = Sunday
  const eomSerial = (s) => { const d = serialToDate(s); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) - EPOCH) / DAY); };
  const somSerial = (s) => { const d = serialToDate(s); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - EPOCH) / DAY); };
  const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  // A report row can collect several Final Merchant names, separated by commas: "Nathali / Venushka, Venushka"
  const keyNames = (key) => String(key == null ? '' : key).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const sumKey = (map, key) => {
    let out = null;
    for (const k of keyNames(key)) {
      const v = map.get(k); if (v === undefined) continue;
      if (Array.isArray(v)) { out = out || [0, 0]; out[0] += v[0]; out[1] += v[1]; } else out = (out || 0) + v;
    }
    return out;
  };
  const norm = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const low = (v) => norm(v).toLowerCase();

  const REQUIRED = ['INVOICE_NO', 'ERP_INVOICE_ID', 'SOURCE_NAME', 'GRAND_TOTAL', 'INVOICE_DATE', 'COUPON_CODE', 'STATUS',
    'POS_WAREHOUSE', 'POS_SALE', 'CREATED_BY'];

  /* ---------- dates & working days ---------- */
  // Remaining days from the report making day to month end.
  // Outlets: every day except company leave days. Pepiliyana: no Sunday, Poya or leave day.
  // Online: Mon-Fri 1, Saturday 1/2, no Sunday, Poya or leave day.
  function computeDays(makingSerial, poyaISO, leaveISO, rangeStartSerial) {
    const valid = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.trim());
    const poya = new Set((poyaISO || []).filter(valid).map((x) => isoToSerial(x.trim())));
    const leave = new Set((leaveISO || []).filter(valid).map((x) => isoToSerial(x.trim())));
    const report = makingSerial;
    const start = rangeStartSerial || somSerial(report), eom = eomSerial(report);
    let outlet = 0, pep = 0, online = 0, leaveLeft = 0;
    for (let s = makingSerial + 1; s <= eom; s++) {
      if (leave.has(s)) { leaveLeft++; continue; }
      outlet += 1;
      const w = weekday(s);
      if (w === 0 || poya.has(s)) continue;
      pep += 1; online += (w === 6 ? 0.5 : 1);
    }
    const d = serialToDate(report);
    return {
      making: makingSerial, report, monthStart: start, eom,
      dayNo: report - start + 1, daysInMonth: report - start + 1,
      remDays: outlet, pepDays: pep, onlineDays: online, leaveLeft,
      monthName: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(),
    };
  }

  /* ---------- reading the dump ---------- */
  function findHeader(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 10); r++) {
      const row = (aoa[r] || []).map(norm);
      if (REQUIRED.every((h) => row.includes(h))) return r;
    }
    return -1;
  }
  function toSerial(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Math.floor(v);
    if (v instanceof Date) return Math.floor((Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - EPOCH) / DAY);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH) / DAY);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - EPOCH) / DAY);
    return null;
  }
  const num = (v) => { if (v === null || v === undefined || v === '') return 0; const n = Number(v); return isFinite(n) ? n : 0; };

  /* ---------- merchant rules ---------- */
  const nos = (v) => low(v).replace(/\s+/g, '');
  // keyword in a coupon (spaces / capitals ignored). A keyword ending in a digit must not run on into another digit:
  // "WH-1" finds "WH-1,WHA20" but not "WH-10"; "PALMERS" still finds "PALMERS25".
  const hasKw = (text, kw) => { if (!kw) return false; let i = text.indexOf(kw);
    while (i >= 0) { const nx = text.charAt(i + kw.length); if (!(/\d$/.test(kw) && /\d/.test(nx))) return true; i = text.indexOf(kw, i + 1); } return false; };
  function makeRules(S) {
    const lc = (pairs) => { const m = new Map(); for (const p of pairs) { const k = low(p[0]); if (k && !m.has(k)) m.set(k, norm(p[1])); } return m; };
    // MER number fallback (Shopify coupons carry only "MER97"): MER97 -> name of "MER97-Sachini";
    // a variant ending in "-C" (e.g. MER84-Kanchana-C) is used only if it is the only code for that number.
    const merNum = new Map();
    const pairs = S.mer.map((p) => [norm(p[0]), norm(p[1])]).filter((p) => p[0] && p[1]);
    for (const pass of [false, true]) for (const [code, name] of pairs) {
      const m = /^(MER\d+)/i.exec(code); if (!m) continue;
      const isC = /-\s*C\s*$/i.test(code); if (isC !== pass) continue;
      const k = m[1].toLowerCase(); if (!merNum.has(k)) merNum.set(k, name);
    }
    return {
      merNum,
      mer: lc(S.mer), ship: lc(S.ship), email: lc(S.email), override: lc(S.override),
      // keywords match without spaces and case: "Maheshi-WH-1" finds "MER95-Maheshi - WH-1"
      specialFirst: S.special.filter((x) => low(x[0]) && low(x[2]) === 'yes').map((x) => [nos(x[0]), norm(x[1])]),
      specialAll: S.special.filter((x) => low(x[0])).map((x) => [nos(x[0]), norm(x[1])]),
      shopifyDefault: norm(S.shopifyDefault), staffKeyword: low(S.staffKeyword),
      exclude: new Set(S.excludeStatus.map(low).filter(Boolean)),
    };
  }
  function finalMerchant(coupon, source, createdBy, invoice, R) {
    const c = norm(coupon), cl = c.toLowerCase().replace(/\s+/g, '');
    if (invoice && R.override.has(low(invoice))) return [R.override.get(low(invoice)), 'Invoice override'];
    for (const [k, n] of R.specialFirst) if (hasKw(cl, k)) return [n, 'Special coupon (beats MER)'];
    const m = /MER[1-9]/.exec(c);
    if (m) {
      const end = c.indexOf(',', m.index);
      const tok = (end < 0 ? c.slice(m.index) : c.slice(m.index, end)).trim();
      const short = tok.split('-')[0];
      if (R.mer.has(tok.toLowerCase())) return [R.mer.get(tok.toLowerCase()), 'Coupon code'];
      if (R.mer.has(short.toLowerCase())) return [R.mer.get(short.toLowerCase()), 'Coupon code'];
      const num = /^(MER\d+)/i.exec(tok);
      if (num && R.merNum && R.merNum.has(num[1].toLowerCase())) return [R.merNum.get(num[1].toLowerCase()), 'Coupon code'];
      return ['UNMAPPED ' + tok, 'Coupon code NOT IN MAP - CHECK'];
    }
    for (const [k, n] of R.specialAll) if (hasKw(cl, k)) return [n, 'Special coupon'];
    if (low(source) === 'shopify') return [R.shopifyDefault, 'Shopify - no merchant code'];
    const cb = norm(createdBy);
    if (R.staffKeyword && cb.toLowerCase().includes(R.staffKeyword)) {
      return [R.email.get(cb.toLowerCase()) || cb, 'Created by staff e-mail - CHECK'];
    }
    return ['UNASSIGNED', 'No code / no staff e-mail - CHECK'];
  }

  /* ---------- Warehouse file (your mapping sheet) ----------
     Shipping Service | Final Shipping  (header row, usually columns A:B)
     Merchant code    | Final Merchant  (header "Merchant code"/"Final Merchant", or else columns G:H as in the Warehouse sheet) */
  function parseWarehouse(aoa) {
    let hr = -1, si = -1, fi = -1;
    for (let r = 0; r < Math.min(aoa.length, 10) && hr < 0; r++) {
      const row = (aoa[r] || []).map(low);
      const a = row.indexOf('shipping service'), b = row.indexOf('final shipping');
      if (a >= 0 && b >= 0 && !row.includes('invoice_no') && !row.includes('erp_invoice_id')) { hr = r; si = a; fi = b; }
    }
    if (hr < 0) return null;
    const head = (aoa[hr] || []).map(low);
    let mc = head.findIndex((h) => h === 'merchant code' || h === 'merchant code (coupon)' || h === 'coupon code');
    let mn = head.findIndex((h) => h === 'final merchant');
    if (mc < 0 || mn < 0) { mc = 6; mn = 7; }
    const ship = [], mer = [];
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      if (norm(row[si]) && norm(row[fi])) ship.push([norm(row[si]), norm(row[fi])]);
      if (norm(row[mc]) && norm(row[mn]) && typeof row[mn] !== 'number') mer.push([norm(row[mc]), norm(row[mn]), 'from Warehouse file']);
    }
    // the merchant table on the Warehouse sheet has no header, so its first row can sit on the header row
    const h0 = aoa[hr] || [];
    if (mc === 6 && norm(h0[6]) && norm(h0[7])) mer.unshift([norm(h0[6]), norm(h0[7]), 'from Warehouse file']);
    if (!ship.length) return null;
    return { ship, mer };
  }
  const isWarehouse = (aoa) => !!parseWarehouse(aoa);

  /* ---------- main processing ---------- */
  // Coupon tokens: "MER86-Nirukshi,COS5" -> ['mer86-nirukshi', 'cos5']
  const couponTokens = (c) => norm(c).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  function couponMatches(tokens, codes, mode) {
    return codes.some((code) => tokens.some((t) => mode === 'contains' ? t.includes(code) : mode === 'starts' ? t.startsWith(code) : t === code));
  }
  // opts.promo = { codes: ['cos5'], mode: 'exact'|'starts'|'contains', from: serial, to: serial }  -> promotion analysis instead of month-to-date
  function processDump(aoa, S, makingSerial, opts) {
    const promo = opts && opts.promo ? opts.promo : null;
    const hr = findHeader(aoa);
    if (hr < 0) throw new Error('This sheet does not look like Dump 2: the header row needs ' + REQUIRED.join(', ') + '.');
    const headers = aoa[hr].map(norm);
    const ix = Object.fromEntries(headers.map((h, i) => [h, i]));
    const rangeStart = opts && opts.rangeStartSerial ? opts.rangeStartSerial : null;
    const days = computeDays(makingSerial, S.poya.map((p) => p[1]), (S.leave || []).map((p) => p[1]), rangeStart);
    const R = makeRules(S);
    const all = [];
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || row.every((v) => v === null || v === undefined || v === '')) continue;
      const inv = norm(row[ix.ERP_INVOICE_ID]) || norm(row[ix.INVOICE_NO]);
      const [merchant, rule] = finalMerchant(row[ix.COUPON_CODE], row[ix.SOURCE_NAME], row[ix.CREATED_BY], inv, R);
      const date = toSerial(row[ix.INVOICE_DATE]);
      const pos = num(row[ix.POS_SALE]);
      const status = norm(row[ix.STATUS]);
      const tokens = couponTokens(row[ix.COUPON_CODE]);
      const include = promo
        ? date !== null && date >= promo.from && date <= promo.to && !R.exclude.has(status.toLowerCase()) && couponMatches(tokens, promo.codes, promo.mode)
        : date !== null && date >= days.monthStart && date <= days.report && !R.exclude.has(status.toLowerCase());
      const shipSvc = pos === 0 ? 'Online' : norm(row[ix.POS_WAREHOUSE]);
      const finalShip = R.ship.get(shipSvc.toLowerCase()) || ('UNMAPPED ' + shipSvc);
      all.push({ row, inv, merchant, rule, date, pos, status, include, shipSvc, finalShip, tokens, amount: num(row[ix.GRAND_TOTAL]),
        discount: ix.DISCOUNTS !== undefined ? num(row[ix.DISCOUNTS]) : 0 });
    }
    const inc = all.filter((x) => x.include);
    // Merchants from elsewhere who sold at the visitor shop (Cool Planet) get their own rows under it.
    // A Final Merchant ending in "-C" (e.g. Kanchana-C) is always counted as a Cool Planet sale.
    const vb = S.visitorBlock && S.visitorBlock.shop ? S.visitorBlock : null;
    const homeKeys = new Set(vb ? S.rows.filter((r) => (vb.homeRows || []).includes(r.row)).flatMap((r) => keyNames(r.key)) : []);
    const cName = (m) => m.replace(/\s*-\s*C\s*$/i, '').trim();
    for (const x of inc) {
      x.visitor = null;
      if (!vb) continue;
      if (/-\s*C\s*$/i.test(x.merchant)) x.visitor = cName(x.merchant);
      else if (x.pos === 1 && low(x.finalShip) === low(vb.shop) && !homeKeys.has(low(x.merchant))) x.visitor = x.merchant;
    }
    const vMap = new Map();
    for (const x of inc) if (x.visitor) { if (!vMap.has(x.visitor)) vMap.set(x.visitor, [0, 0]); vMap.get(x.visitor)[x.pos === 1 ? 1 : 0] += x.amount; }
    const nSlots = vb ? (vb.slotRows || []).length : 0;
    let vList = [...vMap.entries()].map(([name, v]) => ({ name, members: [name], online: v[0], showroom: v[1] }))
      .sort((a, b) => (b.online + b.showroom) - (a.online + a.showroom) || a.name.localeCompare(b.name));
    const overflow = nSlots && vList.length > nSlots;
    if (overflow) {
      const keep = vList.slice(0, nSlots - 1), rest = vList.slice(nSlots - 1);
      vList = [...keep, { name: 'Others', members: rest.flatMap((x) => x.members), online: rest.reduce((s, x) => s + x.online, 0), showroom: rest.reduce((s, x) => s + x.showroom, 0) }];
    }
    const slots = vList;
    // pivot
    const pv = new Map();
    for (const x of inc) {
      if (!pv.has(x.finalShip)) pv.set(x.finalShip, new Map());
      const m = pv.get(x.finalShip);
      if (!m.has(x.merchant)) m.set(x.merchant, [0, 0]);
      m.get(x.merchant)[x.pos === 1 ? 1 : 0] += x.amount;
    }
    const cmp = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
    const keys = new Set(S.rows.flatMap((r) => keyNames(r.key)));
    const pivot = [...pv.keys()].sort(cmp).map((shop) => {
      const ms = [...pv.get(shop).entries()].sort((a, b) => cmp(a[0], b[0]))
        .map(([merchant, v]) => ({ merchant, online: v[0], showroom: v[1],
          onReport: keys.has(low(merchant)) || (!!vb && inc.some((x) => x.visitor && x.merchant === merchant && x.finalShip === shop)) }));
      return { shop, online: ms.reduce((s, x) => s + x.online, 0), showroom: ms.reduce((s, x) => s + x.showroom, 0), merchants: ms };
    });
    // merchant totals by key
    const byKey = new Map();
    const byShopKey = new Map();
    for (const x of inc) {
      if (x.visitor) continue;   // shown on the visitor rows under Cool Planet instead
      const k = low(x.merchant);
      if (!byKey.has(k)) byKey.set(k, [0, 0]);
      byKey.get(k)[x.pos === 1 ? 1 : 0] += x.amount;
      const sk = low(x.finalShip) + '|' + k;
      if (!byShopKey.has(sk)) byShopKey.set(sk, [0, 0]);
      byShopKey.get(sk)[x.pos === 1 ? 1 : 0] += x.amount;
    }
    const totalShowroom = inc.reduce((s, x) => s + (x.pos === 1 ? x.amount : 0), 0);
    const totalOnline = inc.reduce((s, x) => s + (x.pos === 1 ? 0 : x.amount), 0);
    const placed = S.rows.reduce((s, r) => { const v = sumKey(byKey, r.key); return s + (v ? v[0] + v[1] : 0); }, 0)
      + slots.reduce((s, x) => s + x.online + x.showroom, 0);
    const review = inc.filter((x) => /CHECK/.test(x.rule));
    const notOnReport = [];
    for (const p of pivot) for (const m of p.merchants) if (!m.onReport) notOnReport.push({ shop: p.shop, ...m });
    // Keep unmatched showroom sales visible without attributing them to another person.
    // The final workbook places these totals into the blank template row reserved after
    // each outlet block.
    const unassignedByShop = new Map();
    for (const x of notOnReport) {
      if (!x.showroom) continue;
      const current = unassignedByShop.get(x.shop) || [0, 0];
      current[0] += x.online || 0;
      current[1] += x.showroom || 0;
      unassignedByShop.set(x.shop, current);
    }
    const maxDate = all.reduce((m, x) => (x.date !== null && x.date > m ? x.date : m), -Infinity);
    const checks = [
      { label: 'Latest invoice in the dump', value: isFinite(maxDate) ? serialToISO(maxDate) : '—',
        ok: maxDate >= days.report, msg: maxDate >= days.report ? 'Dump reaches the report date' : 'The dump stops before the report date. Export a fresh Dump 2.' },
      { label: 'Orders in the report', value: inc.length, ok: inc.length > 0,
        msg: inc.length > 0 ? `${all.length.toLocaleString('en')} rows read, voided and returned removed` : 'No orders for this month in the dump.' },
      { label: 'Sales placed on Merchant Wise', value: placed, ok: Math.abs(placed - totalShowroom - totalOnline) < 0.5,
        msg: Math.abs(placed - totalShowroom - totalOnline) < 0.5 ? 'Every rupee is on the report'
          : `${fmtNum(totalShowroom + totalOnline - placed, 2)} is not on the report. See the merchants below.` },
      { label: 'Merchants not on the report', value: notOnReport.length, ok: notOnReport.length === 0,
        msg: notOnReport.length ? notOnReport.map((m) => `${m.merchant} (${m.shop}) ${fmtNum(m.online + m.showroom, 2)}`).join(' · ') : 'None' },
      ...(vb ? [{ label: 'Other merchants at ' + vb.shop, value: slots.length, ok: !overflow, warn: overflow,
        msg: slots.length ? slots.map((x) => `${x.name} ${fmtNum(x.online + x.showroom, 2)}`).join(' · ') + (overflow ? ` (more than ${nSlots} merchants: the smallest are combined as Others)` : ' – shown in their own rows under Cool Planet') : 'None' }] : []),
      { label: 'Coupon codes not in the map', value: inc.filter((x) => x.merchant.startsWith('UNMAPPED')).length,
        ok: !inc.some((x) => x.merchant.startsWith('UNMAPPED')),
        msg: [...new Set(inc.filter((x) => x.merchant.startsWith('UNMAPPED')).map((x) => x.merchant.slice(9)))].join(', ') || 'None' },
      { label: 'Warehouses not in the map', value: inc.filter((x) => x.finalShip.startsWith('UNMAPPED')).length,
        ok: !inc.some((x) => x.finalShip.startsWith('UNMAPPED')),
        msg: [...new Set(inc.filter((x) => x.finalShip.startsWith('UNMAPPED')).map((x) => x.shipSvc))].join(', ') || 'None' },
      { label: 'Orders to confirm with staff', value: review.length, ok: review.length === 0, warn: true,
        msg: review.length ? `${fmtNum(review.reduce((s, x) => s + x.amount, 0), 2)} assigned from CREATED_BY for now. Download the Cosmetics review file.` : 'None' },
    ];
    return { slots, headers, ix, all, inc, pivot, byKey, byShopKey, totalShowroom, totalOnline, placed, review, notOnReport, unassignedByShop, checks, days };
  }

  function fmtNum(v, dp) {
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  /* ---------- Excel file clean-up ----------
     ExcelJS writes a few elements in an order the Excel file format does not allow (font size/colour inside
     <font>, and outlinePr after pageSetUpPr inside <sheetPr>). Excel then offers to "repair" the file.
     This puts them back in the official order before the file is saved. */
  const FONT_ORDER = ['b', 'i', 'strike', 'condense', 'extend', 'outline', 'shadow', 'u', 'vertAlign', 'sz', 'color', 'name', 'family', 'charset', 'scheme'];
  const SHEETPR_ORDER = ['tabColor', 'outlinePr', 'pageSetUpPr'];
  function reorderKids(inner, order) {
    const kids = inner.match(/<([A-Za-z]+)\b[^>]*\/>/g) || [];
    if (kids.join('') !== inner) return inner;
    const rank = (k) => { const i = order.indexOf(/^<([A-Za-z]+)/.exec(k)[1]); return i < 0 ? 999 : i; };
    return kids.map((k, i) => [k, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]).join('');
  }
  function getZip() {
    if (typeof fflate !== 'undefined') return fflate;                         // browser (vendor/fflate.js)
    if (typeof require === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      try { return require('fflate'); } catch { /* not installed */ }
    }
    return null;
  }
  function fixOoxml(buf) {
    const Z = getZip(); if (!Z) throw new Error('The zip library (fflate) did not load, so the Excel file cannot be finished. Reload the page.');
    const files = Z.unzipSync(new Uint8Array(buf));
    const dec = new TextDecoder(), enc = new TextEncoder();
    for (const name of Object.keys(files)) {
      if (/^xl\/styles\.xml$/.test(name)) {
        files[name] = enc.encode(dec.decode(files[name]).replace(/<font>([\s\S]*?)<\/font>/g, (m, inner) => '<font>' + reorderKids(inner, FONT_ORDER) + '</font>'));
      } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        files[name] = enc.encode(dec.decode(files[name]).replace(/<sheetPr(\b[^>]*)>([\s\S]*?)<\/sheetPr>/, (m, a, inner) => '<sheetPr' + a + '>' + reorderKids(inner, SHEETPR_ORDER) + '</sheetPr>'));
      }
    }
    return Z.zipSync(files, { level: 6 });
  }

  /* ---------- final report (template + HyperFormula) ---------- */
  const SHEETS = ['Outlet Wise', 'Merchant Wise'];
  const KEY = 'W';   // Merchant Wise hidden column holding each row's Final Merchant name(s)
  async function buildReport(ExcelJS, HyperFormula, templateBuf, res, S, daily) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(templateBuf);
    // keep the workbook view valid for a 2-sheet file (an out-of-range firstSheet makes Excel offer to "repair")
    (wb.views && wb.views.length ? wb.views : (wb.views = [{}])).forEach((v) => { v.firstSheet = 0; v.activeTab = 0; v.visibility = 'visible'; });
    const ow = wb.getWorksheet('Outlet Wise'), mw = wb.getWorksheet('Merchant Wise');
    const d = res.days;
    const shopForOutlet = (outlet) => {
      const mapped = (S.outletWarehouses || []).find((pair) => low(pair[0]) === low(outlet));
      if (mapped) return norm(mapped[1]);
      const target = low(outlet).replace(/\s+/g, '');
      const aliases = target === 'negambo' ? ['negambo', 'negombo'] : target === 'galle' ? ['gcc'] : [target];
      return [...(res.pivot || [])].find((p) => aliases.some((a) => low(p.shop).replace(/\s+/g, '').includes(a)))?.shop || '';
    };
    const title = `COSMETICS.LK ${d.monthName} MONTH TARGET`;
    ow.getCell('D2').value = title; mw.getCell('D2').value = title;
    // date block (Outlet Wise V7:W10): V7 day no, V8 days in month, W7 report date, W8 remaining, W9 Pepiliyana, W10 online
    // date block (Outlet Wise W7:X10, as in the manual sheet): W7 day no, W8 days in month, X7 report date, X8 remaining, X9 Pepiliyana, X10 online
    ow.getCell('X7').value = serialToDate(d.report);
    ow.getCell('W7').value = d.dayNo; ow.getCell('W8').value = d.daysInMonth;
    ow.getCell('X8').value = d.remDays; ow.getCell('X9').value = d.pepDays; ow.getCell('X10').value = d.onlineDays;
    const MV = vatMoves(S);
    const typed = (kind, row) => { let v = daily && daily[kind] ? daily[kind][row] : null; v = (v === null || v === undefined || v === '') ? null : Number(v);
      // a typed figure on a moved row (e.g. Maheshi - Palmers) is added to the row it moves to
      for (const fr of MV.fromRows) if (MV.fromRows[fr] === row && daily && daily[kind] && daily[kind][fr] !== null && daily[kind][fr] !== undefined && daily[kind][fr] !== '') v = (v || 0) + Number(daily[kind][fr]);
      return v; };
    const rowShop = shopForOutlet;
    for (const r of S.rows) {
      const shop = rowShop(r.outlet);
      const global = sumKey(res.byKey, r.key) || [0, 0];
      const showroomShop = low(r.outlet) === 'online' ? shopForOutlet('Pepiliyana') : shop;
      const shopSales = keyNames(r.key).reduce((sum, name) => { const values = res.byShopKey?.get(low(showroomShop) + '|' + name) || [0, 0]; return [sum[0] + values[0], sum[1] + values[1]]; }, [0, 0]);
      // Online has no physical warehouse, so keep online merchant totals global;
      // only showroom sales are constrained by the warehouse/shop.
      const physicalMerchantRows = low(r.outlet) === 'online' ? [] : S.rows.filter((other) => low(other.outlet) !== 'online' && keyNames(other.key).some((name) => keyNames(r.key).includes(name)));
      const v = [physicalMerchantRows.length > 1 && physicalMerchantRows[0] !== r ? 0 : global[0], shopSales[1]];
      mw.getCell(KEY + r.row).value = r.key;
      mw.getCell('H' + r.row).value = round2(v[1]);
      mw.getCell('I' + r.row).value = round2(v[0]);
      if (r.showroomTarget !== null && r.showroomTarget !== undefined && r.showroomTarget !== '') mw.getCell('E' + r.row).value = Number(r.showroomTarget);
      if (r.onlineTarget !== null && r.onlineTarget !== undefined && r.onlineTarget !== '') mw.getCell('F' + r.row).value = Number(r.onlineTarget);
      let vat = typed('vat', r.row);
      let palm = typed('palmers', r.row);
      if (MV.fromRows.has(r.row)) { vat = null; palm = null; }
      else if (res.vat) {
        const sameMerchantRows = physicalMerchantRows;
        const shopAmount = (map, outlet) => keyNames(r.key).reduce((sum, name) => sum + (map.get(low(rowShop(outlet)) + '|' + name) || 0), 0);
        const vatValue = sameMerchantRows.length > 1 ? (sameMerchantRows[0] === r ? (sumKey(res.vat.byKey, r.key) || 0) - sameMerchantRows.slice(1).reduce((sum, other) => sum + shopAmount(res.vat.byShopKey, other.outlet), 0) : shopAmount(res.vat.byShopKey, r.outlet)) : sumKey(res.vat.byKey, r.key);
        const palmValue = sameMerchantRows.length > 1 ? (sameMerchantRows[0] === r ? (sumKey(res.vat.palmByKey, r.key) || 0) - sameMerchantRows.slice(1).reduce((sum, other) => sum + shopAmount(res.vat.palmByShopKey, other.outlet), 0) : shopAmount(res.vat.palmByShopKey, r.outlet)) : sumKey(res.vat.palmByKey, r.key);
        vat = round2(vatValue || 0);
        palm = round2(palmValue || 0);
      }
      mw.getCell('L' + r.row).value = (palm === null || palm === undefined || palm === '') ? null : Number(palm);
      mw.getCell('K' + r.row).value = (vat === null || vat === undefined || vat === '') ? null : Number(vat);
    }
    // Cool Planet visitor rows: name, sales, VAT / Palmers; unused rows stay hidden
    const vatOf = (m, map) => (m || []).reduce((s, n) => s + (map.get(n) || 0), 0);
    ((S.visitorBlock && S.visitorBlock.slotRows) || []).forEach((row, i) => {
      const sl = res.slots[i];
      const set = (c, v) => { mw.getCell(c + row).value = v; };
      mw.getRow(row).hidden = !sl;
      if (!sl) { ['D', 'H', 'I', 'K', 'L', KEY].forEach((c) => set(c, null)); return; }
      set('D', sl.name); set(KEY, sl.name); set('H', round2(sl.showroom)); set('I', round2(sl.online));
      set('K', res.vat ? round2(vatOf(sl.members, res.vat.visitorVat)) : null);
      set('L', res.vat ? round2(vatOf(sl.members, res.vat.visitorPalm)) : null);
    });
    // Unmatched merchants are deliberately reported as Unassigned under their shop.
    // These rows are blank rows in the original template between outlet blocks.
    const unassignedRows = new Map([
      ['ogf shop', 9], ['kiribathgoda shop', 21], ['maharagama shop', 24],
      ['galle shop', 27], ['negambo shop', 30],
    ]);
    for (const [shop, totals] of (res.unassignedByShop || new Map())) {
      const row = unassignedRows.get(low(shop));
      if (!row) continue;
      const set = (c, v) => { mw.getCell(c + row).value = v; };
      const vat = (res.notOnReport || []).filter((x) => low(x.shop) === low(shop)).reduce((sum, x) => sum + (res.vat ? (res.vat.byKey.get(low(x.merchant)) || 0) : 0), 0);
      const palm = (res.notOnReport || []).filter((x) => low(x.shop) === low(shop)).reduce((sum, x) => sum + (res.vat ? (res.vat.palmByKey.get(low(x.merchant)) || 0) : 0), 0);
      set('D', 'Unassigned'); set(KEY, 'Unassigned'); set('H', round2(totals[1])); set('I', round2(totals[0]));
      set('K', res.vat ? round2(vat) : null); set('L', res.vat ? round2(palm) : null);
      mw.getRow(row).hidden = false;
    }
    // "Total" rows after Staff Sales: an online merchant who also sold at Cool Planet gets her whole total
    const vb = S.visitorBlock || {};
    const slotRows = vb.slotRows || [], totRows = vb.totalRows || [], owTotRows = vb.owTotalRows || [];
    const online = S.rows.filter((r) => low(r.outlet) === 'online');
    const groups = [];
    res.slots.forEach((sl, i) => {
      if (i >= slotRows.length) return;
      const on = online.find((r) => keyNames(r.key).includes(low(sl.name)));
      if (!on) return;
      let g = groups.find((x) => x.on === on); if (!g) groups.push(g = { on, slots: [] });
      g.slots.push(slotRows[i]);
    });
    res.totalRows = [];
    totRows.forEach((row, i) => {
      const g = groups[i], owRow = owTotRows[i];
      mw.getRow(row).hidden = !g; if (owRow) ow.getRow(owRow).hidden = !g;
      if (!g) { ['D', 'E', 'F', 'H', 'I', 'K', 'L', KEY].forEach((c) => { mw.getCell(c + row).value = null; }); if (owRow) ow.getCell('D' + owRow).value = null; return; }
      const on = g.on.row, sum = (c) => ({ formula: [c + on, ...g.slots.map((r) => c + r)].join('+') });
      mw.getCell('D' + row).value = g.on.name; mw.getCell(KEY + row).value = g.on.name;
      mw.getCell('E' + row).value = { formula: 'E' + on }; mw.getCell('F' + row).value = { formula: 'F' + on };
      ['H', 'I', 'K', 'L'].forEach((c) => { mw.getCell(c + row).value = sum(c); });
      if (owRow) ow.getCell('D' + owRow).value = g.on.name;
      res.totalRows.push({ name: g.on.name, row, owRow });
    });
    for (const t of S.extraTargets || []) {
      const ws = wb.getWorksheet(t.sheet);
      if (ws && t.value !== '' && t.value !== null && t.value !== undefined) ws.getCell(t.cell).value = Number(t.value);
    }
    // Dynamic warehouse allocation view. The original template has fixed merged
    // sections, so this separate sheet is generated without mutating those rows.
    const wa = wb.getWorksheet('Warehouse Merchant Wise') || wb.addWorksheet('Warehouse Merchant Wise');
    wa.spliceRows(1, wa.rowCount);
    wa.mergeCells('A1:H1');
    wa.getCell('A1').value = title + ' - WAREHOUSE MERCHANT ALLOCATION';
    wa.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    wa.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    const headers = ['Shop', 'Merchant', 'Showroom Sale', 'Online Sale', 'Total Sale', 'VAT Sale', 'Palmers Sale', 'Source'];
    wa.addRow(headers);
    wa.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wa.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8EA9DB' } };
    for (const p of res.pivot || []) {
      for (const m of p.merchants.filter((x) => x.showroom > 0 || x.online > 0)) {
        const global = sumKey(res.byKey, m.merchant) || [0, 0];
        const vat = res.vat ? (res.vat.byKey.get(low(m.merchant)) || 0) : 0;
        const palm = res.vat ? (res.vat.palmByKey.get(low(m.merchant)) || 0) : 0;
        wa.addRow([p.shop, m.merchant, round2(m.showroom), round2(global[0]), round2(m.showroom + global[0]), round2(vat), round2(palm), m.showroom > 0 ? 'Warehouse' : 'Online']);
      }
    }
    wa.columns = [{ width: 28 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }];
    for (let r = 3; r <= wa.rowCount; r++) { for (let c = 3; c <= 7; c++) wa.getCell(r, c).numFmt = '#,##0.00'; if (r % 2) wa.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; }
    const CHK = S.checkRow || 62;   // Merchant Wise reconciliation line (pivot totals)
    mw.getCell('H' + CHK).value = round2(res.totalShowroom);
    mw.getCell('I' + CHK).value = round2(res.totalOnline);
    if (daily && daily.vatTotal !== '' && daily.vatTotal != null) mw.getCell('K' + CHK).value = Number(daily.vatTotal);
    if (daily && daily.cosmo !== '' && daily.cosmo != null) ow.getCell(S.cosmoCell || 'J48').value = Number(daily.cosmo);

    // evaluate with HyperFormula
    const NR = Math.max(66, mw.rowCount, ow.rowCount), NC = 30;
    const data = {};
    for (const name of SHEETS) {
      const ws = wb.getWorksheet(name); const arr = [];
      for (let r = 1; r <= NR; r++) {
        const line = [];
        for (let c = 1; c <= NC; c++) {
          const cell = ws.getCell(r, c);
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) { line.push(null); continue; }
          const v = cell.value;
          if (v && typeof v === 'object' && v.formula) line.push('=' + v.formula);
          else if (v && typeof v === 'object' && v.sharedFormula) line.push(null);
          else if (v instanceof Date) line.push(Math.round((v.getTime() - EPOCH) / DAY));
          else if (v && typeof v === 'object' && v.richText) line.push(v.richText.map((t) => t.text).join(''));
          else line.push(v === undefined ? null : v);
        }
        arr.push(line);
      }
      data[name] = arr;
    }
    const hf = HyperFormula.buildFromSheets(data, { licenseKey: 'gpl-v3' });
    const values = {};
    for (const name of SHEETS) {
      const sid = hf.getSheetId(name); const ws = wb.getWorksheet(name);
      values[name] = [];
      for (let r = 1; r <= NR; r++) {
        values[name][r] = [];
        for (let c = 1; c <= NC; c++) {
          let v = hf.getCellValue({ sheet: sid, row: r - 1, col: c - 1 });
          if (v && typeof v === 'object' && 'value' in v && v.type) v = { error: v.value };
          values[name][r][c] = v;
          const cell = ws.getCell(r, c);
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
          if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
            cell.value = { formula: cell.value.formula, result: v === null ? 0 : v };
          }
        }
      }
    }
    hf.destroy();
    // Row colour: red when Forecast Achievement % is below 90%, black at 90% or more (as displayed, 1 decimal).
    const colourRows = (ws, vals, fcCol, r0, r1, c0, c1) => {
      const top = new Map();
      for (const m of ws.model.merges || []) {
        const [a, b] = m.split(':'); const p = (x) => { const mm = /([A-Z]+)(\d+)/.exec(x); let c = 0; for (const ch of mm[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+mm[2], c]; };
        const [ra, ca] = p(a), [rb, cb] = p(b);
        if (ca <= fcCol && fcCol <= cb) for (let r = ra; r <= rb; r++) top.set(r, ra);
      }
      for (let r = r0; r <= r1; r++) {
        const v = vals[top.get(r) || r][fcCol];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        const argb = Math.round(v * 1000) / 1000 < 0.9 ? 'FFFF0000' : 'FF000000';
        for (let c = c0; c <= c1; c++) {
          const cell = ws.getCell(r, c);
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
          // give the cell its own style copy first: cells loaded from the template can share one style object
          cell.style = Object.assign({}, cell.style || {}, { font: Object.assign({}, (cell.style && cell.style.font) || {}, { color: { argb } }) });
        }
      }
    };
    colourRows(mw, values['Merchant Wise'], 21, 7, mw.rowCount, 2, 21);
    colourRows(ow, values['Outlet Wise'], 19, 7, ow.rowCount, 2, 19);
    // Rebuild Merchant Wise from the calculated warehouse/merchant grain. This
    // avoids inserting into the template's merged rows and supports a merchant
    // appearing under multiple warehouses (for example, Naduni under OGF and
    // Kiribathgoda).
    const dynamic = wb.addWorksheet('Merchant Wise Dynamic');
    const dynamicHeaders = ['No', 'Outlet / Merchant Name', 'Merchant Name', 'Showroom Target', 'Online Target', 'Total Target', 'Showroom Sale', 'Online Sale', 'Total Sale', 'VAT Sale', 'Palmers Sale', 'Showroom Sale %', 'Online Sale %', 'Total Sale %', 'VAT Sale %', 'Palmers Sale %', 'Balance', 'Per Day Target', 'Forecast Month End Achievement', 'Forecast Achievement %'];
    dynamic.getCell('A1').value = title; dynamic.getCell('A1').font = { bold: true, size: 14 };
    dynamic.addRow(dynamicHeaders);
    dynamic.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }; dynamic.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8EA9DB' } };
    const dayNo = Math.max(1, Number(d.dayNo) || 1), daysInMonth = Math.max(dayNo, Number(d.daysInMonth) || dayNo);
    const normShop = (x) => low(x).replace(/\s+/g, '');
    const shopRowsFor = (shop) => S.rows.filter((r) => shopForOutlet(r.outlet) === shop);
    const dynamicShops = [...new Set((res.pivot || []).map((p) => p.shop).concat(S.rows.map((r) => shopForOutlet(r.outlet)).filter(Boolean)))];
    let outletNo = 0;
    for (const shop of dynamicShops) {
      const pivot = (res.pivot || []).find((p) => p.shop === shop);
      const configured = shopRowsFor(shop);
      const names = [...new Set(configured.flatMap((r) => keyNames(r.key)).concat((pivot?.merchants || []).filter((m) => m.showroom > 0 || m.online > 0).map((m) => low(m.merchant))))];
      if (!names.length) continue;
      outletNo += 1;
      const first = dynamic.rowCount + 1;
      const outletName = configured[0]?.outlet || shop.replace(/\s+shop.*$/i, '');
      for (const name of names) {
        const configuredRow = configured.find((r) => keyNames(r.key).includes(low(name)));
        const displayName = configuredRow?.name || (pivot?.merchants || []).find((m) => low(m.merchant) === low(name))?.merchant || name;
        const global = sumKey(res.byKey, name) || [0, 0];
        const shopSales = res.byShopKey?.get(low(shop) + '|' + low(name)) || [0, 0];
        const showroom = shopSales[1] || 0;
        const online = normShop(shop) === 'online' ? global[0] : global[0];
        const vat = res.vat?.byShopKey?.get(low(shop) + '|' + low(name)) || 0;
        const palm = res.vat?.palmByShopKey?.get(low(shop) + '|' + low(name)) || 0;
        const showroomTarget = configuredRow?.showroomTarget == null ? null : Number(configuredRow.showroomTarget);
        const onlineTarget = configuredRow?.onlineTarget == null ? null : Number(configuredRow.onlineTarget);
        const totalTarget = (showroomTarget || 0) + (onlineTarget || 0);
        const total = showroom + online;
        const forecast = dayNo ? total / dayNo * daysInMonth : 0;
        dynamic.addRow([null, outletName, displayName, showroomTarget, onlineTarget, totalTarget || null, round2(showroom), round2(online), round2(total), round2(vat), round2(palm), showroomTarget ? showroom / showroomTarget : null, onlineTarget ? online / onlineTarget : null, totalTarget ? total / totalTarget : null, totalTarget ? vat / totalTarget : null, totalTarget ? palm / totalTarget : null, totalTarget ? totalTarget - total : null, totalTarget ? totalTarget / daysInMonth : null, totalTarget ? forecast : null, totalTarget ? forecast / totalTarget : null]);
      }
      const last = dynamic.rowCount;
      const totalRow = dynamic.addRow([null, 'Total', '', configured.reduce((s, r) => s + (Number(r.showroomTarget) || 0), 0) || null, configured.reduce((s, r) => s + (Number(r.onlineTarget) || 0), 0) || null, null, 0, 0, 0, 0, 0]);
      for (let r = first; r <= last; r++) for (let c = 7; c <= 11; c++) totalRow.getCell(c).value = (totalRow.getCell(c).value || 0) + (Number(dynamic.getCell(r, c).value) || 0);
      const totalTarget = (Number(totalRow.getCell(4).value) || 0) + (Number(totalRow.getCell(5).value) || 0); totalRow.getCell(6).value = totalTarget || null; totalRow.getCell(12).value = totalRow.getCell(4).value ? totalRow.getCell(7).value / totalRow.getCell(4).value : null; totalRow.getCell(13).value = totalRow.getCell(5).value ? totalRow.getCell(8).value / totalRow.getCell(5).value : null; totalRow.getCell(14).value = totalTarget ? totalRow.getCell(9).value / totalTarget : null; totalRow.getCell(15).value = totalTarget ? totalRow.getCell(10).value / totalTarget : null; totalRow.getCell(16).value = totalTarget ? totalRow.getCell(11).value / totalTarget : null; totalRow.getCell(17).value = totalTarget ? totalTarget - totalRow.getCell(9).value : null; totalRow.getCell(18).value = totalTarget ? totalTarget / daysInMonth : null; totalRow.getCell(19).value = totalTarget ? totalRow.getCell(9).value / dayNo * daysInMonth : null; totalRow.getCell(20).value = totalTarget ? totalRow.getCell(19).value / totalTarget : null;
      for (let r = first; r <= totalRow.number; r++) { dynamic.getCell(r, 1).value = r === first ? outletNo : null; dynamic.getCell(r, 2).value = r === first ? outletName : null; }
      dynamic.getCell(totalRow.number, 2).value = 'Total';
      if (last >= first) { dynamic.mergeCells(first, 1, totalRow.number, 1); dynamic.mergeCells(first, 2, totalRow.number, 2); }
    }
    // Put the generated values into the template's visual layout: title at row 2,
    // headers at row 4, data from row 7, with the template's widths and styles.
    dynamic.insertRows(1, [new Array(20).fill(null)]);
    dynamic.insertRows(3, [new Array(20).fill(null)]);
    dynamic.insertRows(5, [new Array(20).fill(null), new Array(20).fill(null)]);
    dynamic.getCell('D2').value = title; dynamic.getCell('A2').value = null; dynamic.mergeCells('D2:T2');
    dynamic.columns = mw.columns.map((column) => ({ width: column.width }));
    const copyRowStyle = (from, to) => { for (let c = 1; c <= 20; c++) { const a = from.getCell(c), b = to.getCell(c); b.style = JSON.parse(JSON.stringify(a.style || {})); b.numFmt = a.numFmt; } };
    for (let c = 1; c <= 20; c++) { dynamic.getCell(2, c).style = JSON.parse(JSON.stringify(mw.getCell(2, c).style || {})); dynamic.getCell(4, c).style = JSON.parse(JSON.stringify(mw.getCell(4, c).style || {})); }
    for (let r = 7; r <= dynamic.rowCount; r++) copyRowStyle(String(dynamic.getCell(r, 2).value).toLowerCase() === 'total' ? mw.getRow(9) : mw.getRow(7), dynamic.getRow(r));
    for (let r = 7; r <= dynamic.rowCount; r++) { for (let c = 4; c <= 11; c++) dynamic.getCell(r, c).numFmt = '#,##0'; for (let c = 12; c <= 16; c++) dynamic.getCell(r, c).numFmt = '0.0%'; dynamic.getCell(r, 17).numFmt = '#,##0'; dynamic.getCell(r, 18).numFmt = '#,##0'; dynamic.getCell(r, 19).numFmt = '#,##0'; dynamic.getCell(r, 20).numFmt = '0.0%'; }
    dynamic.views = [{ state: 'frozen', ySplit: 4 }];
    wb.removeWorksheet(dynamic.id);
    // Add only missing merchant rows to the original template data area.
    // Insert only missing merchant rows, then rewrite the affected data and total
    // rows so formulas cannot retain references to their pre-insertion positions.
    if (true) {
    // Header merges, widths and the rest of the workbook remain untouched.
    const dataMerges = [...(mw.model.merges || [])].filter((merge) => /\d+/.test(merge) && Number(/\d+$/.exec(merge.split(':')[0])?.[0] || 0) >= 7);
    const originalRows = Array.from({ length: mw.rowCount + 1 }, (_, row) => ({ row, hidden: mw.getRow(row || 1).hidden, height: mw.getRow(row || 1).height }));
    const rowPositions = originalRows.map((item) => item.row);
    for (const merge of dataMerges) mw.unMergeCells(merge);
    const movedMerges = dataMerges.map((merge) => merge.split(':').map((address) => { const m = /^([A-Z]+)(\d+)$/.exec(address); return { col: m[1], row: Number(m[2]) }; }));
    const shiftFormula = (formula, at, external) => formula.replace(external ? /('Merchant Wise'!)(\$?[A-Z]{1,3})(\$?)(\d+)/g : /(?<!'Outlet Wise'!)(\$?[A-Z]{1,3})(\$?)(\d+)/g,
      (...args) => { const [match, a, b, c, e] = args; const row = Number(external ? e : c); return row >= at ? (external ? a + b + c : a + b) + (row + 1) : match; });
    const rebaseFormulas = (ws, at, external = false) => { for (let rr = 1; rr <= ws.rowCount; rr++) for (let cc = 1; cc <= 30; cc++) { const cell = ws.getCell(rr, cc); const value = cell.value; if (!value || typeof value !== 'object' || !value.formula) continue; cell.value = { ...value, formula: shiftFormula(value.formula, at, external), result: undefined }; } };
    const additions = [];
    for (const pivot of res.pivot || []) {
      const rows = S.rows.filter((r) => shopForOutlet(r.outlet) === pivot.shop);
      for (const merchant of pivot.merchants.filter((m) => m.showroom > 0)) {
        if (rows.length && !['cool planet', 'pepiliyana'].includes(low(rows[0].outlet)) && !rows.some((r) => keyNames(r.key).includes(low(merchant.merchant)))) additions.push({ shop: pivot.shop, outlet: rows[0].outlet, name: merchant.merchant });
      }
    }
    const inserted = [];
    for (const add of additions.sort((a, b) => String(b.shop).localeCompare(String(a.shop)))) {
      const rows = S.rows.filter((r) => low(r.outlet) === low(add.outlet));
      const at = Math.max(...rows.map((r) => r.row)) + 1;
      if (!Number.isFinite(at)) continue;
      mw.insertRows(at, [new Array(23).fill(null)]);
      for (let i = 1; i < rowPositions.length; i++) if (rowPositions[i] >= at) rowPositions[i]++;
      rebaseFormulas(mw, at); rebaseFormulas(ow, at, true);
      for (const pair of movedMerges) { if (pair[0].row >= at) pair[0].row++; if (pair[1].row >= at) pair[1].row++; }
      for (const r of S.rows) if (r.row >= at) r.row += 1;
      for (const item of inserted) if (item.row >= at) item.row++;
      const item = { ...add, row: at }; inserted.push(item); S.rows.push({ row: at, outlet: add.outlet, name: add.name, key: add.name, showroomTarget: null, onlineTarget: null, hidden: false });
    }
    const setReportRow = (row, name, shop, configured) => {
      const shopSales = res.byShopKey?.get(low(shop) + '|' + low(name)) || [0, 0]; const showroom = shopSales[1] || 0; const online = 0;
      const vat = res.vat?.byShopKey?.get(low(shop) + '|' + low(name)) || 0; const palm = res.vat?.palmByShopKey?.get(low(shop) + '|' + low(name)) || 0;
      const st = configured?.showroomTarget == null ? null : Number(configured.showroomTarget); const ot = configured?.onlineTarget == null ? null : Number(configured.onlineTarget); const tt = (st || 0) + (ot || 0); const total = showroom + online; const forecast = total / Math.max(1, d.dayNo) * d.daysInMonth;
      mw.getCell('D' + row).value = name; mw.getCell('E' + row).value = st; mw.getCell('F' + row).value = ot; mw.getCell('G' + row).value = tt || null; mw.getCell('H' + row).value = round2(showroom); mw.getCell('I' + row).value = round2(online); mw.getCell('J' + row).value = round2(total); mw.getCell('K' + row).value = round2(vat); mw.getCell('L' + row).value = round2(palm); mw.getCell('M' + row).value = st ? showroom / st : null; mw.getCell('N' + row).value = ot ? online / ot : null; mw.getCell('O' + row).value = tt ? total / tt : null; mw.getCell('P' + row).value = tt ? vat / tt : null; mw.getCell('Q' + row).value = tt ? palm / tt : null; mw.getCell('R' + row).value = tt ? tt - total : null; mw.getCell('S' + row).value = tt ? tt / d.daysInMonth : null; mw.getCell('T' + row).value = tt ? forecast : null; mw.getCell('U' + row).value = tt ? forecast / tt : null;
    };
    for (const add of inserted) {
      const source = mw.getRow(Math.max(7, add.row - 1)), target = mw.getRow(add.row);
      for (let c = 1; c <= 23; c++) target.getCell(c).style = JSON.parse(JSON.stringify(source.getCell(c).style || {}));
      setReportRow(add.row, add.name, add.shop, null);
      mw.getCell('B' + add.row).value = source.getCell('B').value;
      mw.getCell('C' + add.row).value = source.getCell('C').value;
      mw.getCell('W' + add.row).value = add.name;
      mw.getCell('J' + add.row).value = { formula: `H${add.row}+I${add.row}` };
      const home = S.rows.find((r) => r.row !== add.row && low(r.outlet) !== 'online' && keyNames(r.key).includes(low(add.name)));
      if (home) for (const col of ['K', 'L']) {
        const cell = mw.getCell(col + home.row), amount = Number(mw.getCell(col + add.row).value) || 0;
        if (typeof cell.value === 'number') cell.value = round2(cell.value - amount);
      }
    }
    for (let i = 1; i < originalRows.length; i++) {
      const row = mw.getRow(rowPositions[i]);
      row.hidden = originalRows[i].hidden;
      if (originalRows[i].height !== undefined) row.height = originalRows[i].height;
    }
    for (const add of inserted) {
      const rows = S.rows.filter((r) => low(r.outlet) === low(add.outlet)).sort((a, b) => a.row - b.row);
      const total = rows[rows.length - 1].row + 1;
      if (low(mw.getCell('D' + total).value) !== 'total') continue;
      for (const col of ['E', 'F', 'H', 'I', 'K', 'L']) mw.getCell(col + total).value = { formula: `SUM(${col}${rows[0].row}:${col}${total - 1})` };
    }
    const standalone = inserted.filter((add) => {
      const rows = S.rows.filter((r) => low(r.outlet) === low(add.outlet));
      return low(mw.getCell('D' + (Math.max(...rows.map((r) => r.row)) + 1)).value) !== 'total';
    });
    if (standalone.length) {
      const checkRow = rowPositions[S.checkRow || 62];
      const summaryRows = [checkRow - 2];
      mw.eachRow((row) => { if (['showroom total', 'grand total'].includes(low(row.getCell('C').value))) summaryRows.push(row.number); });
      for (const row of summaryRows) for (const col of ['H', 'J', 'K', 'L']) {
        const cell = mw.getCell(col + row), value = cell.value;
        if (value && typeof value === 'object' && value.formula) cell.value = { formula: `${value.formula}+${standalone.map((add) => `${col}${add.row}`).join('+')}` };
      }
    }
    for (const [start, end] of movedMerges) mw.mergeCells(`${start.col}${start.row}:${end.col}${end.row}`);
    // Refresh cached formula results after ExcelJS moves the original rows.
    const shiftedData = {};
    const shiftedRows = Math.max(mw.rowCount, ow.rowCount);
    for (const sheet of SHEETS) {
      const ws = wb.getWorksheet(sheet);
      shiftedData[sheet] = Array.from({ length: shiftedRows }, (_, index) => Array.from({ length: 30 }, (_, col) => {
        const cell = ws.getCell(index + 1, col + 1);
        if (cell.isMerged && cell.master.address !== cell.address) return null;
        const v = cell.value;
        if (v && typeof v === 'object' && v.formula) return '=' + v.formula;
        if (v instanceof Date) return Math.round((v.getTime() - EPOCH) / DAY);
        return v === undefined ? null : v;
      }));
    }
    const shiftedHf = HyperFormula.buildFromSheets(shiftedData, { licenseKey: 'gpl-v3' });
    for (const sheet of SHEETS) {
      const ws = wb.getWorksheet(sheet), sid = shiftedHf.getSheetId(sheet);
      for (let row = 1; row <= ws.rowCount; row++) for (let col = 1; col <= 30; col++) {
        const cell = ws.getCell(row, col), v = cell.value;
        if (!v || typeof v !== 'object' || !v.formula) continue;
        const result = shiftedHf.getCellValue({ sheet: sid, row: row - 1, col: col - 1 });
        cell.value = { formula: v.formula, result: result && typeof result === 'object' && 'value' in result ? { error: result.value } : result };
      }
    }
    shiftedHf.destroy();
    }
    const warehouseAllocation = wb.getWorksheet('Warehouse Merchant Wise');
    if (warehouseAllocation) wb.removeWorksheet(warehouseAllocation.id);
    wb.calcProperties = Object.assign(wb.calcProperties || {}, { fullCalcOnLoad: true });
    const buffer = fixOoxml(await wb.xlsx.writeBuffer());
    return { buffer, values, wb };
  }
  const round2 = (v) => Math.round(v * 100) / 100;

  /* ---------- workings workbook ---------- */
  async function buildWorkings(ExcelJS, res, S) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Daily Sale Report';
    const H = res.headers, ix = res.ix, d = res.days;
    const dateCols = new Set(['INVOICE_DATE', 'PRINTED_ON', 'DISPATCHED_DATE', 'DELIVERY_COMPLETED_DATE', 'COMPLETED_DATE']);
    const timeCols = new Set(['PRINTED_TIME', 'DISPATCHED_TIME', 'COMPLETED_TIME']);
    const moneyCols = new Set(['SUBTOTAL', 'DISCOUNTS', 'SHIPPING_TOTAL', 'GRAND_TOTAL']);
    const head = (ws, cols, red) => {
      const r = ws.getRow(1);
      cols.forEach((h, i) => {
        const c = r.getCell(i + 1); c.value = h;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: red && red.has(h) ? 'FFC00000' : 'FF1F3864' } };
        c.alignment = { vertical: 'middle', wrapText: true };
      });
      r.height = 30;
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };
    const fmtCols = (ws, cols) => cols.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(34, Math.max(10, h.length + 2));
      if (dateCols.has(h)) col.numFmt = 'dd-mm-yyyy';
      else if (timeCols.has(h)) col.numFmt = 'hh:mm:ss';
      else if (moneyCols.has(h)) col.numFmt = '#,##0.00';
    });
    const cpos = ix.COUPON_CODE, ppos = ix.POS_SALE;
    // Main Copy
    const mcCols = [...H.slice(0, cpos + 1), 'FINAL MERCHANT', ...H.slice(cpos + 1), 'MERCHANT RULE'];
    const mc = wb.addWorksheet('Main Copy', { properties: { tabColor: { argb: 'FF7F7F7F' } } });
    fmtCols(mc, mcCols); head(mc, mcCols, new Set(['FINAL MERCHANT']));
    for (const x of res.all) {
      const r = H.map((_, i) => cleanVal(x.row[i]));
      mc.addRow([...r.slice(0, cpos + 1), x.merchant, ...r.slice(cpos + 1), x.rule]);
    }
    mc.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: mcCols.length } };
    // Copy
    const lo = Math.min(cpos, ppos), hi = Math.max(cpos, ppos);
    const cpCols = [];
    H.forEach((h, i) => { cpCols.push(h); if (i === cpos) cpCols.push('FINAL MERCHANT'); if (i === ppos) cpCols.push('Shipping Service', 'Final Shipping'); });
    cpCols.push('MERCHANT RULE');
    const cp = wb.addWorksheet('Copy', { properties: { tabColor: { argb: 'FF2F5597' } } });
    fmtCols(cp, cpCols); head(cp, cpCols, new Set(['FINAL MERCHANT', 'Shipping Service', 'Final Shipping']));
    for (const x of res.inc) {
      const out = [];
      H.forEach((h, i) => { out.push(cleanVal(x.row[i])); if (i === cpos) out.push(x.merchant); if (i === ppos) out.push(x.shipSvc, x.finalShip); });
      out.push(x.rule);
      cp.addRow(out);
    }
    cp.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cpCols.length } };
    void lo; void hi;
    // Pivot
    const pv = wb.addWorksheet('Pivot', { properties: { tabColor: { argb: 'FF00B050' } } });
    pv.getColumn(1).width = 34; [2, 3, 4].forEach((c) => { pv.getColumn(c).width = 18; pv.getColumn(c).numFmt = '#,##0.00;-#,##0.00;"-"'; });
    pv.getColumn(5).width = 20;
    pv.getCell('A1').value = 'Sum of GRAND_TOTAL'; pv.getCell('A1').font = { bold: true, size: 12 };
    pv.getCell('A2').value = `${serialToISO(d.monthStart)} to ${serialToISO(d.report)} · voided / returned removed`;
    pv.getCell('A2').font = { italic: true, color: { argb: 'FF808080' } };
    const ph = pv.getRow(4); ['Row Labels', 'POS_SALE 0 (Online)', 'POS_SALE 1 (Showroom)', 'Grand Total', 'On Merchant Wise?'].forEach((h, i) => {
      const c = ph.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    });
    for (const p of res.pivot) {
      const r = pv.addRow([p.shop, p.online, p.showroom, p.online + p.showroom]);
      r.font = { bold: true }; r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; });
      for (const m of p.merchants) {
        const rr = pv.addRow([m.merchant, m.online, m.showroom, m.online + m.showroom, m.onReport ? 'Yes' : 'NOT ON REPORT']);
        rr.getCell(1).alignment = { indent: 2 };
        if (!m.onReport) rr.getCell(5).font = { bold: true, color: { argb: 'FFC00000' } };
      }
    }
    const gt = pv.addRow(['Grand Total', res.totalOnline, res.totalShowroom, res.totalOnline + res.totalShowroom]);
    gt.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    gt.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } }; });
    if (res.vat) addVatSheets(wb, res.vat);
    // Cosmetics review
    addReviewSheet(wb, res);
    // Settings used
    const st = wb.addWorksheet('Settings used');
    st.getColumn(1).width = 46; st.getColumn(2).width = 22;
    const lines = [['Report making date', serialToDate(d.making)], ['Sales up to (report date)', serialToDate(d.report)],
      ['Month start', serialToDate(d.monthStart)], ['Days completed in month', d.dayNo], ['Total days in month', d.daysInMonth],
      ['Remaining days – outlets (every day)', d.remDays], ['Remaining days – Pepiliyana (no Sunday, no Poya)', d.pepDays],
      ['Remaining days – online (Sat ½, no Sunday, no Poya)', d.onlineDays], ['Rows read from dump', res.all.length],
      ['Orders in report', res.inc.length], ['Showroom total (POS_SALE 1)', res.totalShowroom], ['Online total (POS_SALE 0)', res.totalOnline],
      ['Statuses removed', S.excludeStatus.join(', ')],
      ['Company leave days (not counted)', (S.leave || []).filter((l) => l[1]).map((l) => l[1] + (l[0] ? ' ' + l[0] : '')).join(', ') || 'None']];
    lines.forEach((l) => { const r = st.addRow(l); r.getCell(1).font = { bold: true }; if (l[1] instanceof Date) r.getCell(2).numFmt = 'dd-mmm-yyyy'; else if (typeof l[1] === 'number' && l[1] > 1000) r.getCell(2).numFmt = '#,##0.00'; });
    // Warehouse (maps)
    const wh = wb.addWorksheet('Warehouse');
    const blocks = [[1, ['Shipping Service', 'Final Shipping'], S.ship], [4, ['Merchant code', 'Final Merchant'], S.mer],
      [7, ['Special coupon', 'Final Merchant', 'Beats MER code?'], S.special], [11, ['Staff e-mail', 'Final Merchant'], S.email],
      [14, ['Invoice override', 'Final Merchant', 'Reason'], S.override]];
    for (const [col, hs, rows] of blocks) {
      hs.forEach((h, j) => { const c = wh.getCell(1, col + j); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; wh.getColumn(col + j).width = 24; });
      rows.forEach((row, i) => hs.forEach((_, j) => { wh.getCell(i + 2, col + j).value = row[j] == null ? null : row[j]; }));
    }
    return fixOoxml(await wb.xlsx.writeBuffer());
  }

  /* ---------- VAT: Dump 3 + ERP item list ---------- */
  const D3_REQUIRED = ['INVOICE_NO', 'SKU', 'GRAND_TOTAL', 'BRAND'];
  function findHeaderBy(aoa, test) {
    for (let r = 0; r < Math.min(aoa.length, 10); r++) { const row = (aoa[r] || []).map(norm); if (test(row)) return r; }
    return -1;
  }
  const isDump3 = (aoa) => findHeaderBy(aoa, (row) => D3_REQUIRED.every((h) => row.includes(h))) >= 0;
  const ITEM_CODE = ['Item Code', 'ID', 'SKU', 'Item'];
  const ITEM_STATUS = ['Tax Status', 'Item Status', 'VAT Status', 'Tax status'];
  const isItemList = (aoa) => findHeaderBy(aoa, (row) => ITEM_CODE.some((h) => row.includes(h)) && ITEM_STATUS.some((h) => row.includes(h))) >= 0;
  function vatKind(status) {
    const s = low(status).replace(/[\s_-]+/g, '');
    if (!s) return '';
    if (s.includes('non') && /vat.*\/|\/.*vat/.test(s) && s.replace('nonvat', '').includes('vat')) return 'MIXED';
    if (s === 'vat') return 'VAT';
    if (s.includes('non')) return 'NON';
    if (s.includes('vat')) return 'VAT';
    return '';
  }
  // VAT / Palmers sale of one row counted on another person's row (S.vatTo = [[from, to]]):
  // Maheshi - Palmers -> Maheshi Priyadarshani. Every Final Merchant name on the "from" row moves.
  function vatMoves(S) {
    // [from, to, except]: VAT / Palmers of orders on the "from" row are counted on the "to" row,
    // except orders whose coupon contains "except" (e.g. Maheshi-WH-1), which stay on the "from" row.
    // Without an exception the whole "from" row moves and its VAT / Palmers cells stay blank.
    const names = new Map(), fromRows = new Set();
    for (const [from, to, exc] of (S.vatTo || [])) {
      const f = low(from), t = low(to); if (!f || !t) continue;
      const ex = nos(exc || '');
      const row = (S.rows || []).find((r) => keyNames(r.key).includes(f));
      const tRow = (S.rows || []).find((r) => keyNames(r.key).includes(t));
      for (const n of (row ? keyNames(row.key) : [f])) names.set(n, { to: t, except: ex });
      if (row && !ex) { fromRows.add(row.row); if (tRow) fromRows[row.row] = tRow.row; }
    }
    return { names, fromRows, target(merchant, coupon) { const m = names.get(low(merchant)); if (!m) return low(merchant); if (m.except && hasKw(nos(coupon), m.except)) return low(merchant); return m.to; } };
  }
  function processVat(d3aoa, itemAoa, res, S) {
    const hr = findHeaderBy(d3aoa, (row) => D3_REQUIRED.every((h) => row.includes(h)));
    if (hr < 0) throw new Error('Dump 3 needs the columns ' + D3_REQUIRED.join(', ') + '.');
    const headers = d3aoa[hr].map(norm); const ix = Object.fromEntries(headers.map((h, i) => [h, i]));
    const ih = findHeaderBy(itemAoa, (row) => ITEM_CODE.some((h) => row.includes(h)) && ITEM_STATUS.some((h) => row.includes(h)));
    if (ih < 0) throw new Error('The item list needs an Item Code column and a Tax Status column.');
    const iHead = itemAoa[ih].map(norm);
    const ci = iHead.indexOf(ITEM_CODE.find((h) => iHead.includes(h)));
    const si = iHead.indexOf(ITEM_STATUS.find((h) => iHead.includes(h)));
    const erp2i = iHead.indexOf('ERP2 Tax Status');
    const items = new Map(), erp2Items = new Map();
    for (let r = ih + 1; r < itemAoa.length; r++) { const row = itemAoa[r]; if (!row) continue; const k = low(row[ci]); if (k && !items.has(k)) items.set(k, norm(row[si])); if (k && erp2i >= 0 && !erp2Items.has(k)) erp2Items.set(k, norm(row[erp2i])); }
    // lookups from Dump 2 Copy (orders in the report)
    const byInv = new Map(), byErp = new Map();
    const d2 = res.ix;
    for (const x of res.inc) {
      const info = { merchant: x.merchant, shop: x.finalShip, company: norm(x.row[d2.COMPANY_NAME]), visitor: x.visitor || null, coupon: norm(x.row[d2.COUPON_CODE]) };
      const a = low(x.row[d2.INVOICE_NO]); if (a && !byInv.has(a)) byInv.set(a, info);
      const b = low(x.row[d2.ERP_INVOICE_ID]); if (b && !byErp.has(b)) byErp.set(b, info);
    }
    const palm = low(S.palmersBrand || 'Palmers'); const palmersBrand = norm(S.palmersBrand || 'Palmers');
    const lines = [];
    for (let r = hr + 1; r < d3aoa.length; r++) {
      const row = d3aoa[r];
      if (!row || row.every((v) => v === null || v === undefined || v === '')) continue;
      const info = byInv.get(low(row[ix.INVOICE_NO])) || (ix.ERP_INVOICE_ID !== undefined ? byErp.get(low(row[ix.ERP_INVOICE_ID])) : null) || null;
      const sku = norm(row[ix.SKU]);
      const status = items.has(sku.toLowerCase()) ? items.get(sku.toLowerCase()) : null;
      const erp2Status = erp2Items.has(sku.toLowerCase()) ? erp2Items.get(sku.toLowerCase()) : null;
      let finalVat = '';
      const kind = vatKind(status);
      const location = ix.LOCATION_NAME !== undefined ? norm(row[ix.LOCATION_NAME]) : '';
      if (low(location) === 'cosmetics.lk' ? (kind === 'VAT' || kind === 'MIXED') : (location && vatKind(erp2Status) === 'VAT')) finalVat = 'VAT';
      lines.push({ row, coupon: info ? info.coupon : '', merchant: info ? info.merchant : '', shop: info ? info.shop : '', company: info ? info.company : '', sku, status, erp2Status, finalVat,
        amount: num(row[ix.GRAND_TOTAL]), brand: norm(row[ix.BRAND]), location, inCopy: !!info, visitor: info ? info.visitor : null });
    }
    const copy = lines.filter((l) => l.inCopy);
    const p1 = new Map(), p2 = new Map();
    for (const l of copy) {
      if (l.finalVat === 'VAT') p1.set(l.merchant, (p1.get(l.merchant) || 0) + l.amount);
      if (l.finalVat === 'VAT' && low(l.brand) === palm) p2.set(l.merchant, (p2.get(l.merchant) || 0) + l.amount);
    }
    const cmp = (a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' });
    const pivot1 = [...p1.entries()].sort(cmp), pivot2 = [...p2.entries()].sort(cmp);
    // report rows: lines from a Cool Planet visitor sale go to the visitor rows, everything else to the merchant's row
    const byKey = new Map(), byShopKey = new Map(), visitorVat = new Map(), visitorPalm = new Map();
    const MVv = vatMoves(S);
    for (const l of copy) {
      const isPalm = l.finalVat === 'VAT' && low(l.brand) === palm;
      if (l.finalVat !== 'VAT' && !isPalm) continue;
      if (l.visitor) { if (l.finalVat === 'VAT') visitorVat.set(l.visitor, (visitorVat.get(l.visitor) || 0) + l.amount); if (isPalm) visitorPalm.set(l.visitor, (visitorPalm.get(l.visitor) || 0) + l.amount); }
      else if (l.finalVat === 'VAT') { const k = MVv.target(l.merchant, l.coupon); l.reportKey = k; byKey.set(k, (byKey.get(k) || 0) + l.amount); const sk = low(l.shop) + '|' + low(k); byShopKey.set(sk, (byShopKey.get(sk) || 0) + l.amount); }
    }
    const palmByKey = new Map(), palmByShopKey = new Map();
    for (const l of copy) if (l.finalVat === 'VAT' && !l.visitor && low(l.brand) === palm) { const k = MVv.target(l.merchant, l.coupon); palmByKey.set(k, (palmByKey.get(k) || 0) + l.amount); const sk = low(l.shop) + '|' + low(k); palmByShopKey.set(sk, (palmByShopKey.get(sk) || 0) + l.amount); }
    const vatTotal = pivot1.reduce((s, x) => s + x[1], 0), palmersTotal = pivot2.reduce((s, x) => s + x[1], 0);
    const missing = copy.filter((l) => l.status === null);
    const keys = new Set(S.rows.flatMap((r) => keyNames(r.key)));
    const offReport = [...byKey.entries()].filter(([m]) => !keys.has(m));
    const coveredInv = new Set(copy.map((l) => low(l.row[ix.INVOICE_NO])));
    const coveredErp = new Set(ix.ERP_INVOICE_ID !== undefined ? copy.map((l) => low(l.row[ix.ERP_INVOICE_ID])) : []);
    const ordersMissing = res.inc.filter((x) => !coveredInv.has(low(x.row[d2.INVOICE_NO])) && !coveredErp.has(low(x.row[d2.ERP_INVOICE_ID])));
    // item list make-up, to explain an empty VAT pivot
    const kinds = { VAT: 0, MIXED: 0, NON: 0, other: 0 }; for (const st of items.values()) kinds[vatKind(st) || 'other']++;
    const missSkus = new Set(missing.map((l) => l.sku)).size, allSkus = new Set(copy.map((l) => l.sku)).size;
    let emptyWhy = '';
    if (!copy.length) emptyWhy = 'No Dump 3 line belongs to an order in the Dump 2 Copy. Export Dump 3 on the same day as Dump 2 (it must cover this month up to the report date).';
    else if (!kinds.VAT && !kinds.MIXED) emptyWhy = `The item list has ${items.size.toLocaleString('en')} item${items.size === 1 ? '' : 's'} and none is VAT or VAT/Non VAT (${kinds.NON} Non VAT${kinds.other ? ', ' + kinds.other + ' blank/other' : ''}), so nothing can count as VAT. Upload the full ERP 1 item list.`;
    else if (missSkus === allSkus) emptyWhy = `None of the ${allSkus.toLocaleString('en')} SKUs sold is in the item list (${items.size.toLocaleString('en')} items). Upload the full ERP 1 item list, or check that its Item Code matches Dump 3's SKU.`;
    else emptyWhy = `No sold item is VAT: ${missSkus.toLocaleString('en')} of ${allSkus.toLocaleString('en')} SKUs are missing from the item list and the rest are Non VAT${kinds.MIXED ? ' or VAT/Non VAT sold outside ' + (S.vatLocation || 'Cosmetics.lk') : ''}.`;
    const checks = [
      { label: 'Dump 2 orders found in Dump 3', value: res.inc.length - ordersMissing.length, ok: ordersMissing.length === 0,
        msg: ordersMissing.length ? `${ordersMissing.length} orders have no item lines in Dump 3. Export Dump 3 on the same day as Dump 2.` : `${copy.length.toLocaleString('en')} item lines in Copy VAT` },
      { label: 'SKUs not in the item list', value: missing.length, ok: missing.length === 0,
        msg: missing.length ? `${[...new Set(missing.map((l) => l.sku))].slice(0, 12).join(', ')}${new Set(missing.map((l) => l.sku)).size > 12 ? '…' : ''} (${fmtNum(missing.reduce((s, l) => s + l.amount, 0), 2)}) counted as not VAT. Upload the full item list.` : 'All SKUs found' },
      vatTotal > 0
        ? { label: 'VAT sale (Final VAT Status = VAT)', value: vatTotal, ok: true, msg: `Palmers VAT ${fmtNum(palmersTotal, 2)}` }
        : { label: 'VAT sale (Final VAT Status = VAT)', value: 0, ok: false, msg: emptyWhy },
      { label: 'VAT merchants not on the report', value: offReport.length, ok: offReport.length === 0,
        msg: offReport.length ? offReport.map(([m, v]) => `${m} ${fmtNum(v, 2)}`).join(' · ') : 'None' },
    ];
    return { visitorVat, visitorPalm, palmersBrand, headers, ix, lines, copy, pivot1, pivot2, byKey, byShopKey, palmByKey, palmByShopKey, vatTotal, palmersTotal, checks, itemCount: items.size, itemKinds: kinds, emptyWhy };
  }
  function addVatSheets(wb, vat) {
    const H = vat.headers, ix = vat.ix;
    const head = (ws, cols, red) => { const r = ws.getRow(1); cols.forEach((h, i) => { const c = r.getCell(i + 1); c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: red.has(h) ? 'FFC00000' : 'FF1F3864' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
      r.height = 30; ws.views = [{ state: 'frozen', ySplit: 1 }];
      cols.forEach((h, i) => { const col = ws.getColumn(i + 1); col.width = Math.min(34, Math.max(10, h.length + 2));
        if (/TOTAL|PRICE/.test(h)) col.numFmt = '#,##0.00'; }); };
    const cols = []; H.forEach((h) => { cols.push(h); if (h === 'INVOICE_NO') cols.push('FINAL MERCHANT', 'COMPANY_NAME'); if (h === 'SKU') cols.push('Item Status', 'Final VAT Status'); });
    const red = new Set(['FINAL MERCHANT', 'COMPANY_NAME', 'Item Status', 'Final VAT Status']);
    const rowOut = (l) => { const o = []; H.forEach((h, i) => { o.push(cleanVal(l.row[i])); if (h === 'INVOICE_NO') o.push(l.merchant || null, l.company || null); if (h === 'SKU') o.push(l.status === null ? '#N/A' : l.status, l.finalVat || null); }); return o; };
    const d3 = wb.addWorksheet('Dump 3', { properties: { tabColor: { argb: 'FF7F7F7F' } } }); head(d3, cols, red);
    for (const l of vat.lines) d3.addRow(rowOut(l));
    d3.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const cv = wb.addWorksheet('Copy VAT', { properties: { tabColor: { argb: 'FF2F5597' } } }); head(cv, cols, red);
    for (const l of vat.copy) cv.addRow(rowOut(l));
    cv.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const pv = wb.addWorksheet('VAT Pivot', { properties: { tabColor: { argb: 'FF00B050' } } });
    pv.getColumn(1).width = 30; pv.getColumn(2).width = 18; pv.getColumn(2).numFmt = '#,##0.00';
    pv.getColumn(4).width = 30; pv.getColumn(5).width = 18; pv.getColumn(5).numFmt = '#,##0.00';
    const block = (col, filters, data) => {
      let r = 1;
      for (const [k, v] of filters) { pv.getCell(r, col).value = k; pv.getCell(r, col).font = { bold: true }; pv.getCell(r, col + 1).value = v; r++; }
      r++;
      [['Sale Merchant', col], ['Sum of GRAND_TOTAL', col + 1]].forEach(([h, c]) => { const cell = pv.getCell(r, c); cell.value = h; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; });
      r++;
      let tot = 0; for (const [m, v] of data) { pv.getCell(r, col).value = m; pv.getCell(r, col + 1).value = v; tot += v; r++; }
      pv.getCell(r, col).value = 'Grand Total'; pv.getCell(r, col + 1).value = tot;
      [col, col + 1].forEach((c) => { const cell = pv.getCell(r, c); cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; });
    };
    block(1, [['Final VAT Status', 'VAT']], vat.pivot1);
    block(4, [['Final VAT Status', 'VAT'], ['BRAND', vat.palmersBrand]], vat.pivot2);
  }
  function addReviewSheet(wb, res) {
    const ix = res.ix;
    const cr = wb.addWorksheet('Cosmetics Review', { properties: { tabColor: { argb: 'FFC00000' } } });
    const cols = [['Invoice Date', 'INVOICE_DATE', 12], ['ERP_INVOICE_ID', 'ERP_INVOICE_ID', 15], ['Source', 'SOURCE_NAME', 12],
      ['Customer', 'CUSTOMER_NAME', 24], ['Grand Total', 'GRAND_TOTAL', 13], ['POS_SALE', 'POS_SALE', 9], ['POS Warehouse', 'POS_WAREHOUSE', 26],
      ['Status', 'STATUS', 16], ['Coupon Code', 'COUPON_CODE', 18], ['Created By', 'CREATED_BY', 34]];
    cr.getCell('A1').value = 'Orders to confirm: no merchant code, merchant taken from CREATED_BY for now';
    cr.getCell('A1').font = { bold: true, size: 12 };
    cr.getCell('A2').value = 'Ask each person whether the order is really theirs. When confirmed, add the ERP_INVOICE_ID and correct merchant under Invoice overrides in the tool.';
    cr.getCell('A2').font = { italic: true, color: { argb: 'FF808080' } };
    const hdrs = [...cols.map((c) => c[0]), 'Merchant used for now', 'Why', 'Confirmed merchant'];
    const hr = cr.getRow(4);
    hdrs.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } }; });
    cols.forEach((c, i) => { cr.getColumn(i + 1).width = c[2]; });
    cr.getColumn(1).numFmt = 'dd-mm-yyyy'; cr.getColumn(5).numFmt = '#,##0.00';
    cr.getColumn(cols.length + 1).width = 22; cr.getColumn(cols.length + 2).width = 30; cr.getColumn(cols.length + 3).width = 22;
    for (const x of res.review) {
      cr.addRow([...cols.map((c) => (ix[c[1]] === undefined ? null : cleanVal(x.row[ix[c[1]]]))), x.merchant, x.rule, null]);
    }
    cr.views = [{ state: 'frozen', ySplit: 4 }];
    return cr;
  }
  async function buildReview(ExcelJS, res) {
    const wb = new ExcelJS.Workbook(); addReviewSheet(wb, res); return fixOoxml(await wb.xlsx.writeBuffer());
  }
  // strip control characters Excel cannot store (they appear now and then in pasted addresses)
  const cleanVal = (v) => (v === undefined ? null : (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '') : v));

  /* ---------- Promotion analysis ---------- */
  // Most-used coupon codes (non-merchant codes) in a period, voided / returned removed.
  function couponStats(res, from, to, S) {
    const R = makeRules(S); const m = new Map();
    for (const x of res.all) {
      if (x.date === null || x.date < from || x.date > to || R.exclude.has(x.status.toLowerCase())) continue;
      for (const t of new Set(x.tokens)) {
        if (/^mer\d/.test(t)) continue;
        const k = t.toUpperCase(); if (!m.has(k)) m.set(k, { code: k, orders: 0, sales: 0 });
        const v = m.get(k); v.orders++; v.sales += x.amount;
      }
    }
    return [...m.values()].sort((a, b) => b.orders - a.orders || b.sales - a.sales);
  }
  // Merchant Wise / Outlet Wise / by location / by day for the orders in res.inc (a promo run of processDump)
  function promoSummary(res, S) {
    const blank = () => ({ orders: new Set(), showroom: 0, online: 0, discount: 0 });
    const add = (st, x) => { st.orders.add(x.inv); st[x.pos === 1 ? 'showroom' : 'online'] += x.amount; st.discount += x.discount; };
    const byMerchant = new Map(), byVisitor = new Map();
    for (const x of res.inc) {
      const map = x.visitor ? byVisitor : byMerchant, k = x.visitor ? x.visitor : low(x.merchant);
      if (!map.has(k)) map.set(k, blank()); add(map.get(k), x);
    }
    const merge = (sts) => { const o = blank(); for (const s of sts) { if (!s) continue; s.orders.forEach((i) => o.orders.add(i)); o.showroom += s.showroom; o.online += s.online; o.discount += s.discount; } return o; };
    const fin = (label, st, extra) => ({ label, orders: st.orders.size, showroom: st.showroom, online: st.online, total: st.showroom + st.online, discount: st.discount, ...extra });
    const used = new Set();
    const outlets = [];
    const vb = S.visitorBlock || {};
    for (const r of S.rows) {
      let g = outlets.find((o) => o.outlet === r.outlet); if (!g) outlets.push(g = { outlet: r.outlet, rows: [] });
      const names = keyNames(r.key); names.forEach((n) => used.add(n));
      g.rows.push(fin(r.name, merge(names.map((n) => byMerchant.get(n))), { key: r.key }));
      // Cool Planet visitors right after the shop's own merchants
      if ((vb.homeRows || []).length && r.row === Math.max(...vb.homeRows)) {
        for (const sl of res.slots) g.rows.push(fin(sl.name + ' (at ' + (r.outlet || 'shop') + ')', merge(sl.members.map((n) => byVisitor.get(n))), { visitor: true }));
      }
    }
    const others = [...byMerchant.entries()].filter(([k]) => !used.has(k)).map(([k, st]) => fin(res.inc.find((x) => low(x.merchant) === k).merchant, st, { other: true }));
    const all = merge([...byMerchant.values(), ...byVisitor.values()]);
    const grand = fin('Grand Total', all);
    const pct = (v) => grand.total ? v / grand.total : 0;
    for (const g of outlets) { g.rows = g.rows.filter((x) => x.orders || x.total); g.rows.forEach((x) => { x.share = pct(x.total); });
      const t = { orders: g.rows.reduce((s, x) => s + x.orders, 0), showroom: g.rows.reduce((s, x) => s + x.showroom, 0), online: g.rows.reduce((s, x) => s + x.online, 0), discount: g.rows.reduce((s, x) => s + x.discount, 0) };
      g.total = { label: 'Total', ...t, total: t.showroom + t.online }; g.total.share = pct(g.total.total); }
    others.forEach((x) => { x.share = pct(x.total); });
    // Outlet Wise: shop outlets as one line each, online merchants one line each (like the report)
    const outletWise = [];
    for (const g of outlets) {
      if (!g.rows.length) continue;
      if (low(g.outlet) === 'online') g.rows.forEach((x) => outletWise.push({ ...x, outlet: 'Online' }));
      else outletWise.push({ ...g.total, label: g.rows.length === 1 && !g.rows[0].visitor ? g.rows[0].label : 'Total', outlet: g.outlet });
    }
    others.forEach((x) => outletWise.push({ ...x, outlet: 'Not on report' }));
    const days = new Map();
    for (const x of res.inc) { if (!days.has(x.date)) days.set(x.date, blank()); add(days.get(x.date), x); }
    const daily = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([d, st]) => fin(serialToISO(d), st, { date: d }));
    grand.share = 1;
    return { outlets: outlets.filter((g) => g.rows.length), others, outletWise, grand, daily, location: res.pivot, avgOrder: grand.orders ? grand.total / grand.orders : 0 };
  }
  async function buildPromoWorkbook(ExcelJS, res, P, meta) {
    const wb = new ExcelJS.Workbook();
    const NAVY = 'FF1F3864', LIGHT = 'FFD9E1F2';
    const hdr = (ws, r, heads) => { const row = ws.getRow(r); heads.forEach((h, i) => { const c = row.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle', wrapText: true }; }); row.height = 28; };
    const money = '#,##0.00;-#,##0.00;"-"', pctf = '0.0%';
    const title = (ws, text) => { ws.getCell('A1').value = text; ws.getCell('A1').font = { bold: true, size: 13 };
      ws.getCell('A2').value = `Coupon ${meta.codes.join(', ')} (${meta.modeLabel}) · ${meta.fromISO} to ${meta.toISO} · voided / Returned to Store removed`; ws.getCell('A2').font = { italic: true, color: { argb: 'FF808080' } }; };
    const put = (ws, vals, style) => { const r = ws.addRow(vals); if (style === 'bold' || style === 'total') { r.font = { bold: true }; r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; }); } return r; };
    const fmtCols = (ws, widths, fmts) => widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; if (fmts[i]) ws.getColumn(i + 1).numFmt = fmts[i]; });
    // Summary
    const su = wb.addWorksheet('Summary'); title(su, 'PROMOTION ANALYSIS');
    fmtCols(su, [30, 20], [null, null]);
    [['Orders', P.grand.orders], ['Showroom sale (POS_SALE 1)', P.grand.showroom], ['Online sale (POS_SALE 0)', P.grand.online], ['Total sale', P.grand.total],
      ['Discounts given', P.grand.discount], ['Average order', P.avgOrder], ['Days with sales', P.daily.length]].forEach(([k, v], i) => {
      const r = su.getRow(4 + i); r.getCell(1).value = k; r.getCell(1).font = { bold: true }; r.getCell(2).value = v; r.getCell(2).numFmt = typeof v === 'number' && !['Orders', 'Days with sales'].includes(k) ? money : '#,##0'; });
    // Merchant Wise
    const mw = wb.addWorksheet('Merchant Wise'); title(mw, 'MERCHANT WISE');
    fmtCols(mw, [16, 30, 9, 15, 15, 15, 14, 9], [null, null, '#,##0', money, money, money, money, pctf]);
    hdr(mw, 4, ['Outlet', 'Merchant', 'Orders', 'Showroom Sale', 'Online Sale', 'Total Sale', 'Discount', '% of promo']);
    for (const g of P.outlets) {
      g.rows.forEach((x, i) => put(mw, [i === 0 ? g.outlet : '', x.label, x.orders, x.showroom, x.online, x.total, x.discount, x.share]));
      if (g.rows.length > 1 && low(g.outlet) !== 'online') put(mw, ['', 'Total', g.total.orders, g.total.showroom, g.total.online, g.total.total, g.total.discount, g.total.share], 'bold');
    }
    P.others.forEach((x, i) => put(mw, [i === 0 ? 'Not on report' : '', x.label, x.orders, x.showroom, x.online, x.total, x.discount, x.share]));
    put(mw, ['Grand Total', '', P.grand.orders, P.grand.showroom, P.grand.online, P.grand.total, P.grand.discount, 1], 'total');
    mw.views = [{ state: 'frozen', ySplit: 4 }];
    // Outlet Wise
    const ow = wb.addWorksheet('Outlet Wise'); title(ow, 'OUTLET WISE');
    fmtCols(ow, [16, 30, 9, 15, 15, 15, 14, 9], [null, null, '#,##0', money, money, money, money, pctf]);
    hdr(ow, 4, ['Outlet', 'Merchant', 'Orders', 'Showroom Sale', 'Online Sale', 'Total Sale', 'Discount', '% of promo']);
    let prev = null;
    for (const x of P.outletWise) { put(ow, [x.outlet === prev ? '' : x.outlet, x.label, x.orders, x.showroom, x.online, x.total, x.discount, x.share]); prev = x.outlet; }
    put(ow, ['Grand Total', '', P.grand.orders, P.grand.showroom, P.grand.online, P.grand.total, P.grand.discount, 1], 'total');
    ow.views = [{ state: 'frozen', ySplit: 4 }];
    // By location (Final Shipping x Final Merchant)
    const lo = wb.addWorksheet('By Location'); title(lo, 'BY LOCATION (Final Shipping ▸ Final Merchant)');
    fmtCols(lo, [34, 16, 16, 16], [null, money, money, money]);
    hdr(lo, 4, ['Location / Merchant', 'Online (POS 0)', 'Showroom (POS 1)', 'Total']);
    for (const p of P.location) { put(lo, [p.shop, p.online, p.showroom, p.online + p.showroom], 'bold');
      for (const m of p.merchants) { const r = put(lo, [m.merchant, m.online, m.showroom, m.online + m.showroom]); r.getCell(1).alignment = { indent: 2 }; } }
    put(lo, ['Grand Total', P.grand.online, P.grand.showroom, P.grand.total], 'total');
    // By day
    const dy = wb.addWorksheet('By Day'); title(dy, 'BY DAY');
    fmtCols(dy, [14, 9, 15, 15, 15, 14], ['dd-mm-yyyy', '#,##0', money, money, money, money]);
    hdr(dy, 4, ['Date', 'Orders', 'Showroom Sale', 'Online Sale', 'Total Sale', 'Discount']);
    for (const d of P.daily) put(dy, [serialToDate(d.date), d.orders, d.showroom, d.online, d.total, d.discount]);
    put(dy, ['Total', P.grand.orders, P.grand.showroom, P.grand.online, P.grand.total, P.grand.discount], 'total');
    // Orders
    const od = wb.addWorksheet('Orders'); title(od, 'ORDERS');
    const ix = res.ix, g = (x, k) => (ix[k] === undefined ? null : cleanVal(x.row[ix[k]]));
    fmtCols(od, [12, 15, 12, 24, 26, 22, 24, 8, 12, 14, 16, 30], ['dd-mm-yyyy', null, null, null, null, null, null, '0', money, money, null, null]);
    hdr(od, 4, ['Invoice Date', 'ERP_INVOICE_ID', 'Source', 'Customer', 'Coupon Code', 'Final Merchant', 'Final Shipping', 'POS_SALE', 'Discount', 'Grand Total', 'Status', 'Created By']);
    for (const x of [...res.inc].sort((a, b) => a.date - b.date)) od.addRow([x.date !== null ? serialToDate(x.date) : null, x.inv, g(x, 'SOURCE_NAME'), g(x, 'CUSTOMER_NAME'), g(x, 'COUPON_CODE'), x.merchant, x.finalShip, x.pos, x.discount, x.amount, x.status, g(x, 'CREATED_BY')]);
    od.views = [{ state: 'frozen', ySplit: 4 }]; od.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 12 } };
    return fixOoxml(await wb.xlsx.writeBuffer());
  }

  const api = { hasKw, vatMoves, couponStats, promoSummary, buildPromoWorkbook, couponTokens, fixOoxml, keyNames, sumKey, parseWarehouse, isWarehouse, processVat, isDump3, isItemList, vatKind, isoToSerial, serialToISO, serialToDate, computeDays, findHeader, finalMerchant, makeRules, processDump,
    buildReport, buildWorkings, buildReview, fmtNum, REQUIRED };
  return api;
})();

export default SaleEngine;



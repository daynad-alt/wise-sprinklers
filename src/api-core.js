/**
 * Shared API core — Postgres-backed.
 *
 * `createApp(db)` builds the Express app; `db(text, params)` must resolve to an
 * array of rows. In production that's Netlify DB (Neon); in tests it's PGlite.
 * The same code path runs in both, so what we verify locally is what ships.
 */
const express = require('express');

/* --------------------------------- schema -------------------------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vendors (
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, email TEXT,
     phone TEXT, category TEXT, address TEXT, status TEXT NOT NULL DEFAULT 'active',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS clients (
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT,
     address TEXT, city TEXT, status TEXT NOT NULL DEFAULT 'active',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS inventory_items (
     id SERIAL PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
     category TEXT, vendor_id INT REFERENCES vendors(id) ON DELETE SET NULL,
     unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0, unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
     quantity INT NOT NULL DEFAULT 0, reorder_level INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS invoices (
     id SERIAL PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE,
     client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'draft', issue_date TEXT NOT NULL, due_date TEXT,
     tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0, notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
     id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
     inventory_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
     description TEXT NOT NULL, quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
     unit_price DOUBLE PRECISION NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS appointments (
     id SERIAL PRIMARY KEY, client_name TEXT NOT NULL, email TEXT, phone TEXT,
     service TEXT, address TEXT, appt_date TEXT NOT NULL, appt_time TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'requested', notes TEXT,
     reminder_sent INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE(appt_date, appt_time))`,
  `CREATE TABLE IF NOT EXISTS reviews (
     id SERIAL PRIMARY KEY, client_name TEXT NOT NULL, rating INT NOT NULL DEFAULT 5,
     service TEXT, body TEXT, approved INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS payments (
     id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
     amount DOUBLE PRECISION NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT 'card (demo)',
     status TEXT NOT NULL DEFAULT 'paid', paid_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS site_content (
     id SERIAL PRIMARY KEY, ckey TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
     value TEXT, type TEXT NOT NULL DEFAULT 'textarea', sort INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS services (
     id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
     short TEXT, body TEXT, image TEXT, sort INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS media (
     name TEXT PRIMARY KEY, content_type TEXT NOT NULL, data TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
];

// Business availability config for booking.
const BOOKING = {
  slots: ['08:00', '10:00', '13:00', '15:00', '17:00'],
  // 0=Sun .. 6=Sat ; closed Sundays
  openDays: [1, 2, 3, 4, 5, 6],
};

/* --------------------------------- seed ---------------------------------- */
const SEED = {
  vendors: {
    cols: ['id', 'name', 'contact_name', 'email', 'phone', 'category', 'address'],
    rows: [
      [1, 'Hunter Industries', 'Marcy Ruiz', 'orders@hunterirrigation.com', '760-744-5240', 'Irrigation', '1940 Diamond St, San Marcos, CA'],
      [2, 'Rain Bird Corp', 'Dev Patel', 'sales@rainbird.com', '626-812-3400', 'Irrigation', '6991 E Southpoint Rd, Tucson, AZ'],
      [3, 'FX Luminaire', 'Karen Wells', 'support@fxl.com', '800-688-1837', 'Lighting', '1940 Diamond St, San Marcos, CA'],
      [4, 'NDS Drainage', 'Tom Alcorn', 'orders@ndspro.com', '800-726-1994', 'Drainage', '851 N Harvard Ave, Lindsay, CA'],
      [5, 'Gulf Coast Wholesale Supply', 'Ana Flores', 'ana@gcwsupply.com', '281-482-9000', 'General', '2103 Bay Area Blvd, Houston, TX'],
    ],
  },
  clients: {
    cols: ['id', 'name', 'company', 'email', 'phone', 'address', 'city', 'status'],
    rows: [
      [1, 'Robert Mueller', null, 'rmueller@example.com', '281-555-0142', '412 Whispering Pines Dr', 'Friendswood, TX', 'active'],
      [2, 'Priya Nair', null, 'priya.nair@example.com', '832-555-0198', '77 Bayou Bend Ct', 'Pearland, TX', 'active'],
      [3, 'Sunset Ridge HOA', 'Sunset Ridge Community', 'board@sunsetridgehoa.org', '713-555-0110', '1 Community Center Way', 'League City, TX', 'active'],
      [4, 'Daniel Okafor', null, 'dokafor@example.com', '409-555-0175', '2205 Seawall Blvd', 'Galveston, TX', 'active'],
      [5, 'Maplewood Retail Plaza', 'Maplewood Properties LLC', 'facilities@maplewoodplaza.com', '281-555-0221', '900 Commerce St', 'Alvin, TX', 'active'],
      [6, 'Grace Whitfield', null, 'gwhitfield@example.com', '281-555-0166', '18 Heron Lakes Dr', 'Friendswood, TX', 'inactive'],
    ],
  },
  inventory_items: {
    cols: ['id', 'sku', 'name', 'description', 'category', 'vendor_id', 'unit_cost', 'unit_price', 'quantity', 'reorder_level'],
    rows: [
      [1, 'HTR-PGP-04', 'Hunter PGP Ultra Rotor', 'Gear-driven rotor, adjustable arc', 'Sprinkler Heads', 1, 8.5, 19.0, 140, 40],
      [2, 'RB-1804-SAM', 'Rain Bird 1804 Spray Head', '4" pop-up spray body w/ check valve', 'Sprinkler Heads', 2, 3.25, 8.5, 320, 80],
      [3, 'HTR-PGV-100', 'Hunter PGV 1" Valve', 'Inline globe valve, 1 inch', 'Valves', 1, 14.0, 32.0, 60, 20],
      [4, 'HTR-XC-800', 'Hunter X-Core 8-Station Controller', 'Outdoor irrigation controller, 8 zones', 'Controllers', 1, 78.0, 165.0, 18, 6],
      [5, 'RB-ESP-TM2', 'Rain Bird ESP-TM2 Controller', 'Wi-Fi ready modular controller', 'Controllers', 2, 92.0, 189.0, 4, 6],
      [6, 'FXL-LX-LED', 'FX Luminaire LX Path Light', 'Brass LED path light, warm 2700K', 'Lighting', 3, 46.0, 99.0, 55, 20],
      [7, 'FXL-DM-UP', 'FX Luminaire DM Uplight', 'Directional brass uplight fixture', 'Lighting', 3, 52.0, 112.0, 38, 15],
      [8, 'C9-LED-WW', 'C9 LED Bulb — Warm White', 'Commercial-grade C9 LED, per bulb', 'Holiday Lighting', 5, 0.55, 1.75, 2400, 500],
      [9, 'NDS-CB-9', 'NDS 9" Catch Basin', 'Square catch basin w/ grate', 'Drainage', 4, 11.0, 26.0, 45, 15],
      [10, 'NDS-4-PERF', '4" Perforated Drain Pipe (10ft)', 'French drain corrugated pipe', 'Drainage', 4, 6.75, 15.0, 8, 25],
      [11, 'PVC-34-CL200', '3/4" PVC Lateral Pipe (per ft)', 'Class 200 PVC pipe', 'Pipe & Fittings', 5, 0.35, 0.95, 5000, 1000],
      [12, 'WIRE-18-7', '18ga 7-Strand Irrigation Wire (per ft)', 'Direct-burial multi-strand wire', 'Electrical', 5, 0.22, 0.6, 3000, 800],
    ],
  },
  invoices: {
    cols: ['id', 'invoice_number', 'client_id', 'status', 'issue_date', 'due_date', 'tax_rate', 'notes'],
    rows: [
      [1, 'INV-1001', 1, 'paid', '2026-05-02', '2026-05-16', 8.25, 'New 6-zone install, front and back yard.'],
      [2, 'INV-1002', 2, 'sent', '2026-06-10', '2026-06-24', 8.25, 'Landscape lighting — 9 fixtures.'],
      [3, 'INV-1003', 3, 'overdue', '2026-04-18', '2026-05-02', 8.25, 'HOA common-area drainage remediation.'],
      [4, 'INV-1004', 4, 'draft', '2026-07-12', '2026-07-26', 8.25, 'Sprinkler repair — estimate pending approval.'],
      [5, 'INV-1005', 5, 'paid', '2026-06-28', '2026-07-12', 8.25, 'Commercial holiday lighting — roofline install.'],
    ],
  },
  invoice_items: {
    cols: ['id', 'invoice_id', 'inventory_id', 'description', 'quantity', 'unit_price'],
    rows: [
      [1, 1, 4, 'Hunter X-Core 8-station controller', 1, 165.0],
      [2, 1, 1, 'PGP Ultra rotors', 14, 19.0],
      [3, 1, 3, '1" inline valves', 6, 32.0],
      [4, 1, 11, '3/4" PVC lateral pipe', 480, 0.95],
      [5, 1, null, 'Labor — installation (12 hrs)', 12, 85.0],
      [6, 2, 6, 'LX brass path lights', 6, 99.0],
      [7, 2, 7, 'DM brass uplights', 3, 112.0],
      [8, 2, 12, 'Low-voltage wire', 240, 0.6],
      [9, 2, null, 'Labor — lighting design & install (8 hrs)', 8, 85.0],
      [10, 3, 9, '9" catch basins', 8, 26.0],
      [11, 3, 10, '4" perforated drain pipe', 24, 15.0],
      [12, 3, null, 'Labor — trenching & drainage (26 hrs)', 26, 85.0],
      [13, 4, 2, 'Rain Bird 1804 spray heads', 10, 8.5],
      [14, 4, 3, 'Replacement valve', 1, 32.0],
      [15, 4, null, 'Labor — diagnostics & repair (3 hrs)', 3, 85.0],
      [16, 5, 8, 'C9 LED warm-white bulbs', 600, 1.75],
      [17, 5, null, 'Labor — install, takedown & storage', 1, 1450.0],
    ],
  },
  reviews: {
    cols: ['id', 'client_name', 'rating', 'service', 'body', 'approved'],
    rows: [
      [1, 'Robert M.', 5, 'Sprinkler Installation', 'Wise designed a 6-zone system for us and the lawn has never looked better. Professional, on-time, fair price.', 1],
      [2, 'Priya N.', 5, 'Landscape Lighting', 'The uplighting on our oaks is stunning. The crew was tidy and walked us through everything.', 1],
      [3, 'Daniel O.', 5, 'Repair & Diagnostics', 'Found a wire break two other companies missed. Fixed same day. Highly recommend.', 1],
      [4, 'Grace W.', 4, 'Christmas Lighting', 'Beautiful C9 install and they handle takedown. Made the holidays easy.', 1],
    ],
  },
  site_content: {
    cols: ['id', 'ckey', 'label', 'value', 'type', 'sort'],
    rows: [
      [1, 'hero_sub', 'Hero subtext', 'Licensed irrigation, engineered drainage, landscape lighting & Christmas lighting across Brazoria, Galveston & Harris Counties. Quality work. Lasting solutions.', 'textarea', 1],
      [2, 'about_body', 'About paragraph', "We're a family-owned company with over 20 years of hands-on experience in irrigation, drainage, landscape lighting and holiday lighting. Led by a Texas Licensed Irrigator, we believe in honest recommendations, quality workmanship and showing up when we say we will — the same friendly crew from first call to final walkthrough.", 'textarea', 2],
      [3, 'care_body', 'Wise Care paragraph', 'Seasonal tune-ups, priority scheduling and expert eyes on your irrigation and landscape lighting. Bundle both and save more with the Wise Care Bundle.', 'textarea', 3],
      [4, 'reviews_intro', 'Reviews intro', "Real feedback from Gulf Coast homes and businesses we've served.", 'text', 4],
      [5, 'services_heading', 'Services heading', 'Everything your yard needs.', 'text', 5],
    ],
  },
  services: {
    cols: ['id', 'slug', 'title', 'short', 'body', 'image', 'sort'],
    rows: [
      [1, 'sprinkler-install', 'Sprinkler Installation & Upgrades',
        'Custom-designed irrigation engineered for full coverage, water efficiency and long-term reliability.',
        'Every property is different, so we design each system from the ground up — mapping zones to your soil, sun and plantings for even coverage with no dry spots or waste. We install pressure-matched heads, smart Wi-Fi controllers and efficient drip where it belongs, then walk you through the schedule so your lawn thrives while your water bill stays low.',
        '/api/media/svc-install.jpg', 1],
      [2, 'repair', 'Repair & Diagnostics',
        'Broken heads, leaking valves, backflow and controller faults — fixed right the first time.',
        'A stuck valve or hidden wire break can quietly waste hundreds of gallons. We run a full system diagnostic — zone by zone, valve by valve — to find the real cause, not just the symptom. From broken heads and leaks to backflow testing and smart-controller upgrades, we carry the common parts on the truck so most repairs are done the same day.',
        '/api/media/svc-repair.jpg', 2],
      [3, 'drainage', 'Engineered Drainage',
        'French drains, channel drains and catch basins that eliminate standing water for good.',
        'Standing water rots foundations, drowns grass and breeds mosquitoes. We engineer a real solution — grading the flow, then installing French drains, channel drains, catch basins and downspout tie-ins sized to the actual runoff on your lot. The result is a yard that stays dry and usable even after a Gulf Coast downpour.',
        '/api/media/svc-drainage.jpg', 3],
      [4, 'lighting', 'Landscape Lighting',
        'Professional LED design and installation that lifts curb appeal and safety after dark.',
        'Great lighting is about restraint and placement. We design warm, low-voltage LED layouts that highlight your architecture and trees, wash paths for safety, and make your home look its best from the street. Durable brass fixtures and smart timers mean it looks incredible and takes care of itself.',
        '/api/media/svc-lighting.jpg', 4],
      [5, 'christmas', 'Christmas Lighting',
        'Custom-fit C9 LED installs with maintenance, takedown and storage — a hassle-free holiday.',
        'Skip the ladder. We measure, custom-cut and install commercial-grade C9 LED lighting to your rooflines, trees and columns, then maintain it all season. After the holidays we take it down and store it labeled for next year — so it goes up faster and looks perfect every time.',
        '/api/media/svc-christmas.jpg', 5],
      [6, 'wise-care', 'Wise Care Plans',
        'Year-round maintenance for sprinklers and lighting — bundle both and save.',
        'Our Wise Care Plans keep everything running with scheduled seasonal tune-ups, priority booking and a friendly check-up before each season changes. Cover your sprinkler system, your landscape lighting, or bundle both with the Wise Care Bundle for the best value and true year-round peace of mind.',
        '/api/media/svc-care.jpg', 6],
    ],
  },
};

async function insertRows(db, table, cols, rows) {
  if (!rows.length) return;
  const params = [];
  const tuples = rows.map((r) => {
    const ph = r.map((v) => { params.push(v); return `$${params.length}`; });
    return `(${ph.join(',')})`;
  });
  await db(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`, params);
}

async function seed(db) {
  for (const table of ['vendors', 'clients', 'inventory_items', 'invoices', 'invoice_items', 'reviews', 'site_content', 'services']) {
    const n = (await db(`SELECT COUNT(*)::int AS n FROM ${table}`))[0].n;
    if (n > 0) continue; // already has data — don't touch it
    await insertRows(db, table, SEED[table].cols, SEED[table].rows);
    // keep SERIAL sequences ahead of the explicit ids we inserted
    await db(`SELECT setval(pg_get_serial_sequence('${table}','id'), (SELECT COALESCE(MAX(id),1) FROM ${table}))`);
  }
}

// Runs once per warm instance; idempotent + safe to retry.
function makeEnsureReady(db) {
  let promise = null;
  return function ensureReady() {
    if (!promise) {
      promise = (async () => {
        for (const stmt of SCHEMA) await db(stmt);
        await seed(db); // seeds only tables that are still empty (per-table check)
      })().catch((e) => { promise = null; throw e; });
    }
    return promise;
  };
}

/* --------------------------------- app ----------------------------------- */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const eesc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const prettyTime = (t) => { let [h, m] = String(t).split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };

/* ---------- email (sends through the company's own GoDaddy mailbox via SMTP) ---------- */
function emailTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  let nodemailer; try { nodemailer = require('nodemailer'); } catch (e) { return null; }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
const LOGO = 'https://wisesprinklers.netlify.app/api/media/logo.png';
function emailShell(inner) {
  return `<div style="background:#0a1c12;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#0e2618;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.06)">
      <div style="background:#080a09;padding:18px;text-align:center"><img src="${LOGO}" alt="Wise Sprinklers &amp; Lighting" style="height:52px"></div>
      <div style="padding:30px 28px">${inner}</div>
      <div style="background:#080a09;padding:14px;text-align:center;color:#6a776e;font-size:12px">Wise Sprinklers &amp; Lighting · Friendswood, TX · Licensed &amp; Insured · <a href="tel:2819104283" style="color:#37d45f;text-decoration:none">281·910·4283</a></div>
    </div></div>`;
}
function detailRow(label, val) {
  return `<tr><td style="padding:9px 0;color:#8ea79a;font-size:14px;border-bottom:1px solid rgba(255,255,255,.06)">${eesc(label)}</td>
    <td style="padding:9px 0;text-align:right;color:#f3efe4;font-size:14px;font-weight:bold;border-bottom:1px solid rgba(255,255,255,.06)">${eesc(val)}</td></tr>`;
}
async function sendBookingEmails(appt) {
  const t = emailTransport();
  if (!t) return { sent: false, reason: 'email not configured' };
  const from = `"Wise Sprinklers & Lighting" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const notify = process.env.NOTIFY_EMAIL || 'nathan@wisesprinklers.com';
  const when = `${appt.appt_date} at ${prettyTime(appt.appt_time)}`;
  const custInner = `
    <h1 style="color:#37d45f;font-size:22px;margin:0 0 8px">Thanks, ${eesc(appt.client_name.split(' ')[0])}! 🌱</h1>
    <p style="color:#cfd8d0;font-size:15px;line-height:1.6;margin:0 0 20px">We've received your request for a free estimate. A member of our team will reach out shortly to confirm your visit. Here's what we have:</p>
    <table style="width:100%;border-collapse:collapse">
      ${detailRow('Service', appt.service || 'General')}${detailRow('Requested date', when)}
    </table>
    <p style="color:#8ea79a;font-size:13px;margin-top:24px;line-height:1.6">Need to change something or reach us sooner? Just reply to this email or call <a href="tel:2819104283" style="color:#37d45f">281·910·4283</a>. We look forward to taking care of your yard.</p>`;
  const bizInner = `
    <h1 style="color:#37d45f;font-size:21px;margin:0 0 8px">New booking request</h1>
    <p style="color:#cfd8d0;font-size:14px;margin:0 0 18px">A customer just booked through the website.</p>
    <table style="width:100%;border-collapse:collapse">
      ${detailRow('Name', appt.client_name)}${detailRow('Service', appt.service || '—')}
      ${detailRow('Date / time', when)}${detailRow('Phone', appt.phone || '—')}
      ${detailRow('Email', appt.email || '—')}${appt.notes ? detailRow('Notes', appt.notes) : ''}
    </table>
    <p style="color:#8ea79a;font-size:13px;margin-top:20px">Reply to this email to reach the customer directly.</p>`;
  const jobs = [];
  if (appt.email) jobs.push(t.sendMail({ from, to: appt.email, subject: 'We received your request — Wise Sprinklers & Lighting', html: emailShell(custInner) }));
  jobs.push(t.sendMail({ from, to: notify, replyTo: appt.email || undefined, subject: `New booking: ${appt.client_name} — ${when}`, html: emailShell(bizInner) }));
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  return { sent: failed.length === 0, delivered: results.length - failed.length, failed: failed.length, error: failed[0]?.reason?.message };
}

function createApp(db) {
  const ensureReady = makeEnsureReady(db);
  const one = async (text, params) => (await db(text, params))[0];
  const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

  const app = express();
  app.use(express.json({ limit: '12mb' }));
  // permissive CORS so images can be uploaded from the existing site + API is callable anywhere
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(wrap(async (_req, _res, next) => { await ensureReady(); next(); }));
  app.use((req, _res, next) => {
    req.url = req.url.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
    if (req.url === '') req.url = '/';
    next();
  });

  /* clients */
  app.get('/clients', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.status) { p.push(req.query.status); where.push(`status = $${p.length}`); }
    if (req.query.q) { p.push(`%${req.query.q}%`); where.push(`(name ILIKE $${p.length} OR company ILIKE $${p.length} OR email ILIKE $${p.length})`); }
    res.json(await db(`SELECT * FROM clients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`, p));
  }));
  app.get('/clients/:id', wrap(async (req, res) => {
    const c = await one('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    c ? res.json(c) : notFound(res, 'Client');
  }));
  app.get('/clients/:id/invoices', wrap(async (req, res) => {
    if (!(await one('SELECT id FROM clients WHERE id = $1', [req.params.id]))) return notFound(res, 'Client');
    res.json(await db('SELECT * FROM invoices WHERE client_id = $1 ORDER BY issue_date DESC', [req.params.id]));
  }));
  app.post('/clients', wrap(async (req, res) => {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(await one(
      `INSERT INTO clients (name, company, email, phone, address, city, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.name, b.company ?? null, b.email ?? null, b.phone ?? null, b.address ?? null, b.city ?? null, b.status ?? 'active']));
  }));
  const updateClient = wrap(async (req, res) => {
    const cur = await one('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!cur) return notFound(res, 'Client');
    const m = { ...cur, ...req.body };
    res.json(await one(
      `UPDATE clients SET name=$1, company=$2, email=$3, phone=$4, address=$5, city=$6, status=$7 WHERE id=$8 RETURNING *`,
      [m.name, m.company, m.email, m.phone, m.address, m.city, m.status, req.params.id]));
  });
  app.put('/clients/:id', updateClient);
  app.patch('/clients/:id', updateClient);
  app.delete('/clients/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM clients WHERE id = $1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Client');
  }));

  /* vendors */
  app.get('/vendors', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.category) { p.push(req.query.category); where.push(`category = $${p.length}`); }
    if (req.query.status) { p.push(req.query.status); where.push(`status = $${p.length}`); }
    if (req.query.q) { p.push(`%${req.query.q}%`); where.push(`(name ILIKE $${p.length} OR contact_name ILIKE $${p.length})`); }
    res.json(await db(`SELECT * FROM vendors ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`, p));
  }));
  app.get('/vendors/:id', wrap(async (req, res) => {
    const v = await one('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    v ? res.json(v) : notFound(res, 'Vendor');
  }));
  app.get('/vendors/:id/inventory', wrap(async (req, res) => {
    if (!(await one('SELECT id FROM vendors WHERE id = $1', [req.params.id]))) return notFound(res, 'Vendor');
    res.json(await db('SELECT * FROM inventory_items WHERE vendor_id = $1 ORDER BY name', [req.params.id]));
  }));
  app.post('/vendors', wrap(async (req, res) => {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(await one(
      `INSERT INTO vendors (name, contact_name, email, phone, category, address, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.name, b.contact_name ?? null, b.email ?? null, b.phone ?? null, b.category ?? null, b.address ?? null, b.status ?? 'active']));
  }));
  const updateVendor = wrap(async (req, res) => {
    const cur = await one('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    if (!cur) return notFound(res, 'Vendor');
    const m = { ...cur, ...req.body };
    res.json(await one(
      `UPDATE vendors SET name=$1, contact_name=$2, email=$3, phone=$4, category=$5, address=$6, status=$7 WHERE id=$8 RETURNING *`,
      [m.name, m.contact_name, m.email, m.phone, m.category, m.address, m.status, req.params.id]));
  });
  app.put('/vendors/:id', updateVendor);
  app.patch('/vendors/:id', updateVendor);
  app.delete('/vendors/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM vendors WHERE id = $1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Vendor');
  }));

  /* inventory */
  const INV = `SELECT i.*, v.name AS vendor_name FROM inventory_items i LEFT JOIN vendors v ON v.id = i.vendor_id`;
  app.get('/inventory', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.category) { p.push(req.query.category); where.push(`i.category = $${p.length}`); }
    if (req.query.vendor_id) { p.push(req.query.vendor_id); where.push(`i.vendor_id = $${p.length}`); }
    if (req.query.low_stock === 'true') where.push('i.quantity <= i.reorder_level');
    if (req.query.q) { p.push(`%${req.query.q}%`); where.push(`(i.name ILIKE $${p.length} OR i.sku ILIKE $${p.length})`); }
    res.json(await db(`${INV} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.name`, p));
  }));
  app.get('/inventory/low-stock', wrap(async (_req, res) => {
    res.json(await db(`${INV} WHERE i.quantity <= i.reorder_level ORDER BY i.quantity`));
  }));
  app.get('/inventory/:id', wrap(async (req, res) => {
    const it = await one(`${INV} WHERE i.id = $1`, [req.params.id]);
    it ? res.json(it) : notFound(res, 'Inventory item');
  }));
  app.post('/inventory', wrap(async (req, res) => {
    const b = req.body;
    if (!b.sku || !b.name) return res.status(400).json({ error: 'sku and name are required' });
    if (await one('SELECT 1 FROM inventory_items WHERE sku = $1', [b.sku])) return res.status(409).json({ error: `SKU '${b.sku}' already exists` });
    const r = await one(
      `INSERT INTO inventory_items (sku, name, description, category, vendor_id, unit_cost, unit_price, quantity, reorder_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [b.sku, b.name, b.description ?? null, b.category ?? null, b.vendor_id ?? null, b.unit_cost ?? 0, b.unit_price ?? 0, b.quantity ?? 0, b.reorder_level ?? 0]);
    res.status(201).json(await one(`${INV} WHERE i.id = $1`, [r.id]));
  }));
  const updateItem = wrap(async (req, res) => {
    const cur = await one('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (!cur) return notFound(res, 'Inventory item');
    const m = { ...cur, ...req.body };
    await db(
      `UPDATE inventory_items SET sku=$1, name=$2, description=$3, category=$4, vendor_id=$5, unit_cost=$6, unit_price=$7, quantity=$8, reorder_level=$9 WHERE id=$10`,
      [m.sku, m.name, m.description, m.category, m.vendor_id, m.unit_cost, m.unit_price, m.quantity, m.reorder_level, req.params.id]);
    res.json(await one(`${INV} WHERE i.id = $1`, [req.params.id]));
  });
  app.put('/inventory/:id', updateItem);
  app.patch('/inventory/:id', updateItem);
  app.post('/inventory/:id/adjust', wrap(async (req, res) => {
    const cur = await one('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (!cur) return notFound(res, 'Inventory item');
    const delta = Number(req.body.delta);
    if (Number.isNaN(delta)) return res.status(400).json({ error: 'delta (number) is required' });
    await db('UPDATE inventory_items SET quantity = $1 WHERE id = $2', [Math.max(0, cur.quantity + delta), req.params.id]);
    res.json(await one(`${INV} WHERE i.id = $1`, [req.params.id]));
  }));
  app.delete('/inventory/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Inventory item');
  }));

  /* invoices */
  async function hydrate(id) {
    const inv = await one('SELECT * FROM invoices WHERE id = $1', [id]);
    if (!inv) return null;
    const client = await one('SELECT id, name, company, email FROM clients WHERE id = $1', [inv.client_id]);
    const items = (await db('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]))
      .map((it) => ({ ...it, line_total: round2(it.quantity * it.unit_price) }));
    const subtotal = round2(items.reduce((s, it) => s + it.line_total, 0));
    const tax = round2(subtotal * (inv.tax_rate / 100));
    return { ...inv, client: client || null, items, subtotal, tax, total: round2(subtotal + tax) };
  }
  app.get('/invoices', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.status) { p.push(req.query.status); where.push(`inv.status = $${p.length}`); }
    if (req.query.client_id) { p.push(req.query.client_id); where.push(`inv.client_id = $${p.length}`); }
    const rows = await db(
      `SELECT inv.*, c.name AS client_name, c.company AS client_company,
              COALESCE((SELECT SUM(quantity*unit_price) FROM invoice_items WHERE invoice_id = inv.id), 0) AS subtotal
       FROM invoices inv LEFT JOIN clients c ON c.id = inv.client_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY inv.issue_date DESC`, p);
    res.json(rows.map((r) => ({ ...r, subtotal: round2(r.subtotal), total: round2(r.subtotal * (1 + r.tax_rate / 100)) })));
  }));
  app.get('/invoices/:id', wrap(async (req, res) => {
    const inv = await hydrate(req.params.id);
    inv ? res.json(inv) : notFound(res, 'Invoice');
  }));
  app.post('/invoices', wrap(async (req, res) => {
    const b = req.body;
    if (!b.client_id) return res.status(400).json({ error: 'client_id is required' });
    if (!(await one('SELECT 1 FROM clients WHERE id = $1', [b.client_id]))) return res.status(400).json({ error: `client_id ${b.client_id} does not exist` });
    let number = b.invoice_number;
    if (!number) {
      const r = await one(`SELECT COALESCE(MAX(CAST(substring(invoice_number FROM 5) AS INTEGER)), 1000) AS n FROM invoices WHERE invoice_number LIKE 'INV-%'`);
      number = 'INV-' + (r.n + 1);
    }
    if (await one('SELECT 1 FROM invoices WHERE invoice_number = $1', [number])) return res.status(409).json({ error: `invoice_number '${number}' already exists` });
    const inv = await one(
      `INSERT INTO invoices (invoice_number, client_id, status, issue_date, due_date, tax_rate, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [number, b.client_id, b.status || 'draft', b.issue_date || new Date().toISOString().slice(0, 10), b.due_date || null, b.tax_rate ?? 0, b.notes || null]);
    for (const it of b.items || []) {
      await db(`INSERT INTO invoice_items (invoice_id, inventory_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)`,
        [inv.id, it.inventory_id || null, it.description || '(item)', it.quantity ?? 1, it.unit_price ?? 0]);
    }
    res.status(201).json(await hydrate(inv.id));
  }));
  app.put('/invoices/:id', wrap(async (req, res) => {
    const cur = await one('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!cur) return notFound(res, 'Invoice');
    const b = req.body;
    const m = { status: b.status ?? cur.status, issue_date: b.issue_date ?? cur.issue_date, due_date: b.due_date ?? cur.due_date, tax_rate: b.tax_rate ?? cur.tax_rate, notes: b.notes ?? cur.notes };
    await db('UPDATE invoices SET status=$1, issue_date=$2, due_date=$3, tax_rate=$4, notes=$5 WHERE id=$6',
      [m.status, m.issue_date, m.due_date, m.tax_rate, m.notes, req.params.id]);
    if (Array.isArray(b.items)) {
      await db('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
      for (const it of b.items) {
        await db('INSERT INTO invoice_items (invoice_id, inventory_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
          [req.params.id, it.inventory_id || null, it.description || '(item)', it.quantity ?? 1, it.unit_price ?? 0]);
      }
    }
    res.json(await hydrate(req.params.id));
  }));
  app.patch('/invoices/:id/status', wrap(async (req, res) => {
    const allowed = ['draft', 'sent', 'paid', 'overdue', 'void'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    const r = await db('UPDATE invoices SET status = $1 WHERE id = $2 RETURNING id', [req.body.status, req.params.id]);
    if (!r.length) return notFound(res, 'Invoice');
    res.json(await hydrate(req.params.id));
  }));
  app.delete('/invoices/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM invoices WHERE id = $1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Invoice');
  }));

  /* ---------------- availability + appointments ---------------- */
  const invoiceTotal = (inv) => round2((inv.subtotal || 0) * (1 + (inv.tax_rate || 0) / 100));

  app.get('/availability', wrap(async (req, res) => {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    const dow = new Date(date + 'T00:00:00').getDay();
    const open = BOOKING.openDays.includes(dow);
    const booked = (await db(`SELECT appt_time FROM appointments WHERE appt_date = $1 AND status <> 'cancelled'`, [date])).map((r) => r.appt_time);
    res.json({
      date, open,
      slots: BOOKING.slots.map((time) => ({ time, available: open && !booked.includes(time) })),
    });
  }));

  // Public booking
  app.post('/appointments', wrap(async (req, res) => {
    const b = req.body;
    if (!b.client_name || !b.appt_date || !b.appt_time) return res.status(400).json({ error: 'client_name, appt_date and appt_time are required' });
    if (!BOOKING.slots.includes(b.appt_time)) return res.status(400).json({ error: 'invalid time slot' });
    const taken = await one(`SELECT 1 FROM appointments WHERE appt_date=$1 AND appt_time=$2 AND status<>'cancelled'`, [b.appt_date, b.appt_time]);
    if (taken) return res.status(409).json({ error: 'That time slot is already booked' });
    const r = await one(
      `INSERT INTO appointments (client_name, email, phone, service, address, appt_date, appt_time, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'requested') RETURNING *`,
      [b.client_name, b.email ?? null, b.phone ?? null, b.service ?? null, b.address ?? null, b.appt_date, b.appt_time, b.notes ?? null]);
    let email;
    try { email = await sendBookingEmails(r); } catch (e) { email = { sent: false, error: String(e && e.message) }; }
    res.status(201).json({ ...r, email });
  }));

  app.get('/appointments', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.status) { p.push(req.query.status); where.push(`status = $${p.length}`); }
    if (req.query.date) { p.push(req.query.date); where.push(`appt_date = $${p.length}`); }
    res.json(await db(`SELECT * FROM appointments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY appt_date, appt_time`, p));
  }));

  // Demo reminders: confirmed, not yet reminded, in the future
  app.get('/appointments/reminders/due', wrap(async (_req, res) => {
    res.json(await db(`SELECT * FROM appointments WHERE status='confirmed' AND reminder_sent=0 AND appt_date >= to_char(now(),'YYYY-MM-DD') ORDER BY appt_date, appt_time`));
  }));
  app.post('/appointments/:id/remind', wrap(async (req, res) => {
    const r = await db('UPDATE appointments SET reminder_sent=1 WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.length) return notFound(res, 'Appointment');
    res.json({ ...r[0], reminder: 'sent (demo)' });
  }));

  app.get('/appointments/:id', wrap(async (req, res) => {
    const a = await one('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    a ? res.json(a) : notFound(res, 'Appointment');
  }));
  app.patch('/appointments/:id/status', wrap(async (req, res) => {
    const allowed = ['requested', 'confirmed', 'completed', 'cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    const r = await db('UPDATE appointments SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
    r.length ? res.json(r[0]) : notFound(res, 'Appointment');
  }));
  const updateAppt = wrap(async (req, res) => {
    const cur = await one('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
    if (!cur) return notFound(res, 'Appointment');
    const m = { ...cur, ...req.body };
    const r = await one(
      `UPDATE appointments SET client_name=$1, email=$2, phone=$3, service=$4, address=$5, appt_date=$6, appt_time=$7, status=$8, notes=$9 WHERE id=$10 RETURNING *`,
      [m.client_name, m.email, m.phone, m.service, m.address, m.appt_date, m.appt_time, m.status, m.notes, req.params.id]);
    res.json(r);
  });
  app.put('/appointments/:id', updateAppt);
  app.delete('/appointments/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM appointments WHERE id=$1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Appointment');
  }));

  /* ---------------- reviews ---------------- */
  app.get('/reviews', wrap(async (req, res) => {
    const where = [], p = [];
    if (req.query.approved === 'true') where.push('approved = 1');
    else if (req.query.approved === 'false') where.push('approved = 0');
    res.json(await db(`SELECT * FROM reviews ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`, p));
  }));
  app.post('/reviews', wrap(async (req, res) => {
    const b = req.body;
    if (!b.client_name || !b.rating) return res.status(400).json({ error: 'client_name and rating are required' });
    const rating = Math.max(1, Math.min(5, Number(b.rating)));
    const r = await one(
      `INSERT INTO reviews (client_name, rating, service, body, approved) VALUES ($1,$2,$3,$4,0) RETURNING *`,
      [b.client_name, rating, b.service ?? null, b.body ?? null]);
    res.status(201).json(r);
  }));
  app.patch('/reviews/:id/approve', wrap(async (req, res) => {
    const approved = req.body.approved === false ? 0 : 1;
    const r = await db('UPDATE reviews SET approved=$1 WHERE id=$2 RETURNING *', [approved, req.params.id]);
    r.length ? res.json(r[0]) : notFound(res, 'Review');
  }));
  app.delete('/reviews/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM reviews WHERE id=$1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Review');
  }));

  /* ---------------- customer portal + payments (demo) ---------------- */
  app.get('/portal', wrap(async (req, res) => {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const client = await one('SELECT id, name, company, email FROM clients WHERE lower(email)=lower($1)', [email]);
    if (!client) return res.json({ found: false, client: null, invoices: [] });
    const invoices = (await db(
      `SELECT inv.*, COALESCE((SELECT SUM(quantity*unit_price) FROM invoice_items WHERE invoice_id=inv.id),0) AS subtotal
       FROM invoices inv WHERE client_id=$1 ORDER BY issue_date DESC`, [client.id]))
      .map((inv) => ({ id: inv.id, invoice_number: inv.invoice_number, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, subtotal: round2(inv.subtotal), total: invoiceTotal(inv), paid: inv.status === 'paid' }));
    res.json({ found: true, client, invoices });
  }));
  app.get('/invoices/:id/payments', wrap(async (req, res) => {
    res.json(await db('SELECT * FROM payments WHERE invoice_id=$1 ORDER BY paid_at DESC', [req.params.id]));
  }));
  app.post('/invoices/:id/pay', wrap(async (req, res) => {
    const inv = await one(
      `SELECT inv.*, COALESCE((SELECT SUM(quantity*unit_price) FROM invoice_items WHERE invoice_id=inv.id),0) AS subtotal FROM invoices inv WHERE id=$1`, [req.params.id]);
    if (!inv) return notFound(res, 'Invoice');
    if (inv.status === 'paid') return res.status(409).json({ error: 'Invoice already paid' });
    const amount = invoiceTotal(inv);
    await db('INSERT INTO payments (invoice_id, amount, method, status) VALUES ($1,$2,$3,$4)', [inv.id, amount, req.body.method || 'card (demo)', 'paid']);
    await db(`UPDATE invoices SET status='paid' WHERE id=$1`, [inv.id]);
    res.json({ paid: true, invoice_id: inv.id, amount, status: 'paid' });
  }));

  /* ---------------- CMS: editable site content + services ---------------- */
  app.get('/content', wrap(async (_req, res) => { res.json(await db('SELECT * FROM site_content ORDER BY sort, id')); }));
  app.put('/content/:id', wrap(async (req, res) => {
    const r = await db('UPDATE site_content SET value=$1 WHERE id=$2 RETURNING *', [req.body.value ?? '', req.params.id]);
    r.length ? res.json(r[0]) : notFound(res, 'Content');
  }));

  app.get('/services', wrap(async (_req, res) => { res.json(await db('SELECT * FROM services ORDER BY sort, id')); }));
  app.get('/services/:id', wrap(async (req, res) => { const s = await one('SELECT * FROM services WHERE id=$1', [req.params.id]); s ? res.json(s) : notFound(res, 'Service'); }));
  app.post('/services', wrap(async (req, res) => {
    const b = req.body;
    if (!b.title) return res.status(400).json({ error: 'title is required' });
    const slug = (b.slug || b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) + '-' + Date.now().toString(36).slice(-4);
    const nextSort = (await one('SELECT COALESCE(MAX(sort),0)+1 AS n FROM services')).n;
    const r = await one('INSERT INTO services (slug,title,short,body,image,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [slug, b.title, b.short ?? null, b.body ?? null, b.image ?? null, b.sort ?? nextSort]);
    res.status(201).json(r);
  }));
  app.put('/services/:id', wrap(async (req, res) => {
    const cur = await one('SELECT * FROM services WHERE id=$1', [req.params.id]);
    if (!cur) return notFound(res, 'Service');
    const m = { ...cur, ...req.body };
    const r = await one('UPDATE services SET title=$1, short=$2, body=$3, image=$4, sort=$5 WHERE id=$6 RETURNING *',
      [m.title, m.short, m.body, m.image, m.sort, req.params.id]);
    res.json(r);
  }));
  app.delete('/services/:id', wrap(async (req, res) => {
    const r = await db('DELETE FROM services WHERE id=$1 RETURNING id', [req.params.id]);
    r.length ? res.json({ deleted: true, id: Number(req.params.id) }) : notFound(res, 'Service');
  }));

  /* ---------------- media (self-hosted images in the DB) ---------------- */
  app.get('/media', wrap(async (_req, res) => { res.json(await db('SELECT name, content_type, length(data) AS b64len FROM media ORDER BY name')); }));
  app.post('/media', wrap(async (req, res) => {
    const { name, dataUrl } = req.body;
    if (!name || !dataUrl) return res.status(400).json({ error: 'name and dataUrl are required' });
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'dataUrl must be a base64 data URL' });
    await db(`INSERT INTO media (name, content_type, data) VALUES ($1,$2,$3)
              ON CONFLICT (name) DO UPDATE SET content_type=EXCLUDED.content_type, data=EXCLUDED.data, created_at=now()`,
      [name, m[1], m[2]]);
    res.json({ ok: true, name, bytes: Math.round(m[2].length * 0.75) });
  }));
  // server-side import: the function fetches the image itself (no browser CORS/CSP limits)
  app.post('/media/import', wrap(async (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    let r;
    try { r = await fetch(url); } catch (e) { return res.status(502).json({ error: 'fetch failed: ' + e.message }); }
    if (!r.ok) return res.status(502).json({ error: 'source returned ' + r.status });
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const data = Buffer.from(await r.arrayBuffer()).toString('base64');
    await db(`INSERT INTO media (name, content_type, data) VALUES ($1,$2,$3)
              ON CONFLICT (name) DO UPDATE SET content_type=EXCLUDED.content_type, data=EXCLUDED.data, created_at=now()`,
      [name, ct, data]);
    res.json({ ok: true, name, content_type: ct, bytes: Math.round(data.length * 0.75) });
  }));
  app.delete('/media/:name', wrap(async (req, res) => {
    const r = await db('DELETE FROM media WHERE name=$1 RETURNING name', [req.params.name]);
    r.length ? res.json({ deleted: true, name: req.params.name }) : notFound(res, 'Media');
  }));
  app.get('/media/:name', wrap(async (req, res) => {
    const row = await one('SELECT content_type, data FROM media WHERE name=$1', [req.params.name]);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.set('Content-Type', row.content_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(row.data, 'base64'));
  }));

  /* meta */
  app.get('/health', wrap(async (_req, res) => { await db('SELECT 1'); res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() }); }));
  app.get('/summary', wrap(async (_req, res) => {
    const count = async (t) => (await one(`SELECT COUNT(*)::int AS n FROM ${t}`)).n;
    const inventory_value = round2((await one('SELECT COALESCE(SUM(unit_cost*quantity),0) AS v FROM inventory_items')).v);
    const low_stock = await db('SELECT id, sku, name, quantity, reorder_level FROM inventory_items WHERE quantity <= reorder_level ORDER BY quantity');
    const invoices_by_status = await db('SELECT status, COUNT(*)::int AS count FROM invoices GROUP BY status');
    const out = await one(`
      SELECT COALESCE(SUM(t.subtotal * (1 + inv.tax_rate/100.0)), 0) AS amount
      FROM invoices inv JOIN (SELECT invoice_id, SUM(quantity*unit_price) subtotal FROM invoice_items GROUP BY invoice_id) t
      ON t.invoice_id = inv.id WHERE inv.status IN ('sent','overdue')`);
    const pending_reviews = (await one(`SELECT COUNT(*)::int AS n FROM reviews WHERE approved=0`)).n;
    const new_appointments = (await one(`SELECT COUNT(*)::int AS n FROM appointments WHERE status='requested'`)).n;
    const collected = round2((await one(`SELECT COALESCE(SUM(amount),0) AS v FROM payments`)).v);
    res.json({
      counts: {
        clients: await count('clients'), vendors: await count('vendors'),
        inventory_items: await count('inventory_items'), invoices: await count('invoices'),
        appointments: await count('appointments'), reviews: await count('reviews'),
      },
      inventory_value, low_stock, invoices_by_status, outstanding_receivables: round2(out.amount),
      new_appointments, pending_reviews, collected,
    });
  }));
  app.get('/', (_req, res) => res.json({
    name: 'Wise Sprinklers & Lighting — Demo Management API (Netlify DB / Postgres)',
    version: '2.0.0',
    storage: 'Netlify Database (managed Postgres) — data is durable',
    endpoints: {
      meta: ['GET /api/health', 'GET /api/summary'],
      clients: ['GET /api/clients', 'GET /api/clients/:id', 'GET /api/clients/:id/invoices', 'POST /api/clients', 'PUT|PATCH /api/clients/:id', 'DELETE /api/clients/:id'],
      vendors: ['GET /api/vendors', 'GET /api/vendors/:id', 'GET /api/vendors/:id/inventory', 'POST /api/vendors', 'PUT|PATCH /api/vendors/:id', 'DELETE /api/vendors/:id'],
      inventory: ['GET /api/inventory', 'GET /api/inventory/low-stock', 'GET /api/inventory/:id', 'POST /api/inventory', 'PUT|PATCH /api/inventory/:id', 'POST /api/inventory/:id/adjust', 'DELETE /api/inventory/:id'],
      invoices: ['GET /api/invoices', 'GET /api/invoices/:id', 'POST /api/invoices', 'PUT /api/invoices/:id', 'PATCH /api/invoices/:id/status', 'DELETE /api/invoices/:id'],
    },
  }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error', detail: String(err.message || err) }); });

  return app;
}

module.exports = { createApp, makeEnsureReady, SCHEMA, SEED };

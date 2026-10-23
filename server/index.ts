// Local approval server: stores each manager decision (approve / edit / reject) with a
// timestamp in SQLite. Runs on localhost only. No personal data is accepted or stored.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, SIZES } from '../core/types.ts';

const PORT = Number(process.env.API_PORT ?? 8787);
const DB_PATH = fileURLToPath(new URL('./audit.db', import.meta.url));
const ACTIONS = ['approve', 'edit', 'reject'];

const db = new DatabaseSync(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  scenario TEXT NOT NULL,
  action TEXT NOT NULL,
  policy TEXT NOT NULL,
  metrics TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
)`);

/** Removes US tail numbers (N-numbers) from free text before it is stored. */
export const redact = (s: string) => s.replace(/\bN[1-9][0-9]{0,4}[A-HJ-NP-Z]{0,2}\b/g, '[redacted]');

function validPolicy(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  const caps = o.overnightCap as Record<string, unknown> | undefined;
  return !!caps && SIZES.every((s) => Array.isArray(caps[s]) && (caps[s] as unknown[]).every((n) => Number.isInteger(n) && (n as number) >= 0))
    && typeof o.dropAndGoOnlyAt === 'number'
    && Array.isArray(o.overflowOrder) && o.overflowOrder.every((x) => typeof x === 'string');
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/decisions' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 200').all() as Record<string, string | number>[];
    return send(res, 200, rows.map((r) => ({ ...r, policy: JSON.parse(String(r.policy)), metrics: JSON.parse(String(r.metrics)) })));
  }
  if (req.url === '/api/decisions' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 64_000) req.destroy(); });
    req.on('end', () => {
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Body is not JSON.' }); }
      const { scenario, action, policy, metrics, note = '' } = body;
      if (!SCENARIOS.includes(scenario as never)) return send(res, 400, { error: 'Unknown scenario.' });
      if (!ACTIONS.includes(action as string)) return send(res, 400, { error: 'Action must be approve, edit or reject.' });
      if (!validPolicy(policy)) return send(res, 400, { error: 'Policy is missing caps, trigger or overflow order.' });
      if (!metrics || typeof metrics !== 'object') return send(res, 400, { error: 'Metrics are missing.' });
      if (typeof note !== 'string' || note.length > 500) return send(res, 400, { error: 'Note must be text of 500 characters or less.' });
      const ts = new Date().toISOString();
      const info = db.prepare('INSERT INTO decisions (ts, scenario, action, policy, metrics, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ts, scenario as string, action as string, JSON.stringify(policy), JSON.stringify(metrics), redact(note.trim()));
      send(res, 201, { id: Number(info.lastInsertRowid), ts });
    });
    return;
  }
  send(res, 404, { error: 'Not found.' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Approval server on http://127.0.0.1:${PORT} (audit log: ${DB_PATH})`));

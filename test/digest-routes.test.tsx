import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RigConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import type { DigestRow, StatusCounts } from '../src/digest/types.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));

const config: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};

const FULL = '2026-10-28';
const EMPTY = '2026-10-26';
const BAD = '2026-10-27';
const MISSING = '2026-10-20';

const fullLines = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"fail","owner":null}',
  '{"at":"2026-10-28T09:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T10:00:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T10:05:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T10:10:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T08:30:00+01:00","job":"backup/db","status":"ok","owner":"lane-07"}',
];

const badLines = [
  '{"at":"2026-10-27T09:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  'this line is not json {',
  '{"at":"2026-10-27T10:00:00+01:00","job":"backup/db","status":"ok","owner":"lane-07"}',
];

// Jobs in the order the reader sorts them (by job). Page and JSON must agree on this.
const FULL_JOBS = ['backup/db', 'fixtures/refresh', 'lane/sync', 'rig/rotate-logs'];

type DigestJson = { night: string; rows: DigestRow[]; counts: StatusCounts; badLines: number };

// The page's table rows, one string per <tr>, header row dropped.
function bodyRows(html: string): string[] {
  return html.split('<tr').slice(2);
}

beforeAll(() => {
  writeFileSync(join(runsDir, `${FULL}.jsonl`), fullLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a normal night as one table with the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request(`/digest/${FULL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html.split('<table').length - 1).toBe(1);
    expect(bodyRows(html)).toHaveLength(FULL_JOBS.length);
  });

  it('marks retries of 3 or more and any fail with class warn', async () => {
    const html = await (await createApp(config).request(`/digest/${FULL}`)).text();
    const rows = bodyRows(html);
    const refresh = rows.find((r) => r.includes('fixtures/refresh'));
    const rotate = rows.find((r) => r.includes('rig/rotate-logs'));
    const sync = rows.find((r) => r.includes('lane/sync'));
    expect(refresh).toContain('class="warn"');
    expect(rotate).toContain('class="warn"');
    expect(sync).not.toContain('class="warn"');
  });

  it('renders a null owner and a missing error as the dash', async () => {
    const html = await (await createApp(config).request(`/digest/${FULL}`)).text();
    const rotate = bodyRows(html).find((r) => r.includes('rig/rotate-logs'));
    const backup = bodyRows(html).find((r) => r.includes('backup/db'));
    expect(rotate).toContain('\u2014');
    expect(backup).toContain('\u2014');
  });

  it('lists the jobs sorted by job', async () => {
    const html = await (await createApp(config).request(`/digest/${FULL}`)).text();
    const positions = FULL_JOBS.map((job) => html.indexOf(job));
    positions.forEach((p) => expect(p).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders an empty night as "nothing ran"', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(bodyRows(html)).toHaveLength(2);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns rows, counts and badLines for a normal night', async () => {
    const res = await createApp(config).request(`/api/digest/${FULL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(FULL);
    expect(body.rows.map((r) => r.job)).toEqual(FULL_JOBS);
    expect(body.badLines).toBe(0);
    const runs = body.rows.reduce((sum, r) => sum + r.runs, 0);
    expect(runs).toBe(fullLines.length);
    expect(body.counts.ok + body.counts.retry + body.counts.fail).toBe(runs);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns empty rows for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(EMPTY);
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line without changing the row count', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((r) => r.job)).toEqual(['backup/db', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for one night', async () => {
    const html = await (await createApp(config).request(`/digest/${FULL}`)).text();
    const body = (await (await createApp(config).request(`/api/digest/${FULL}`)).json()) as DigestJson;
    const pageOrder = FULL_JOBS.map((job) => html.indexOf(job));
    expect([...pageOrder].sort((a, b) => a - b)).toEqual(pageOrder);
    expect(body.rows.map((r) => r.job)).toEqual(FULL_JOBS);
  });
});

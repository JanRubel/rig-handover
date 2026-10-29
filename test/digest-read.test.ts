import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  if (!night.found) throw new Error('fixture night not found');
  const row = (job: string) => night.rows.find((r) => r.job === job);

  it('folds 5 jobs, sorted by job, and counts the 1 bad line', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('fixtures/refresh: 4 runs, 3 retries, last ok, last error kept', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the row with a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('notes/backup ends in fail', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('keeps times as written, offset and all', () => {
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight on a temp runs dir', () => {
  let dir = '';
  const tmp = () => (dir = mkdtempSync(join(tmpdir(), 'rig-runs-')));
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('no file: not found', () => {
    expect(readNight(tmp(), '2026-01-01')).toEqual({ found: false });
  });

  it('empty file: found, nothing ran', () => {
    writeFileSync(join(tmp(), '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      found: true,
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('a night that is not YYYY-MM-DD is not found, even if the file exists', () => {
    writeFileSync(join(tmp(), 'secret.jsonl'), '{"at":"2026-01-01T00:00:00Z","job":"x","status":"ok","owner":null}\n');
    for (const night of ['secret', '../secret', '2026-1-01', '2026-01-01/../secret', '']) {
      expect(readNight(dir, night)).toEqual({ found: false });
    }
  });

  it('counts lines with missing or invalid fields as bad; blank lines are not bad', () => {
    const lines = [
      '{"at":"2026-01-01T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      '',
      '{"at":"2026-01-01T02:00:00+02:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-01-01T02:00:00+02:00","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T02:00:00+02:00","job":"a","status":"ok"}',
      '{"at":"not a time","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T02:00:00+02:00","job":"a","status":"ok","owner":"x","error":42}',
      '[1,2]',
      'null',
      '   ',
    ];
    writeFileSync(join(tmp(), '2026-01-01.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-01-01');
    expect(night.found && night.badLines).toBe(7);
    expect(night.found && night.rows.length).toBe(1);
    expect(night.found && night.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });
});

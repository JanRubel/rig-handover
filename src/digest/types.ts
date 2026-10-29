// Plan morning-digest, section 1. The contract for the run log reader; page, JSON route,
// board link and route tests are all built against this file.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from its lines in runs/<night>.jsonl.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log: keep the row, the view renders it as —
  runs: number; // lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // `error` of the last line that had one; null if none did
  firstAt: string; // ISO strings as written in the log, offset kept, never converted to UTC
  lastAt: string;
};

// Log lines per status, bad lines excluded. Counts lines, not jobs: runs = ok + retry + fail
// summed over rows. The board link reads this instead of re-folding the rows.
export type StatusCounts = Record<RunStatus, number>;

export type NightDigest =
  | { found: false } // no runs/<night>.jsonl: the route answers 404
  | {
      found: true; // an empty file is found with rows: [] ("nothing ran")
      rows: DigestRow[]; // sorted by job; page and JSON both render this order as is
      counts: StatusCounts;
      badLines: number; // lines that did not parse: counted, never thrown
    };

// Sync, never throws. `night` is YYYY-MM-DD; the file is `${runsDir}/${night}.jsonl`.
export type ReadNight = (runsDir: string, night: string) => NightDigest;

import type { DigestRow } from '../digest/types.js';

const dash = '—';

export function DigestPage({ night, rows, badLines }: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest {night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td class={r.retries >= 3 ? 'warn' : undefined}>{r.retries}</td>
                <td class={r.lastStatus === 'fail' ? 'warn' : undefined}>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 ? (
        <p class="mute">
          {badLines} {badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      ) : null}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest {night}</h1>
      <p class="warn">no run log for this night</p>
    </>
  );
}

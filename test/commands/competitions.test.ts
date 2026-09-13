import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import http from 'node:http';

/** An anchor-build entry-info page with both registration windows open. */
const ENTRY_INFO =
  '<html><body><a name="reg_window"></a><h2>Account Registration</h2>' +
  '<p>You will be able to create your account beginning Friday, August 14, 2026 12:00 AM, EDT through Friday, September 18, 2026 5:00 PM, EDT.</p>' +
  '<p>Judges and stewards may register beginning Friday, August 14, 2026 12:00 AM, EDT through Friday, September 25, 2026 5:00 PM, EDT.</p>' +
  '</body></html>';

/** A page the parser can read nothing at all out of. */
const NOTHING_READABLE = '<html><body><h2>Rules</h2><p>Ship bottles to arrive by 9/16 at 5:00</p></body></html>';

/**
 * A page whose only readable field is the bottle requirement - the one field BCOEM
 * can emit detached from its own section, so it turns up on pages that have
 * nothing else.
 */
const INCIDENTAL_ONLY =
  '<html><body><a name="entry-acceptance-rules"></a><h2>Entry Acceptance Rules</h2>' +
  '<p><strong>Number of Bottles Required Per Entry: 2</strong></p></body></html>';

/**
 * Serves the entry-info page only at `?section=entry`, and whatever the caller
 * chooses at the root.
 *
 * @param root how to answer a request without a section parameter
 * @returns the root URL, the paths that were requested, and a stop function
 */
async function serveCompetition(
  root: (response: http.ServerResponse) => void
): Promise<{ paths: string[]; stop: () => Promise<void>; url: string }> {
  const paths: string[] = [];
  const server = http.createServer((request, response) => {
    paths.push(request.url ?? '');

    if ((request.url ?? '').includes('section=entry')) {
      response.writeHead(200, { 'content-type': 'text/html' }).end(ENTRY_INFO);
      return;
    }

    root(response);
  });

  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  return {
    paths,
    stop: () => new Promise<void>(resolve => { server.close(() => resolve()); }),
    url: `http://127.0.0.1:${address.port}/index.php`,
  };
}

describe('competitions', () => {
  it('shows help', async () => {
    const { stdout } = await runCommand(['competitions', '--help']);
    expect(stdout).to.contain('metadata');
  });

  it('should try the entry-info page when the given URL cannot be fetched', async () => {
    // A finished competition commonly drops or redirects the page a user pastes,
    // which is the very case the extra candidate exists to cover. An unguarded
    // fetch made that failure abort the search instead.
    const { paths, stop, url } = await serveCompetition(response => {
      response.writeHead(404).end('gone');
    });

    try {
      const { stdout } = await runCommand(['competitions', url, '-o', 'csv']);
      expect(paths.some(path => path.includes('section=entry'))).to.equal(true);
      expect(stdout).to.contain('create your account beginning');
    } finally {
      await stop();
    }
  });

  it('should keep searching when the given URL yields nothing readable', async () => {
    const { paths, stop, url } = await serveCompetition(response => {
      response.writeHead(200, { 'content-type': 'text/html' }).end(NOTHING_READABLE);
    });

    try {
      const { stdout } = await runCommand(['competitions', url, '-o', 'csv']);
      expect(paths.some(path => path.includes('section=entry'))).to.equal(true);
      expect(stdout).to.contain('create your account beginning');
    } finally {
      await stop();
    }
  });

  it('should keep searching when the given URL yields only an incidental field', async () => {
    // This is what INCIDENTAL_COLUMNS is for: the bottle requirement alone is not
    // proof a page carries competition metadata, so the search must continue.
    const { paths, stop, url } = await serveCompetition(response => {
      response.writeHead(200, { 'content-type': 'text/html' }).end(INCIDENTAL_ONLY);
    });

    try {
      const { stdout } = await runCommand(['competitions', url, '-o', 'csv']);
      expect(paths.some(path => path.includes('section=entry')), 'must try entry-info').to.equal(true);
      expect(stdout).to.contain('create your account beginning');
    } finally {
      await stop();
    }
  });

  it('should still print an incidental field when no candidate offers more', async () => {
    // Not worth stopping the search for, but once the search is over it beats
    // dropping the value and claiming nothing was published.
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' }).end(INCIDENTAL_ONLY);
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');

    try {
      const { stdout } = await runCommand(['competitions', `http://127.0.0.1:${address.port}/index.php`, '-o', 'csv']);
      expect(stdout).to.contain('Number of Bottles Required Per Entry: 2');
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); });
    }
  });

  it('should report plainly when no candidate publishes metadata', async () => {
    // BCOEM gates the entry-info page behind a login once the windows close.
    const server = http.createServer((_request, response) => {
      response.writeHead(403, { 'content-type': 'text/html' }).end('<html>Login required</html>');
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');

    try {
      const { stderr, stdout } = await runCommand([
        'competitions',
        `http://127.0.0.1:${address.port}/index.php`,
        '-o',
        'csv',
      ]);
      expect(stderr).to.contain('No competition metadata published');
      expect(stdout).to.equal('');
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); });
    }
  });
});

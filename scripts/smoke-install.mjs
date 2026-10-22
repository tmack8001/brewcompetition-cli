// Installs the packed CLI into an empty directory with no lockfile, so
// dependencies resolve to whatever npm picks today, then runs it against local
// fixtures. Extra arguments are install specs, e.g. `cheerio@1.0.0-rc.12`.
import assert from 'node:assert/strict'
import {exec, execSync} from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = {
  '/info': path.join(root, 'test/resources/metadata/bcoem_info.html'),
  '/results': path.join(root, 'test/resources/results/bcoem_results.html'),
}

const q = (s) => JSON.stringify(s)
const sh = (cmd, cwd) => execSync(cmd, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300_000})

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'brewcompetition-smoke-'))
const packDir = path.join(work, 'pack')
const appDir = path.join(work, 'app')
fs.mkdirSync(packDir)
fs.mkdirSync(appDir)

const server = http.createServer((req, res) => {
  const file = fixtures[new URL(req.url, 'http://localhost').pathname]
  res.writeHead(file ? 200 : 404, {'content-type': 'text/html'})
  res.end(file ? fs.readFileSync(file) : 'not found')
})

try {
  sh(`npm pack --pack-destination ${q(packDir)}`, root)
  const tarball = fs.readdirSync(packDir).find((f) => f.endsWith('.tgz'))
  assert.ok(tarball, 'npm pack produced no tarball')

  sh('npm init -y', appDir)
  const extra = process.argv.slice(2).map((spec) => q(spec)).join(' ')
  sh(`npm install --no-audit --no-fund ${q(path.join(packDir, tarball))} ${extra}`, appDir)

  const cli = `node ${q(path.join(appDir, 'node_modules/brewcompetition-cli/bin/run.js'))}`
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const base = `http://127.0.0.1:${server.address().port}`

  // The server shares this process, so the CLI must run asynchronously.
  const run = (args) =>
    new Promise((resolve, reject) => {
      exec(`${cli} ${args}`, {cwd: appDir, timeout: 60_000}, (err, stdout, stderr) => {
        if (err) reject(new Error(`${args}\n${stderr}`))
        else resolve({stderr, stdout})
      })
    })

  const medals = await run(`medals ${base}/results --club "The Bru Club"`)
  assert.ok(Object.keys(JSON.parse(medals.stdout)).length > 0, 'medals printed no categories')
  assert.match(medals.stdout, /Ross Stuart/)

  const info = await run(`competitions ${base}/info`)
  assert.ok(JSON.parse(info.stdout).data.awards_ceremony_start_date, 'competitions printed no awards date')

  console.log(`smoke install OK: ${tarball}`)
} finally {
  server.close()
  fs.rmSync(work, {force: true, maxRetries: 3, recursive: true})
}

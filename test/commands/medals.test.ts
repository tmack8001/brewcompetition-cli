import {runCommand} from '@oclif/test'
import axios from 'axios'
import {expect} from 'chai'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import Medals from '../../src/commands/medals.js'

describe('medals', () => {
  it('requires url argument when no config file provided', async () => {
    const {error} = await runCommand(['medals'])
    expect(error?.message).to.contain('url is required')
  })

  it('shows help', async () => {
    const {stdout} = await runCommand(['medals', '--help'])
    expect(stdout).to.contain('extract competition winners from a URL')
  })

  it('validates output format', async () => {
    const {error} = await runCommand(['medals', 'https://example.com', '--output', 'invalid'])
    expect(error?.message).to.contain('Expected --output')
  })

  describe('failure reporting', () => {
    let originalExitCode: typeof process.exitCode
    let server: http.Server
    let goodUrl: string
    let tmp: string

    before(async () => {
      const page = fs.readFileSync(path.join(process.cwd(), 'test/resources/results/bcoem_results.html'), 'utf8')
      server = http.createServer((_req, res) => {
        res.setHeader('content-type', 'text/html')
        res.end(page)
      })
      await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
      goodUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/`
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medals-test-'))
    })

    after(async () => {
      await new Promise(resolve => { server.close(resolve) })
      fs.rmSync(tmp, {force: true, recursive: true})
    })

    // The command writes with console.*, which runCommand does not capture.
    const logged = {err: [] as string[], out: [] as string[]}
    const realConsole = {error: console.error, log: console.log}

    beforeEach(() => {
      logged.err = []
      logged.out = []
      console.error = (...args: unknown[]) => { logged.err.push(args.join(' ')) }
      console.log = (...args: unknown[]) => { logged.out.push(args.join(' ')) }
      originalExitCode = process.exitCode
      process.exitCode = undefined
    })

    afterEach(() => {
      console.error = realConsole.error
      console.log = realConsole.log
      process.exitCode = originalExitCode
    })

    it('exits non-zero when the competition cannot be read', async () => {
      await Medals.run(['not a url'])
      expect(logged.err.join('\n')).to.contain('Error:')
      expect(process.exitCode).to.equal(1)
    })

    it('reports an unknown BAP competition by key and exits non-zero', async () => {
      const original = axios.defaults.adapter
      axios.defaults.adapter = async config => ({
        config,
        data: String(config.url).includes('/api/') ? 'Not found.' : '<html><div id="root"></div></html>',
        headers: {},
        status: String(config.url).includes('/api/') ? 404 : 200,
        statusText: '',
      }) as never
      try {
        await Medals.run(['https://beerawardsplatform.com/competitions', '-o', 'csv'], process.cwd())
      } finally {
        axios.defaults.adapter = original
      }

      expect(logged.err.join('\n')).to.contain('No BAP competition found for key "competitions"')
      expect(logged.out).to.deep.equal([])
      expect(process.exitCode).to.equal(1)
    })

    it('exits zero when the competition is read', async () => {
      await Medals.run([goodUrl, '-o', 'csv'], process.cwd())
      expect(logged.out.join('\n')).to.contain('Table')
      expect(logged.err).to.deep.equal([])
      expect(process.exitCode).to.not.equal(1)
    })

    it('still prints every readable competition from a config file when one is unreadable, and exits non-zero', async () => {
      const config = path.join(tmp, 'config.json')
      fs.writeFileSync(config, JSON.stringify({brewers: [], club: '', competitions: ['not a url', goodUrl, 'also not a url']}))
      await Medals.run(['-f', config, '-o', 'csv'], process.cwd())
      expect(logged.out.join('\n')).to.contain('Table')
      expect(logged.err.filter(line => line.startsWith('Error:'))).to.have.length(2)
      expect(process.exitCode).to.equal(1)
    })
  })
})

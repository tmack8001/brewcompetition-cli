import {runCommand} from '@oclif/test'
import {expect} from 'chai'

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
})

import {expect, test} from '@oclif/test'

describe('medals', () => {
  test
  .command(['medals'])
  .catch(error => {
    expect(error.message).to.contain('url is required')
  })
  .it('requires url argument when no config file provided')

  test
  .command(['medals', '--help'])
  .exit(0)
  .it('shows help')

  test
  .command(['medals', 'https://example.com', '--output', 'invalid'])
  .catch(error => {
    expect(error.message).to.contain('Expected --output')
  })
  .it('validates output format')
})

# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Brew Competition CLI seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please Do Not

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before it has been addressed

### Please Do

**Report security vulnerabilities by emailing the maintainer directly:**

- Email: [Create an issue with "SECURITY" in the title and we'll provide contact info]
- Include:
  - Description of the vulnerability
  - Steps to reproduce
  - Potential impact
  - Suggested fix (if any)

### What to Expect

1. **Acknowledgment**: We'll acknowledge receipt of your vulnerability report within 48 hours
2. **Assessment**: We'll investigate and assess the severity within 5 business days
3. **Fix**: We'll work on a fix and keep you updated on progress
4. **Release**: We'll release a patch and credit you (if desired) in the release notes
5. **Disclosure**: After the fix is released, we'll publish a security advisory

## Security Best Practices

When using Brew Competition CLI:

### For Users

- Keep the package updated to the latest version
- Only fetch results from trusted competition URLs
- Be cautious with config files from untrusted sources
- Review output before sharing (may contain personal information)

### For Contributors

- Never commit credentials, API keys, or sensitive data
- Validate and sanitize all user inputs
- Use parameterized queries for any database operations
- Keep dependencies up to date
- Run `npm audit` regularly and fix vulnerabilities

## Known Security Considerations

### Data Privacy

- The tool fetches publicly available competition results
- Results may contain personal information (names, clubs)
- Users are responsible for handling data appropriately
- No data is stored or transmitted to third parties

### Network Security

- All HTTP requests should use HTTPS when available
- The tool does not execute arbitrary code from fetched pages
- HTML parsing is done safely with Cheerio (no eval)

### Dependencies

- We regularly update dependencies to patch vulnerabilities
- Run `npm audit` to check for known vulnerabilities
- Critical vulnerabilities are addressed immediately

## Security Updates

Security updates will be released as:
- **Critical**: Immediate patch release
- **High**: Patch within 7 days
- **Medium**: Patch in next minor release
- **Low**: Patch in next release

## Disclosure Policy

- Security issues are disclosed after a fix is available
- We follow responsible disclosure practices
- Security advisories are published on GitHub
- Users are notified through release notes

## Contact

For security concerns, please:
1. Create a GitHub issue with "SECURITY" in the title (we'll provide private contact)
2. Or contact the repository owner directly through GitHub

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be credited in:
- Release notes
- Security advisories
- This document (if desired)

Thank you for helping keep Brew Competition CLI and its users safe!

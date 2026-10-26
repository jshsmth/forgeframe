# Security Policy

ForgeFrame carries data and callbacks between origins, so origin checks, the
iframe sandbox, and prop delivery rules are security boundaries. Please report
any way to bypass them privately.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| 0.x     | No        |

Fixes are released for the latest 1.x version.

## Reporting a vulnerability

Report vulnerabilities through GitHub's private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/jshsmth/forgeframe/security/advisories/new>). Do not open a
public issue or pull request for a suspected vulnerability.

Include the affected version, the consumer and host setup (origins, iframe or
popup, the `domain`, `peers` and `sandbox` settings, and the host's
`consumerOrigins`), and the steps or a minimal reproduction. You can expect an initial
response within 7 days. Please keep the report private until a fix is released.

# Security Policy

ForgeFrame carries data and callbacks between origins, so origin checks, the
iframe sandbox, and prop delivery rules are security boundaries. Please report
any way to bypass them privately.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No        |
| 0.x     | No        |

Fixes are released for the latest 2.x version. 1.x stops receiving fixes when
2.0.0 is released; upgrade with the README's
[migration guide](https://github.com/jshsmth/forgeframe#migrating-from-v1-to-v2).

## Reporting a vulnerability

Report vulnerabilities through GitHub's private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/jshsmth/forgeframe/security/advisories/new>). Do not open a
public issue or pull request for a suspected vulnerability.

Include the affected version, the consumer and host setup (origins, iframe or
popup, the `hostOrigins`, `peers` and `sandbox` settings, and the host's
`consumerOrigins`), and the steps or a minimal reproduction. You can expect an initial
response within 7 days. Please keep the report private until a fix is released.

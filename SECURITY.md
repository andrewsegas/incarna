# Security Policy

## Supported versions

Incarna is developed on the **`main`** branch. Security fixes are applied to
`main`. Please make sure you're running the latest `main` before reporting.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |

## Reporting a vulnerability

**Please do not open public issues for security vulnerabilities.**

Instead, report privately using one of these channels:

- **GitHub Security Advisories** — go to the repository's **Security** tab and
  click **"Report a vulnerability"**. This is the preferred method.
- Or contact the maintainer directly: **@andrewsegas**.

When reporting, please include:

- Clear **reproduction steps** (or a proof of concept).
- The impact you observed or expect.
- Any relevant environment details (browser/headset, config, versions).

Please allow **reasonable time** for the issue to be investigated and fixed
before any public disclosure. We appreciate responsible disclosure and will
keep you updated on progress.

## Sensitive surface

Incarna has a small but sensitive attack surface worth understanding:

- **`server.js` proxies API keys and agent access.** The server sits between the
  browser and the underlying AI provider/agent so that credentials never reach
  the client.
- **Keys must stay server-side.** Store API keys in `.env` / `agents.local.json`
  (both gitignored). Never embed keys in front-end code or commit them.
- **Lock public tunnels with `SESSION_TOKEN`.** If you expose Incarna over a
  public tunnel (e.g. for testing on a Quest), set a `SESSION_TOKEN` so that
  random visitors can't drive your agents or consume your API quota.

Thanks for helping keep Incarna and its users safe.

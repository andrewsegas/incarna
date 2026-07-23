# Security

Be honest with yourself about what Incarna is: it runs a small proxy server that
exposes **your** conversational agents and spends **your** API credits
(OpenClaw / ElevenLabs / OpenAI) on every request. Anyone who can reach the link
can talk to your agents and burn your credits. **Treat the link as sensitive.**

This guide covers the practical steps to keep it safe.

## Your API keys stay server-side

`server.js` acts as a proxy. Your OpenClaw / ElevenLabs / OpenAI API keys are
**only ever used server-side** and are **never sent to the browser**. The client
talks to `/api/*` endpoints on your server, and the server makes the upstream
calls. Keep your keys in `.env`.

## Lock a public link with `SESSION_TOKEN`

If you expose Incarna beyond your own machine, set a session token. When the env
var `SESSION_TOKEN` is set, **every `/api/*` call requires that secret**, passed
either as:

- a `?k=SECRET` query parameter in the URL, or
- an `x-incarna-token` header.

The client automatically forwards `?k=` from the page URL, so a locked public link
looks like:

```
https://your-host/?k=YOUR_SECRET
```

Share that full link only with people you trust. Anyone without the token gets
rejected by the API.

```sh
SESSION_TOKEN=some-long-random-secret node server.js
```

Use a long, random value — it's the only thing standing between the internet and
your agents.

## Rate limiting

There's a per-IP **token-bucket rate limiter** on the expensive endpoints
(`/api/agent`, `/api/tts`, `/api/stt`) so a single client can't hammer your
credits. You can tune it with:

- `RATE_LIMIT_CAPACITY` — how many requests are allowed in a burst.
- `RATE_LIMIT_REFILL_MS` — how fast the bucket refills.

## Don't commit secrets

`.env` and `agents.local.json` are **gitignored** and are also **blocked from
static serving**, so the server won't hand them out over HTTP. Keep it that way —
never commit either file, and don't move your secrets into files that are served
statically.

## Exposing a tunnel to the internet: the trade-offs

To use Incarna on a Meta Quest you'll need a public HTTPS URL (a tunnel — see
below). The moment you tunnel, your server is reachable by anyone who finds the
URL. Mitigate this:

- Always set `SESSION_TOKEN` before tunneling, and only share the `?k=` link.
- Rely on the rate limiter, and tune it down if you're worried about abuse.
- Take the tunnel down when you're not using it.
- Assume the URL can leak — the token is your real protection, not obscurity.

## Keep `ALLOW_DEV_WRITES` off in production

The Action Lab can write to `actions.json`, but only when the server is started
with `ALLOW_DEV_WRITES=true`. **Leave it off (the default) in production.** Only
enable it on a local machine when you're actively curating actions.

## Quest requires HTTPS

Serving to a Meta Quest requires **HTTPS**, which means a tunnel (or another
HTTPS-terminating setup). Plain `http://` won't work for WebXR on the headset.
Combine HTTPS with `SESSION_TOKEN` so your public, tunneled link is also a locked
link.

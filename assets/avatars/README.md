# Avatars

Incarna is **avatar-agnostic**: any [VRM](https://vrm.dev) model works, and swapping
one keeps all actions, expressions and lip-sync working (they're built on the VRM standard).

Avatar files are **not** committed to this repo, because many VRM models are
licensed **without redistribution rights**. Bring your own:

## Add an avatar

1. Get a `.vrm` model:
   - Make one for free with **[VRoid Studio](https://vroid.com/en/studio)**, or
   - Download one from **[VRoid Hub](https://hub.vroid.com)** (check each model's
     "conditions of use" — some allow redistribution, most don't).
2. Drop the file in this folder, e.g. `assets/avatars/my-avatar.vrm`.
3. Point an agent at it in `agents.local.json`:
   ```json
   { "id": "assistant", "avatar": "assets/avatars/my-avatar.vrm", ... }
   ```

## Respect the model's license

Open the model's page (or read its embedded VRM metadata) and honour:
`avatarPermission`, `commercialUsage`, `allowRedistribution`, `creditNotation`.
If `creditNotation` is "required", credit the author wherever you show the avatar
(streams, videos, screenshots).

You can inspect a VRM's embedded license with:

```bash
node scripts/vrm-meta.mjs assets/avatars/my-avatar.vrm
```

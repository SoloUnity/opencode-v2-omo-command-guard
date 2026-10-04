# opencode-v2-omo-command-guard

Restricts OMO workflow commands to Orchestrator.

Clone into `~/.config/opencode/plugins/opencode-v2-omo-command-guard`.
Load before OMO Slim in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    "./plugins/opencode-v2-omo-command-guard/plugin",
    "oh-my-opencode-slim@3.0.2"
  ]
}
```

Applies to `/deepwork`, `/reflect`, `/loop`, and `/interview`.

Tests: `cd plugin && npm test`.

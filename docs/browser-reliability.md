# Browser reliability validation

The shared engine now discovers Windows Edge/Chrome installations outside PATH,
keeps idle CDP connections alive, preserves partial frames and retains one target
session across domains. Explicit reconnect clears element references. Managed
shutdown handles Edge's launcher handoff before reusing the isolated profile.

Code consumes the existing browser tool results, including bounded diagnostics;
there is no desktop browser runtime duplication or protocol method rename.

Validation on Windows:

- Full engine suite: 1283 passed, 8 skipped at the broad regression checkpoint.
- Subsequent focused browser tests cover the final lifecycle corrections.
- Real Edge: loopback page, 31 seconds idle, navigation, keyboard-driven state
  change, PNG capture, console checks, reconnect without replay and relaunch.
- The same real-browser scenario passed using the packaged engine, not just the
  source checkout. Its temporary browser processes were closed after testing.
- Code's Rust supervisor successfully started the real packaged engine and
  queried its browser tool catalog in an isolated temporary home.
- Protocol generation check and Rust library tests passed. The running desktop
  executable was left open; an installer was not rebuilt or installed.

Restart `npm run desktop:dev` to load the updated engine. The packaged
`ENGINE_SOURCE.json` marks this as a development build with local changes.

Repeat the native bridge smoke test after packaging:

```text
npm run browser:vertical
```

The browser test verifies a controlled fixture, not the user's game or a live
model's decision to use the tools. No provider request is needed for these checks.

## Chrome exit 21 regression

Reproduced exit 21 with empty stderr by launching two BrowserManager instances
for the same session/profile. Desktop turns created new managers without closing
the previous turn's browser. AgentSession.end now closes its browser even if hooks
fail, and runtime instances use distinct profile subdirectories. The real-browser
test also checks two simultaneous runtimes of one session and verifies that ending
one does not close the other. New desktop turns start fresh browser state.

The sidebar activity indicator now follows engine busy-session IDs independently
of the selected chat. Collapsed projects also indicate ongoing session activity;
selection alone no longer animates.

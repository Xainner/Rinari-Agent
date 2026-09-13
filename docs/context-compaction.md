# Context compaction integration

The Engine owns summarization, budgets and durable projections. Settings → Context
configures automatic compaction, threshold, summarizer and per-model effective windows.
The activity displays “Compactando contexto automáticamente…” and preserves completion,
failure, cancellation and skipped states. Retrying compaction starts a context-only
operation; it does not resend the original user request.

The desktop requires `persistent_context_compaction_v1`. Regenerate protocol types from
the local engine schema and package a development engine after validation. A published
Git pin alone does not include uncommitted source changes; package provenance must
identify this build as development.

Validation and operator commands are documented in Rinari-CLI `docs/context-compaction.md`.
The local development package was updated and verified on 2026-09-13. Start a fresh
`npm run tauri -- dev` process to test it; an already-running Engine retains its loaded
code. Frontend: 92 tests passed. Rust: 18 tests and the opt-in packaged integration passed.

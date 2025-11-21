# PR Checklist

Please read and check all that apply.

Changesets

- [x] This PR includes a Changeset under `.changeset/` describing the change (patch/minor/major) with a clear, user-focused summary
- [ ] OR this PR is docs/tests-only and I added the `skip-changeset` label

Quality

- [x] If fixing a bug, I added a regression test immediately after the fix (API tests with Playwright where applicable)
- [x] I validated streaming semantics (NDJSON/SSE) if touching /v1/responses or /v1/chat/completions
- [x] I kept response shapes and error handling consistent (status, headers, payload)

Multichain/Web3 (if applicable)

- [x] Considered chain-specific behavior and updated docs/tests accordingly

Notes

- Add a changeset via: `bun run changeset`

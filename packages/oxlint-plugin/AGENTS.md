# Repository lint rules

`src/index.ts` registers Hexwardens-specific Oxlint rules. Root `lint.config.ts` owns enablement and path exceptions. Prefer built-in Oxlint rules when configuration can express the same check.

Rules inspect syntax through `vite-plus/lint/plugins`; they must not import application packages. Use the plugin API bundled with Vite+ so the SDK and linter upgrade together.

The tests run the real linter against temporary fixture files through `test/harness.ts`. Before changing a rule, describe the invalid and valid programs it must distinguish and add the corresponding fixtures. An invalid fixture must assert a diagnostic from that rule; valid fixtures must remain silent.

Ported rules come from `brandhaug/b2b-saas-starter` at `1c273c36b72f7fd9d4f867aece3d1787dcffae68`. Theme-specific rules were excluded because Hexwardens has its own design contract.

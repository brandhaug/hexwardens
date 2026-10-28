import { defineConfig } from 'vite-plus'
import {
	type Capability,
	REACT_DOCTOR_RULE_REGISTRY
} from 'oxlint-plugin-react-doctor/core'

// The repo's lint configuration. It lives beside `vite.config.ts` rather than
// inside it because `vp lint` is the single biggest block of policy in the
// repo, and 900 lines of `'error'` hid the ~30 places where a deliberate
// decision was made. `vp` discovers only `vite.config.ts`; that file
// imports `lintConfig` from here, so `vp lint` still runs with no extra flags.
//
// The shape to read for: each plugin is switched on wholesale at `error` from a
// name list, and every deviation — a rule that is off, or a rule that carries
// options — sits in one block at the end of `rules` with the reason it
// deviates. Per-path exemptions live in `overrides`, one comment per block.

/**
 * Rule names as whitespace-separated text rather than an array: the formatter
 * fills these lines, so a plugin's enabled set stays a paragraph instead of one
 * line per rule.
 */
function ruleNames(list: string): Array<string> {
	return list.split(/\s+/u).filter((name) => name.length > 0)
}

/**
 * Switch every named rule of one plugin on at `error`. `prefix` carries its own
 * separator so the core ESLint rules can pass an empty one.
 */
function enable(prefix: string, list: string): Record<string, 'error'> {
	return Object.fromEntries(
		ruleNames(list).map((name) => [`${prefix}${name}`, 'error'])
	)
}

// --- Bulk enablement -------------------------------------------------------
// oxlint's Rust plugins expose no importable rule registry, so their enabled
// sets are spelled out. Adding a name here is the whole gesture; the severity
// is always `error` and lives in `enable`.

// ESLint core rules oxlint reimplements.
const CORE = `
  array-callback-return block-scoped-var curly default-case-last default-param-last
  eqeqeq guard-for-in no-array-constructor no-await-in-loop no-case-declarations
  no-constructor-return no-duplicate-imports no-empty no-empty-function no-eq-null
  no-extend-native no-fallthrough no-implied-eval no-label-var no-labels
  no-lone-blocks no-lonely-if no-loop-func no-multi-str no-nested-ternary no-new-func
  no-new-wrappers no-object-constructor no-param-reassign no-promise-executor-return
  no-proto no-prototype-builtins no-regex-spaces no-return-assign no-script-url
  no-self-compare no-sequences no-shadow no-template-curly-in-string no-throw-literal
  no-unexpected-multiline no-unmodified-loop-condition no-unneeded-ternary
  no-unreachable-loop no-unused-expressions no-useless-call no-useless-concat
  no-useless-constructor no-useless-rename no-var object-shorthand prefer-const
  prefer-exponentiation-operator prefer-object-has-own prefer-object-spread
  prefer-regex-literals prefer-template preserve-caught-error radix
`

// TypeScript discipline (oxlint's typescript plugin, spelled with the
// typescript-eslint prefix). The type-aware members rely on `options.typeAware`.
const TYPESCRIPT = `
  adjacent-overload-signatures await-thenable ban-tslint-comment
  consistent-generic-constructors no-array-delete no-base-to-string
  no-confusing-non-null-assertion no-deprecated no-duplicate-enum-values
  no-duplicate-type-constituents no-dynamic-delete no-empty-object-type
  no-explicit-any no-extra-non-null-assertion no-extraneous-class
  no-floating-promises no-for-in-array no-invalid-void-type no-misused-new
  no-misused-promises no-misused-spread no-mixed-enums no-namespace
  no-non-null-asserted-nullish-coalescing no-non-null-asserted-optional-chain
  no-non-null-assertion no-require-imports no-this-alias
  no-unnecessary-boolean-literal-compare no-unnecessary-condition
  no-unnecessary-template-expression no-unnecessary-type-constraint
  no-unsafe-declaration-merging no-unsafe-enum-comparison no-unsafe-function-type
  no-wrapper-object-types prefer-enum-initializers prefer-for-of prefer-function-type
  prefer-literal-enum-member prefer-namespace-keyword prefer-optional-chain
  prefer-ts-expect-error require-array-sort-compare require-await
  restrict-plus-operands return-await switch-exhaustiveness-check
  triple-slash-reference unbound-method use-unknown-in-catch-callback-variable
`

const UNICORN = `
  catch-error-name consistent-date-clone consistent-empty-array-spread
  consistent-existence-index-check error-message filename-case new-for-builtins
  no-abusive-eslint-disable no-accessor-recursion no-array-fill-with-reference-type
  no-array-sort no-await-expression-member no-await-in-promise-methods
  no-confusing-array-with no-document-cookie no-empty-file no-hex-escape
  no-instanceof-array no-invalid-fetch-options no-invalid-remove-event-listener
  no-length-as-slice-end no-magic-array-flat-depth no-negated-condition
  no-negation-in-equality-check no-new-array no-object-as-default-parameter
  no-single-promise-in-promise-methods no-thenable no-typeof-undefined
  no-unnecessary-array-splice-count no-unnecessary-await no-unnecessary-slice-end
  no-unreadable-array-destructuring no-useless-fallback-in-spread
  no-useless-length-check no-useless-promise-resolve-reject no-useless-spread
  no-useless-switch-case no-zero-fractions numeric-separators-style prefer-array-find
  prefer-array-flat-map prefer-array-index-of prefer-array-some prefer-at
  prefer-blob-reading-methods prefer-classlist-toggle prefer-date-now
  prefer-dom-node-append prefer-dom-node-text-content prefer-event-target
  prefer-import-meta-properties prefer-keyboard-event-key
  prefer-logical-operator-over-ternary prefer-math-min-max prefer-modern-dom-apis
  prefer-modern-math-apis prefer-native-coercion-functions prefer-node-protocol
  prefer-number-properties prefer-object-from-entries prefer-optional-catch-binding
  prefer-regexp-test prefer-set-has prefer-set-size prefer-single-call prefer-spread
  prefer-string-raw prefer-string-replace-all prefer-string-slice
  prefer-structured-clone prefer-type-error require-array-join-separator
  require-number-to-fixed-digits-argument require-post-message-target-origin
  switch-case-braces text-encoding-identifier-case
`

const OXC = `
  approx-constant bad-array-method-on-arguments bad-bitwise-operator
  bad-char-at-comparison bad-comparison-sequence bad-match-all-arg bad-min-max-func
  bad-object-literal-comparison bad-replace-all-arg branches-sharing-code
  const-comparisons double-comparisons erasing-op misrefactored-assign-op
  missing-throw no-accumulating-spread no-async-endpoint-handlers no-barrel-file
  number-arg-out-of-range only-used-in-recursion uninvoked-array-callback
`

const IMPORT = `
  export no-absolute-path no-cycle no-duplicates no-empty-named-blocks
  no-mutable-exports no-named-as-default no-self-import
`

const PROMISE = `
  always-return no-callback-in-promise no-multiple-resolved no-nesting no-new-statics
  no-promise-in-callback no-return-wrap param-names prefer-catch spec-only
  valid-params
`

const VITEST = `
  consistent-vitest-vi hoisted-apis-on-top no-alias-methods no-commented-out-tests
  no-conditional-tests no-disabled-tests no-duplicate-hooks no-focused-tests
  no-identical-title no-import-node-test no-standalone-expect no-test-prefixes
  no-test-return-statement no-unneeded-async-expect-function
  padding-around-test-blocks prefer-comparison-matcher prefer-each
  prefer-equality-matcher prefer-hooks-in-order prefer-hooks-on-top prefer-spy-on
  prefer-to-be-object prefer-to-contain prefer-to-have-length
  require-to-throw-message valid-describe-callback valid-expect
  valid-expect-in-promise
`

const REACT = `
  button-has-type checked-requires-onchange-or-readonly display-name error-boundaries
  globals hook-use-state iframe-missing-sandbox immutability incompatible-library
  jsx-boolean-value jsx-key jsx-no-comment-textnodes
  jsx-no-constructed-context-values jsx-no-duplicate-props jsx-no-script-url
  jsx-no-target-blank jsx-no-undef jsx-pascal-case jsx-props-no-spread-multi
  no-children-prop no-clone-element no-danger no-danger-with-children
  no-direct-mutation-state no-find-dom-node no-is-mounted
  no-object-type-as-default-prop no-render-return-value no-string-refs no-this-in-sfc
  no-unknown-property no-unstable-nested-components only-export-components
  preserve-manual-memoization purity refs require-render-return self-closing-comp
  set-state-in-effect set-state-in-render static-components style-prop-object
  unsupported-syntax use-memo void-dom-elements-no-children void-use-memo
`

const REACT_HOOKS = `
  exhaustive-deps rules-of-hooks
`

const JSX_A11Y = `
  alt-text anchor-has-content anchor-is-valid aria-activedescendant-has-tabindex
  aria-props aria-proptypes aria-role aria-unsupported-elements autocomplete-valid
  click-events-have-key-events heading-has-content html-has-lang iframe-has-title
  img-redundant-alt interactive-supports-focus label-has-associated-control lang
  mouse-events-have-key-events no-access-key no-aria-hidden-on-focusable
  no-distracting-elements no-interactive-element-to-noninteractive-role
  no-noninteractive-element-to-interactive-role no-noninteractive-tabindex
  no-redundant-roles no-static-element-interactions role-has-required-aria-props
  role-supports-aria-props scope tabindex-no-positive
`

// Effect discipline (oxlint-plugin-effect), the full `recommended` preset
// except `noNullish` (see the deviations block). The preset is written for
// Effect-native TypeScript, so the members that assume no JSX and no DOM are
// switched off for `apps/web` in an override.
const EFFECT = `
  noAs noAsyncFunction noDynamicImports noEffectBind noEffectDo noGlobals noNewError
  noNewPromise noNodeBuiltinImport noTernary noTestLifecycleHooks noThrowStatement
  noTryCatch preferEffectFn
`

// The three remaining JS plugins, each listed in full — every rule the plugin
// ships as of the pinned version. anti-slop and vite-plus do export a `rules`
// map and could be derived the way react-doctor is; 26 names between the three
// of them is not worth making every `vp` command load three more plugin modules
// to answer `vp dev`.
const ANTI_SLOP = `
  no-chained-type-assertions no-conditional-empty-object-spread
  no-known-value-widening no-module-mocking no-object-parameters no-reflect-apply
  no-reflect-get no-runtime-typeof no-shape-in-symbol-names no-unknown-parameters
  no-unknown-returns no-unknown-type-aliases no-unsafe-dictionary-type
  no-widen-then-assert require-safety-comment-for-type-assertion
`

const HEXWARDENS = `
  no-effect-internal-tags no-inline-schema-compile
  no-interface-merge-outside-dts no-mismatched-augmentation-context
  no-unknown-error-message prefer-effect-predicate
`

const VITE_PLUS = `
  prefer-vite-plus-imports
`

// --- Restricted members and imports ----------------------------------------
// Four starter plugin rules (no-schema-class, no-unsupported-effect-api,
// no-effect-escape-hatch, no-deep-workspace-imports) enforced nothing oxlint's
// own no-restricted-* rules cannot express, so the plugin rules are gone and
// the behavior lives here as configuration. The constants are shared with the
// overrides below, because an override replaces the base value of every rule
// it names.

// `Schema.Class` and `Schema.TaggedClass` encode a runtime instanceof check
// that a plain object fails even though TypeScript's structural typing accepts
// it, and the starter passes decoded values across worker, queue and HTTP
// boundaries as plain objects. `ErrorClass` and `TaggedError` stay allowed:
// they are how Effect models typed errors.
const SCHEMA_CLASS_MESSAGE =
	'Avoid Schema.Class and Schema.TaggedClass. Encoding them runs an instanceof check that a plain object fails, so use Schema.Struct or Schema.TaggedStruct with Schema.is for runtime checks.'

const RESTRICTED_SCHEMA_PROPERTIES = [
	{ object: 'Schema', property: 'Class', message: SCHEMA_CLASS_MESSAGE },
	{ object: 'Schema', property: 'TaggedClass', message: SCHEMA_CLASS_MESSAGE }
]

// Effect v2 and v3 combinators Effect v4 renamed. They fail as a missing
// export at runtime rather than at the call site, so each message names the
// replacement.
const RESTRICTED_EFFECT_PROPERTIES = [
	{
		object: 'Effect',
		property: 'async',
		message:
			'Effect.async does not exist in Effect v4. Use Effect.callback to adapt a callback API.'
	},
	{
		object: 'Effect',
		property: 'zipRight',
		message:
			'Effect.zipRight does not exist in Effect v4. Use Effect.andThen, or sequence the steps in Effect.gen.'
	},
	{
		object: 'Effect',
		property: 'timeoutFail',
		message:
			'Effect.timeoutFail does not exist in Effect v4. Use Effect.timeoutOrElse and fail with a tagged error in the fallback.'
	}
]

// `die` and its siblings move a failure out of the typed error channel and
// into a defect, so callers lose what the error channel is for and the failure
// surfaces as an opaque 500. Property-only entries: any object's `.die`
// counts, as the deleted rule read it. Test files drop this half in an
// override below.
const RESTRICTED_ESCAPE_HATCH_PROPERTIES = [
	{
		property: 'die',
		message:
			'Avoid die. It turns a typed failure into a defect, so fail with a tagged error and let the caller match on it.'
	},
	{
		property: 'dieMessage',
		message:
			'Avoid dieMessage. It turns a typed failure into a defect, so fail with a tagged error and let the caller match on it.'
	},
	{
		property: 'orDie',
		message:
			'Avoid orDie. It turns a typed failure into a defect, so fail with a tagged error and let the caller match on it.'
	},
	{
		property: 'orDieWith',
		message:
			'Avoid orDieWith. It turns a typed failure into a defect, so fail with a tagged error and let the caller match on it.'
	}
]

// Imports that reach through a workspace package's src/ tree instead of its
// curated exports subpaths, e.g. `@hexwardens/db/src/schema.ts` instead
// of `@hexwardens/db/schema`. The curated subpaths are the packages'
// real interfaces — they keep the browser-safe client and the testing-only
// module out of application code — and the export maps already refuse these
// at runtime; this surfaces the violation at lint time.
const DEEP_WORKSPACE_SRC_IMPORT = {
	group: ['@hexwardens/*/src', '@hexwardens/*/src/**'],
	message:
		"Import through a workspace package's src/ tree. Use the package's curated exports subpath instead (e.g. '@hexwardens/db/schema', or add the subpath to the package's exports map if it is missing)."
}

// --- react-doctor ----------------------------------------------------------
// react-doctor ships hundreds of rules across React ecosystems, which is why this
// one plugin is derived rather than listed. Its registry tags every rule with
// the libraries it needs (`requires`), so the enabled set is "every rule this
// stack can satisfy, minus the five groups below". A react-doctor upgrade that
// adds a rule for a library named in STACK turns that rule on, which is the
// intent.

/** The libraries react-doctor may assume when deciding a rule applies here. */
const STACK: ReadonlySet<Capability> = new Set<Capability>([
	'react',
	'react:18',
	'react:19',
	'react:19.2',
	'ssr',
	'tailwind',
	'tailwind:3.4',
	'tailwind:4',
	'base-ui',
	'shadcn',
	'tanstack-form',
	'tanstack-query',
	'tanstack-start',
	'three',
	'three:181',
	'r3f',
	'r3f:3',
	'r3f:6'
])

// Already reported by an enabled Rust plugin (react, jsx-a11y, react-hooks).
// Two messages for one mistake is the thing to avoid, and the Rust rule is the
// faster of the two. `no-direct-mutation-state` is the one name held by both
// plugins that stays on in both, which is why it is absent from this list.
const RD_DUPLICATED_BY_OXLINT = `
  alt-text anchor-has-content anchor-is-valid aria-activedescendant-has-tabindex
  aria-props aria-proptypes aria-role aria-unsupported-elements autocomplete-valid
  button-has-type checked-requires-onchange-or-readonly click-events-have-key-events
  display-name exhaustive-deps forbid-elements heading-has-content hook-use-state
  html-has-lang iframe-has-title iframe-missing-sandbox img-redundant-alt
  interactive-supports-focus jsx-boolean-value jsx-curly-brace-presence jsx-key
  jsx-no-comment-textnodes jsx-no-constructed-context-values jsx-no-duplicate-props
  jsx-no-script-url jsx-no-undef jsx-no-useless-fragment jsx-pascal-case
  jsx-props-no-spread-multi label-has-associated-control lang
  mouse-events-have-key-events no-access-key no-aria-hidden-on-focusable
  no-children-prop no-clone-element no-danger no-danger-with-children
  no-distracting-elements no-find-dom-node
  no-interactive-element-to-noninteractive-role no-is-mounted no-namespace
  no-noninteractive-element-to-interactive-role no-noninteractive-tabindex
  no-redundant-roles no-render-return-value no-static-element-interactions
  no-string-refs no-this-in-sfc no-unknown-property no-unstable-nested-components
  only-export-components react-in-jsx-scope require-render-return
  role-has-required-aria-props role-supports-aria-props rules-of-hooks scope
  self-closing-comp style-prop-object tabindex-no-positive
  void-dom-elements-no-children
`

// Libraries this repo does not use. react-doctor carries no `requires` token
// for these, so they cannot be gated by STACK: Ink, Jotai, Motion, Redux, React
// Server Components, react-markdown.
const RD_UNUSED_LIBRARIES = `
  ink-ctrl-c-handler-requires-exit-option ink-newline-inside-text
  ink-no-bare-process-exit ink-no-direct-raw-mode ink-no-dom-host-elements
  ink-no-dom-router ink-no-focus-in-render ink-no-layout-inside-text
  ink-no-live-hooks-in-render-to-string ink-no-measure-element-in-render
  ink-no-multiple-static ink-no-raw-text ink-no-repeated-render
  ink-prefer-use-animation ink-prefer-use-paste ink-static-is-append-only
  ink-static-requires-key ink-suspense-requires-concurrent
  ink-use-reactive-window-size ink-use-string-width-for-cursor
  ink-use-suspend-terminal ink-valid-aria-semantics
  jotai-derived-atom-returns-fresh-object jotai-select-atom-in-render-body
  jotai-tq-use-raw-query-atom motion-animate-presence-must-outlive-child
  motion-animate-presence-requires-key motion-animate-presence-wait-single-child
  motion-create-in-render motion-drag-axis-constraint-mismatch
  motion-imperative-animation-in-render motion-keyframe-times-mismatch
  motion-layout-on-inline-element motion-unstable-layout-id-in-iteration
  motion-use-transform-range-length motion-value-constructor-in-render
  motion-value-subscription-in-render react-markdown-unsanitized-raw-html
  redux-useselector-inline-derivation redux-useselector-returns-new-collection
  server-after-nonblocking server-auth-actions server-cache-with-object-literal
  server-dedup-props server-fetch-without-revalidate server-hoist-static-io
  server-no-mutable-module-state server-sequential-independent-await use-lazy-motion
`

// Class-component-era React. This repo has no class components, so none of
// these can fire.
const RD_CLASS_COMPONENTS = `
  forward-ref-uses-ref no-did-mount-set-state no-did-update-set-state
  no-initialize-state no-react-children no-redundant-should-component-update
  no-set-state no-unsafe no-will-update-set-state prefer-es6-class
  prefer-function-component state-in-constructor
`

// JSX style limits the repo does not enforce: file naming, fragment syntax,
// handler naming, nesting depth, prop spreading, inline prop identity.
const RD_JSX_STYLE = `
  forbid-component-props forbid-dom-props jsx-filename-extension jsx-fragments
  jsx-handler-names jsx-max-depth jsx-no-jsx-as-prop jsx-no-new-array-as-prop
  jsx-no-new-function-as-prop jsx-no-new-object-as-prop jsx-props-no-spreading
  no-multi-comp
`

// Individually declined: accessibility checks beyond the enabled jsx-a11y set,
// and single rules the repo has not adopted.
const RD_DECLINED = `
  anchor-ambiguous-text aria-braille-equivalent control-has-associated-label
  empty-table-header html-xml-lang-mismatch iframe-title-unique media-has-caption
  no-aria-hidden-on-body no-array-index-key no-autofocus
  no-duplicate-static-id-reference no-event-handler
  no-focusable-content-in-role-text no-noninteractive-element-interactions
  no-pass-live-state-to-parent no-presentation-role-conflict
  no-reset-all-state-on-prop-change no-server-side-image-map no-unescaped-entities
  prefer-tag-over-role
`

/**
 * Every react-doctor rule the stack satisfies, minus the groups above. Scan
 * rules are excluded wholesale: they read files from disk outside the lint
 * pass.
 */
function reactDoctorRules() {
	const excluded = new Set([
		...ruleNames(RD_DUPLICATED_BY_OXLINT),
		...ruleNames(RD_UNUSED_LIBRARIES),
		...ruleNames(RD_CLASS_COMPONENTS),
		...ruleNames(RD_JSX_STYLE),
		...ruleNames(RD_DECLINED)
	])
	const enabled: Record<string, 'error'> = {}
	for (const [name, meta] of Object.entries(REACT_DOCTOR_RULE_REGISTRY)) {
		if (meta.isScanRule || excluded.has(name)) {
			continue
		}
		if (!(meta.requires ?? []).every((capability) => STACK.has(capability))) {
			continue
		}
		if (meta.disabledWhen?.some((capability) => STACK.has(capability))) {
			continue
		}
		enabled[`react-doctor/${name}`] = 'error'
	}
	return enabled
}

const { lint = {} } = defineConfig({
	lint: {
		plugins: [
			'typescript',
			'react',
			'jsx-a11y',
			'oxc',
			'unicorn',
			'import',
			'promise',
			'vitest'
		],
		jsPlugins: [
			'eslint-plugin-better-tailwindcss',
			'oxlint-plugin-effect/plugin',
			{
				name: 'anti-slop',
				specifier: './node_modules/ultracite/config/oxlint/anti-slop/plugin.mjs'
			},
			{
				name: 'hexwardens',
				specifier: './packages/oxlint-plugin/src/index.ts'
			},
			{ name: 'react-doctor', specifier: 'oxlint-plugin-react-doctor' },
			{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }
		],
		settings: {
			'better-tailwindcss': { entryPoint: 'apps/web/src/index.css' }
		},
		options: {
			reportUnusedDisableDirectives: 'deny',
			typeAware: true,
			typeCheck: false
		},
		categories: { correctness: 'error', suspicious: 'error', perf: 'error' },
		env: { browser: true, node: true, es2024: true, builtin: true },
		ignorePatterns: [
			'.agents/**',
			'.claude/**',
			'.codex/**',
			'node_modules/**',
			'**/node_modules/**',
			'**/dist/**',
			'**/.output/**',
			'**/dev-dist/**',
			'**/.alchemy/**',
			'**/routeTree.gen.ts',
			'**/worker-configuration.d.ts',
			'**/playwright-report/**',
			'**/test-results/**'
		],
		rules: {
			...enable('', CORE),
			...enable('@typescript-eslint/', TYPESCRIPT),
			...enable('unicorn/', UNICORN),
			...enable('oxc/', OXC),
			...enable('import/', IMPORT),
			...enable('promise/', PROMISE),
			...enable('vitest/', VITEST),
			...enable('react/', REACT),
			...enable('react-hooks/', REACT_HOOKS),
			...enable('jsx-a11y/', JSX_A11Y),
			...enable('effect/', EFFECT),
			...enable('anti-slop/', ANTI_SLOP),
			...enable('hexwardens/', HEXWARDENS),
			...enable('vite-plus/', VITE_PLUS),
			...reactDoctorRules(),
			'@typescript-eslint/ban-ts-comment': [
				'error',
				{ minimumDescriptionLength: 10 }
			],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' }
			],
			'@typescript-eslint/no-confusing-void-expression': [
				'error',
				{ ignoreArrowShorthand: true }
			],
			// Const assertions and unsafe casts share the Effect rule; avoid contradictory suggestions.
			'@typescript-eslint/prefer-as-const': 'off',
			// TaggedError is a curried Effect schema factory, not an Error constructor.
			'unicorn/throw-new-error': 'off',
			// Renaming catch bindings can shadow an outer error accumulator.
			'unicorn/catch-error-name': 'off',
			'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
			'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
			'no-console': 'error',
			// Effect public tagged unions use _tag as their documented discriminant.
			'no-underscore-dangle': [
				'error',
				{ allow: ['_tag'], allowFunctionParams: true }
			],
			'no-restricted-imports': [
				'error',
				{ patterns: [DEEP_WORKSPACE_SRC_IMPORT] }
			],
			'no-restricted-properties': [
				'error',
				...RESTRICTED_SCHEMA_PROPERTIES,
				...RESTRICTED_EFFECT_PROPERTIES,
				...RESTRICTED_ESCAPE_HATCH_PROPERTIES
			],
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					fix: { imports: 'safe-fix', variables: 'off' }
				}
			],
			'no-warning-comments': ['error', { terms: ['@nocommit'] }],
			'react/function-component-definition': [
				'error',
				{
					namedComponents: 'function-declaration',
					unnamedComponents: 'arrow-function'
				}
			],
			'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],
			'unicorn/no-useless-undefined': [
				'error',
				{ checkArguments: false, checkArrowFunctionBody: false }
			],
			'react-in-jsx-scope': 'off'
		},
		overrides: [
			{
				// These asset tests use shared assertion functions to validate every registry entry.
				files: [
					'apps/web/src/**/visual-registry-rig.test.ts',
					'apps/web/src/**/visual-registry-attribution.test.ts'
				],
				rules: {
					'vitest/expect-expect': [
						'error',
						{
							assertFunctionNames: [
								'expect',
								'assertRigNames',
								'assertAllMeshEntriesHaveAttribution'
							]
						}
					]
				}
			},

			{
				// Storybook and asset inspection execute in Node, outside browser bundles.
				files: [
					'apps/web/.storybook/main.ts',
					'apps/web/src/components/game/animation-clips.test.ts'
				],
				rules: { 'effect/noNodeBuiltinImport': 'off' }
			},
			{
				// Fixture factories deliberately throw on invalid test setup.
				files: ['apps/web/src/lib/moment-feedback/test-helpers.ts'],
				rules: { 'effect/noThrowStatement': 'off', 'effect/noNewError': 'off' }
			},
			{
				// Concurrent host asset traversal uses native promises.
				files: ['tools/check-tri-counts.ts'],
				rules: { 'effect/noNewPromise': 'off' }
			},
			{
				// Game snapshots share unchanged data; each changed element must get a fresh object.
				files: ['packages/game-logic/src/**'],
				rules: { 'oxc/no-map-spread': 'off' }
			},

			{
				// The Node-only Vite shim applies D1 migrations in ledger order.
				files: ['apps/web/src/lib/cloudflare-workers-shim.ts'],
				rules: {
					'effect/noNodeBuiltinImport': 'off',
					'effect/noTryCatch': 'off',
					'effect/noThrowStatement': 'off',
					'effect/noNewError': 'off',
					'no-await-in-loop': 'off',
					'react-doctor/async-await-in-loop': 'off'
				}
			},
			{
				// Miniflare integration fixtures run in the Node test host.
				files: ['apps/game-server/src/test/d1-fixture.ts'],
				rules: { 'effect/noNodeBuiltinImport': 'off' }
			},
			{
				// CLI operational checks deliberately use the native Node test runner.
				files: [
					'infra/operations.test.ts',
					'infra/backup.test.ts',
					'.github/scripts/*.test.ts'
				],
				rules: { 'vitest/no-import-node-test': 'off' }
			},
			{
				// Deployment smoke retries must remain bounded and sequential.
				files: ['.github/scripts/deployment.ts'],
				rules: {
					'no-await-in-loop': 'off',
					'react-doctor/async-await-in-loop': 'off'
				}
			},
			{
				// The host file-copy adapter uses native Promise APIs.
				files: ['packages/db/scripts/sync-d1-migrations.ts'],
				rules: { 'effect/noNewPromise': 'off' }
			},
			{
				// Custom progress graphics, controlled modal overlays and SVG logos preserve their native renderer semantics.
				files: [
					'apps/web/src/components/game/tile-item-miniature.tsx',
					'apps/web/src/routes/profile.$username.tsx',
					'apps/web/src/components/game/game-over-overlay.tsx',
					'apps/web/src/components/game/shortcut-help-overlay.tsx',
					'apps/web/src/components/game/game-dialog-panel.tsx',
					'apps/web/src/components/logo.tsx'
				],
				rules: { 'jsx-a11y/prefer-tag-over-role': 'off' }
			},

			{
				// Existing compact game labels follow DESIGN.md tokens; this tooling port preserves their sizes.
				files: [
					'apps/web/src/components/achievements-gallery.tsx',
					'apps/web/src/components/landing-shell.tsx',
					'apps/web/src/components/online-presence-bar.tsx',
					'apps/web/src/routes/lobby.tsx',
					'apps/web/src/routes/profile.$username.tsx',
					'apps/web/src/components/game/action-bar.tsx',
					'apps/web/src/components/game/capture-badge.tsx',
					'apps/web/src/components/game/menu-button.tsx',
					'apps/web/src/components/game/onboarding-prompt.tsx',
					'apps/web/src/components/game/perk-choice-panel.tsx',
					'apps/web/src/components/game/saved-match-prompt.tsx',
					'apps/web/src/components/game/tile-item-miniature.tsx',
					'apps/web/src/components/game/top-bar.tsx',
					'apps/web/src/components/game/unit-miniature.tsx',
					'apps/web/src/components/lobby/daily-challenge-briefing.tsx',
					'apps/web/src/components/lobby/invite-token.tsx',
					'apps/web/src/components/lobby/lobby-seat.tsx',
					'apps/web/src/components/lobby/tribe-banner.tsx'
				],
				rules: {
					'react-doctor/no-tiny-text': 'off',
					'react-doctor/no-tiny-uppercase-tracked-label': 'off'
				}
			},
			{
				// Unknown inputs are deliberate at schema, WebSocket, and route parsing boundaries.
				files: [
					'packages/game-logic/src/match/initializer.ts',
					'packages/game-logic/src/fog-of-war/schema.ts',
					'packages/game-logic/src/multiplayer/codec.ts',
					'apps/web/src/lib/game-client.ts',
					'apps/web/src/routes/game.tsx',
					'apps/web/src/routes/profile.$username.tsx'
				],
				rules: { 'anti-slop/no-unknown-parameters': 'off' }
			},

			{
				// These imports deliberately split heavy rendering and service-worker code.
				files: [
					'apps/web/src/components/game/board.tsx',
					'apps/web/src/components/game/tech-tree-panel.tsx',
					'apps/web/src/components/wiki/wiki-tech-tree.tsx',
					'apps/web/src/components/landing-hero-showcase.tsx',
					'apps/web/src/components/pwa-service-worker.tsx'
				],
				rules: { 'effect/noDynamicImports': 'off' }
			},

			{
				// Pure game rules and native Durable Object callbacks keep their synchronous/Promise contracts.
				// Effect services still use typed errors and the unsafe-cast restrictions below.
				files: ['packages/game-logic/**', 'apps/game-server/**'],
				rules: {
					'effect/noAsyncFunction': 'off',
					'effect/noTernary': 'off',
					'effect/noGlobals': 'off',
					'effect/noThrowStatement': 'off',
					'effect/noNewError': 'off',
					'effect/noNewPromise': 'off',
					'effect/noTryCatch': 'off'
				}
			},
			{
				// Cloudflare and build adapters intentionally use host APIs and Promise interfaces.
				files: [
					'scripts/**',
					'packages/*/scripts/**',
					'tools/**',
					'.github/scripts/**',
					'infra/**',
					'alchemy.run.ts',
					'**/*.config.ts'
				],
				rules: {
					'no-console': 'off',
					'effect/noGlobals': 'off',
					'effect/noNodeBuiltinImport': 'off',
					'effect/noAsyncFunction': 'off',
					'effect/noTryCatch': 'off',
					'effect/noThrowStatement': 'off',
					'effect/noNewError': 'off',
					'effect/noTernary': 'off'
				}
			},
			{
				// React handlers, DOM effects, conditional JSX and DOM test cleanup use native interfaces.
				files: ['apps/web/**'],
				rules: {
					'effect/noTernary': 'off',
					'effect/noAsyncFunction': 'off',
					'effect/noGlobals': 'off',
					'effect/noTestLifecycleHooks': 'off'
				}
			},
			{
				// React Three Fiber props are renderer-owned, not DOM attributes.
				files: ['apps/web/src/components/game/**/*.{ts,tsx}'],
				rules: { 'react/no-unknown-property': 'off' }
			},
			{
				// Route exports and stories are framework entries, not only React components.
				files: [
					'apps/web/src/routes/**/*.{ts,tsx}',
					'apps/web/src/router.tsx',
					'**/*.stories.tsx',
					'**/*-stories-shared.tsx'
				],
				rules: { 'react/only-export-components': 'off' }
			},
			{
				// TanStack redirects and not-found signals use thrown control flow.
				files: ['apps/web/src/routes/**/*.{ts,tsx}'],
				rules: { 'effect/noThrowStatement': 'off' }
			},
			{
				// Effect useSpan and other non-React use-prefixed APIs are not hooks.
				files: ['packages/**', 'apps/game-server/**', 'infra/**'],
				rules: { 'react-hooks/rules-of-hooks': 'off' }
			},
			{
				// The game package must remain usable in both browsers and Workers.
				files: ['packages/game-logic/src/**/*.{ts,tsx}'],
				rules: {
					'no-restricted-imports': [
						'error',
						{
							patterns: [
								DEEP_WORKSPACE_SRC_IMPORT,
								{
									group: [
										'react',
										'react/*',
										'react-dom',
										'react-dom/*',
										'node:*',
										'bun',
										'bun:*',
										'cloudflare:*',
										'@hexwardens/db',
										'@hexwardens/db/*'
									],
									message:
										'Game logic is platform-free. Put host I/O in a web or game-server adapter.'
								}
							]
						}
					]
				}
			},
			{
				// Tests use framework lifecycle and deliberate failure injection at their boundaries.
				files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**', '**/e2e/**'],
				rules: {
					'no-empty-function': 'off',
					'no-await-in-loop': 'off',
					'no-console': 'off',
					'react/only-export-components': 'off',
					'react-hooks/rules-of-hooks': 'off',
					'effect/noTryCatch': 'off',
					'effect/noThrowStatement': 'off',
					'effect/noNewError': 'off',
					'effect/noNewPromise': 'off',
					'effect/noAsyncFunction': 'off',
					'effect/noTestLifecycleHooks': 'off',
					'effect/noGlobals': 'off',
					'effect/noTernary': 'off',
					'no-restricted-properties': [
						'error',
						...RESTRICTED_SCHEMA_PROPERTIES,
						...RESTRICTED_EFFECT_PROPERTIES
					],
					// Describe-scoped fixtures remain next to the scenarios that own them.
					'unicorn/consistent-function-scoping': 'off',
					'vitest/no-standalone-expect': [
						'error',
						{
							additionalTestBlockFunctions: [
								'it.effect',
								'it.live',
								'it.scoped',
								'it.layer'
							]
						}
					]
				}
			},
			{
				// The plugin test adapter launches Oxlint against temporary fixture files.
				files: ['packages/oxlint-plugin/test/**'],
				rules: {
					'effect/noNodeBuiltinImport': 'off',
					'vitest/expect-expect': 'off',
					'vitest/valid-title': 'off'
				}
			},
			{
				// Ambient declarations and intentional declaration merges require interfaces.
				files: ['**/*.d.ts'],
				rules: {
					'@typescript-eslint/consistent-type-imports': 'off',
					'@typescript-eslint/no-empty-object-type': 'off'
				}
			}
		]
	}
})

export const lintConfig = lint

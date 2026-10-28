import { definePlugin } from 'vite-plus/lint/plugins'
import noEffectInternalTags from './rules/no-effect-internal-tags.ts'
import noInlineSchemaCompile from './rules/no-inline-schema-compile.ts'
import noInterfaceMergeOutsideDts from './rules/no-interface-merge-outside-dts.ts'
import noMismatchedAugmentationContext from './rules/no-mismatched-augmentation-context.ts'
import noRunPromiseInTests from './rules/no-run-promise-in-tests.ts'
import noUnknownErrorMessage from './rules/no-unknown-error-message.ts'
import preferEffectPredicate from './rules/prefer-effect-predicate.ts'

// Rule ids are alphabetical. The root `lint.config.ts` enables and scopes
// every one of them; each rule file's doc comment says what it catches.
export default definePlugin({
	meta: { name: 'hexwardens' },
	rules: {
		'no-effect-internal-tags': noEffectInternalTags,
		'no-inline-schema-compile': noInlineSchemaCompile,
		'no-interface-merge-outside-dts': noInterfaceMergeOutsideDts,
		'no-mismatched-augmentation-context': noMismatchedAugmentationContext,
		'no-run-promise-in-tests': noRunPromiseInTests,
		'no-unknown-error-message': noUnknownErrorMessage,
		'prefer-effect-predicate': preferEffectPredicate
	}
})

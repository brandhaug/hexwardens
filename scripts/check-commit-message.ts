import { readFileSync } from 'node:fs'

export function isConventionalTitle(title: string): boolean {
	return /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([a-z0-9][a-z0-9./_-]*\))?!?: \S(?:[^\r\n]*\S)?$/.test(
		title
	)
}

if (import.meta.main) {
	const file = process.argv[2]
	if (!file) {
		throw new Error('Provide a commit message file')
	}
	const title = readFileSync(file, 'utf8').split(/\r?\n/)[0] ?? ''
	if (!isConventionalTitle(title)) {
		process.stderr.write(
			'Use a Conventional Commit title, for example: fix(combat): correct counter damage\n'
		)
		process.exitCode = 1
	}
}

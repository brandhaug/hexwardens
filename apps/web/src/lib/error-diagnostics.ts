/** Error messages, stacks and causes can contain credentials or submitted data. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Caught failures are unknown until this redaction boundary classifies them.
export function errorDiagnostics(error: unknown) {
	if (error instanceof TypeError) {
		return { name: 'TypeError' }
	}
	if (error instanceof RangeError) {
		return { name: 'RangeError' }
	}
	if (error instanceof SyntaxError) {
		return { name: 'SyntaxError' }
	}
	return { name: 'Error' }
}

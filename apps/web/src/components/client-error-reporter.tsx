import { errorDiagnostics } from '@/lib/error-diagnostics'
import { constVoid } from 'effect/Function'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error.functions'

/** Hard cap per page load so a render loop or flaky network can't turn one
 * bug into thousands of reports. Duplicate messages are sent once. */
const MAX_REPORTS_PER_PAGE = 10

export function ClientErrorReporter() {
	useEffect(() => {
		let sent = 0
		const seen = new Set<string>()

		const report = (
			source: 'onerror' | 'unhandledrejection',
			message: string,
			stack: string | undefined
		) => {
			if (sent >= MAX_REPORTS_PER_PAGE || seen.has(message)) {
				return
			}
			seen.add(message)
			sent++
			void reportClientError({
				data: {
					message: message.slice(0, 2000),
					stack: stack?.slice(0, 8000),
					source,
					url: window.location.href.slice(0, 2000)
				}
				// Reporting must never throw — losing one report is fine.
			}).catch(constVoid)
		}

		const onError = (event: ErrorEvent) => {
			report('onerror', errorDiagnostics(event.error).name, undefined)
		}
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			report(
				'unhandledrejection',
				errorDiagnostics(event.reason).name,
				undefined
			)
		}

		window.addEventListener('error', onError)
		window.addEventListener('unhandledrejection', onUnhandledRejection)
		return () => {
			window.removeEventListener('error', onError)
			window.removeEventListener('unhandledrejection', onUnhandledRejection)
		}
	}, [])

	return null
}

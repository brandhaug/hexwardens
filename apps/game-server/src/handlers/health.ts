import { HexwardensApi } from '@hexwardens/api'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

export const HealthHandlers = HttpApiBuilder.group(
	HexwardensApi,
	'health',
	(handlers) =>
		handlers.handle('check', () => Effect.succeed({ status: 'ok' as const }))
)

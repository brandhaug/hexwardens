import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

export const PresenceApi = HttpApiGroup.make('presence').add(
	HttpApiEndpoint.get('count', '/presence', {
		success: Schema.Struct({ online: Schema.Finite })
	})
)

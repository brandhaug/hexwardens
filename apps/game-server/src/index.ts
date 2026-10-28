import { Effect } from 'effect'
import { handleFetch } from './request-handler'
import { type Env } from './types'

export { Matchmaker } from './matchmaker'
export { Match } from './match'
export { Presence } from './presence'

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return Effect.runPromise(handleFetch(request, env))
	}
}

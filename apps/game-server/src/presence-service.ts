import { Context, Effect, Layer } from 'effect'

export class PresenceCounter extends Context.Service<
	PresenceCounter,
	{ readonly count: Effect.Effect<number> }
>()('@hexwardens/game-server/PresenceCounter') {}

export const presenceLayerFromCount = (
	count: () => Promise<number>
): Layer.Layer<PresenceCounter> =>
	Layer.succeed(PresenceCounter, {
		count: Effect.promise(count)
	})

import { decodeClientMessage } from '../multiplayer/codec'
import { type MatchCodec } from './ports'

/** Alias kept for existing imports — the underlying type is {@link WireDecodeError}. */
export { WireDecodeError as CodecError } from '../multiplayer/codec'

export function createCodec(): MatchCodec {
	return {
		decode: decodeClientMessage
	}
}

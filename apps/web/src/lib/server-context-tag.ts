import { Context } from 'effect'
import { type TokenSigner } from '@/lib/game-token.server'
import { type Database } from '@hexwardens/db/client'

export interface ServerContext {
	readonly request: Request
	mintGuestToken(): Promise<string>
	mintUserToken(userId: string, username: string): Promise<string>
	db(): Database
}

export type { Database, TokenSigner }

export class ServerContextTag extends Context.Service<
	ServerContextTag,
	ServerContext
>()('@web/ServerContext') {}

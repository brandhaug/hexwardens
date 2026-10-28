import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Schema } from 'effect'
import { AuthForm } from '@/components/auth-form'
import { LandingShell } from '@/components/landing-shell'

const signInSearch = Schema.Struct({
	authError: Schema.optional(Schema.String)
})

const decodeSearch = Schema.decodeUnknownSync(signInSearch)

export const Route = createFileRoute('/sign-in')({
	validateSearch: decodeSearch,
	component: SignInComponent
})

function SignInComponent() {
	const navigate = useNavigate()
	const { authError } = Route.useSearch()

	return (
		<LandingShell>
			<AuthForm error={authError} onBack={() => void navigate({ to: '/' })} />
		</LandingShell>
	)
}

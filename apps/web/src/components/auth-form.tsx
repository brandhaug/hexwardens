import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { signInAction, signUpAction } from '@/lib/auth.functions'

type AuthFormProps = {
	onBack: () => void
	error?: string | undefined
}

function ErrorMessage({ message }: { message?: string | undefined }) {
	if (!message) {
		return null
	}
	return <p className='text-sm text-destructive'>{message}</p>
}

function SignInForm({ error }: { error?: string | undefined }) {
	return (
		<form
			action={signInAction.url}
			method='POST'
			className='flex flex-col gap-4 pt-4'
		>
			<ErrorMessage message={error} />
			<div className='flex flex-col gap-2'>
				<Label htmlFor='sign-in-username'>Username</Label>
				<Input
					id='sign-in-username'
					name='username'
					type='text'
					autoComplete='username'
					required
				/>
			</div>
			<div className='flex flex-col gap-2'>
				<Label htmlFor='sign-in-password'>Password</Label>
				<Input
					id='sign-in-password'
					name='password'
					type='password'
					autoComplete='current-password'
					required
					minLength={8}
				/>
			</div>
			<Button type='submit'>Sign In</Button>
		</form>
	)
}

function SignUpForm({ error }: { error?: string | undefined }) {
	return (
		<form
			action={signUpAction.url}
			method='POST'
			className='flex flex-col gap-4 pt-4'
		>
			<ErrorMessage message={error} />
			<div className='flex flex-col gap-2'>
				<Label htmlFor='sign-up-username'>Username</Label>
				<Input
					id='sign-up-username'
					name='username'
					type='text'
					autoComplete='username'
					required
					minLength={3}
				/>
			</div>
			<div className='flex flex-col gap-2'>
				<Label htmlFor='sign-up-email'>Email</Label>
				<Input
					id='sign-up-email'
					name='email'
					type='email'
					autoComplete='email'
					required
				/>
			</div>
			<div className='flex flex-col gap-2'>
				<Label htmlFor='sign-up-password'>Password</Label>
				<Input
					id='sign-up-password'
					name='password'
					type='password'
					autoComplete='new-password'
					required
					minLength={8}
				/>
			</div>
			<Button type='submit'>Sign Up</Button>
		</form>
	)
}

export function AuthForm({ onBack, error }: AuthFormProps) {
	return (
		<div className='mx-auto flex w-full max-w-[380px] flex-col gap-5'>
			<h2 className='font-heading text-2xl font-semibold tracking-[0.02em]'>
				Sign in to save your progress
			</h2>
			<Tabs defaultValue='sign-in'>
				<TabsList className='grid w-full grid-cols-2'>
					<TabsTrigger value='sign-in'>Sign In</TabsTrigger>
					<TabsTrigger value='sign-up'>Sign Up</TabsTrigger>
				</TabsList>
				<TabsContent value='sign-in'>
					<SignInForm error={error} />
				</TabsContent>
				<TabsContent value='sign-up'>
					<SignUpForm error={error} />
				</TabsContent>
			</Tabs>
			<Button variant='ghost' onClick={onBack}>
				Back to menu
			</Button>
		</div>
	)
}

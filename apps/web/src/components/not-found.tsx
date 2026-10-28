import { Link } from '@tanstack/react-router'

export function NotFound() {
	return (
		<div className='flex h-full flex-col items-center justify-center gap-4 py-16'>
			<h1 className='text-2xl font-semibold'>Page not found</h1>
			<p className='text-sm text-muted-foreground'>
				The page you are looking for does not exist.
			</p>
			<Link to='/' className='text-sm underline hover:text-foreground'>
				Go home
			</Link>
		</div>
	)
}

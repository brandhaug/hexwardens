import { TanStackDevtools } from '@tanstack/react-devtools'
import { type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	HeadContent,
	Link,
	Outlet,
	Scripts
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { type ReactNode } from 'react'
import { useHydrated } from '@/hooks/use-hydrated'
import { ClientErrorReporter } from '@/components/client-error-reporter'
import { PwaServiceWorker } from '@/components/pwa-service-worker'
import { Toaster } from '@/components/ui/sonner'
import appCss from '../index.css?url'

interface RouterAppContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf8'
			},
			{
				name: 'viewport',
				content:
					'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
			},
			{
				name: 'theme-color',
				content: '#0F3E4D',
				media: '(prefers-color-scheme: dark)'
			},
			{
				name: 'theme-color',
				content: '#087d97'
			},
			{
				name: 'color-scheme',
				content: 'dark light'
			},
			{
				name: 'format-detection',
				content: 'telephone=no'
			},
			{
				name: 'apple-mobile-web-app-capable',
				content: 'yes'
			},
			{
				name: 'apple-mobile-web-app-status-bar-style',
				content: 'black-translucent'
			},
			{
				name: 'apple-mobile-web-app-title',
				content: 'Hexwardens'
			},
			{
				name: 'mobile-web-app-capable',
				content: 'yes'
			},
			{
				title: 'Hexwardens'
			}
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss
			},
			{
				rel: 'manifest',
				href: '/manifest.webmanifest'
			},
			{
				rel: 'icon',
				href: '/favicon.ico',
				sizes: 'any'
			},
			{
				rel: 'icon',
				href: '/pwa-icon.svg',
				type: 'image/svg+xml'
			},
			{
				rel: 'apple-touch-icon',
				href: '/apple-touch-icon-180x180.png'
			}
		]
	}),

	component: RootComponent,
	errorComponent: RootErrorComponent
})

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	)
}

function RootErrorComponent({ reset }: ErrorComponentProps) {
	return (
		<RootDocument>
			<div className='flex h-full flex-col items-center justify-center gap-4 py-16'>
				<h1 className='text-2xl font-semibold'>Something went wrong</h1>
				<p className='max-w-md text-center text-sm text-muted-foreground'>
					An unexpected error occurred.
				</p>
				<div className='flex gap-3'>
					<button
						type='button'
						onClick={reset}
						className='text-sm underline hover:text-foreground'
					>
						Try again
					</button>
					<Link to='/' className='text-sm underline hover:text-foreground'>
						Go home
					</Link>
				</div>
			</div>
		</RootDocument>
	)
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	const hydrated = useHydrated()
	return (
		<html lang='en' className='dark'>
			<head>
				<HeadContent />
			</head>
			<body data-hydrated={hydrated ? 'true' : undefined}>
				<main className='grid min-h-svh grid-rows-[auto_1fr]'>{children}</main>
				<Toaster richColors />
				<PwaServiceWorker />
				<ClientErrorReporter />
				<TanStackDevtools
					config={{
						position: 'bottom-left'
					}}
					plugins={[
						{
							name: 'TanStack Query',
							render: <ReactQueryDevtoolsPanel />
						},
						{
							name: 'TanStack Router',
							render: <TanStackRouterDevtoolsPanel />
						}
					]}
				/>
				<Scripts />
			</body>
		</html>
	)
}

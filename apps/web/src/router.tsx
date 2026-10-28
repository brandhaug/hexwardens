import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import Loader from './components/loader'
import { NotFound } from './components/not-found'
import { routeTree } from './routeTree.gen'
import './index.css'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

export function getRouter() {
	const queryClient: QueryClient = new QueryClient()

	const router = createRouter({
		routeTree,
		defaultPreload: 'intent',
		defaultPendingComponent: () => <Loader />,
		defaultNotFoundComponent: NotFound,
		context: { queryClient }
	})

	setupRouterSsrQueryIntegration({
		router,
		queryClient
	})

	return router
}

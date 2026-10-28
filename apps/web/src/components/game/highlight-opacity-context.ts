import { createContext } from 'react'

/**
 * Per-board tile-highlight opacity multiplier. Provided once at the Board
 * scene root so every TileHighlight reads from a single source — avoids
 * O(N) `useSyncExternalStore` subscriptions when there are N visible tiles.
 *
 * Defaults to `1` so consumers rendered outside a Board (storybook fixtures,
 * thumbnails) get unscaled highlights without a Provider.
 */
export const HighlightOpacityContext = createContext<number>(1)

import { type TileState } from '@hexwardens/game-logic/tile/tile'
import { constVoid } from 'effect/Function'
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore
} from 'react'
import { ActionBar } from '@/components/game/action-bar'
import { Board } from '@/components/game/board'
import {
	GameOverOverlay,
	type DailyChallengeOutcome
} from '@/components/game/game-over-overlay'
import { OnboardingPrompt } from '@/components/game/onboarding-prompt'
import { PerkChoicePanel } from '@/components/game/perk-choice-panel'
import { TechTreePanel } from '@/components/game/tech-tree-panel'
import { UnitCodexPanel } from '@/components/game/unit-codex-panel'
import { TopBar } from '@/components/game/top-bar'
import { TurnBanner } from '@/components/game/turn-banner'
import { type ActionIntent } from '@hexwardens/game-logic/actions/intent'
import {
	Board as GameBoard,
	type BoardPosition
} from '@hexwardens/game-logic/board/board'
import { findVillagesByTribe } from '@hexwardens/game-logic/domains/village'
import { type Tech } from '@hexwardens/game-logic/domains/tech'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type UnitType } from '@hexwardens/game-logic/domains/unit'
import { type GameState } from '@hexwardens/game-logic/game'
import { getCurrentPlayerState } from '@hexwardens/game-logic/player/player-state'
import {
	getOnboardingProgress,
	recordOnboardingSelection,
	replayOnboarding,
	setOnboardingCompleted,
	subscribeOnboardingProgress
} from '@/lib/onboarding/onboarding-progress'
import { deriveOnboardingStep } from '@/lib/onboarding/onboarding-step-controller'
import { type TurnTimerSnapshot } from '@/lib/use-turn-timer'

interface GameLayoutProps {
	gameState: GameState
	playerTribe: Tribe
	playerName: string
	selectedTile: BoardPosition | null
	isInteractive: boolean
	overlay?: React.ReactNode
	turnTimer?: TurnTimerSnapshot | null
	onTileSelect: (position: BoardPosition | null) => void
	onCombat: (
		attackerPosition: BoardPosition,
		defenderPosition: BoardPosition
	) => void
	onMovement: (fromPosition: BoardPosition, toPosition: BoardPosition) => void
	onAction: (action: ActionIntent) => void
	endTurnArmed: boolean
	onEndTurn: () => void
	readyUnitCount: number
	onNextUnit: () => void
	/** Optional: routed to the in-game menu's "Quit to menu" item. */
	onQuit?: () => void
	/** Optional: routed to the in-game menu's "Keyboard shortcuts" item. */
	onOpenHelp?: () => void
	/**
	 * Optional Daily Challenge recap surfaced in the Match-end overlay.
	 * Only the online Public Queue route passes a value — offline `/game`
	 * and private lobbies leave this `undefined`.
	 */
	dailyOutcome?: DailyChallengeOutcome | null
	onGameOverPlayAgain?: () => void
}

const noop = constVoid

export function GameLayout({
	gameState,
	playerTribe,
	playerName,
	selectedTile,
	isInteractive,
	overlay,
	turnTimer,
	onTileSelect,
	onCombat,
	onMovement,
	onAction,
	endTurnArmed,
	onEndTurn,
	readyUnitCount,
	onNextUnit,
	onQuit,
	onOpenHelp,
	dailyOutcome,
	onGameOverPlayAgain
}: GameLayoutProps) {
	const [isTechTreeOpen, setIsTechTreeOpen] = useState(false)
	const [isUnitCodexOpen, setIsUnitCodexOpen] = useState(false)

	const handleOpenTechTree = useCallback(() => setIsTechTreeOpen(true), [])
	const handleCloseTechTree = useCallback(() => setIsTechTreeOpen(false), [])
	const handleOpenUnitCodex = useCallback(() => setIsUnitCodexOpen(true), [])
	const handleCloseUnitCodex = useCallback(() => setIsUnitCodexOpen(false), [])

	const handleSkipOnboarding = useCallback(() => {
		setOnboardingCompleted(true)
	}, [])

	const handleReplayTutorial = useCallback(() => {
		onTileSelect(null)
		replayOnboarding(gameState.turn)
	}, [onTileSelect, gameState.turn])

	const selectedTileData = selectedTile
		? (gameState.units.board[selectedTile.r_idx]?.[selectedTile.q_idx] ?? null)
		: null

	const onboardingStep = useGameOnboarding(gameState, playerTribe, selectedTile)

	return (
		<div
			data-route='immersive'
			data-game-chrome
			className='flex h-dvh w-full flex-col overflow-hidden bg-background'
		>
			{/* Keyboard skip link — invisible until focused, then jumps Tab
			    users straight to the action dock. The full focus order goes
			    logo → identity → gold → research → menu → end turn → board
			    → dock, which is brutal for keyboard play. */}
			{/* oxlint-disable-next-line react-doctor/no-layout-shifting-interaction-state -- The skip-navigation link intentionally expands when keyboard focus reveals it. */}
			<a
				// oxlint-disable-next-line react-doctor/anchor-target-exists -- The target action-dock is rendered by the ActionBar child in this layout.
				href='#action-dock'
				className='sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:inline-flex focus:h-11 focus:items-center focus:rounded-md focus:border focus:border-foreground/20 focus:bg-background focus:px-4 focus:font-medium focus:text-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			>
				Skip to actions
			</a>
			<TopBar
				playerTribe={playerTribe}
				gameState={gameState}
				turn={gameState.turn}
				playerName={playerName}
				turnTimer={turnTimer ?? null}
				endTurnArmed={endTurnArmed}
				onEndTurn={isInteractive ? onEndTurn : noop}
				onQuit={onQuit}
				onOpenHelp={onOpenHelp}
				onReplayTutorial={handleReplayTutorial}
			/>
			<div className='relative flex-1 overflow-hidden'>
				<Board
					gameState={gameState}
					currentPlayerTribe={playerTribe}
					selectedTile={selectedTile}
					onTileSelect={onTileSelect}
					onCombat={isInteractive ? onCombat : noop}
					onMovement={isInteractive ? onMovement : noop}
				/>
				<TurnBanner gameState={gameState} localTribe={playerTribe} />
			</div>

			<ActionBar
				selectedTile={selectedTile}
				selectedTileData={selectedTileData}
				currentGameState={gameState}
				currentPlayerTribe={playerTribe}
				onAction={isInteractive ? onAction : noop}
				onOpenResearch={handleOpenTechTree}
				onOpenTrain={handleOpenUnitCodex}
				endTurnArmed={endTurnArmed}
				onEndTurn={isInteractive ? onEndTurn : noop}
				turnTimer={turnTimer ?? null}
				isGameOver={gameState.isGameOver}
				readyUnitCount={readyUnitCount}
				onNextUnit={onNextUnit}
				canAct={isInteractive}
			/>

			{isInteractive && (
				<PerkChoicePanel
					gameState={gameState}
					playerTribe={playerTribe}
					onAction={onAction}
					onFocusVillage={onTileSelect}
				/>
			)}

			<GameResearchPanels
				gameState={gameState}
				playerTribe={playerTribe}
				selectedTile={selectedTile}
				selectedTileData={selectedTileData}
				isInteractive={isInteractive}
				onAction={onAction}
				isTechTreeOpen={isTechTreeOpen}
				isUnitCodexOpen={isUnitCodexOpen}
				handleCloseTechTree={handleCloseTechTree}
				handleCloseUnitCodex={handleCloseUnitCodex}
			/>

			{onboardingStep && isInteractive && (
				<OnboardingPrompt step={onboardingStep} onSkip={handleSkipOnboarding} />
			)}

			{gameState.isGameOver && (
				<GameOverOverlay
					winner={gameState.winner}
					playerTribe={playerTribe}
					turn={gameState.turn}
					dailyOutcome={dailyOutcome}
					onPlayAgain={onGameOverPlayAgain}
				/>
			)}

			{overlay}
		</div>
	)
}

function useGameOnboarding(
	gameState: GameState,
	playerTribe: Tribe,
	selectedTile: BoardPosition | null
) {
	const onboardingProgress = useSyncExternalStore(
		subscribeOnboardingProgress,
		getOnboardingProgress,
		getOnboardingProgress
	)
	// Onboarding step: derived purely from authoritative state + UI signals.
	// Returning `null` means no in-place prompt is shown right now.
	const onboardingStep = useMemo(() => {
		if (onboardingProgress.completed) {
			return null
		}
		return deriveOnboardingStep({
			gameState,
			playerTribe,
			selectedTile,
			hasMovedUnitThisTurn: onboardingProgress.movedUnit === true,
			hasSelectedVillage: onboardingProgress.selectedVillage === true,
			isReplay: onboardingProgress.replayTurn !== undefined
		})
	}, [onboardingProgress, gameState, playerTribe, selectedTile])

	// Once a player completes the end-turn step (turn rolls past 1), persist
	// the dismissal so returning players never see this run again.
	useEffect(() => {
		if (
			!onboardingProgress.completed &&
			gameState.turn > (onboardingProgress.replayTurn ?? 1)
		) {
			setOnboardingCompleted(true)
		}
	}, [
		gameState.turn,
		onboardingProgress.completed,
		onboardingProgress.replayTurn
	])

	useEffect(() => {
		if (!selectedTile || gameState.currentPlayerTribe !== playerTribe) {
			return
		}
		const item = GameBoard.from(gameState.units.board).at(selectedTile)?.item
		if (item?.type === 'village' && item.tribe === playerTribe) {
			recordOnboardingSelection()
		}
	}, [selectedTile, gameState, playerTribe])
	return onboardingStep
}

function GameResearchPanels({
	gameState,
	playerTribe,
	selectedTile,
	selectedTileData,
	isInteractive,
	onAction,
	isTechTreeOpen,
	isUnitCodexOpen,
	handleCloseTechTree,
	handleCloseUnitCodex
}: Pick<
	GameLayoutProps,
	'gameState' | 'playerTribe' | 'selectedTile' | 'isInteractive' | 'onAction'
> & {
	selectedTileData: TileState | null
	isTechTreeOpen: boolean
	isUnitCodexOpen: boolean
	handleCloseTechTree: () => void
	handleCloseUnitCodex: () => void
}) {
	const handleResearch = useCallback(
		(tech: Tech) => {
			if (!selectedTile) {
				return
			}
			onAction({ kind: 'research', at: selectedTile, tech })
		},
		[onAction, selectedTile]
	)
	const handleTrain = useCallback(
		(unit: UnitType) => {
			if (!selectedTile) {
				return
			}
			onAction({ kind: 'train', at: selectedTile, unit })
		},
		[onAction, selectedTile]
	)
	const currentPlayer = getCurrentPlayerState(
		gameState.playerStates,
		gameState.currentPlayerTribe
	)
	const selectedIsOwnVillage =
		selectedTileData?.item?.type === 'village' &&
		selectedTileData.item.tribe === playerTribe

	return (
		<>
			<TechTreePanel
				ownedVillages={
					findVillagesByTribe(gameState.units.board, playerTribe).length
				}
				researchedTechs={currentPlayer.researchedTechs}
				researchInProgress={currentPlayer.researchInProgress}
				currentTribe={playerTribe}
				playerMoney={currentPlayer.money}
				isOpen={isTechTreeOpen}
				onClose={handleCloseTechTree}
				onResearch={
					isInteractive &&
					selectedIsOwnVillage &&
					!currentPlayer.researchInProgress
						? handleResearch
						: undefined
				}
			/>

			<UnitCodexPanel
				researchedTechs={currentPlayer.researchedTechs}
				currentTribe={playerTribe}
				playerMoney={currentPlayer.money}
				isOpen={isUnitCodexOpen}
				onClose={handleCloseUnitCodex}
				onTrain={
					isInteractive && selectedIsOwnVillage && !selectedTileData.unit
						? handleTrain
						: undefined
				}
			/>
		</>
	)
}

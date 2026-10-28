import { type Tech } from '@hexwardens/game-logic/domains/tech'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { GameDialogPanel } from './game-dialog-panel'
import { TechTreeDisplay } from './tech-tree-display'

export interface TechTreePanelProps {
	researchedTechs: readonly Tech[]
	researchInProgress: { tech: Tech; turnsRemaining: number } | null
	currentTribe: Tribe
	playerMoney: number
	ownedVillages: number
	isOpen: boolean
	onClose: () => void
	onResearch?: ((tech: Tech) => void) | undefined
}

export default function TechTreePanelInner({
	researchedTechs,
	researchInProgress,
	currentTribe,
	playerMoney,
	ownedVillages,
	onClose,
	onResearch
}: TechTreePanelProps) {
	return (
		<GameDialogPanel
			id='tech-tree-title'
			title='Tech Tree'
			contentClassName='overflow-y-auto p-0'
			onClose={onClose}
		>
			<TechTreeDisplay
				researchedTechs={researchedTechs}
				researchInProgress={researchInProgress}
				currentTribe={currentTribe}
				playerMoney={playerMoney}
				ownedVillages={ownedVillages}
				onResearch={onResearch}
			/>
		</GameDialogPanel>
	)
}

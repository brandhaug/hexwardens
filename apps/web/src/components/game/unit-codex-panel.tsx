import { type Tech } from '@hexwardens/game-logic/domains/tech'
import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type UnitType } from '@hexwardens/game-logic/domains/unit'
import { GameDialogPanel } from './game-dialog-panel'
import { UnitCodexDisplay } from './unit-codex-display'

interface UnitCodexPanelProps {
	researchedTechs: readonly Tech[]
	currentTribe: Tribe
	playerMoney: number
	isOpen: boolean
	onClose: () => void
	onTrain?: ((unitType: UnitType) => void) | undefined
}

export function UnitCodexPanel({
	researchedTechs,
	currentTribe,
	playerMoney,
	isOpen,
	onClose,
	onTrain
}: UnitCodexPanelProps) {
	if (!isOpen) {
		return null
	}

	return (
		<GameDialogPanel
			id='unit-codex-title'
			title='Unit Codex'
			contentClassName='overflow-y-auto py-4'
			onClose={onClose}
		>
			<UnitCodexDisplay
				researchedTechs={researchedTechs}
				currentTribe={currentTribe}
				playerMoney={playerMoney}
				onTrain={onTrain}
			/>
		</GameDialogPanel>
	)
}

import { type toast } from 'sonner'
import { type playUiSfx } from './audio/audio-service'
import { vi, beforeEach } from 'vite-plus/test'
import {
	ACHIEVEMENT_REGISTRY,
	type AchievementId
} from '@hexwardens/game-logic/achievements/registry'

const { playUiSfxMock, successMock } = vi.hoisted(() => ({
	playUiSfxMock: vi.fn<typeof playUiSfx>(),
	successMock: vi.fn<typeof toast.success>()
}))
vi.mock('@/lib/audio/audio-service', () => ({ playUiSfx: playUiSfxMock }))

vi.mock('sonner', () => ({
	toast: {
		success: successMock,
		error: vi.fn<() => void>(),
		info: vi.fn<() => void>()
	}
}))

const importHelper = async () => {
	const mod = await import('./show-achievement-toast')
	return mod.showAchievementUnlockToasts
}

describe('showAchievementUnlockToasts', () => {
	beforeEach(() => {
		playUiSfxMock.mockReset()
		successMock.mockReset()
	})

	it('plays the stinger once and renders one toast per id', async () => {
		const showAchievementUnlockToasts = await importHelper()
		const ids: AchievementId[] = ['first-win', 'beat-beginner-bot']
		showAchievementUnlockToasts(ids)
		expect(playUiSfxMock).toHaveBeenCalledTimes(1)
		expect(playUiSfxMock).toHaveBeenCalledWith('achievement')
		expect(successMock).toHaveBeenCalledTimes(2)
		expect(successMock).toHaveBeenNthCalledWith(
			1,
			`Achievement unlocked: ${ACHIEVEMENT_REGISTRY['first-win'].name}`,
			expect.objectContaining({
				description: ACHIEVEMENT_REGISTRY['first-win'].description
			})
		)
	})

	it('is a no-op for an empty list', async () => {
		const showAchievementUnlockToasts = await importHelper()
		showAchievementUnlockToasts([])
		expect(playUiSfxMock).not.toHaveBeenCalled()
		expect(successMock).not.toHaveBeenCalled()
	})
})

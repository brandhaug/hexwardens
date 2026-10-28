import { useEffect } from 'react'
import { getAudioManager } from '@/lib/audio/audio-service'
import { type MusicTrack } from '@/lib/audio/audio-manager'

/**
 * Wires the audio manager's music bed to the lifecycle of the calling
 * route. The first user gesture (pointer-down or key-press) unlocks the
 * AudioContext and starts the requested track on a loop. Visibility
 * changes pause / resume the bed so a backgrounded tab doesn't keep
 * playing into a muted system. The track stops on unmount, which also
 * runs when the route unmounts on navigation.
 *
 * Both `/game` and `/multiplayer-game` reach for this — keeping the
 * autoplay-unlock + visibility wiring in one place avoids two
 * subtly-different copies of the same effect drifting apart.
 */
export function useMatchMusic(track: MusicTrack): void {
	useEffect(() => {
		const manager = getAudioManager()
		const startMusic = () => {
			manager.prepare()
			manager.startMusic(track)
			window.removeEventListener('pointerdown', startMusic)
			window.removeEventListener('keydown', startMusic)
		}
		window.addEventListener('pointerdown', startMusic)
		window.addEventListener('keydown', startMusic)

		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				manager.pauseMusic()
			} else {
				manager.resumeMusic()
			}
		}
		document.addEventListener('visibilitychange', onVisibility)

		return () => {
			window.removeEventListener('pointerdown', startMusic)
			window.removeEventListener('keydown', startMusic)
			document.removeEventListener('visibilitychange', onVisibility)
			manager.stopMusic()
		}
	}, [track])
}

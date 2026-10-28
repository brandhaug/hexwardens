import { Popover } from '@base-ui/react/popover'
import { Slider } from '@base-ui/react/slider'
import {
	BookOpen,
	CheckCheck,
	RotateCcw,
	Keyboard,
	LogOut,
	Maximize,
	Menu as MenuIcon,
	Minimize,
	Move,
	Sparkles,
	Volume2,
	VolumeX,
	Wind,
	type LucideIcon
} from 'lucide-react'
import { useCallback, useId, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
	type AudioPreferences,
	getAudioPreferences,
	getServerAudioPreferences,
	setFxVolume,
	setMasterVolume,
	setMusicVolume,
	subscribeAudioPreferences,
	toggleFxMute,
	toggleMusicMute,
	toggleMute
} from '@/lib/audio-preferences'

import {
	type GamePreferences,
	cameraSpeedRange,
	getGamePreferences,
	getServerGamePreferences,
	highlightOpacityRange,
	setCameraSpeed,
	setConfirmEndTurn,
	setHighlightOpacity,
	subscribeGamePreferences,
	toggleMotionPreference
} from '@/lib/game-preferences'

import { haptic } from '@/lib/haptics'
import { useFullscreen } from '@/hooks/use-fullscreen'
import { useTapToConfirm } from '@/hooks/use-tap-to-confirm'
import { cn } from '@/lib/utils'

interface MenuButtonProps {
	/** Called when the player commits to leaving. Defaults to navigating home. */
	onQuit?: (() => void) | undefined
	/** Optional: opens the keyboard-shortcut overlay. Hidden when undefined. */
	onOpenHelp?: (() => void) | undefined
	onReplayTutorial?: (() => void) | undefined
}

function useAudioPreferences(): AudioPreferences {
	return useSyncExternalStore(
		subscribeAudioPreferences,
		getAudioPreferences,
		getServerAudioPreferences
	)
}

function useGamePreferences(): GamePreferences {
	return useSyncExternalStore(
		subscribeGamePreferences,
		getGamePreferences,
		getServerGamePreferences
	)
}

export function MenuButton({
	onQuit,
	onOpenHelp,
	onReplayTutorial
}: MenuButtonProps) {
	const navigate = useNavigate()
	const audio = useAudioPreferences()
	const prefs = useGamePreferences()
	const fullscreen = useFullscreen()

	const quitConfirm = useTapToConfirm({
		onArm: () => haptic('tap'),
		onCommit: () => {
			haptic('commit')
			if (onQuit) {
				onQuit()
			} else {
				void navigate({ to: '/' })
			}
		}
	})

	const handleHelp = useCallback(() => {
		haptic('tap')
		onOpenHelp?.()
	}, [onOpenHelp])

	const anyMuted = audio.muted || audio.musicMuted || audio.fxMuted

	return (
		<Popover.Root
			onOpenChange={(open) => {
				if (!open && quitConfirm.armed) {
					quitConfirm.reset()
				}
			}}
		>
			<Popover.Trigger
				data-press='teal'
				data-testid='menu-button-trigger'
				aria-label={anyMuted ? 'Open menu (audio muted)' : 'Open menu'}
				className='relative flex size-11 shrink-0 items-center justify-center rounded-md border border-teal-mist/45 bg-linear-to-b from-teal-top-sm to-teal-bottom text-teal-cyan shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_0_var(--teal-bevel),0_4px_8px_var(--chip-cast-soft)] hover:from-teal-top-sm-hover hover:to-teal-bottom-hover md:size-9'
			>
				<MenuIcon className='size-5' aria-hidden='true' />
				{anyMuted && (
					// oxlint-disable-next-line react-doctor/no-pure-black-shadow -- Preserve the existing game chrome bevel and shadow tokens.
					<span
						aria-hidden='true'
						className='-bottom-1 -right-1 absolute flex size-4 items-center justify-center rounded-full border border-gold-text bg-gold-bright text-gold-text shadow-[0_1px_0_rgba(0,0,0,0.35)]'
						title='Audio muted'
					>
						<VolumeX className='size-2.5' aria-hidden='true' />
					</span>
				)}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner sideOffset={10} align='end'>
					<Popover.Popup
						data-game-chrome
						className='motion-safe:animate-[panel-rise_180ms_cubic-bezier(0.16,1,0.3,1)] flex max-h-[min(640px,calc(100dvh-6rem))] w-[320px] flex-col gap-3 overflow-y-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none'
					>
						<SoundSettings audio={audio} />

						<MenuDivider />

						<MenuSection title='Settings'>
							<MenuToggleItem
								icon={CheckCheck}
								label='Confirm end turn'
								hint={
									prefs.confirmEndTurn
										? 'Press twice to end your turn'
										: 'End your turn immediately'
								}
								pressed={prefs.confirmEndTurn}
								onClick={() => setConfirmEndTurn(!prefs.confirmEndTurn)}
							/>
							{fullscreen.isSupported && (
								<MenuToggleItem
									icon={fullscreen.isFullscreen ? Minimize : Maximize}
									label={
										fullscreen.isFullscreen
											? 'Exit fullscreen'
											: 'Enter fullscreen'
									}
									pressed={fullscreen.isFullscreen}
									onClick={() => {
										haptic('tap')
										fullscreen.toggle()
									}}
								/>
							)}
							<MenuToggleItem
								icon={Wind}
								label='Reduce motion'
								hint={
									prefs.motionPreference === 'reduce'
										? 'Animations muted'
										: 'Following system'
								}
								pressed={prefs.motionPreference === 'reduce'}
								onClick={() => {
									haptic('tap')
									toggleMotionPreference()
								}}
							/>
							<SettingSlider
								icon={Move}
								label='Camera speed'
								value={prefs.cameraSpeed}
								min={cameraSpeedRange.min}
								max={cameraSpeedRange.max}
								step={0.1}
								format={(v) => `${v.toFixed(1)}×`}
								onChange={setCameraSpeed}
							/>
							<SettingSlider
								icon={Sparkles}
								label='Tile highlights'
								value={prefs.highlightOpacity}
								min={highlightOpacityRange.min}
								max={highlightOpacityRange.max}
								step={0.05}
								format={(v) => `${Math.round(v * 100)}%`}
								onChange={setHighlightOpacity}
							/>
						</MenuSection>

						<MenuDivider />

						<MenuSection title='Help'>
							{onReplayTutorial && (
								<MenuItem
									icon={RotateCcw}
									label='Replay tutorial'
									onClick={onReplayTutorial}
									closeOnClick
								/>
							)}
							{onOpenHelp && (
								// Hidden on touch — there is no keyboard to reference, and
								// the row was pushing Quit below the popup's max-height on
								// phones.
								<div className='hidden fine:block'>
									<MenuItem
										icon={Keyboard}
										label='Keyboard shortcuts'
										onClick={handleHelp}
										closeOnClick
									/>
								</div>
							)}
							<MenuItem icon={BookOpen} label='Wiki' href='/wiki' newTab />
						</MenuSection>

						<MenuDivider />

						<button
							type='button'
							onClick={quitConfirm.trigger}
							data-press={quitConfirm.armed ? 'ember' : 'teal'}
							className={cn(
								'flex h-11 w-full items-center gap-3 rounded-md border px-3 font-heading text-sm uppercase tracking-[0.06em] transition-colors',
								quitConfirm.armed
									? 'border-ember-top bg-ember-top/15 text-ember-top'
									: 'border-transparent text-ember-top hover:border-ember-top/40 hover:bg-ember-top/10'
							)}
						>
							<LogOut className='size-4' aria-hidden='true' />
							<span className='flex-1 text-left'>
								{quitConfirm.armed ? 'Tap again to confirm' : 'Quit to menu'}
							</span>
						</button>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	)
}

interface MasterVolumeRowProps {
	value: number
	onChange: (next: number) => void
}

/**
 * Compact one-row master-volume slider for touch devices. Replaces the
 * three vertical bus columns on coarse pointers so the in-game menu fits in
 * a single popup height and Quit stays in view without scrolling.
 */
function MasterVolumeRow({ value, onChange }: MasterVolumeRowProps) {
	return (
		<div className='flex items-center gap-3 rounded-md border border-foreground/10 bg-background/40 px-3 py-2 fine:hidden'>
			<Volume2
				className='size-4 shrink-0 text-foreground/65'
				aria-hidden='true'
			/>
			<Slider.Root
				value={Math.round(value * 100)}
				onValueChange={(next) => onChange(next / 100)}
				min={0}
				max={100}
				step={1}
				aria-label='Master volume'
				className='flex h-5 flex-1 items-center'
			>
				<Slider.Control className='flex h-5 w-full items-center justify-center'>
					<Slider.Track className='relative h-1.5 w-full rounded-full bg-muted'>
						<Slider.Indicator className='absolute top-0 left-0 h-full rounded-full bg-primary' />
						<Slider.Thumb
							getAriaValueText={(_, raw) => `${Math.round(raw)}%`}
							className='block size-5 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm focus-visible:outline-2 focus-visible:outline-ring'
						/>
					</Slider.Track>
				</Slider.Control>
			</Slider.Root>
			<span className='w-9 text-right font-mono text-foreground/65 text-xs tabular-nums'>
				{Math.round(value * 100)}%
			</span>
		</div>
	)
}

function MenuSection({
	title,
	children
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section className='flex flex-col gap-2'>
			<h3 className='font-heading text-[0.6rem] text-foreground/55 uppercase tracking-[0.18em]'>
				{title}
			</h3>
			{children}
		</section>
	)
}

function MenuDivider() {
	return <div aria-hidden='true' className='h-px bg-border' />
}

interface MenuItemProps {
	icon: LucideIcon
	label: string
	onClick?: () => void
	href?: string
	newTab?: boolean
	variant?: 'default' | 'destructive'
	closeOnClick?: boolean
}

function MenuItem({
	icon: Icon,
	label,
	onClick,
	href,
	newTab,
	variant = 'default',
	closeOnClick
}: MenuItemProps) {
	const base =
		'flex h-11 w-full items-center gap-3 rounded-md border border-transparent px-3 font-heading text-sm uppercase tracking-[0.06em] transition-colors'
	const variantClass =
		variant === 'destructive'
			? 'text-ember-top hover:border-ember-top/40 hover:bg-ember-top/10'
			: 'text-foreground hover:border-foreground/15 hover:bg-background/60'

	const content = (
		<>
			<Icon className='size-4' aria-hidden='true' />
			<span className='flex-1 text-left'>{label}</span>
		</>
	)

	if (href) {
		return (
			<a
				href={href}
				target={newTab ? '_blank' : undefined}
				rel={newTab ? 'noopener noreferrer' : undefined}
				className={cn(base, variantClass)}
				onClick={() => haptic('tap')}
			>
				{content}
			</a>
		)
	}

	if (closeOnClick) {
		return (
			<Popover.Close
				onClick={onClick}
				className={cn(base, variantClass)}
				render={(props) => (
					<button type='button' {...props}>
						{content}
					</button>
				)}
			/>
		)
	}

	return (
		<button type='button' onClick={onClick} className={cn(base, variantClass)}>
			{content}
		</button>
	)
}

interface MenuToggleItemProps {
	icon: LucideIcon
	label: string
	hint?: string
	pressed: boolean
	onClick: () => void
}

function MenuToggleItem({
	icon: Icon,
	label,
	hint,
	pressed,
	onClick
}: MenuToggleItemProps) {
	return (
		<button
			type='button'
			data-press='teal'
			aria-pressed={pressed}
			onClick={onClick}
			className={cn(
				'flex h-11 w-full items-center gap-3 rounded-md border px-3 font-heading text-sm uppercase tracking-[0.06em] transition-colors',
				pressed
					? 'border-gold-bright/60 bg-gold-bright/10 text-foreground'
					: 'border-foreground/15 bg-background/40 text-foreground hover:bg-background/60'
			)}
		>
			<Icon className='size-4' aria-hidden='true' />
			<span className='flex-1 text-left'>{label}</span>
			<span className='font-mono text-foreground/55 text-xs tabular-nums'>
				{pressed ? 'ON' : (hint ?? 'OFF')}
			</span>
		</button>
	)
}

interface SettingSliderProps {
	icon: LucideIcon
	label: string
	value: number
	min: number
	max: number
	step: number
	format: (value: number) => string
	onChange: (value: number) => void
}

function SettingSlider({
	icon: Icon,
	label,
	value,
	min,
	max,
	step,
	format,
	onChange
}: SettingSliderProps) {
	return (
		<div className='flex flex-col gap-1.5 rounded-md border border-foreground/10 bg-background/40 px-3 py-2'>
			<div className='flex items-center justify-between gap-2'>
				<span className='flex items-center gap-2 font-heading text-foreground text-xs uppercase tracking-[0.08em]'>
					<Icon className='size-3.5' aria-hidden='true' />
					{label}
				</span>
				<span className='font-mono text-foreground/65 text-xs tabular-nums'>
					{format(value)}
				</span>
			</div>
			<Slider.Root
				value={value}
				onValueChange={onChange}
				min={min}
				max={max}
				step={step}
				aria-label={label}
				className='flex h-4 items-center'
			>
				<Slider.Control className='flex h-4 w-full items-center justify-center'>
					<Slider.Track className='relative h-1.5 w-full rounded-full bg-muted'>
						<Slider.Indicator className='absolute top-0 left-0 h-full rounded-full bg-primary' />
						<Slider.Thumb
							getAriaValueText={(_formatted, raw) => format(raw)}
							className='block size-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm coarse:size-5.5 focus-visible:outline-2 focus-visible:outline-ring'
						/>
					</Slider.Track>
				</Slider.Control>
			</Slider.Root>
		</div>
	)
}

interface VolumeColumnProps {
	label: string
	value: number
	onChange: (next: number) => void
	muted?: boolean
	onMute?: () => void
	testId: string
}

function VolumeColumn({
	label,
	value,
	onChange,
	muted,
	onMute,
	testId
}: VolumeColumnProps) {
	const handleChange = useCallback(
		(next: number) => onChange(next / 100),
		[onChange]
	)
	const describedById = useId()
	return (
		// oxlint-disable-next-line react-doctor/no-cramped-container-padding -- Preserve the compact game HUD spacing contract.
		<div className='flex flex-1 flex-col items-center gap-1.5 rounded-md border border-foreground/10 bg-background/40 px-1 py-2'>
			<span
				className={cn(
					'font-heading text-[0.6rem] uppercase tracking-[0.14em]',
					muted ? 'text-foreground/35 line-through' : 'text-foreground/65'
				)}
			>
				{label}
			</span>
			{muted && (
				<span className='sr-only' id={describedById}>
					{`${label} bus muted — press the mute button to unmute`}
				</span>
			)}
			<Slider.Root
				value={Math.round(value * 100)}
				onValueChange={handleChange}
				min={0}
				max={100}
				step={1}
				orientation='vertical'
				aria-label={`${label} volume`}
				aria-describedby={muted ? describedById : undefined}
				className='flex h-24 flex-col items-center gap-1.5'
				data-testid={testId}
				disabled={muted}
			>
				<Slider.Control className='flex h-20 w-4 items-center justify-center'>
					<Slider.Track
						className={cn(
							'relative h-full w-1.5 rounded-full bg-muted',
							muted && 'opacity-50'
						)}
					>
						<Slider.Indicator className='absolute bottom-0 left-0 w-full rounded-full bg-primary' />
						<Slider.Thumb
							getAriaValueText={(_formatted, raw) => `${Math.round(raw)}%`}
							className='block size-3.5 -translate-x-1/2 rounded-full border-2 border-primary bg-background shadow-sm coarse:size-5.5 focus-visible:outline-2 focus-visible:outline-ring'
						/>
					</Slider.Track>
				</Slider.Control>
				<span className='font-mono text-[0.625rem] text-foreground/60 tabular-nums'>
					{Math.round(value * 100)}
				</span>
			</Slider.Root>
			{onMute && (
				<button
					type='button'
					onClick={() => {
						haptic('tap')
						onMute()
					}}
					aria-pressed={muted}
					aria-label={`${muted ? 'Unmute' : 'Mute'} ${label}`}
					className={cn(
						'flex size-7 items-center justify-center rounded-md border transition-colors',
						muted
							? 'border-ember-top/60 bg-ember-top/15 text-ember-top'
							: 'border-foreground/15 bg-background/40 text-foreground/70 hover:bg-background/60'
					)}
				>
					{muted ? (
						<VolumeX className='size-3.5' aria-hidden='true' />
					) : (
						<Volume2 className='size-3.5' aria-hidden='true' />
					)}
				</button>
			)}
		</div>
	)
}

function SoundSettings({ audio }: { audio: AudioPreferences }) {
	const MuteIcon = audio.muted ? VolumeX : Volume2
	return (
		<MenuSection title='Sound'>
			<button
				type='button'
				data-press='teal'
				onClick={() => {
					haptic('tap')
					toggleMute()
				}}
				aria-pressed={audio.muted}
				data-testid='audio-toggle-mute'
				className='flex h-11 items-center justify-between gap-2 rounded-md border border-foreground/15 bg-background/40 px-3 font-heading text-sm uppercase tracking-[0.06em] text-foreground hover:bg-background/60'
			>
				<span className='flex items-center gap-2'>
					<MuteIcon className='size-4' aria-hidden='true' />
					{audio.muted ? 'Unmute all' : 'Mute all'}
				</span>
				<span className='font-mono text-foreground/55 text-xs tabular-nums'>
					{audio.muted ? 'OFF' : 'ON'}
				</span>
			</button>
			{/* Touch devices get a single horizontal Master slider so the
							    menu fits without scrolling and Quit stays in view.
							    Per-bus controls live on desktop where the three vertical
							    columns fit comfortably. */}
			<MasterVolumeRow value={audio.masterVolume} onChange={setMasterVolume} />
			<div className='hidden items-stretch gap-2 pt-1 fine:flex'>
				<VolumeColumn
					label='Master'
					value={audio.masterVolume}
					onChange={setMasterVolume}
					testId='audio-volume-master'
				/>
				<VolumeColumn
					label='Music'
					value={audio.musicVolume}
					onChange={setMusicVolume}
					muted={audio.musicMuted}
					onMute={toggleMusicMute}
					testId='audio-volume-music'
				/>
				<VolumeColumn
					label='FX'
					value={audio.fxVolume}
					onChange={setFxVolume}
					muted={audio.fxMuted}
					onMute={toggleFxMute}
					testId='audio-volume-fx'
				/>
			</div>
		</MenuSection>
	)
}

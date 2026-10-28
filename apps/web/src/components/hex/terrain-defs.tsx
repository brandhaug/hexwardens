import { memo } from 'react'
import { type TileTerrain } from '@hexwardens/game-logic/tile/tile-terrain'

type TerrainNoiseConfig = {
	terrain: TileTerrain
	turbulenceType: 'fractalNoise' | 'turbulence'
	frequency: number
	octaves: number
	seed: number
	strength: number
}

const TERRAIN_NOISE_CONFIGS: TerrainNoiseConfig[] = [
	{
		terrain: 'grass',
		turbulenceType: 'fractalNoise',
		frequency: 0.15,
		octaves: 3,
		seed: 1,
		strength: 0.15
	},
	{
		terrain: 'forest',
		turbulenceType: 'fractalNoise',
		frequency: 0.18,
		octaves: 3,
		seed: 5,
		strength: 0.18
	},
	{
		terrain: 'jungle',
		turbulenceType: 'fractalNoise',
		frequency: 0.16,
		octaves: 3,
		seed: 7,
		strength: 0.18
	},
	{
		terrain: 'swamp',
		turbulenceType: 'fractalNoise',
		frequency: 0.12,
		octaves: 3,
		seed: 8,
		strength: 0.2
	},
	{
		terrain: 'desert',
		turbulenceType: 'fractalNoise',
		frequency: 0.12,
		octaves: 4,
		seed: 2,
		strength: 0.3
	},
	{
		terrain: 'terraced',
		turbulenceType: 'fractalNoise',
		frequency: 0.15,
		octaves: 4,
		seed: 10,
		strength: 0.3
	},
	{
		terrain: 'barren',
		turbulenceType: 'fractalNoise',
		frequency: 0.15,
		octaves: 4,
		seed: 11,
		strength: 0.2
	},
	{
		terrain: 'stone',
		turbulenceType: 'fractalNoise',
		frequency: 0.2,
		octaves: 4,
		seed: 6,
		strength: 0.22
	},
	{
		terrain: 'snow',
		turbulenceType: 'fractalNoise',
		frequency: 0.15,
		octaves: 4,
		seed: 3,
		strength: 0.35
	},
	{
		terrain: 'tundra',
		turbulenceType: 'fractalNoise',
		frequency: 0.15,
		octaves: 4,
		seed: 9,
		strength: 0.3
	},
	{
		terrain: 'ice',
		turbulenceType: 'turbulence',
		frequency: 0.1,
		octaves: 3,
		seed: 12,
		strength: 0.2
	},
	{
		terrain: 'water',
		turbulenceType: 'turbulence',
		frequency: 0.08,
		octaves: 3,
		seed: 4,
		strength: 0.22
	},
	{
		terrain: 'ocean',
		turbulenceType: 'turbulence',
		frequency: 0.06,
		octaves: 3,
		seed: 13,
		strength: 0.28
	}
]

function TerrainDefsView() {
	return (
		<svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
			<defs>
				{TERRAIN_NOISE_CONFIGS.map((cfg) => {
					const intercept = (1 - cfg.strength) / 2
					return (
						<filter key={cfg.terrain} id={`terrain-${cfg.terrain}`}>
							<feTurbulence
								type={cfg.turbulenceType}
								baseFrequency={cfg.frequency}
								numOctaves={cfg.octaves}
								seed={cfg.seed}
								result='noise'
							/>
							<feColorMatrix
								in='noise'
								type='saturate'
								values='0'
								result='mono'
							/>
							<feComponentTransfer in='mono' result='subtle'>
								<feFuncR
									type='linear'
									slope={cfg.strength}
									intercept={intercept}
								/>
								<feFuncG
									type='linear'
									slope={cfg.strength}
									intercept={intercept}
								/>
								<feFuncB
									type='linear'
									slope={cfg.strength}
									intercept={intercept}
								/>
								<feFuncA type='linear' slope={0} intercept={1} />
							</feComponentTransfer>
							<feBlend
								in='SourceGraphic'
								in2='subtle'
								mode='overlay'
								result='textured'
							/>
							<feComposite in='textured' in2='SourceGraphic' operator='in' />
						</filter>
					)
				})}
				{/* Deliberate "tabletop fog" texture for hidden tiles. */}
				<filter id='board-art-fog-filter'>
					<feTurbulence
						type='fractalNoise'
						baseFrequency='0.04'
						numOctaves={3}
						seed={42}
						result='fog'
					/>
					<feColorMatrix in='fog' type='saturate' values='0' result='monoFog' />
					<feComponentTransfer in='monoFog' result='softFog'>
						<feFuncR type='linear' slope='0.18' intercept='0.32' />
						<feFuncG type='linear' slope='0.18' intercept='0.3' />
						<feFuncB type='linear' slope='0.18' intercept='0.28' />
						<feFuncA type='linear' slope='0' intercept='0.78' />
					</feComponentTransfer>
					<feBlend
						in='SourceGraphic'
						in2='softFog'
						mode='multiply'
						result='textured'
					/>
					<feComposite in='textured' in2='SourceGraphic' operator='in' />
				</filter>
			</defs>
		</svg>
	)
}

export const TerrainDefs = memo(TerrainDefsView)

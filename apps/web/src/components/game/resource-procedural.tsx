/** Small, grounded resource models. Dimensions are in board world units. */
export function WheatPatch() {
	return (
		<group>
			{[-0.3, 0, 0.3].flatMap((x) =>
				[-0.22, 0.22].map((z) => (
					<group key={`${x}:${z}`} position={[x, 0, z]}>
						<mesh position={[0, 0.025, 0]} receiveShadow>
							<boxGeometry args={[0.23, 0.05, 0.22]} />
							<meshStandardMaterial color='#956039' roughness={1} />
						</mesh>
						<mesh position={[0, 0.18, 0]} castShadow>
							<cylinderGeometry args={[0.018, 0.024, 0.3, 5]} />
							<meshStandardMaterial color='#718c38' roughness={1} />
						</mesh>
						<mesh
							position={[0, 0.34, 0]}
							scale={[0.065, 0.15, 0.06]}
							castShadow
						>
							<icosahedronGeometry args={[1, 0]} />
							<meshStandardMaterial
								color='#efc552'
								roughness={0.9}
								flatShading
							/>
						</mesh>
						<mesh
							position={[0.055, 0.17, 0]}
							rotation={[0, 0, -0.7]}
							castShadow
						>
							<coneGeometry args={[0.055, 0.2, 4]} />
							<meshStandardMaterial color='#8ca846' roughness={1} />
						</mesh>
					</group>
				))
			)}
		</group>
	)
}

export function FishShoal() {
	return (
		<group>
			<mesh position={[0, 0.012, 0]} scale={[1, 1, 0.85]} receiveShadow>
				<cylinderGeometry args={[0.62, 0.62, 0.02, 12]} />
				<meshStandardMaterial color='#289eaa' roughness={0.7} />
			</mesh>
			{[-0.3, 0, 0.3].map((z, index) => (
				<group
					key={z}
					position={[index === 1 ? 0.15 : -0.13, 0.06, z]}
					rotation={[0, -0.35, 0]}
				>
					<mesh scale={[0.23, 0.055, 0.085]}>
						<icosahedronGeometry args={[1, 1]} />
						<meshStandardMaterial
							color='#9fe2d8'
							roughness={0.65}
							flatShading
						/>
					</mesh>
					<mesh
						position={[-0.24, 0, 0]}
						rotation={[0, 0, -Math.PI / 2]}
						scale={[1, 1, 0.4]}
					>
						<coneGeometry args={[0.1, 0.14, 3]} />
						<meshStandardMaterial color='#62beb9' roughness={0.7} />
					</mesh>
					<mesh position={[0.14, 0.045, 0.035]}>
						<sphereGeometry args={[0.019, 6, 4]} />
						<meshBasicMaterial color='#173e49' />
					</mesh>
				</group>
			))}
		</group>
	)
}

export function ClayDeposit() {
	return (
		<group>
			<mesh position={[0, 0.05, 0]} scale={[0.58, 0.08, 0.46]} receiveShadow>
				<icosahedronGeometry args={[1, 0]} />
				<meshStandardMaterial color='#9d563a' roughness={1} flatShading />
			</mesh>
			{[-0.23, 0, 0.26].map((x) => (
				<mesh
					key={x}
					position={[x, 0.15, x === 0 ? -0.15 : 0.12]}
					scale={[0.23, x === 0 ? 0.25 : 0.16, 0.2]}
					castShadow
				>
					<icosahedronGeometry args={[1, 0]} />
					<meshStandardMaterial
						color={x === 0 ? '#c77a4c' : '#da9460'}
						roughness={1}
						flatShading
					/>
				</mesh>
			))}
		</group>
	)
}

export function PearlShell() {
	return (
		<group rotation={[0, -0.4, 0]}>
			<mesh position={[0, 0.045, 0]} scale={[0.36, 0.08, 0.28]} castShadow>
				<sphereGeometry args={[1, 8, 4]} />
				<meshStandardMaterial color='#ddbdb0' roughness={0.85} flatShading />
			</mesh>
			<mesh
				position={[0, 0.19, -0.15]}
				rotation={[-0.65, 0, 0]}
				scale={[0.34, 0.06, 0.27]}
				castShadow
			>
				<sphereGeometry args={[1, 8, 4]} />
				<meshStandardMaterial color='#edd9c9' roughness={0.8} flatShading />
			</mesh>
			<mesh position={[0, 0.15, 0.045]} castShadow>
				<icosahedronGeometry args={[0.13, 1]} />
				<meshStandardMaterial
					color='#fff4de'
					roughness={0.25}
					metalness={0.15}
				/>
			</mesh>
		</group>
	)
}

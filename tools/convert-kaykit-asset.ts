import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

if (args.length !== 2) {
	process.stderr.write(
		'Usage: node tools/convert-kaykit-asset.ts <source.{gltf,glb}> <target.glb>\n'
	)
	process.exit(1)
}

const source = args.at(0)
const target = args.at(1)

if (target === undefined || source === undefined) {
	process.stderr.write('Source and target are required.\n')
	process.exit(1)
}

if (extname(target) !== '.glb') {
	process.stderr.write('Target must be a .glb file.\n')
	process.exit(1)
}

await mkdir(dirname(target), { recursive: true })

switch (extname(source)) {
	case '.gltf': {
		run('pnpm', ['exec', 'gltf-pipeline', '-i', source, '-o', target])
		break
	}
	case '.glb': {
		await copyFile(source, target)
		break
	}
	default: {
		process.stderr.write('Source must be a .gltf or .glb file.\n')
		process.exit(1)
	}
}

run('pnpm', ['exec', 'gltf-transform', 'validate', target])
process.stdout.write(`Converted ${source} -> ${target}\n`)

function run(command: string, commandArgs: readonly string[]) {
	const result = spawnSync(command, [...commandArgs], { stdio: 'inherit' })
	if (result.status === 0) {
		return
	}
	process.exit(result.status ?? 1)
}

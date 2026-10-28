import { Schema } from 'effect'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const modelsRoot = path.join(process.cwd(), 'apps/web/public/models')

const caps = new Map<string, number>(
	Object.entries({
		heroes: 15_000,
		units: 10_000,
		buildings: 7500,
		resources: 1500,
		terrain: 100,
		decorations: 1500,
		villages: 7500,
		ruins: 7500
	})
)

interface ModelReport {
	readonly file: string
	readonly category: string
	readonly triangles: number
}

const GltfPrimitive = Schema.Struct({
	mode: Schema.optional(Schema.Number),
	indices: Schema.optional(Schema.Number),
	attributes: Schema.optional(
		Schema.Struct({ POSITION: Schema.optional(Schema.Number) })
	)
})
const Gltf = Schema.Struct({
	accessors: Schema.optional(
		Schema.Array(Schema.Struct({ count: Schema.Number }))
	),
	meshes: Schema.optional(
		Schema.Array(Schema.Struct({ primitives: Schema.Array(GltfPrimitive) }))
	)
})
const decodeGltf = Schema.decodeUnknownSync(Schema.fromJsonString(Gltf))

const allFiles = await walk(modelsRoot)
const files = allFiles.filter(
	(file) => file.endsWith('.glb') || file.endsWith('.gltf')
)
const reports: ModelReport[] = await Promise.all(
	files.map(async (file) => ({
		file,
		category: categoryFor(file),
		triangles: await countTriangles(file)
	}))
)

const byCategory = new Map<string, ModelReport[]>()
for (const report of reports) {
	const existing = byCategory.get(report.category) ?? []
	existing.push(report)
	byCategory.set(report.category, existing)
}

let failed = false
for (const [category, categoryReports] of [...byCategory.entries()].toSorted(
	([a], [b]) => a.localeCompare(b)
)) {
	const sorted = categoryReports.toSorted((a, b) => b.triangles - a.triangles)
	const max = sorted[0]
	if (max === undefined) {
		continue
	}
	const cap = caps.get(category)
	const capText = cap === undefined ? 'no cap' : `cap ${cap}`
	process.stdout.write(`${category}: ${max.triangles} tris max (${capText})\n`)
	process.stdout.write(`  ${path.relative(process.cwd(), max.file)}\n`)
	if (cap !== undefined && max.triangles > cap) {
		failed = true
		for (const report of sorted.filter((entry) => entry.triangles > cap)) {
			process.stdout.write(
				`  over cap: ${report.triangles} ${path.relative(process.cwd(), report.file)}\n`
			)
		}
	}
}

if (failed) {
	process.exit(1)
}

async function walk(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true })
	const groups = await Promise.all(
		entries.map((entry) => {
			const fullPath = path.join(root, entry.name)
			return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath])
		})
	)
	return groups.flat()
}

function categoryFor(file: string): string {
	const relative = path.relative(modelsRoot, file)
	return relative.split(path.sep)[0] ?? 'unknown'
}

async function countTriangles(file: string): Promise<number> {
	const root = await readGltfJson(file)
	let total = 0
	for (const mesh of root.meshes ?? []) {
		for (const primitive of mesh.primitives) {
			const index = primitive.indices ?? primitive.attributes?.POSITION
			const count =
				index === undefined ? 0 : (root.accessors?.[index]?.count ?? 0)
			const mode = primitive.mode ?? 4
			if (mode === 4) {
				total += Math.floor(count / 3)
			} else if (mode === 5 || mode === 6) {
				total += Math.max(0, count - 2)
			}
		}
	}
	return total
}

async function readGltfJson(file: string): Promise<typeof Gltf.Type> {
	const bytes = await readFile(file)
	if (file.endsWith('.gltf')) {
		return decodeGltf(bytes.toString('utf8'))
	}
	if (bytes.readUInt32LE(0) !== 0x46_54_6c_67) {
		throw new Error(`Invalid GLB magic: ${file}`)
	}
	const jsonLength = bytes.readUInt32LE(12)
	const jsonType = bytes.readUInt32LE(16)
	if (jsonType !== 0x4e_4f_53_4a) {
		throw new Error(`First GLB chunk is not JSON: ${file}`)
	}
	const json = bytes.subarray(20, 20 + jsonLength).toString('utf8')
	return decodeGltf(json)
}

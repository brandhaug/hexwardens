import { type PrimaryBuilding } from '../domains/primary-building'
import { type Resource } from '../domains/resource'
import { type Ruins } from '../domains/ruins'
import { type SecondaryBuilding } from '../domains/secondary-building'
import { type UtilityBuilding } from '../domains/utility-building'
import { type Village } from '../domains/village'

export type TileItem =
	| PrimaryBuilding
	| SecondaryBuilding
	| UtilityBuilding
	| Village
	| Ruins
	| Resource

import { type Tribe } from '@hexwardens/game-logic/domains/tribe'
import { type LeaderboardSort } from '@hexwardens/api/leaderboard'
import { HexwardensApiClient } from './api-client'
import { ReactivityKey } from './reactivity-keys'

export const leaderboardAtom = (args: {
	readonly sort: LeaderboardSort
	readonly tribe?: Tribe
	readonly minMatches?: number
	readonly limit: number
	readonly offset: number
}) =>
	HexwardensApiClient.query('leaderboard', 'list', {
		query: args,
		timeToLive: '30 seconds',
		reactivityKeys: [ReactivityKey.leaderboard]
	})

export const profileAtom = (username: string, matchLimit = 20) =>
	HexwardensApiClient.query('profile', 'get', {
		params: { username },
		query: { matchLimit },
		timeToLive: '1 minute',
		reactivityKeys: [ReactivityKey.profile]
	})

export const achievementsAtom = (username: string) =>
	HexwardensApiClient.query('achievements', 'get', {
		params: { username },
		timeToLive: '1 minute',
		reactivityKeys: [ReactivityKey.achievements]
	})

export const cosmeticsAtom = (username: string) =>
	HexwardensApiClient.query('cosmetics', 'get', {
		params: { username },
		timeToLive: '30 seconds',
		reactivityKeys: [ReactivityKey.cosmetics]
	})

export const presenceAtom = HexwardensApiClient.query('presence', 'count', {
	timeToLive: '60 seconds',
	reactivityKeys: [ReactivityKey.presence]
})

export const dailyChallengeAtom = (date: string) =>
	HexwardensApiClient.query('daily', 'view', {
		params: { date },
		timeToLive: '15 seconds',
		reactivityKeys: [ReactivityKey.daily]
	})

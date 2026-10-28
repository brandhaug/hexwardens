# Drop the Victory Points System

Victory Points (awarded for tech research, kills, and Village captures, used as a 500-turn-cap tiebreak) are removed. A Tribe is eliminated when it owns zero Villages, and the Match ends when only one Tribe remains. The 500-turn cap is retained as a draw safety valve — when reached, the Match ends as a draw with no winner declared.

Hexwardens has no points system; victory there is binary (last tribe with cities standing). Keeping VP only as a tiebreak meant we owned a player-state field, per-action `awardPoints` calls, and codec/UI surface for a system that didn't otherwise exist in the game's vocabulary. Dropping it aligns our outcome model with Hexwardens'. The 500-turn cap survives because we run on Cloudflare Durable Objects with bot-vs-bot tests — an unbounded match drains state and stalls CI — but declaring a draw is more honest than synthesising a winner from a side-stat.

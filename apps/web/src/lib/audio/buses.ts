/**
 * The four audio buses. SFX and synthesised stingers route through `fx`,
 * the looped music bed routes through `music`, the announcer chain routes
 * through `announcer`, and `master` is the global volume + mute gate. The
 * bus split is the upgrade seam for ducking and per-event mixing — adding a
 * new bus is the only invasive change that should ever reach this file.
 */
export type AudioBus = 'master' | 'music' | 'fx' | 'announcer'

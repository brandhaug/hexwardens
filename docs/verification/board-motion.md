# Board motion and mobile rendering verification

Verified on 2026-09-28 against the local Vite dev build in desktop Chromium.
Mobile results use a 390 × 844 viewport with device scale factor 3 on the same
computer. They measure rendering allocation and browser frame intervals, not
physical-phone performance or battery consumption.

## Reproduce

```sh
pnpm -C apps/web test
pnpm -C packages/game-logic test
pnpm -C apps/web exec playwright test e2e/board-mobile.spec.ts e2e/smoke.spec.ts --grep 'mobile pixel|offline game'
```

Keep port 3001 available for the repository's Playwright server configuration.
This run used the same tests with a temporary config pointing at port 3002 because
another application owned 3001. All four browser tests passed. The mobile test
attaches screenshots of both viewport sizes to Playwright's results.

The web suite passed 356 tests; game logic passed 769 tests. The movement tests
first failed on abrupt motion, stationary hopping, and reduced-motion handling,
then passed after implementation.

## Measurements

Same running offline match, viewport, and browser before and after editing:

| Measurement                        | Before      | After       |
| ---------------------------------- | ----------- | ----------- |
| Board CSS size                     | 390 × 706   | 390 × 706   |
| Board drawing buffer               | 780 × 1412  | 585 × 1059  |
| Drawing-buffer pixels              | 1,101,360   | 619,515     |
| Mobile directional shadow target   | 2048 × 2048 | 1024 × 1024 |
| Mobile contact-shadow resolution   | 1024        | 512         |
| Median frame interval, 180 samples | 16.7 ms     | 16.7 ms     |
| 95th-percentile frame interval     | 16.7 ms     | 16.8 ms     |

Drawing-buffer pixels fell 43.75%. The directional shadow allocation uses one
quarter as many texels. Desktop retains DPR 2 and 2048-pixel directional shadows.
A rendered-scene probe confirmed an existing desktop shadow allocation changed
to 1024 × 1024 after resizing to mobile. Frame intervals do not demonstrate an
FPS improvement on this computer.

For the frame sample, run this in the browser console after the board settles:

```js
await new Promise((resolve) => {
	const samples = []
	let previous = performance.now()
	function frame(now) {
		samples.push(now - previous)
		previous = now
		if (samples.length < 180) requestAnimationFrame(frame)
		else {
			samples.sort((a, b) => a - b)
			resolve({ medianMs: samples[90], p95Ms: samples[171] })
		}
	}
	requestAnimationFrame(frame)
})
```

## Interaction checks

A temporary browser fixture mounted the real `Board` with a visible caveman and
supplied successive snapshots. A one-hex movement sampled the rendered group at
x = 0 initially, 0.548 at 108 ms, 1.295 at 192 ms, and 1.732 at 292 ms. With reduced
motion enabled, the first rendered frame was already at x = 1.732 and remained
there. Combat displayed the attack pose and existing damage callout. Selection
showed the wider outer hex outline and separate inner outline.

For manual repetition, enter an offline match, select a unit, move to a highlighted
hex, and attack an adjacent enemy. Repeat with the browser's reduced-motion
emulation enabled. Movement should settle without a hop in reduced motion;
combat feedback and health remain visible. Check selection at desktop and phone
widths, then resize across 768 px and confirm the canvas remains rendered.

No game-rule or multiplayer protocol changes were made. Independent Standards
and Spec reviews found no remaining blocking issues after the repair pass.

import type { Attitude } from "../../domain/types";

/** The phone held in `a`, the player turned about the vertical by `angle`, anticlockwise from above */
export function swivelled(a: Attitude, angle: number): Attitude {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return {
		xx: c * a.xx - s * a.xy,
		xy: s * a.xx + c * a.xy,
		xz: a.xz,
		yx: c * a.yx - s * a.yy,
		yy: s * a.yx + c * a.yy,
		yz: a.yz,
		zx: c * a.zx - s * a.zy,
		zy: s * a.zx + c * a.zy,
		zz: a.zz,
	};
}

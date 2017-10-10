import {ctx} from "tcx";
import {Vector} from "math";

export interface Layout {
    draw(pos: Vector, size: Vector): void;
    getSize(): Vector;
}

export class HorizontalWeighted implements Layout {
    private size: Vector;
    constructor(private left: Layout, private right: Layout, private leftWeight: number) {
        let lsize = left.getSize();
        let rsize = right.getSize();
        this.size = new Vector(Math.max(lsize.x / leftWeight, rsize.x / (1 - leftWeight)), Math.max(lsize.y, rsize.y));
    }
    draw(pos: Vector, size: Vector) {
        let lWidth = size.x * this.leftWeight;
        let lsize = new Vector(lWidth, size.y);
        this.left.draw(pos, lsize);
        this.right.draw(pos.add(new Vector(lWidth, 0)), new Vector(size.x - lWidth, size.y));
    }
    getSize() {
        return this.size;
    }
}

export class HorizontalJoin implements Layout {
    private size: Vector;
    constructor(private left: Layout, private right: Layout) {
        let lsize = left.getSize();
        let rsize = right.getSize();
        this.size = new Vector(lsize.x + rsize.x, Math.max(lsize.y, rsize.y));
    }
    draw(pos: Vector, size: Vector) {
        let lWants = this.left.getSize();
        let rWants = this.right.getSize();
        let lPortion = lWants.x / (lWants.x + rWants.x);

        let lWidth = size.x * lPortion;
        this.left.draw(pos, new Vector(lWidth, size.y));
        this.right.draw(pos.add(new Vector(lWidth, 0)), new Vector(size.x - lWidth, size.y));
    }
    getSize() {
        return this.size;
    }
}

export class VerticalJoin implements Layout {
    private size: Vector;
    constructor(private top: Layout, private bottom: Layout) {
        let lsize = top.getSize();
        let rsize = bottom.getSize();
        this.size = new Vector(Math.max(lsize.x, rsize.x), lsize.y + rsize.y);
    }
    draw(pos: Vector, size: Vector) {
        let tWants = this.top.getSize();
        let bWants = this.bottom.getSize();
        let tPortion = tWants.y / (tWants.y + bWants.y);

        let tHeight = size.y * tPortion;
        this.top.draw(pos, new Vector(size.x, tHeight));
        this.bottom.draw(pos.add(new Vector(0, tHeight)), new Vector(size.x, size.y - tHeight));
    }
    getSize() {
        return this.size;
    }
}

export class Border implements Layout {
    private size: Vector;
    /** color can be null for padding instead
     *  `widths` is [top, right, bottom, left]
     */
    constructor(private inner: Layout, private widths: [number, number, number, number], private color: string | null) {
        let innerSize = inner.getSize();
        this.size = new Vector(innerSize.x + widths[1] + widths[3], innerSize.y + widths[0] + widths[2]);
    }
    draw(pos: Vector, size: Vector) {
        if (this.color != null) {
            ctx.fillStyle = this.color;
            let [top, right, bottom, left] = this.widths;
            if (top > 0) {
                ctx.fillRect(pos.x, pos.y, size.x, top);
            }
            if (bottom > 0) {
                ctx.fillRect(pos.x, pos.y + size.y - bottom, size.x, bottom);
            }
            if (left > 0) {
                ctx.fillRect(pos.x, pos.y + top, left, size.y - top - bottom);
            }
            if (right > 0) {
                ctx.fillRect(pos.x + size.x - right, pos.y + top, right, size.y - top - bottom);
            }
        }
        let innerSize = size.sub(new Vector(this.widths[1] + this.widths[3], this.widths[0] + this.widths[2])).max(new Vector(0, 0));
        this.inner.draw(pos.add(new Vector(this.widths[3], this.widths[0])), innerSize);
    }
    getSize() {
        return this.size;
    }
}

export class Text implements Layout {
    private size: Vector;
    constructor(private text: string, private font: [number, string], private fillColor: string) {
        ctx.font = font[0] + "px " + font[1];
        this.size = new Vector(ctx.measureText(text).width, font[0]);
    }
    draw(pos: Vector, size: Vector) {
        ctx.font = Math.min(this.font[0], Math.floor(size.y)) + "px " + this.font[1];
        ctx.fillStyle = this.fillColor;
        ctx.fillText(this.text, pos.x, pos.y + this.font[0] * 0.8, size.x);
    }
    getSize() {
        return this.size;
    }
}

export class Background implements Layout {
    constructor(private inner: Layout, private color: string) {}
    draw(pos: Vector, size: Vector) {
        ctx.fillStyle = this.color;
        ctx.fillRect(pos.x, pos.y, size.x, size.y);
        this.inner.draw(pos, size);
    }
    getSize() {
        return this.inner.getSize();
    }
}

/** Used when size will be greater than inner.getSize() to align inner within that larger space */
export class Align implements Layout {
    constructor(private inner: Layout, private alignX: number, private alignY: number) {}
    draw(pos: Vector, size: Vector) {
        let innerSize = this.inner.getSize().min(size);
        let posX = pos.x + (size.x - innerSize.x) * this.alignX;
        let posY = pos.y + (size.y - innerSize.y) * this.alignY;
        this.inner.draw(new Vector(posX, posY), innerSize);
    }
    getSize() {
        return this.inner.getSize();
    }
}

/** Overrides getSize so that inner cannot expand a parent (size may end up larger than maxSize though) */
export class MaxSize implements Layout {
    constructor(private inner: Layout, private maxSize: Vector) { }
    draw(pos: Vector, size: Vector) {
        this.inner.draw(pos, size);
    }
    getSize() {
        return this.inner.getSize().min(this.maxSize);
    }
}

/** Overrides getSize to request at least minSize (size may end up less than minSize though) */
export class MinSize implements Layout {
    constructor(private inner: Layout, private minSize: Vector) { }
    draw(pos: Vector, size: Vector) {
        this.inner.draw(pos, size);
    }
    getSize() {
        return this.inner.getSize().max(this.minSize);
    }
}

export class Empty implements Layout {
    constructor(private size: Vector) {}
    draw(pos: Vector, size: Vector) {}
    getSize() { return this.size; }
}

export function vertical(layouts: Layout[]) {
    if (layouts.length === 0) return new Empty(new Vector(0, 0));
    return layouts.reduce((acc, l) => new VerticalJoin(acc, l));
}
export function horizontal(layouts: Layout[]) {
    if (layouts.length === 0) return new Empty(new Vector(0, 0));
    return layouts.reduce((acc, l) => new HorizontalJoin(acc, l));
}

export function columns(layouts: Layout[]) {
    let numOthers = 1;
    return layouts.reduce((acc, l) => new HorizontalWeighted(new HorizontalJoin(acc, new Empty(new Vector(10, 0))), l, 1 - (1 / ++numOthers)));
}
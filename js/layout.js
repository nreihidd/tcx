define(["require", "exports", "tcx", "math"], function (require, exports, tcx_1, math_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class HorizontalWeighted {
        constructor(left, right, leftWeight) {
            this.left = left;
            this.right = right;
            this.leftWeight = leftWeight;
            let lsize = left.getSize();
            let rsize = right.getSize();
            this.size = new math_1.Vector(Math.max(lsize.x / leftWeight, rsize.x / (1 - leftWeight)), Math.max(lsize.y, rsize.y));
        }
        draw(pos, size) {
            let lWidth = size.x * this.leftWeight;
            let lsize = new math_1.Vector(lWidth, size.y);
            this.left.draw(pos, lsize);
            this.right.draw(pos.add(new math_1.Vector(lWidth, 0)), new math_1.Vector(size.x - lWidth, size.y));
        }
        getSize() {
            return this.size;
        }
    }
    exports.HorizontalWeighted = HorizontalWeighted;
    class HorizontalJoin {
        constructor(left, right) {
            this.left = left;
            this.right = right;
            let lsize = left.getSize();
            let rsize = right.getSize();
            this.size = new math_1.Vector(lsize.x + rsize.x, Math.max(lsize.y, rsize.y));
        }
        draw(pos, size) {
            let lWants = this.left.getSize();
            let rWants = this.right.getSize();
            let lPortion = lWants.x / (lWants.x + rWants.x);
            let lWidth = size.x * lPortion;
            this.left.draw(pos, new math_1.Vector(lWidth, size.y));
            this.right.draw(pos.add(new math_1.Vector(lWidth, 0)), new math_1.Vector(size.x - lWidth, size.y));
        }
        getSize() {
            return this.size;
        }
    }
    exports.HorizontalJoin = HorizontalJoin;
    class VerticalJoin {
        constructor(top, bottom) {
            this.top = top;
            this.bottom = bottom;
            let lsize = top.getSize();
            let rsize = bottom.getSize();
            this.size = new math_1.Vector(Math.max(lsize.x, rsize.x), lsize.y + rsize.y);
        }
        draw(pos, size) {
            let tWants = this.top.getSize();
            let bWants = this.bottom.getSize();
            let tPortion = tWants.y / (tWants.y + bWants.y);
            let tHeight = size.y * tPortion;
            this.top.draw(pos, new math_1.Vector(size.x, tHeight));
            this.bottom.draw(pos.add(new math_1.Vector(0, tHeight)), new math_1.Vector(size.x, size.y - tHeight));
        }
        getSize() {
            return this.size;
        }
    }
    exports.VerticalJoin = VerticalJoin;
    class Border {
        /** color can be null for padding instead
         *  `widths` is [top, right, bottom, left]
         */
        constructor(inner, widths, color) {
            this.inner = inner;
            this.widths = widths;
            this.color = color;
            let innerSize = inner.getSize();
            this.size = new math_1.Vector(innerSize.x + widths[1] + widths[3], innerSize.y + widths[0] + widths[2]);
        }
        draw(pos, size) {
            if (this.color != null) {
                tcx_1.ctx.fillStyle = this.color;
                let [top, right, bottom, left] = this.widths;
                if (top > 0) {
                    tcx_1.ctx.fillRect(pos.x, pos.y, size.x, top);
                }
                if (bottom > 0) {
                    tcx_1.ctx.fillRect(pos.x, pos.y + size.y - bottom, size.x, bottom);
                }
                if (left > 0) {
                    tcx_1.ctx.fillRect(pos.x, pos.y + top, left, size.y - top - bottom);
                }
                if (right > 0) {
                    tcx_1.ctx.fillRect(pos.x + size.x - right, pos.y + top, right, size.y - top - bottom);
                }
            }
            let innerSize = size.sub(new math_1.Vector(this.widths[1] + this.widths[3], this.widths[0] + this.widths[2])).max(new math_1.Vector(0, 0));
            this.inner.draw(pos.add(new math_1.Vector(this.widths[3], this.widths[0])), innerSize);
        }
        getSize() {
            return this.size;
        }
    }
    exports.Border = Border;
    class Text {
        constructor(text, font, fillColor) {
            this.text = text;
            this.font = font;
            this.fillColor = fillColor;
            tcx_1.ctx.font = font[0] + "px " + font[1];
            this.size = new math_1.Vector(tcx_1.ctx.measureText(text).width, font[0]);
        }
        draw(pos, size) {
            tcx_1.ctx.font = Math.min(this.font[0], Math.floor(size.y)) + "px " + this.font[1];
            tcx_1.ctx.fillStyle = this.fillColor;
            tcx_1.ctx.fillText(this.text, pos.x, pos.y + this.font[0] * 0.8, size.x);
        }
        getSize() {
            return this.size;
        }
    }
    exports.Text = Text;
    class Background {
        constructor(inner, color) {
            this.inner = inner;
            this.color = color;
        }
        draw(pos, size) {
            tcx_1.ctx.fillStyle = this.color;
            tcx_1.ctx.fillRect(pos.x, pos.y, size.x, size.y);
            this.inner.draw(pos, size);
        }
        getSize() {
            return this.inner.getSize();
        }
    }
    exports.Background = Background;
    /** Used when size will be greater than inner.getSize() to align inner within that larger space */
    class Align {
        constructor(inner, alignX, alignY) {
            this.inner = inner;
            this.alignX = alignX;
            this.alignY = alignY;
        }
        draw(pos, size) {
            let innerSize = this.inner.getSize().min(size);
            let posX = pos.x + (size.x - innerSize.x) * this.alignX;
            let posY = pos.y + (size.y - innerSize.y) * this.alignY;
            this.inner.draw(new math_1.Vector(posX, posY), innerSize);
        }
        getSize() {
            return this.inner.getSize();
        }
    }
    exports.Align = Align;
    /** Overrides getSize so that inner cannot expand a parent (size may end up larger than maxSize though) */
    class MaxSize {
        constructor(inner, maxSize) {
            this.inner = inner;
            this.maxSize = maxSize;
        }
        draw(pos, size) {
            this.inner.draw(pos, size);
        }
        getSize() {
            return this.inner.getSize().min(this.maxSize);
        }
    }
    exports.MaxSize = MaxSize;
    /** Overrides getSize to request at least minSize (size may end up less than minSize though) */
    class MinSize {
        constructor(inner, minSize) {
            this.inner = inner;
            this.minSize = minSize;
        }
        draw(pos, size) {
            this.inner.draw(pos, size);
        }
        getSize() {
            return this.inner.getSize().max(this.minSize);
        }
    }
    exports.MinSize = MinSize;
    class Empty {
        constructor(size) {
            this.size = size;
        }
        draw(pos, size) { }
        getSize() { return this.size; }
    }
    exports.Empty = Empty;
    function vertical(layouts) {
        if (layouts.length === 0)
            return new Empty(new math_1.Vector(0, 0));
        return layouts.reduce((acc, l) => new VerticalJoin(acc, l));
    }
    exports.vertical = vertical;
    function horizontal(layouts) {
        if (layouts.length === 0)
            return new Empty(new math_1.Vector(0, 0));
        return layouts.reduce((acc, l) => new HorizontalJoin(acc, l));
    }
    exports.horizontal = horizontal;
    function columns(layouts) {
        let numOthers = 1;
        return layouts.reduce((acc, l) => new HorizontalWeighted(new HorizontalJoin(acc, new Empty(new math_1.Vector(10, 0))), l, 1 - (1 / ++numOthers)));
    }
    exports.columns = columns;
});
//# sourceMappingURL=layout.js.map
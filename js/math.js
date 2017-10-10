define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Vector {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
        static fromAngle(angle) {
            return new Vector(Math.cos(angle), Math.sin(angle));
        }
        static random() {
            return Vector.fromAngle(Math.random() * Math.PI * 2);
        }
        add({ x, y }) {
            return new Vector(this.x + x, this.y + y);
        }
        sub({ x, y }) {
            return new Vector(this.x - x, this.y - y);
        }
        mul({ x, y }) {
            return new Vector(this.x * x, this.y * y);
        }
        muls(s) {
            return new Vector(this.x * s, this.y * s);
        }
        div({ x, y }) {
            return new Vector(this.x / x, this.y / y);
        }
        divs(s) {
            return new Vector(this.x / s, this.y / s);
        }
        mag() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }
        mag2() {
            return this.x * this.x + this.y * this.y;
        }
        norm() {
            let m = this.mag();
            if (m === 0)
                return new Vector(0, 0);
            else
                return this.divs(m);
        }
        dot({ x, y }) {
            return this.x * x + this.y * y;
        }
        maxs(s) {
            return new Vector(Math.max(this.x, s), Math.max(this.y, s));
        }
        mins(s) {
            return new Vector(Math.min(this.x, s), Math.min(this.y, s));
        }
        clamps(low, high) {
            return new Vector(Math.max(Math.min(this.x, high), low), Math.max(Math.min(this.y, high), low));
        }
        max({ x, y }) {
            return new Vector(Math.max(this.x, x), Math.max(this.y, y));
        }
        min({ x, y }) {
            return new Vector(Math.min(this.x, x), Math.min(this.y, y));
        }
        clamp(low, high) {
            return new Vector(Math.max(Math.min(this.x, high.x), low.x), Math.max(Math.min(this.y, high.y), low.y));
        }
        floor() {
            return new Vector(Math.floor(this.x), Math.floor(this.y));
        }
        ceil() {
            return new Vector(Math.ceil(this.x), Math.ceil(this.y));
        }
        crossz() {
            return new Vector(-this.y, this.x);
        }
        towards(other, distance) {
            return this.add(other.sub(this).norm().muls(distance));
        }
        mix(other, a) {
            return this.add(other.sub(this).muls(a));
        }
        projectedMag2(other) {
            // || (a*b / ||b||^2)b ||^2 = (a*b)^2 / (b*b)
            let dot = this.dot(other);
            return dot * dot / other.mag2();
        }
        projectOnto(other) {
            return other.muls(this.dot(other) / other.mag2());
        }
        angle() {
            return Math.atan2(this.y, this.x);
        }
        angleBetween(other) {
            return Math.abs(normalizeAngle(this.angle() - other.angle()));
        }
        mulByMatrix(mat, isPoint) {
            let h = isPoint ? 1 : 0;
            return new Vector(mat.a * this.x + mat.c * this.y + h * mat.e, mat.b * this.x + mat.d * this.y + h * mat.f);
        }
    }
    exports.Vector = Vector;
    function normalizeAngle(a) {
        a = a % (Math.PI * 2);
        if (a < -Math.PI) {
            return a + Math.PI * 2;
        }
        if (a > Math.PI) {
            return a - Math.PI * 2;
        }
        return a;
    }
    exports.normalizeAngle = normalizeAngle;
    function clamp(x, min, max) {
        return Math.min(Math.max(x, min), max);
    }
    exports.clamp = clamp;
    function mix(x, y, a) {
        return x + (y - x) * a;
    }
    exports.mix = mix;
    function mod(x, y) {
        return x - Math.floor(x / y) * y;
    }
    exports.mod = mod;
    function choose(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    exports.choose = choose;
});
//# sourceMappingURL=math.js.map
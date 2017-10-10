export class Vector {
    static fromAngle(angle: number): Vector {
        return new Vector(Math.cos(angle), Math.sin(angle));
    }
    static random(): Vector {
        return Vector.fromAngle(Math.random() * Math.PI * 2);
    }
    constructor(public readonly x: number, public readonly y: number) { }
    add({x, y}: Vector): Vector {
        return new Vector(this.x + x, this.y + y);
    }
    sub({x, y}: Vector): Vector {
        return new Vector(this.x - x, this.y - y);
    }
    mul({x, y}: Vector): Vector {
        return new Vector(this.x * x, this.y * y);
    }
    muls(s: number): Vector {
        return new Vector(this.x * s, this.y * s);
    }
    div({x, y}: Vector): Vector {
        return new Vector(this.x / x, this.y / y);
    }
    divs(s: number): Vector {
        return new Vector(this.x / s, this.y / s);
    }
    mag(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    mag2(): number {
        return this.x * this.x + this.y * this.y;
    }
    norm(): Vector {
        let m = this.mag();
        if (m === 0) return new Vector(0, 0);
        else return this.divs(m);
    }
    dot({x, y}: Vector): number {
        return this.x * x + this.y * y;
    }

    maxs(s: number): Vector {
        return new Vector(Math.max(this.x, s), Math.max(this.y, s));
    }
    mins(s: number): Vector {
        return new Vector(Math.min(this.x, s), Math.min(this.y, s));
    }
    clamps(low: number, high: number): Vector {
        return new Vector(Math.max(Math.min(this.x, high), low), Math.max(Math.min(this.y, high), low));
    }

    max({x, y}: Vector): Vector {
        return new Vector(Math.max(this.x, x), Math.max(this.y, y));
    }
    min({x, y}: Vector): Vector {
        return new Vector(Math.min(this.x, x), Math.min(this.y, y));
    }
    clamp(low: Vector, high: Vector): Vector {
        return new Vector(Math.max(Math.min(this.x, high.x), low.x), Math.max(Math.min(this.y, high.y), low.y));
    }

    floor(): Vector {
        return new Vector(Math.floor(this.x), Math.floor(this.y));
    }
    ceil(): Vector {
        return new Vector(Math.ceil(this.x), Math.ceil(this.y));
    }

    crossz(): Vector {
        return new Vector(-this.y, this.x);
    }

    towards(other: Vector, distance: number): Vector {
        return this.add(other.sub(this).norm().muls(distance));
    }

    mix(other: Vector, a: number): Vector {
        return this.add(other.sub(this).muls(a));
    }

    projectedMag2(other: Vector): number {
        // || (a*b / ||b||^2)b ||^2 = (a*b)^2 / (b*b)
        let dot = this.dot(other);
        return dot * dot / other.mag2(); 
    }
    projectOnto(other: Vector): Vector {
        return other.muls(this.dot(other) / other.mag2());
    }
    angle(): number {
        return Math.atan2(this.y, this.x);
    }
    angleBetween(other: Vector): number {
        return Math.abs(normalizeAngle(this.angle() - other.angle()));
    }

    mulByMatrix(mat: SVGMatrix, isPoint: boolean) {
        let h = isPoint ? 1 : 0;
        return new Vector(
            mat.a * this.x + mat.c * this.y + h * mat.e,
            mat.b * this.x + mat.d * this.y + h * mat.f,
        );
    }
}
export function normalizeAngle(a: number) {
    a = a % (Math.PI * 2);
    if (a < -Math.PI) { return a + Math.PI * 2; }
    if (a > Math.PI)  { return a - Math.PI * 2; }
    return a;
}
export function clamp(x: number, min: number, max: number) {
    return Math.min(Math.max(x, min), max);
}
export function mix(x: number, y: number, a: number) {
    return x + (y - x) * a;
}
export function mod(x: number, y: number) {
    return x - Math.floor(x / y) * y;
}
export function choose<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
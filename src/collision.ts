"use strict";

import {Vector, mod} from "math";

export let dbgPointInPolygon: Set<Polygon> = new Set();
export let dbgPolygonRejectedByBBox: Set<Polygon> = new Set();
export let dbgLineSandwich: { a: Line, b: Line, intersect: Vector, snug: Vector, ap: Vector, bp: Vector }[] = [];
export let dbgShowLineSandwich = false;
export let dbgNumCandidates: number[] = [];
export let dbgCandidateStatus: Map<Vector, "considered"|"checked"|"rejected"> = new Map();
export let dbgShowCandidateStatus = false;
export let dbgPointsFiltered = 0;

function quadraticFormula(a: number, b: number, c: number): [number, number] | null {
    let d = b * b - 4 * a * c;
    if (d < 0) {
        return null;
    }
    let e = Math.sqrt(d);
    return [(-b - e) / (2 * a), (-b + e) / (2 * a)];
}
function findCircleIntersectDistance(p: Vector, dir: Vector, r: number): number {
    let a = dir.dot(dir);
    let b = 2 * p.dot(dir);
    let c = p.dot(p) - r * r;

    let ts = quadraticFormula(a, b, c);
    if (ts == null) { throw "XCVIUHSDFI"; }
    let [t1, t2] = ts;
    let t = t1;
    if (t < 0) { t = t2; }
    if (t < 0) { throw "SDPFOIJSDFPOI"; }
    return t;
}

function lawOfCosines(a: number, b: number, c: number): number {
    return Math.acos((a * a + b * b - c * c) / (2 * a * b));
}

export interface BoundingBox {
    min: Vector;
    max: Vector;
}

export interface Polygon {
    points: Vector[];
    lines: Line[];
    precalculatedValues: { constant: number, multiple: number }[];
    boundingBox: BoundingBox;
}

export interface Line {
    a: Vector;
    b: Vector;
}

export interface Circle {
    center: Vector;
    radius: number;
}

type Obstacle = Polygon | Line | Circle;

function isClockwise(points: Vector[]): boolean {
    return points.map((a, i) => {
        let b = points[mod(i + 1, points.length)];
        return (b.x - a.x) * (b.y + a.y);
    }).reduce((a, b) => a + b) < 0;
}

export function makePolygonFromPoints(points: Vector[]): Polygon {
    points = points.slice(0);
    if (isClockwise(points)) {
        points.reverse();
    }
    {
        // Need to remove duplicate points (they break pointInPolygon)
        let prev = points[points.length - 1];
        points = points.filter(p => {
            if (p.sub(prev).mag2() < 0.1) { return false; }
            prev = p;
            return true;
        });
    }

    let lines: Line[] = [];
    let min: Vector = points[0];
    let max: Vector = points[0];
    let precalc: { constant: number, multiple: number }[] = [];
    for (let i = 0; i < points.length; i++) {
        let pointA = points[i];
        let pointB = points[mod(i + 1, points.length)];
        min = min.min(pointA);
        max = max.max(pointA);
        lines.push({ a: pointA, b: pointB });
        precalc.push({
            constant: pointA.x - (pointA.y * pointB.x) / (pointB.y - pointA.y) + (pointA.y * pointA.x) / (pointB.y - pointA.y),
            multiple: (pointB.x - pointA.x) / (pointB.y - pointA.y),
        });
    }
    return { points: points, lines: lines, boundingBox: { min, max }, precalculatedValues: precalc };
}

function pointInPolygon(p: Vector, polygon: Polygon): boolean {
    // http://alienryderflex.com/polygon/
    let oddNodes = false;
    for (let i = 0; i < polygon.lines.length; i++) {
        let line = polygon.lines[i];
        let calc = polygon.precalculatedValues[i];
        if (line.a.y < p.y && line.b.y >= p.y ||
            line.a.y >= p.y && line.b.y < p.y) {
                oddNodes = oddNodes !== (p.y * calc.multiple + calc.constant < p.x);
            }
    }
    return oddNodes;
}

function circleOverlapsLine(circle: Circle, line: Line): boolean {
    let r2 = circle.radius * circle.radius;
    if (circle.center.sub(line.a).mag2() <= r2) return true;
    if (circle.center.sub(line.b).mag2() <= r2) return true;
    let dir = line.b.sub(line.a).norm();
    let circleL = circle.center.dot(dir);
    if (circleL < line.a.dot(dir) || circleL > line.b.dot(dir)) return false;
    let norm = dir.crossz();
    return Math.abs(norm.dot(circle.center.sub(line.a))) < circle.radius;
}

function boundingBoxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
    return !(
        a.max.x < b.min.x ||
        a.max.y < b.min.y ||
        b.max.x < a.min.x ||
        b.max.y < a.min.y
    );
}

function distanceToBoundingBox(p: Vector, bbox: BoundingBox): number {
    if (p.y >= bbox.min.y && p.y <= bbox.max.y) {
        if (p.x >= bbox.min.x) {
            if (p.x <= bbox.max.x) return 0;
            return p.x - bbox.max.x;
        } else {
            return bbox.min.x - p.x;
        }
    } else if (p.x >= bbox.min.x && p.x <= bbox.max.x) {
        if (p.y >= bbox.min.y) {
            if (p.y <= bbox.max.y) return 0;
            return p.y - bbox.max.y;
        } else {
            return bbox.min.y - p.y;
        }
    } else {
        return Math.min(
            p.sub(bbox.min).mag(),
            p.sub(bbox.max).mag(),
            p.sub(new Vector(bbox.min.x, bbox.max.y)).mag(),
            p.sub(new Vector(bbox.max.x, bbox.min.y)).mag()
        );
    }
}

export function circleOverlapsPolygons(circle: Circle, polygons: Polygon[]): boolean {
    let bbox = {
        min: circle.center.sub(new Vector(circle.radius, circle.radius)),
        max: circle.center.add(new Vector(circle.radius, circle.radius)),
    };
    for (let polygon of polygons) {
        if (!boundingBoxesOverlap(polygon.boundingBox, bbox)) {
            dbgPolygonRejectedByBBox.add(polygon);
            continue;
        }
        if (pointInPolygon(circle.center, polygon)) {
            dbgPointInPolygon.add(polygon);
            return true;
        } else {
            for (let line of polygon.lines) {
                if (circleOverlapsLine(circle, line)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isSpotOpen(target: Vector, targetRadius: number, circles: Circle[], polygons: Polygon[], withinBounds: BoundingBox): boolean {
    for (let circle of circles) {
        let rs = circle.radius + targetRadius;
        if (circle.center.sub(target).mag2() < rs * rs) {
            return false;
        }
    }
    if (circleOverlapsPolygons({ center: target, radius: targetRadius }, polygons)) {
        return false;
    }
    if (!boundingBoxesOverlap(
        { min: target, max: target },
        {
            min: withinBounds.min.add(new Vector(targetRadius, targetRadius)),
            max: withinBounds.max.sub(new Vector(targetRadius, targetRadius))
        }))
    {
        return false;
    }
    return true;
}

function distanceToLine(point: Vector, line: Line): number {
    let dir = line.b.sub(line.a).norm();
    let normal = dir.crossz();
    let pointL = point.dot(dir);
    let aL = line.a.dot(dir);
    let bL = line.b.dot(dir);
    let distanceNormal = Math.abs(point.dot(normal) - line.a.dot(normal));
    if (pointL < aL) return new Vector(aL - pointL, distanceNormal).mag();
    if (pointL > bL) return new Vector(pointL - bL, distanceNormal).mag();
    return distanceNormal;
}

function linelineIntersection(a: Line, b: Line): Vector|null {
    // https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
    let adx = a.a.x - a.b.x;
    let ady = a.a.y - a.b.y;
    let bdx = b.a.x - b.b.x;
    let bdy = b.a.y - b.b.y;

    let ac = (a.a.x * a.b.y - a.a.y * a.b.x);
    let bc = (b.a.x * b.b.y - b.a.y * b.b.x);

    let d = adx * bdy - ady * bdx;
    if (Math.abs(d) < 0.01) return null;
    return new Vector(
        (bdx * ac - adx * bc) / d,
        (bdy * ac - ady * bc) / d
    );
}

function lineLineSandwich(a: Line, b: Line, radius: number): Vector|null {
    let intersection = linelineIntersection(a, b);
    if (intersection == null) return null;
    let dirA = a.b.sub(a.a).norm();
    let dirB = b.b.sub(b.a).norm();

    // Have to find the right quadrant (the one that's "outside" both lines)
    {
        let cross = dirA.x * dirB.y - dirA.y * dirB.x;
        if (cross > 0) {
            let t = b;
            b = a;
            a = t;
            let dirT = dirB;
            dirB = dirA;
            dirA = dirT;
        }
    }

    // cosine is symmetric about 0, so the sign of the angle difference doesn't matter
    let theta = dirB.angleBetween(dirA);
    let d = radius / Math.cos(theta / 2);
    let offsetAlongLine = Math.sqrt(d * d - radius * radius);

    let startA = a.a.dot(dirA);
    let endA = a.b.dot(dirA);
    let interA = intersection.dot(dirA);
    let touchA = interA + offsetAlongLine;
    if (touchA < startA || touchA > endA) return null;

    let startB = b.a.dot(dirB);
    let endB = b.b.dot(dirB);
    let interB = intersection.dot(dirB);
    let touchB = interB - offsetAlongLine;
    if (touchB < startB || touchB > endB) return null;

    let bisector = dirA.sub(dirB);
    let bisectorMag = bisector.mag();
    if (bisectorMag < 0.01) return null;
    bisector = bisector.divs(bisectorMag);
    let snug = intersection.add(bisector.muls(d));
    // DBG {
        dbgLineSandwich.push({
            a, b, intersect: intersection, snug, ap: intersection.add(dirA.muls(offsetAlongLine)), bp: intersection.add(dirB.muls(-offsetAlongLine))
        });
    // DBG }
    return snug;
}

function projectCircleToLine(circle: Circle, line: Line): Vector|null {
    let dir = line.b.sub(line.a).norm();
    let normal = dir.crossz();
    if (circle.center.dot(normal) > line.a.dot(normal) + circle.radius) return null; // Circle is already outside the line
    let circleL = circle.center.dot(dir);
    let aL = line.a.dot(dir);
    let bL = line.b.dot(dir);
    if (circleL < aL || circleL > bL) return null;
    let nearestPoint = line.a.add(dir.muls(circleL - aL));
    return nearestPoint.add(normal.muls(circle.radius));
}

function projectCircleOutOfCircle(circle: Circle, toProject: Circle): Vector|null {
    let combinedRadius = circle.radius + toProject.radius;
    let v = toProject.center.sub(circle.center);
    let m2 = v.mag2();
    // This candidate only makes sense if the target is inside this circle
    if (m2 < combinedRadius * combinedRadius) {
        if (m2 < 0.01) {
            v = Vector.random();
            m2 = 1;
        }
        return circle.center.add(v.divs(Math.sqrt(m2)).muls(combinedRadius));
    } else {
        return null;
    }
}

function nestleLineCircle(circle: Circle, line: Line, r: number): Vector[] {
    let dir = line.b.sub(line.a).norm();
    let norm = dir.crossz();
    let d = norm.dot(circle.center.sub(line.a));

    if (d < 0.01 && circle.radius === 0) return []; // early out for vertex+line where the vertex lies on the line
    
    let sa = circle.radius + r;
    let sb = d - r;
    let s = Math.sqrt(sa * sa - sb * sb);

    let circleL = dir.dot(circle.center);
    let v1L = circleL - s;
    let v2L = circleL + s;

    let aL = dir.dot(line.a);
    let bL = dir.dot(line.b);

    let results: number[] = [];
    if (v1L >= aL && v1L <= bL) { results.push(v1L); }
    if (v2L >= aL && v2L <= bL) { results.push(v2L); }

    return results.map(pL => {
        return line.a.add(dir.muls(pL - aL)).add(norm.muls(r));
    });
}

function nestleCircle(a: Circle, b: Circle, r: number): Vector[] {
    let combinedRadius = a.radius + b.radius + r * 2;
    let axis = b.center.sub(a.center);
    let distanceSq = axis.mag2();
    if (distanceSq < 0.1) { return []; }
    if (distanceSq >= combinedRadius * combinedRadius) { return []; }
    let distance = Math.sqrt(distanceSq);
    // alpha can end up NaN if the three distances cannot make up a triangle, why does that happen?
    // It looks like when a real circle `a`, and a point `b`, are `r` apart you end up with the following:
    // Side 1: `r`, Side 2: `a.radius` + `r`, Side 3: `r`, but rounding errors (maybe?) can make that first side
    // slightly lower than `r`, so you end up with a triangle where side 2 is larger than side 1 + side 3.
    // So alpha would be basically 0, meaning both results would be the point right on the axis (where all 3 circles are colinear)
    // So, should alpha be reset to 0 in such a case or the result thrown away?
    let alpha = lawOfCosines(distance, a.radius + r, b.radius + r);
    if (isNaN(alpha)) { return []; }
    let rotatedOffset = new Vector(Math.cos(alpha), Math.sin(alpha)).muls(a.radius + r);
    let norm = axis.divs(distance);
    let normP = norm.crossz();
    let offsetX = norm.muls(rotatedOffset.x);

    let offset1 = offsetX.add(normP.muls(rotatedOffset.y));
    let offset2 = offsetX.add(normP.muls(-rotatedOffset.y));
    return [a.center.add(offset1), a.center.add(offset2)];
}

/** pop returns least priority first (that's really confusingly worded, the element with the lowest value `priority` gets returned first...) */
class Heap<T> {
    // https://github.com/rust-lang/rust/blob/master/src/libcollections/binary_heap.rs
    // https://en.wikipedia.org/wiki/Heap_(data_structure)
    private entries: {value: T, priority: number}[] = [];
    constructor() { }
    insert(value: T, priority: number) {
        this.entries.push({value, priority});
        this.shiftUp(this.entries.length - 1);
    }
    pop(): T|undefined {
        if (this.entries.length === 0) return;
        if (this.entries.length === 1) {
            return (<any>this.entries.pop()).value;
        }
        let returnValue = this.entries[0].value;
        this.entries[0] = <any>this.entries.pop();
        this.shiftDown(0);
        return returnValue;
    }
    get length(): number {
        return this.entries.length;
    }
    private shiftDown(startingIndex: number) {
        let index = startingIndex;
        let entry = this.entries[index];
        while (true) {
            let leftChild = index * 2 + 1;
            if (leftChild >= this.entries.length) break;
            let rightChild = leftChild + 1;
            let betterChild = (rightChild < this.entries.length && this.entries[rightChild].priority < this.entries[leftChild].priority) ? rightChild : leftChild;
            let child = this.entries[betterChild];
            if (child.priority < entry.priority) {
                this.entries[index] = child;
            } else {
                break;
            }
            index = betterChild;
        }
        this.entries[index] = entry;
    }
    private shiftUp(startingIndex: number) {
        let index = startingIndex;
        let entry = this.entries[index];
        while (index > 0) {
            let parentIndex = Math.floor((index - 1) / 2);
            let parent = this.entries[parentIndex];
            if (entry.priority < parent.priority) {
                this.entries[index] = parent;
            } else {
                break;
            }
            index = parentIndex;
        }
        this.entries[index] = entry;
    }
}

function testHeap() {
    let heap = new Heap<number>();
    let values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(Math.random());
    for (let val of values) {
        heap.insert(val, val);
    }
    values.sort();
    let randomInserts = 1000;
    while (values.length > 0 || randomInserts > 0) {
        if (values.length === 0 || randomInserts > 0 && Math.random() < 0.5) {
            let toInsert = Math.random();
            heap.insert(toInsert, toInsert);
            values.push(toInsert);
            values.sort();
            randomInserts -= 1;
        } else {
            let a = values.shift();
            let b = heap.pop();
            if (a !== b) {
                throw "Heap failed: " + a + " !== " + b;
            }
        }
    }
    if (heap.length !== 0) throw "Heap failed, length not 0: " + heap.length;
    if (heap.pop() !== undefined) throw "Heap failed, returned a thing when it ought not have";
    console.log("Heap works successfully");
}

class QuadTree<T> {
    private static MAX_DEPTH = 10;
    private children: QuadTree<T>[]|null;
    private entries: { bbox: BoundingBox, t: T }[] = [];
    constructor(private depth: number, private bounds: BoundingBox) { }
    private genChildren() {
        if (this.children == null && this.depth < QuadTree.MAX_DEPTH) {
            let x0 = this.bounds.min.x;
            let y0 = this.bounds.min.y;
            let x1 = (this.bounds.min.x + this.bounds.max.x) / 2;
            let y1 = (this.bounds.min.y + this.bounds.max.y) / 2;
            let x2 = this.bounds.max.x;
            let y2 = this.bounds.max.y;
            this.children = [
                new QuadTree<T>(this.depth + 1, { min: new Vector(x0, y0), max: new Vector(x1, y1) }),
                new QuadTree<T>(this.depth + 1, { min: new Vector(x1, y0), max: new Vector(x2, y1) }),
                new QuadTree<T>(this.depth + 1, { min: new Vector(x0, y1), max: new Vector(x1, y2) }),
                new QuadTree<T>(this.depth + 1, { min: new Vector(x1, y1), max: new Vector(x2, y2) }),
            ];
        } 
    }
    insert(bbox: BoundingBox, t: T) {
        this.genChildren();
        if (this.children == null) {
            this.entries.push({ bbox, t });
        } else {
            let insertInto = this.children.filter(child => boundingBoxesOverlap(child.bounds, bbox));
            if (insertInto.length !== 1) {
                this.entries.push({ bbox, t });
            } else {
                insertInto[0].insert(bbox, t);
            }
        }
    }
    get(queryBbox: BoundingBox, output: T[]) {
        for (let { bbox, t } of this.entries) {
            if (boundingBoxesOverlap(bbox, queryBbox)) {
                output.push(t);
            }
        }
        if (this.children != null) {
            for (let child of this.children) {
                if (boundingBoxesOverlap(queryBbox, child.bounds)) {
                    child.get(queryBbox, output);
                }
            }
        }
    }
}

type CandidateNode = {
    type: "ExpandObstacle";
    obstacle: Obstacle;
} | {
    type: "CheckCandidatePoint";
    point: Vector;
} | {
    type: "ExpandPair";
    a: Circle | Line;
    b: Circle | Line;
};

interface Vertex extends Circle {
    limA: Vector,
    limB: Vector
}

function circleIsVertex(circle: Circle): circle is Vertex {
    return "limA" in circle;
}
function obstacleIsCircle(obstacle: Obstacle): obstacle is Circle {
    return "center" in obstacle;
}
function obstacleIsPolygon(obstacle: Obstacle): obstacle is Polygon {
    return "lines" in obstacle;
}
function obstacleIsLine(obstacle: Obstacle): obstacle is Line {
    return "a" in obstacle;
}

function pointOutsideVertex(vertex: Vertex, point: Vector): boolean {
    let d = point.sub(vertex.center);
    return vertex.limA.dot(d) >= 0 && vertex.limB.dot(d) >= 0;
}

export function findClosestOpenSpot(target: Vector, targetRadius: number, circles: Circle[], polygons: Polygon[], withinBounds: BoundingBox): Vector {
    let obstacleMinimums = new Map<Obstacle, number>();
    let candidateNodes = new Heap<CandidateNode>();
    let targetCircle = { center: target, radius: targetRadius };

    let expandedObstacles = new QuadTree<Circle|Line>(0, { min: target.sub(new Vector(1000, 1000)), max: target.add(new Vector(1000, 1000)) });
    dbgCandidateStatus.clear();
    dbgPointInPolygon.clear();
    dbgPolygonRejectedByBBox.clear();
    dbgPointsFiltered = 0;

    dbgNumCandidates.push(0);
    dbgLineSandwich = [];

    candidateNodes.insert({type: "CheckCandidatePoint", point: target}, 0);

    for (let circle of circles) {
        candidateNodes.insert({ type: "ExpandObstacle", obstacle: circle }, getMinimum(circle));
    }
    for (let polygon of polygons) {
        candidateNodes.insert({ type: "ExpandObstacle", obstacle: polygon }, getMinimum(polygon));
    }
    {
        function insertBoundaryLine(a: Vector, b: Vector) {
            let line = { a, b };
            candidateNodes.insert({ type: "ExpandObstacle", obstacle: line }, getMinimum(line));
        }
        let tl = withinBounds.min;
        let tr = new Vector(withinBounds.max.x, withinBounds.min.y);
        let br = withinBounds.max;
        let bl = new Vector(withinBounds.min.x, withinBounds.max.y);
        insertBoundaryLine(tl, tr);
        insertBoundaryLine(tr, br);
        insertBoundaryLine(br, bl);
        insertBoundaryLine(bl, tl);
    }

    function getMinimum(obstacle: Obstacle) {
        let min = obstacleMinimums.get(obstacle);
        if (min == null) {
            if (obstacleIsCircle(obstacle)) {
                min = Math.max(0, obstacle.center.sub(target).mag() - (obstacle.radius + targetRadius));
            } else if (obstacleIsLine(obstacle)) {
                min = Math.max(0, distanceToLine(target, obstacle) - targetRadius);
            } else if (obstacleIsPolygon(obstacle)) {
                min = Math.max(0, distanceToBoundingBox(target, obstacle.boundingBox) - targetRadius);
            } else { throw "Unreachable" }
            // These values are used as priorities which are distances squared
            min = min * min;
            obstacleMinimums.set(obstacle, min);
        }
        return min;
    }

    function addPointToCheck(point: Vector) {
        dbgCandidateStatus.set(point, "considered");
        // Insert with distance as the priority so that closer distances have greater priority
        candidateNodes.insert({type: "CheckCandidatePoint", point }, point.sub(target).mag2());
    }

    while (true) {
        dbgNumCandidates[dbgNumCandidates.length - 1] += 1;
        let candidateNode = candidateNodes.pop();
        if (candidateNode == null) {
            console.warn("Ran out of candidates");
            return new Vector(0, 0);
        }
        switch (candidateNode.type) {
            case "CheckCandidatePoint": {
                let candidatePoint = candidateNode.point;
                dbgCandidateStatus.set(candidatePoint, "checked");
                if (isSpotOpen(candidatePoint, targetRadius - 0.01 /* provide the epsilon here */, circles, polygons, withinBounds)) {
                    return candidatePoint;
                }
                dbgCandidateStatus.set(candidatePoint, "rejected");
            } break;
            case "ExpandObstacle": {
                let obstacle = candidateNode.obstacle;
                let obstacleBbox: BoundingBox;
                if (obstacleIsCircle(obstacle)) {
                    let p = projectCircleOutOfCircle(obstacle, targetCircle);
                    if (p != null) {
                        if (!circleIsVertex(obstacle) || pointOutsideVertex(obstacle, p)) {
                            addPointToCheck(p);
                        }
                    }
                    obstacleBbox = {
                        min: obstacle.center.sub(new Vector(obstacle.radius, obstacle.radius)),
                        max: obstacle.center.add(new Vector(obstacle.radius, obstacle.radius))
                    };
                } else if (obstacleIsPolygon(obstacle)) {
                    // Add every line in polygon and every vertex in polygon as separate obstacles.
                    // This will lead to vertices pairing with their own lines but there are early outs for those situations.
                    let prevLine = obstacle.lines[mod(-1, obstacle.lines.length)];
                    let prevDir = prevLine.b.sub(prevLine.a);
                    for (let line of obstacle.lines) {
                        candidateNodes.insert({ type: "ExpandObstacle", obstacle: line }, getMinimum(line));
                        let dir = line.b.sub(line.a);
                        let vertex = { center: line.a, radius: 0, limA: prevDir, limB: dir.muls(-1) };
                        candidateNodes.insert({ type: "ExpandObstacle", obstacle: vertex }, getMinimum(vertex));
                        prevDir = dir;
                    }
                    continue;
                } else if (obstacleIsLine(obstacle)) {
                    let p = projectCircleToLine(targetCircle, obstacle);
                    if (p != null) {
                        addPointToCheck(p);
                    }
                    obstacleBbox = {
                        min: obstacle.a.min(obstacle.b),
                        max: obstacle.a.max(obstacle.b)
                    };
                } else { throw "Unreachable" }
                let toPairWith: (Circle|Line)[] = [];
                let queryBbox = {
                    min: obstacleBbox.min.sub(new Vector(targetRadius * 2, targetRadius * 2)),
                    max: obstacleBbox.max.add(new Vector(targetRadius * 2, targetRadius * 2))
                };
                expandedObstacles.get(queryBbox, toPairWith);
                for (let otherObstacle of toPairWith) {
                    candidateNodes.insert({ type: "ExpandPair", a: obstacle, b: otherObstacle }, Math.max(getMinimum(obstacle), getMinimum(otherObstacle)));
                }
                expandedObstacles.insert(obstacleBbox, obstacle);
            } break;
            case "ExpandPair": {
                let a = candidateNode.a;
                let b = candidateNode.b;
                function doCircleLine(circle: Circle, line: Line) {
                    let points = nestleLineCircle(circle, line, targetRadius);
                    for (let point of points) {
                        if (circleIsVertex(circle) && !pointOutsideVertex(circle, point)) continue;
                        addPointToCheck(point);
                    }
                }
                if (obstacleIsCircle(a) && obstacleIsCircle(b)) {
                    // The targets nestled between two circles
                    let points = nestleCircle(a, b, targetRadius);
                    for (let point of points) {
                        if (circleIsVertex(a) && !pointOutsideVertex(a, point)) continue;
                        if (circleIsVertex(b) && !pointOutsideVertex(b, point)) continue;
                        addPointToCheck(point);
                    }
                } else if (obstacleIsLine(a) && obstacleIsLine(b)) {
                    let sandwich = lineLineSandwich(a, b, targetRadius);
                    if (sandwich != null) {
                        addPointToCheck(sandwich);
                    }
                } else if (obstacleIsCircle(a) && obstacleIsLine(b)) {
                    doCircleLine(a, b);
                } else if (obstacleIsLine(a) && obstacleIsCircle(b)) {
                    doCircleLine(b, a);
                } else { throw "Unreachable" }
            } break;
        }
    }
}
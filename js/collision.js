define(["require", "exports", "math"], function (require, exports, math_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dbgPointInPolygon = new Set();
    exports.dbgPolygonRejectedByBBox = new Set();
    exports.dbgLineSandwich = [];
    exports.dbgShowLineSandwich = false;
    exports.dbgNumCandidates = [];
    exports.dbgCandidateStatus = new Map();
    exports.dbgShowCandidateStatus = false;
    exports.dbgPointsFiltered = 0;
    function quadraticFormula(a, b, c) {
        let d = b * b - 4 * a * c;
        if (d < 0) {
            return null;
        }
        let e = Math.sqrt(d);
        return [(-b - e) / (2 * a), (-b + e) / (2 * a)];
    }
    function findCircleIntersectDistance(p, dir, r) {
        let a = dir.dot(dir);
        let b = 2 * p.dot(dir);
        let c = p.dot(p) - r * r;
        let ts = quadraticFormula(a, b, c);
        if (ts == null) {
            throw "XCVIUHSDFI";
        }
        let [t1, t2] = ts;
        let t = t1;
        if (t < 0) {
            t = t2;
        }
        if (t < 0) {
            throw "SDPFOIJSDFPOI";
        }
        return t;
    }
    function lawOfCosines(a, b, c) {
        return Math.acos((a * a + b * b - c * c) / (2 * a * b));
    }
    function isClockwise(points) {
        return points.map((a, i) => {
            let b = points[math_1.mod(i + 1, points.length)];
            return (b.x - a.x) * (b.y + a.y);
        }).reduce((a, b) => a + b) < 0;
    }
    function makePolygonFromPoints(points) {
        points = points.slice(0);
        if (isClockwise(points)) {
            points.reverse();
        }
        {
            // Need to remove duplicate points (they break pointInPolygon)
            let prev = points[points.length - 1];
            points = points.filter(p => {
                if (p.sub(prev).mag2() < 0.1) {
                    return false;
                }
                prev = p;
                return true;
            });
        }
        let lines = [];
        let min = points[0];
        let max = points[0];
        let precalc = [];
        for (let i = 0; i < points.length; i++) {
            let pointA = points[i];
            let pointB = points[math_1.mod(i + 1, points.length)];
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
    exports.makePolygonFromPoints = makePolygonFromPoints;
    function pointInPolygon(p, polygon) {
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
    function circleOverlapsLine(circle, line) {
        let r2 = circle.radius * circle.radius;
        if (circle.center.sub(line.a).mag2() <= r2)
            return true;
        if (circle.center.sub(line.b).mag2() <= r2)
            return true;
        let dir = line.b.sub(line.a).norm();
        let circleL = circle.center.dot(dir);
        if (circleL < line.a.dot(dir) || circleL > line.b.dot(dir))
            return false;
        let norm = dir.crossz();
        return Math.abs(norm.dot(circle.center.sub(line.a))) < circle.radius;
    }
    function boundingBoxesOverlap(a, b) {
        return !(a.max.x < b.min.x ||
            a.max.y < b.min.y ||
            b.max.x < a.min.x ||
            b.max.y < a.min.y);
    }
    function distanceToBoundingBox(p, bbox) {
        if (p.y >= bbox.min.y && p.y <= bbox.max.y) {
            if (p.x >= bbox.min.x) {
                if (p.x <= bbox.max.x)
                    return 0;
                return p.x - bbox.max.x;
            }
            else {
                return bbox.min.x - p.x;
            }
        }
        else if (p.x >= bbox.min.x && p.x <= bbox.max.x) {
            if (p.y >= bbox.min.y) {
                if (p.y <= bbox.max.y)
                    return 0;
                return p.y - bbox.max.y;
            }
            else {
                return bbox.min.y - p.y;
            }
        }
        else {
            return Math.min(p.sub(bbox.min).mag(), p.sub(bbox.max).mag(), p.sub(new math_1.Vector(bbox.min.x, bbox.max.y)).mag(), p.sub(new math_1.Vector(bbox.max.x, bbox.min.y)).mag());
        }
    }
    function circleOverlapsPolygons(circle, polygons) {
        let bbox = {
            min: circle.center.sub(new math_1.Vector(circle.radius, circle.radius)),
            max: circle.center.add(new math_1.Vector(circle.radius, circle.radius)),
        };
        for (let polygon of polygons) {
            if (!boundingBoxesOverlap(polygon.boundingBox, bbox)) {
                exports.dbgPolygonRejectedByBBox.add(polygon);
                continue;
            }
            if (pointInPolygon(circle.center, polygon)) {
                exports.dbgPointInPolygon.add(polygon);
                return true;
            }
            else {
                for (let line of polygon.lines) {
                    if (circleOverlapsLine(circle, line)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    exports.circleOverlapsPolygons = circleOverlapsPolygons;
    function isSpotOpen(target, targetRadius, circles, polygons, withinBounds) {
        for (let circle of circles) {
            let rs = circle.radius + targetRadius;
            if (circle.center.sub(target).mag2() < rs * rs) {
                return false;
            }
        }
        if (circleOverlapsPolygons({ center: target, radius: targetRadius }, polygons)) {
            return false;
        }
        if (!boundingBoxesOverlap({ min: target, max: target }, {
            min: withinBounds.min.add(new math_1.Vector(targetRadius, targetRadius)),
            max: withinBounds.max.sub(new math_1.Vector(targetRadius, targetRadius))
        })) {
            return false;
        }
        return true;
    }
    function distanceToLine(point, line) {
        let dir = line.b.sub(line.a).norm();
        let normal = dir.crossz();
        let pointL = point.dot(dir);
        let aL = line.a.dot(dir);
        let bL = line.b.dot(dir);
        let distanceNormal = Math.abs(point.dot(normal) - line.a.dot(normal));
        if (pointL < aL)
            return new math_1.Vector(aL - pointL, distanceNormal).mag();
        if (pointL > bL)
            return new math_1.Vector(pointL - bL, distanceNormal).mag();
        return distanceNormal;
    }
    function linelineIntersection(a, b) {
        // https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
        let adx = a.a.x - a.b.x;
        let ady = a.a.y - a.b.y;
        let bdx = b.a.x - b.b.x;
        let bdy = b.a.y - b.b.y;
        let ac = (a.a.x * a.b.y - a.a.y * a.b.x);
        let bc = (b.a.x * b.b.y - b.a.y * b.b.x);
        let d = adx * bdy - ady * bdx;
        if (Math.abs(d) < 0.01)
            return null;
        return new math_1.Vector((bdx * ac - adx * bc) / d, (bdy * ac - ady * bc) / d);
    }
    function lineLineSandwich(a, b, radius) {
        let intersection = linelineIntersection(a, b);
        if (intersection == null)
            return null;
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
        if (touchA < startA || touchA > endA)
            return null;
        let startB = b.a.dot(dirB);
        let endB = b.b.dot(dirB);
        let interB = intersection.dot(dirB);
        let touchB = interB - offsetAlongLine;
        if (touchB < startB || touchB > endB)
            return null;
        let bisector = dirA.sub(dirB);
        let bisectorMag = bisector.mag();
        if (bisectorMag < 0.01)
            return null;
        bisector = bisector.divs(bisectorMag);
        let snug = intersection.add(bisector.muls(d));
        // DBG {
        exports.dbgLineSandwich.push({
            a, b, intersect: intersection, snug, ap: intersection.add(dirA.muls(offsetAlongLine)), bp: intersection.add(dirB.muls(-offsetAlongLine))
        });
        // DBG }
        return snug;
    }
    function projectCircleToLine(circle, line) {
        let dir = line.b.sub(line.a).norm();
        let normal = dir.crossz();
        if (circle.center.dot(normal) > line.a.dot(normal) + circle.radius)
            return null; // Circle is already outside the line
        let circleL = circle.center.dot(dir);
        let aL = line.a.dot(dir);
        let bL = line.b.dot(dir);
        if (circleL < aL || circleL > bL)
            return null;
        let nearestPoint = line.a.add(dir.muls(circleL - aL));
        return nearestPoint.add(normal.muls(circle.radius));
    }
    function projectCircleOutOfCircle(circle, toProject) {
        let combinedRadius = circle.radius + toProject.radius;
        let v = toProject.center.sub(circle.center);
        let m2 = v.mag2();
        // This candidate only makes sense if the target is inside this circle
        if (m2 < combinedRadius * combinedRadius) {
            if (m2 < 0.01) {
                v = math_1.Vector.random();
                m2 = 1;
            }
            return circle.center.add(v.divs(Math.sqrt(m2)).muls(combinedRadius));
        }
        else {
            return null;
        }
    }
    function nestleLineCircle(circle, line, r) {
        let dir = line.b.sub(line.a).norm();
        let norm = dir.crossz();
        let d = norm.dot(circle.center.sub(line.a));
        if (d < 0.01 && circle.radius === 0)
            return []; // early out for vertex+line where the vertex lies on the line
        let sa = circle.radius + r;
        let sb = d - r;
        let s = Math.sqrt(sa * sa - sb * sb);
        let circleL = dir.dot(circle.center);
        let v1L = circleL - s;
        let v2L = circleL + s;
        let aL = dir.dot(line.a);
        let bL = dir.dot(line.b);
        let results = [];
        if (v1L >= aL && v1L <= bL) {
            results.push(v1L);
        }
        if (v2L >= aL && v2L <= bL) {
            results.push(v2L);
        }
        return results.map(pL => {
            return line.a.add(dir.muls(pL - aL)).add(norm.muls(r));
        });
    }
    function nestleCircle(a, b, r) {
        let combinedRadius = a.radius + b.radius + r * 2;
        let axis = b.center.sub(a.center);
        let distanceSq = axis.mag2();
        if (distanceSq < 0.1) {
            return [];
        }
        if (distanceSq >= combinedRadius * combinedRadius) {
            return [];
        }
        let distance = Math.sqrt(distanceSq);
        // alpha can end up NaN if the three distances cannot make up a triangle, why does that happen?
        // It looks like when a real circle `a`, and a point `b`, are `r` apart you end up with the following:
        // Side 1: `r`, Side 2: `a.radius` + `r`, Side 3: `r`, but rounding errors (maybe?) can make that first side
        // slightly lower than `r`, so you end up with a triangle where side 2 is larger than side 1 + side 3.
        // So alpha would be basically 0, meaning both results would be the point right on the axis (where all 3 circles are colinear)
        // So, should alpha be reset to 0 in such a case or the result thrown away?
        let alpha = lawOfCosines(distance, a.radius + r, b.radius + r);
        if (isNaN(alpha)) {
            return [];
        }
        let rotatedOffset = new math_1.Vector(Math.cos(alpha), Math.sin(alpha)).muls(a.radius + r);
        let norm = axis.divs(distance);
        let normP = norm.crossz();
        let offsetX = norm.muls(rotatedOffset.x);
        let offset1 = offsetX.add(normP.muls(rotatedOffset.y));
        let offset2 = offsetX.add(normP.muls(-rotatedOffset.y));
        return [a.center.add(offset1), a.center.add(offset2)];
    }
    /** pop returns least priority first (that's really confusingly worded, the element with the lowest value `priority` gets returned first...) */
    class Heap {
        constructor() {
            // https://github.com/rust-lang/rust/blob/master/src/libcollections/binary_heap.rs
            // https://en.wikipedia.org/wiki/Heap_(data_structure)
            this.entries = [];
        }
        insert(value, priority) {
            this.entries.push({ value, priority });
            this.shiftUp(this.entries.length - 1);
        }
        pop() {
            if (this.entries.length === 0)
                return;
            if (this.entries.length === 1) {
                return this.entries.pop().value;
            }
            let returnValue = this.entries[0].value;
            this.entries[0] = this.entries.pop();
            this.shiftDown(0);
            return returnValue;
        }
        get length() {
            return this.entries.length;
        }
        shiftDown(startingIndex) {
            let index = startingIndex;
            let entry = this.entries[index];
            while (true) {
                let leftChild = index * 2 + 1;
                if (leftChild >= this.entries.length)
                    break;
                let rightChild = leftChild + 1;
                let betterChild = (rightChild < this.entries.length && this.entries[rightChild].priority < this.entries[leftChild].priority) ? rightChild : leftChild;
                let child = this.entries[betterChild];
                if (child.priority < entry.priority) {
                    this.entries[index] = child;
                }
                else {
                    break;
                }
                index = betterChild;
            }
            this.entries[index] = entry;
        }
        shiftUp(startingIndex) {
            let index = startingIndex;
            let entry = this.entries[index];
            while (index > 0) {
                let parentIndex = Math.floor((index - 1) / 2);
                let parent = this.entries[parentIndex];
                if (entry.priority < parent.priority) {
                    this.entries[index] = parent;
                }
                else {
                    break;
                }
                index = parentIndex;
            }
            this.entries[index] = entry;
        }
    }
    function testHeap() {
        let heap = new Heap();
        let values = [];
        for (let i = 0; i < 100; i++)
            values.push(Math.random());
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
            }
            else {
                let a = values.shift();
                let b = heap.pop();
                if (a !== b) {
                    throw "Heap failed: " + a + " !== " + b;
                }
            }
        }
        if (heap.length !== 0)
            throw "Heap failed, length not 0: " + heap.length;
        if (heap.pop() !== undefined)
            throw "Heap failed, returned a thing when it ought not have";
        console.log("Heap works successfully");
    }
    class QuadTree {
        constructor(depth, bounds) {
            this.depth = depth;
            this.bounds = bounds;
            this.entries = [];
        }
        genChildren() {
            if (this.children == null && this.depth < QuadTree.MAX_DEPTH) {
                let x0 = this.bounds.min.x;
                let y0 = this.bounds.min.y;
                let x1 = (this.bounds.min.x + this.bounds.max.x) / 2;
                let y1 = (this.bounds.min.y + this.bounds.max.y) / 2;
                let x2 = this.bounds.max.x;
                let y2 = this.bounds.max.y;
                this.children = [
                    new QuadTree(this.depth + 1, { min: new math_1.Vector(x0, y0), max: new math_1.Vector(x1, y1) }),
                    new QuadTree(this.depth + 1, { min: new math_1.Vector(x1, y0), max: new math_1.Vector(x2, y1) }),
                    new QuadTree(this.depth + 1, { min: new math_1.Vector(x0, y1), max: new math_1.Vector(x1, y2) }),
                    new QuadTree(this.depth + 1, { min: new math_1.Vector(x1, y1), max: new math_1.Vector(x2, y2) }),
                ];
            }
        }
        insert(bbox, t) {
            this.genChildren();
            if (this.children == null) {
                this.entries.push({ bbox, t });
            }
            else {
                let insertInto = this.children.filter(child => boundingBoxesOverlap(child.bounds, bbox));
                if (insertInto.length !== 1) {
                    this.entries.push({ bbox, t });
                }
                else {
                    insertInto[0].insert(bbox, t);
                }
            }
        }
        get(queryBbox, output) {
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
    QuadTree.MAX_DEPTH = 10;
    function circleIsVertex(circle) {
        return "limA" in circle;
    }
    function obstacleIsCircle(obstacle) {
        return "center" in obstacle;
    }
    function obstacleIsPolygon(obstacle) {
        return "lines" in obstacle;
    }
    function obstacleIsLine(obstacle) {
        return "a" in obstacle;
    }
    function pointOutsideVertex(vertex, point) {
        let d = point.sub(vertex.center);
        return vertex.limA.dot(d) >= 0 && vertex.limB.dot(d) >= 0;
    }
    function findClosestOpenSpot(target, targetRadius, circles, polygons, withinBounds) {
        let obstacleMinimums = new Map();
        let candidateNodes = new Heap();
        let targetCircle = { center: target, radius: targetRadius };
        let expandedObstacles = new QuadTree(0, { min: target.sub(new math_1.Vector(1000, 1000)), max: target.add(new math_1.Vector(1000, 1000)) });
        exports.dbgCandidateStatus.clear();
        exports.dbgPointInPolygon.clear();
        exports.dbgPolygonRejectedByBBox.clear();
        exports.dbgPointsFiltered = 0;
        exports.dbgNumCandidates.push(0);
        exports.dbgLineSandwich = [];
        candidateNodes.insert({ type: "CheckCandidatePoint", point: target }, 0);
        for (let circle of circles) {
            candidateNodes.insert({ type: "ExpandObstacle", obstacle: circle }, getMinimum(circle));
        }
        for (let polygon of polygons) {
            candidateNodes.insert({ type: "ExpandObstacle", obstacle: polygon }, getMinimum(polygon));
        }
        {
            function insertBoundaryLine(a, b) {
                let line = { a, b };
                candidateNodes.insert({ type: "ExpandObstacle", obstacle: line }, getMinimum(line));
            }
            let tl = withinBounds.min;
            let tr = new math_1.Vector(withinBounds.max.x, withinBounds.min.y);
            let br = withinBounds.max;
            let bl = new math_1.Vector(withinBounds.min.x, withinBounds.max.y);
            insertBoundaryLine(tl, tr);
            insertBoundaryLine(tr, br);
            insertBoundaryLine(br, bl);
            insertBoundaryLine(bl, tl);
        }
        function getMinimum(obstacle) {
            let min = obstacleMinimums.get(obstacle);
            if (min == null) {
                if (obstacleIsCircle(obstacle)) {
                    min = Math.max(0, obstacle.center.sub(target).mag() - (obstacle.radius + targetRadius));
                }
                else if (obstacleIsLine(obstacle)) {
                    min = Math.max(0, distanceToLine(target, obstacle) - targetRadius);
                }
                else if (obstacleIsPolygon(obstacle)) {
                    min = Math.max(0, distanceToBoundingBox(target, obstacle.boundingBox) - targetRadius);
                }
                else {
                    throw "Unreachable";
                }
                // These values are used as priorities which are distances squared
                min = min * min;
                obstacleMinimums.set(obstacle, min);
            }
            return min;
        }
        function addPointToCheck(point) {
            exports.dbgCandidateStatus.set(point, "considered");
            // Insert with distance as the priority so that closer distances have greater priority
            candidateNodes.insert({ type: "CheckCandidatePoint", point }, point.sub(target).mag2());
        }
        while (true) {
            exports.dbgNumCandidates[exports.dbgNumCandidates.length - 1] += 1;
            let candidateNode = candidateNodes.pop();
            if (candidateNode == null) {
                console.warn("Ran out of candidates");
                return new math_1.Vector(0, 0);
            }
            switch (candidateNode.type) {
                case "CheckCandidatePoint":
                    {
                        let candidatePoint = candidateNode.point;
                        exports.dbgCandidateStatus.set(candidatePoint, "checked");
                        if (isSpotOpen(candidatePoint, targetRadius - 0.01 /* provide the epsilon here */, circles, polygons, withinBounds)) {
                            return candidatePoint;
                        }
                        exports.dbgCandidateStatus.set(candidatePoint, "rejected");
                    }
                    break;
                case "ExpandObstacle":
                    {
                        let obstacle = candidateNode.obstacle;
                        let obstacleBbox;
                        if (obstacleIsCircle(obstacle)) {
                            let p = projectCircleOutOfCircle(obstacle, targetCircle);
                            if (p != null) {
                                if (!circleIsVertex(obstacle) || pointOutsideVertex(obstacle, p)) {
                                    addPointToCheck(p);
                                }
                            }
                            obstacleBbox = {
                                min: obstacle.center.sub(new math_1.Vector(obstacle.radius, obstacle.radius)),
                                max: obstacle.center.add(new math_1.Vector(obstacle.radius, obstacle.radius))
                            };
                        }
                        else if (obstacleIsPolygon(obstacle)) {
                            // Add every line in polygon and every vertex in polygon as separate obstacles.
                            // This will lead to vertices pairing with their own lines but there are early outs for those situations.
                            let prevLine = obstacle.lines[math_1.mod(-1, obstacle.lines.length)];
                            let prevDir = prevLine.b.sub(prevLine.a);
                            for (let line of obstacle.lines) {
                                candidateNodes.insert({ type: "ExpandObstacle", obstacle: line }, getMinimum(line));
                                let dir = line.b.sub(line.a);
                                let vertex = { center: line.a, radius: 0, limA: prevDir, limB: dir.muls(-1) };
                                candidateNodes.insert({ type: "ExpandObstacle", obstacle: vertex }, getMinimum(vertex));
                                prevDir = dir;
                            }
                            continue;
                        }
                        else if (obstacleIsLine(obstacle)) {
                            let p = projectCircleToLine(targetCircle, obstacle);
                            if (p != null) {
                                addPointToCheck(p);
                            }
                            obstacleBbox = {
                                min: obstacle.a.min(obstacle.b),
                                max: obstacle.a.max(obstacle.b)
                            };
                        }
                        else {
                            throw "Unreachable";
                        }
                        let toPairWith = [];
                        let queryBbox = {
                            min: obstacleBbox.min.sub(new math_1.Vector(targetRadius * 2, targetRadius * 2)),
                            max: obstacleBbox.max.add(new math_1.Vector(targetRadius * 2, targetRadius * 2))
                        };
                        expandedObstacles.get(queryBbox, toPairWith);
                        for (let otherObstacle of toPairWith) {
                            candidateNodes.insert({ type: "ExpandPair", a: obstacle, b: otherObstacle }, Math.max(getMinimum(obstacle), getMinimum(otherObstacle)));
                        }
                        expandedObstacles.insert(obstacleBbox, obstacle);
                    }
                    break;
                case "ExpandPair":
                    {
                        let a = candidateNode.a;
                        let b = candidateNode.b;
                        function doCircleLine(circle, line) {
                            let points = nestleLineCircle(circle, line, targetRadius);
                            for (let point of points) {
                                if (circleIsVertex(circle) && !pointOutsideVertex(circle, point))
                                    continue;
                                addPointToCheck(point);
                            }
                        }
                        if (obstacleIsCircle(a) && obstacleIsCircle(b)) {
                            // The targets nestled between two circles
                            let points = nestleCircle(a, b, targetRadius);
                            for (let point of points) {
                                if (circleIsVertex(a) && !pointOutsideVertex(a, point))
                                    continue;
                                if (circleIsVertex(b) && !pointOutsideVertex(b, point))
                                    continue;
                                addPointToCheck(point);
                            }
                        }
                        else if (obstacleIsLine(a) && obstacleIsLine(b)) {
                            let sandwich = lineLineSandwich(a, b, targetRadius);
                            if (sandwich != null) {
                                addPointToCheck(sandwich);
                            }
                        }
                        else if (obstacleIsCircle(a) && obstacleIsLine(b)) {
                            doCircleLine(a, b);
                        }
                        else if (obstacleIsLine(a) && obstacleIsCircle(b)) {
                            doCircleLine(b, a);
                        }
                        else {
                            throw "Unreachable";
                        }
                    }
                    break;
            }
        }
    }
    exports.findClosestOpenSpot = findClosestOpenSpot;
});
//# sourceMappingURL=collision.js.map
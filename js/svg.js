define(["require", "exports", "math", "collision"], function (require, exports, math_1, collision_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    let SVG_SLACK = 0.5;
    function cubicBezierCurve(p0, p1, p2, p3) {
        let q1 = quadraticBezierCurve(p0, p1, p2);
        let q2 = quadraticBezierCurve(p1, p2, p3);
        return t => q1(t).mix(q2(t), t);
    }
    exports.cubicBezierCurve = cubicBezierCurve;
    function quadraticBezierCurve(p0, p1, p2) {
        return t => p0.mix(p1, t).mix(p1.mix(p2, t), t);
    }
    exports.quadraticBezierCurve = quadraticBezierCurve;
    function subdivideSampleCurve(curve, tLow, tHigh, slack) {
        let start = curve(tLow);
        let end = curve(tHigh);
        let tMid = (tHigh + tLow) / 2;
        let mid = curve(tMid);
        let norm = end.sub(start).norm().crossz();
        // let l = start.sub(end).mag();
        let d = Math.abs(norm.dot(mid) - norm.dot(start));
        if (d > slack) {
            let points = subdivideSampleCurve(curve, tLow, tMid, slack);
            points.pop();
            points = points.concat(subdivideSampleCurve(curve, tMid, tHigh, slack));
            return points;
        }
        else {
            return [start, end];
        }
    }
    exports.subdivideSampleCurve = subdivideSampleCurve;
    function pathToPolygons(path, mat) {
        let polygonsResult = [];
        let currentPoints = [];
        function endPolygon() {
            if (currentPoints.length < 2)
                return;
            polygonsResult.push(collision_1.makePolygonFromPoints(currentPoints.map(p => p.mulByMatrix(mat, true))));
            currentPoints = [];
        }
        function* parsePath() {
            let lastPoint = new math_1.Vector(0, 0);
            let lastTangent = null;
            function* readVector() {
                return new math_1.Vector(parseFloat(yield true), parseFloat(yield true));
            }
            function* absolute() {
                return yield* readVector();
            }
            function* relative() {
                return lastPoint.add(yield* readVector());
            }
            let commandChar = "L";
            while (true) {
                if ("mMlLhHvVzZcCsSqQtTaA".indexOf(yield false) !== -1) {
                    commandChar = yield true;
                }
                let nextLastTangent = null;
                let nextVectorNoUpdate = absolute;
                function* nextVector() {
                    lastPoint = yield* nextVectorNoUpdate();
                    return lastPoint;
                }
                switch (commandChar) {
                    case "m": nextVectorNoUpdate = relative;
                    case "M":
                        endPolygon();
                        currentPoints.push(yield* nextVector());
                        commandChar = commandChar === "m" ? "l" : "L";
                        break;
                    case "l": nextVectorNoUpdate = relative;
                    case "L":
                        currentPoints.push(yield* nextVector());
                        break;
                    case "h":
                        lastPoint = lastPoint.add(new math_1.Vector(parseFloat(yield true), 0));
                        currentPoints.push(lastPoint);
                        break;
                    case "H":
                        lastPoint = new math_1.Vector(parseFloat(yield true), lastPoint.y);
                        currentPoints.push(lastPoint);
                        break;
                    case "v":
                        lastPoint = lastPoint.add(new math_1.Vector(0, parseFloat(yield true)));
                        currentPoints.push(lastPoint);
                        break;
                    case "V":
                        lastPoint = new math_1.Vector(lastPoint.x, parseFloat(yield true));
                        currentPoints.push(lastPoint);
                        break;
                    case "z":
                    case "Z":
                        lastPoint = currentPoints[0];
                        endPolygon();
                        commandChar = "L";
                        break;
                    case "c": nextVectorNoUpdate = relative;
                    case "C":
                        {
                            let firstPoint = lastPoint;
                            let controlPoint1 = yield* nextVectorNoUpdate();
                            let controlPoint2 = yield* nextVectorNoUpdate();
                            let endPoint = yield* nextVector();
                            nextLastTangent = endPoint.sub(controlPoint2);
                            let curvePoints = subdivideSampleCurve(cubicBezierCurve(firstPoint, controlPoint1, controlPoint2, endPoint), 0, 1, SVG_SLACK);
                            for (let i = 1; i < curvePoints.length; i++)
                                currentPoints.push(curvePoints[i]);
                        }
                        break;
                    case "s": nextVectorNoUpdate = relative;
                    case "S":
                        {
                            let firstPoint = lastPoint;
                            let controlPoint2 = yield* nextVectorNoUpdate();
                            let endPoint = yield* nextVector();
                            let controlPoint1;
                            if (lastTangent == null) {
                                controlPoint1 = controlPoint2;
                            }
                            else {
                                controlPoint1 = firstPoint.add(lastTangent);
                            }
                            nextLastTangent = endPoint.sub(controlPoint2);
                            let curvePoints = subdivideSampleCurve(cubicBezierCurve(firstPoint, controlPoint1, controlPoint2, endPoint), 0, 1, SVG_SLACK);
                            for (let i = 1; i < curvePoints.length; i++)
                                currentPoints.push(curvePoints[i]);
                        }
                        break;
                    case "q": nextVectorNoUpdate = relative;
                    case "Q":
                        {
                            let firstPoint = lastPoint;
                            let controlPoint1 = yield* nextVectorNoUpdate();
                            let endPoint = yield* nextVector();
                            nextLastTangent = endPoint.sub(controlPoint1);
                            let curvePoints = subdivideSampleCurve(quadraticBezierCurve(firstPoint, controlPoint1, endPoint), 0, 1, SVG_SLACK);
                            for (let i = 1; i < curvePoints.length; i++)
                                currentPoints.push(curvePoints[i]);
                        }
                        break;
                    case "t": nextVectorNoUpdate = relative;
                    case "T":
                        {
                            let firstPoint = lastPoint;
                            let endPoint = yield* nextVector();
                            let controlPoint1;
                            if (lastTangent == null) {
                                controlPoint1 = firstPoint;
                            }
                            else {
                                controlPoint1 = firstPoint.add(lastTangent);
                            }
                            nextLastTangent = endPoint.sub(controlPoint1);
                            let curvePoints = subdivideSampleCurve(quadraticBezierCurve(firstPoint, controlPoint1, endPoint), 0, 1, SVG_SLACK);
                            for (let i = 1; i < curvePoints.length; i++)
                                currentPoints.push(curvePoints[i]);
                        }
                        break;
                    case "a": nextVectorNoUpdate = relative;
                    case "A":
                        // Arcs not supported
                        yield true; // rx
                        yield true; // ry
                        yield true; // x-axis-rotation
                        yield true; // large-arc-flag
                        yield true; // sweep-flag
                        currentPoints.push(yield* nextVector());
                        break;
                    default:
                        throw "Unrecognized command " + commandChar;
                }
                lastTangent = nextLastTangent;
            }
        }
        let tokens = path.split(/[\s,]+/);
        let index = 0;
        let parser = parsePath();
        let wantIncrement = parser.next().value;
        while (index < tokens.length) {
            wantIncrement = parser.next(tokens[wantIncrement ? index++ : index]).value;
        }
        endPolygon();
        return polygonsResult;
    }
    function getSVGSize(svg) {
        return new math_1.Vector(parseFloat(svg.getAttribute("width")), parseFloat(svg.getAttribute("height")));
    }
    exports.getSVGSize = getSVGSize;
    function svgToPolygons(svg) {
        let collisionLayer = svg.querySelector("#collision");
        let polygons = [];
        function processElement(el, parentMat) {
            let mat;
            let transform = el.transform;
            if (transform instanceof SVGAnimatedTransformList && transform.baseVal.numberOfItems > 0) {
                mat = parentMat.multiply(transform.baseVal.getItem(0).matrix);
            }
            else {
                mat = parentMat;
            }
            if (el instanceof SVGPathElement) {
                let path = (el.getAttribute("d"));
                pathToPolygons(path, mat).forEach(polygon => polygons.push(polygon));
            }
            for (let i = 0; i < el.children.length; i++) {
                processElement(el.children[i], mat);
            }
        }
        processElement(collisionLayer, svg.createSVGMatrix());
        return polygons;
    }
    exports.svgToPolygons = svgToPolygons;
    function loadAsync(url, responseType) {
        let req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.responseType = responseType;
        let promise = new Promise((resolve, reject) => {
            req.onload = () => resolve(req.response);
            req.onerror = evt => reject(evt.message);
            req.send();
        });
        return promise;
    }
    exports.loadAsync = loadAsync;
    function splitSVG(svg) {
        let lowSvg = svg.cloneNode(true);
        let highSvg = svg.cloneNode(true);
        let foregroundLayer = lowSvg.querySelector("#foreground");
        if (foregroundLayer != null) {
            lowSvg.removeChild(foregroundLayer);
        }
        let helpersLayer = lowSvg.querySelector("#helpers");
        if (helpersLayer != null) {
            lowSvg.removeChild(helpersLayer);
        }
        let toRemoveFromHigh = highSvg.querySelectorAll("svg > g:not(#foreground)");
        for (let i = 0; i < toRemoveFromHigh.length; i++) {
            highSvg.removeChild(toRemoveFromHigh[i]);
        }
        return [lowSvg, highSvg];
    }
    exports.splitSVG = splitSVG;
    function getAncestors(el) {
        let ancestors = [];
        function pushAncestor(el) {
            let parent = el.parentElement;
            ancestors.push(parent);
            if (!(parent instanceof SVGSVGElement)) {
                pushAncestor(parent);
            }
        }
        pushAncestor(el);
        return ancestors;
    }
    function getElementCompoundTransform(el) {
        let transformChain = getAncestors(el).reverse();
        transformChain.push(el);
        let root = transformChain[0];
        let mat = root.createSVGMatrix();
        for (let el of transformChain) {
            let transform = el.transform;
            if (transform instanceof SVGAnimatedTransformList && transform.baseVal.numberOfItems > 0) {
                mat = mat.multiply(transform.baseVal.getItem(0).matrix);
            }
        }
        return mat;
    }
    function getSVGCirclePosition(svg, selector) {
        let el = svg.querySelector(selector);
        let pos = new math_1.Vector(parseFloat(el.getAttribute("cx") || "0"), parseFloat(el.getAttribute("cy") || "0"));
        let mat = getElementCompoundTransform(el);
        return pos.mulByMatrix(mat, true);
    }
    exports.getSVGCirclePosition = getSVGCirclePosition;
    function getSVGPolygons(svg, selector) {
        let elem = svg.querySelector(selector);
        return pathToPolygons(elem.getAttribute("d") || "", getElementCompoundTransform(elem));
    }
    exports.getSVGPolygons = getSVGPolygons;
});
//# sourceMappingURL=svg.js.map
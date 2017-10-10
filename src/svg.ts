"use strict";

import {Vector} from "math";
import {BoundingBox, Polygon, makePolygonFromPoints} from "collision";

let SVG_SLACK = 0.5;

export type Curve = (t: number) => Vector;

export function cubicBezierCurve(p0: Vector, p1: Vector, p2: Vector, p3: Vector): Curve {
    let q1 = quadraticBezierCurve(p0, p1, p2);
    let q2 = quadraticBezierCurve(p1, p2, p3);
    return t => q1(t).mix(q2(t), t);
}
export function quadraticBezierCurve(p0: Vector, p1: Vector, p2: Vector): Curve {
    return t => p0.mix(p1, t).mix(p1.mix(p2, t), t);
}

export function subdivideSampleCurve(curve: Curve, tLow: number, tHigh: number, slack: number): Vector[] {
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
    } else {
        return [start, end];
    }
}

function pathToPolygons(path: string, mat: SVGMatrix): Polygon[] {
    let polygonsResult: Polygon[] = [];
    let currentPoints: Vector[] = [];
    function endPolygon() {
        if (currentPoints.length < 2) return;
        polygonsResult.push(makePolygonFromPoints(currentPoints.map(p => p.mulByMatrix(mat, true))));
        currentPoints = [];
    }
    function* parsePath(): IterableIterator<boolean> {
        let lastPoint = new Vector(0, 0);
        let lastTangent: Vector|null = null;
        function* readVector(): IterableIterator<boolean> {
            return new Vector(parseFloat(yield true), parseFloat(yield true));
        }
        function* absolute(): IterableIterator<boolean> {
            return yield* readVector();
        }
        function* relative(): IterableIterator<boolean> {
            return lastPoint.add(yield* readVector());
        }
        let commandChar: string = "L";
        while (true) {
            if ("mMlLhHvVzZcCsSqQtTaA".indexOf(yield false) !== -1) {
                commandChar = yield true;
            }
            let nextLastTangent: Vector|null = null;
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
                    lastPoint = lastPoint.add(new Vector(parseFloat(yield true), 0));
                    currentPoints.push(lastPoint);
                    break;
                case "H":
                    lastPoint = new Vector(parseFloat(yield true), lastPoint.y);
                    currentPoints.push(lastPoint);
                    break;

                case "v":
                    lastPoint = lastPoint.add(new Vector(0, parseFloat(yield true)));
                    currentPoints.push(lastPoint);
                    break;
                case "V":
                    lastPoint = new Vector(lastPoint.x, parseFloat(yield true));
                    currentPoints.push(lastPoint);
                    break;

                case "z":
                case "Z":
                    lastPoint = currentPoints[0];
                    endPolygon();
                    commandChar = "L";
                    break;

                case "c": nextVectorNoUpdate = relative;
                case "C": {
                    let firstPoint = lastPoint;
                    let controlPoint1 = yield* nextVectorNoUpdate();
                    let controlPoint2 = yield* nextVectorNoUpdate();
                    let endPoint = yield* nextVector();
                    nextLastTangent = endPoint.sub(controlPoint2);
                    let curvePoints = subdivideSampleCurve(cubicBezierCurve(firstPoint, controlPoint1, controlPoint2, endPoint), 0, 1, SVG_SLACK);
                    for (let i = 1; i < curvePoints.length; i++) currentPoints.push(curvePoints[i]);
                } break;

                case "s": nextVectorNoUpdate = relative;
                case "S": {
                    let firstPoint = lastPoint;
                    let controlPoint2 = yield* nextVectorNoUpdate();
                    let endPoint = yield* nextVector();
                    let controlPoint1: Vector;
                    if (lastTangent == null) {
                        controlPoint1 = controlPoint2;
                    } else {
                        controlPoint1 = firstPoint.add(lastTangent);
                    }
                    nextLastTangent = endPoint.sub(controlPoint2);
                    let curvePoints = subdivideSampleCurve(cubicBezierCurve(firstPoint, controlPoint1, controlPoint2, endPoint), 0, 1, SVG_SLACK);
                    for (let i = 1; i < curvePoints.length; i++) currentPoints.push(curvePoints[i]);
                } break;

                case "q": nextVectorNoUpdate = relative;
                case "Q": {
                    let firstPoint = lastPoint;
                    let controlPoint1 = yield* nextVectorNoUpdate();
                    let endPoint = yield* nextVector();
                    nextLastTangent = endPoint.sub(controlPoint1);
                    let curvePoints = subdivideSampleCurve(quadraticBezierCurve(firstPoint, controlPoint1, endPoint), 0, 1, SVG_SLACK);
                    for (let i = 1; i < curvePoints.length; i++) currentPoints.push(curvePoints[i]);
                } break;

                case "t": nextVectorNoUpdate = relative;
                case "T": {
                    let firstPoint = lastPoint;
                    let endPoint = yield* nextVector();
                    let controlPoint1: Vector;
                    if (lastTangent == null) {
                        controlPoint1 = firstPoint;
                    } else {
                        controlPoint1 = firstPoint.add(lastTangent);
                    }
                    nextLastTangent = endPoint.sub(controlPoint1);
                    let curvePoints = subdivideSampleCurve(quadraticBezierCurve(firstPoint, controlPoint1, endPoint), 0, 1, SVG_SLACK);
                    for (let i = 1; i < curvePoints.length; i++) currentPoints.push(curvePoints[i]);
                } break;

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

export function getSVGSize(svg: SVGSVGElement): Vector {
    return new Vector(parseFloat(<string>svg.getAttribute("width")), parseFloat(<string>svg.getAttribute("height")));
}

export function svgToPolygons(svg: SVGSVGElement): Polygon[] {
    let collisionLayer = svg.querySelector("#collision")!;
    let polygons: Polygon[] = [];
    function processElement(el: Element, parentMat: SVGMatrix) {
        let mat: SVGMatrix;
        let transform = (<any>el).transform;
        if (transform instanceof SVGAnimatedTransformList && transform.baseVal.numberOfItems > 0) {
            mat = parentMat.multiply(transform.baseVal.getItem(0).matrix);
        } else {
            mat = parentMat;
        }
        if (el instanceof SVGPathElement) {
            let path = <string>(el.getAttribute("d"));
            pathToPolygons(path, mat).forEach(polygon => polygons.push(polygon));
        }
        for (let i = 0; i < el.children.length; i++) {
            processElement(el.children[i], mat);
        }
    }
    processElement(collisionLayer, svg.createSVGMatrix());
    return polygons;
}

export function loadAsync<T>(url: string, responseType: "json"): Promise<T>;
export function loadAsync(url: string, responseType: "document"): Promise<Document>;
export function loadAsync(url: string, responseType: "" | "text"): Promise<string>;
export function loadAsync(url: string, responseType: XMLHttpRequestResponseType): Promise<any> {
    let req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.responseType = responseType;
    let promise = new Promise<any>((resolve, reject) => {
        req.onload = () => resolve(req.response);
        req.onerror = evt => reject(evt.message);
        req.send();
    });
    return promise;
}

export function splitSVG(svg: SVGSVGElement) {
    let lowSvg = <SVGSVGElement>svg.cloneNode(true);
    let highSvg = <SVGSVGElement>svg.cloneNode(true);
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

function getAncestors(el: SVGElement): SVGElement[] {
    let ancestors: SVGElement[] = [];
    function pushAncestor(el: SVGElement) {
        let parent = <SVGElement><any>el.parentElement;
        ancestors.push(parent);
        if (!(parent instanceof SVGSVGElement)) {
            pushAncestor(parent);
        }
    }
    pushAncestor(el);
    return ancestors;
}

function getElementCompoundTransform(el: SVGElement): SVGMatrix {
    let transformChain = getAncestors(el).reverse();
    transformChain.push(el);
    let root = <SVGSVGElement>transformChain[0];
    let mat = root.createSVGMatrix();
    for (let el of transformChain) {
        let transform = (<any>el).transform;
        if (transform instanceof SVGAnimatedTransformList && transform.baseVal.numberOfItems > 0) {
            mat = mat.multiply(transform.baseVal.getItem(0).matrix);
        }
    }
    return mat;
}

export function getSVGCirclePosition(svg: SVGSVGElement, selector: string): Vector {
    let el = <SVGPathElement>svg.querySelector(selector);
    let pos = new Vector(parseFloat(el.getAttribute("cx")||"0"), parseFloat(el.getAttribute("cy")||"0"));
    let mat = getElementCompoundTransform(el);
    return pos.mulByMatrix(mat, true);
}

export function getSVGPolygons(svg: SVGSVGElement, selector: string): Polygon[] {
    let elem = <SVGPathElement>svg.querySelector(selector);
    return pathToPolygons(elem.getAttribute("d")||"", getElementCompoundTransform(elem));
}
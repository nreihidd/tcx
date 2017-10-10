"use strict";

import {BoundingBox, Polygon} from "collision";
import * as collision from "collision";
import {drawParticles} from "particles";
import {loadAsync, getSVGSize, splitSVG, svgToPolygons} from "svg";
import {Vector, mod, mix, clamp, choose} from "math";
import * as Layout from "layout";
import {Action} from "techs";
import * as Techs from "techs";
import * as Items from "items";
import {incGlobalBuddyToggle, setTimelineDuration, setGamepadCursor, gamepadCursor, timelineDuration, setWantWait, previewPosition, combatIsInAction, cursorEntities, showBattleBounds, battleBounds, drawTargetArea} from "combat";

//===========================
// Globals

export let wantCacheSVG = false; // navigator.userAgent.indexOf("Chrome") !== -1;

export let UI_FONT = "Sans-serif";
export let TOOLTIP_COLOR = "black";

export let canvas = <HTMLCanvasElement>document.querySelector("#game");
function getContext2D(): CanvasRenderingContext2D {
    let ctx = canvas.getContext('2d');
    if (ctx == null) { console.error("Couldn't get 2d context"); throw "No context"; }
    else { return ctx; }
}
export let ctx = getContext2D();

window.onresize = evt => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};
window.onresize(<any>null);

export let gNow = 0;
export let deltaTime = 0.016;
export let entities: Entity[] = [];
export let inventory = new Map<Item, number>();

export let logicCoroutine: IterableIterator<any>;
export let wantFastDialog = false;

export let cameraFocus = new Vector(0, 0);
export let cameraShakeTtl = 0;
export let cameraShakeMag = 0;

export let lastPolledStates = new WeakMap<Gamepad, GamepadState>();
export let lastSampleTime: number;
export let heldKeys = new Set();
export let gamepadCursorVel = new Vector(0, 0);

export let menuInputs: string[] = [];

export let dbgShowGamepad = false;
export let effects: Effect[] = [];
export let dbgShowEntityCircles = false;

export let dbgShowPolygons = false;
export let dbgShowPolygonNormals = false;
export let levelPolygons: Polygon[] = [];

export let dbgSvgUrl = "background.svg";
export let dbgSvgImage = new Image();
export let dbgSvgImageHighLayer = new Image();
export let dbgSvgSize = new Vector(0, 0);

export let bgm = new Audio();

//===========================
// Basic SFX

export function playSound(soundURL: string) {
    let sound = new Audio(soundURL);
    sound.play();
}

// Basic SFX
//===========================

//===========================
// End Globals

export enum MagicElement {
    RED = 0,
    BLUE = 1,
    YELLOW = 2,
    GREEN = 3,
    WHITE = 4,
    BLACK = 5
}

export interface Entity {
    name: string;
    position: Vector;
    radius: number;

    hp: number;
    maxHp: number;
    /** This is the amount of health to subtract from `maxHp` when determining the actual maximum HP. For now, fatigue has no limit, so when fatigue reaches maxHp the entity is permadead? */
    fatigue: number;

    mp: number;
    maxMp: number;
    /** When a battle begins this entity will start with this much MP */
    startingMp: number;
    /** This is the MP earned for every 1 unit of time? */
    rateMp: number;

    baseStaminaCost: number;
    timeToTurn: number;

    accuracy: number;
    evasion: number;

    attack: number;
    defense: number;

    magicPower: number;
    resistance: number;
    affinities: [number, number, number]; // Red-Blue, Yellow-Green, White-Black

    actions: Techs.Action[];

    shape: string;
    color: string;

    isEnemy: boolean;
    isInCombat: boolean;
}

export interface Item {
    name: string;
    menu(entity: Entity): ImmediateMenu;
}

export function addItemToInventory(item: Item) {
    let count = inventory.get(item);
    if (count == null) {
        inventory.set(item, 1);
    } else {
        inventory.set(item, count + 1);
    }
}

export function removeItemFromInventory(item: Item) {
    let count = inventory.get(item);
    if (count != null) {
        let newCount = count - 1;
        if (newCount > 0) {
            inventory.set(item, newCount);
        } else {
            inventory.delete(item);
        }
    }
}

export function getEntityFatiguedMaxHealth(entity: Entity) {
    return entity.maxHp - Math.floor(entity.fatigue);
}

//===========
//=== Menu

export enum MenuUpdateResult {
    Finished,
    Canceled,
    StillActive,
}

export interface ImmediateMenu {
    update(inputs: string[]): MenuUpdateResult;
    layout(): Layout.Layout | null;
}

export interface ListMenuEntry {
    layout(): Layout.Layout;
    menu(): ImmediateMenu;
    hover(): void;
}

export class ListMenu {
    index: number;
    submenu: ImmediateMenu | null;
    constructor(public numRows = 3, public numColumns = 2) {
        this.index = 0;
        this.submenu = null;
    }
    calcRows(l: number): number {
        return Math.floor((l - 1) / this.numColumns) + 1;
    }
    calcCols(l: number, row: number): number {
        return Math.min(l, (row + 1) * this.numColumns) - row * this.numColumns;
    }
    update(inputs: string[], entries: ListMenuEntry[]): MenuUpdateResult {
        let needPumpSubmenu = false;

        do {
            if (this.submenu != null) {
                needPumpSubmenu = false;
                let r = this.submenu.update(inputs);
                if (r === MenuUpdateResult.Canceled) {
                    this.submenu = null;
                } else if (r === MenuUpdateResult.Finished) {
                    this.submenu = null;
                    return MenuUpdateResult.Finished;
                }
            } else if (inputs.length > 0) {
                let input = inputs.shift();
                if (entries.length === 0) {
                    if (input === "back") {
                        playSound("sound/curshoriz.wav");
                        return MenuUpdateResult.Canceled;
                    }
                    continue;
                }
                if (input === "select") {
                    playSound("sound/cursverti.wav");
                    let entry = entries[this.index];
                    this.submenu = entry.menu();
                    needPumpSubmenu = true;
                } else if (input === "back") {
                    playSound("sound/curshoriz.wav");
                    return MenuUpdateResult.Canceled;
                } else if (input === "up" || input === "down") {
                    let dir = input === "up" ? -1 : 1;
                    playSound("sound/curshoriz.wav");
                    let row = mod(Math.floor(this.index / this.numColumns) + dir, this.calcRows(entries.length));
                    let col = mod(this.index, this.numColumns);
                    this.index = clamp(row * this.numColumns + col, 0, entries.length - 1);
                } else if (input === "left" || input === "right") {
                    let dir = input === "left" ? -1 : 1;
                    playSound("sound/curshoriz.wav");
                    let row = Math.floor(this.index / this.numColumns);
                    let col = mod(this.index - row * this.numColumns + dir, this.calcCols(entries.length, row));
                    this.index = clamp(row * this.numColumns + col, 0, entries.length - 1);
                }
            }
        } while (inputs.length > 0 || needPumpSubmenu);

        return MenuUpdateResult.StillActive;
    }
    layout(entries: ListMenuEntry[]): Layout.Layout {
        let layout: Layout.Layout | null = null;
        if (this.submenu != null) {
            layout = this.submenu.layout();
        }
        if (entries.length === 0) {
            return new CursorLayout(new Layout.Text("-----", [48, UI_FONT], "#999"), true);
        }
        if (layout == null) {
            let startRow = Math.floor(this.index / this.numColumns) - Math.floor(this.numRows / 2); // Inclusive
            let endRow = startRow + this.numRows; // Exclusive

            let maxRow = this.calcRows(entries.length); // Exclusive

            // let startIndex = this.index - Math.floor(this.numVisible / 2);
            // let endIndex = startIndex + this.numVisible;
            if (startRow < 0) {
                startRow = 0;
                endRow = Math.min(startRow + this.numRows, maxRow);
            } else if (endRow > maxRow) {
                endRow = maxRow;
                startRow = Math.max(endRow - this.numRows, 0);
            }

            let rowLayouts: Layout.Layout[] = [];
            for (let row = startRow; row < endRow; row++) {
                let colLayouts: Layout.Layout[] = [];
                for (let col = 0; col < this.numColumns; col++) {
                    let i = row * this.numColumns + col;
                    let l: Layout.Layout;
                    if (i >= entries.length) {
                        l = new Layout.Empty(new Vector(0, 0));
                    } else {
                        l = entries[i].layout();
                        if (i === this.index) {
                            l = new CursorLayout(l, this.submenu == null);
                        }
                    }
                    colLayouts.push(l);
                }
                rowLayouts.push(Layout.columns(colLayouts));
            }
            layout = Layout.vertical(rowLayouts);
        }
        if (this.submenu == null) {
            entries[this.index].hover();
        }
        return layout;
    }
}

export class CursorLayout implements Layout.Layout {
    constructor(public inner: Layout.Layout, public focused: boolean) { }
    getSize() {
        return this.inner.getSize();
    }
    draw(pos: Vector, size: Vector) {
        this.inner.draw(pos, size);
        drawCursor(pos.x - 3, pos.y + this.inner.getSize().y / 2, this.focused);
    }
}

// End Menu
//==========

//==========
// Inputs

var VK: any = <any> "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").reduce((o, c) => {
    o[c] = c.charCodeAt(0); 
    return o;
}, <any>{});

window.onkeydown = evt => {
    if (String.fromCharCode(evt.which) in VK) {
        evt.preventDefault();
        evt.stopPropagation();
    }
    if (!heldKeys.has(evt.which)) {
        heldKeys.add(evt.which);
        var e: any = new Event('actualkeydown');
        e['which'] = evt.which;
        window.dispatchEvent(e);
    }
}
window.onkeyup = evt => {
    if (String.fromCharCode(evt.which) in VK) {
        evt.preventDefault();
        evt.stopPropagation();
    }
    if (heldKeys.delete(evt.which)) {
        var e: any = new Event('actualkeyup');
        e['which'] = evt.which;
        window.dispatchEvent(e);
    }
}

window.addEventListener("actualkeydown", (evt: any) => {
    if (evt.which === VK.W) {
        menuInputs.push("up");
    } else if (evt.which === VK.S) {
        menuInputs.push("down");
    } else if (evt.which === VK.A) {
        menuInputs.push("left");
    } else if (evt.which === VK.D) {
        menuInputs.push("right");
    } else if (evt.which === VK.E) {
        menuInputs.push("select");
    } else if (evt.which === VK.Q || evt.which === 27 /* Esc */) {
        menuInputs.push("back");
    } else if (evt.which === VK.T) {
        setWantWait(true);
    }
});
window.addEventListener("actualkeyup", (evt: any) => {
    if (evt.which === VK.T) {
        setWantWait(false);
    }
});

window.addEventListener("wheel", evt => {
    setTimelineDuration(clamp(timelineDuration + evt.deltaY / 3, 1, 20));
});

window.addEventListener("mousemove", evt => {
    setGamepadCursor(new Vector(evt.clientX, evt.clientY));
});
window.addEventListener("mousedown", evt => {
    if (evt.which === 1) {
        menuInputs.push("select");
    } else if (evt.which === 3) {
        menuInputs.push("back");
    }
});
window.oncontextmenu = evt => {
    evt.preventDefault();
    return false;
};

interface GamepadState {
    LeftStick: Vector;
    RightStick: Vector;
    A: boolean;
    B: boolean;
    X: boolean;
    Y: boolean;
    LB: boolean;
    RB: boolean;
    LT: number;
    RT: number;
    Select: boolean;
    Start: boolean;
    LS: boolean;
    RS: boolean;
    DpadUp: boolean;
    DpadDown: boolean;
    DpadLeft: boolean;
    DpadRight: boolean;
}

function getGamepadState(gamepad: Gamepad): GamepadState {
    let buttons = gamepad.buttons.map(val => val.pressed);
    let axes = gamepad.axes.map(val => val);

    function sampleJoystick(axisX: number, axisY: number) {
        let vector = new Vector(axisX, axisY);
        let mag = vector.mag();
        const DEADZONE = 0.2;
        if (mag > DEADZONE) {
            if (mag > 1) {
                return vector.norm();
            } else {
                return vector.norm().muls((mag - DEADZONE) / (1 - DEADZONE));
            }
        } else {
            return new Vector(0, 0);
        }
    }

    if (buttons.length === 11 && axes.length === 8) {
        // Ubuntu Firefox?
        return {
            LeftStick: sampleJoystick(axes[0], axes[1]),
            RightStick: sampleJoystick(axes[3], axes[4]),
            A: buttons[0],
            B: buttons[1],
            X: buttons[2],
            Y: buttons[3],
            LB: buttons[4],
            RB: buttons[5],
            LT: axes[2],
            RT: axes[5],
            Select: buttons[6],
            Start: buttons[7],
            LS: buttons[9],
            RS: buttons[10],
            DpadUp: axes[7] === -1,
            DpadDown: axes[7] === 1,
            DpadLeft: axes[6] === -1,
            DpadRight: axes[6] === 1,
        };
    } else {
        // Try to match standard gamepad as far as it allows: https://w3c.github.io/gamepad/#remapping
        return {
            LeftStick: sampleJoystick(axes[0] || 0, axes[1] || 0),
            RightStick: sampleJoystick(axes[2] || 0, axes[3] || 0),
            A: buttons[0] || false,
            B: buttons[1] || false,
            X: buttons[2] || false,
            Y: buttons[3] || false,
            LB: buttons[4] || false,
            RB: buttons[5] || false,
            LT: (buttons[6] || false) ? 1 : -1,
            RT: (buttons[7] || false) ? 1 : -1,
            Select: buttons[8] || false,
            Start: buttons[9] || false,
            LS: buttons[10] || false,
            RS: buttons[11] || false,
            DpadUp: buttons[12] || false,
            DpadDown: buttons[13] || false,
            DpadLeft: buttons[14] || false,
            DpadRight: buttons[15] || false,
        };
    }
}

function pollKeyboard() {
    let dv = new Vector((heldKeys.has(VK.A) ? -1 : 0) + (heldKeys.has(VK.D) ? 1 : 0), (heldKeys.has(VK.W) ? -1 : 0) + (heldKeys.has(VK.S) ? 1 : 0));
    if (dv.mag2() > 1) {
        dv = dv.norm();
    }
    gamepadCursorVel = gamepadCursorVel.add(dv);
    wantFastDialog = wantFastDialog || heldKeys.has(VK.T);
}

function pollGamepads() {
    let gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        let gamepad = gamepads[i];
        if (gamepad != null) pollGamepadInputs(gamepad);
    }
}

function pollGamepadInputs(gamepad: Gamepad) {
    let polledState = getGamepadState(gamepad);

    let dv = polledState.LeftStick
        .add(polledState.RightStick)
        .add(new Vector((polledState.DpadLeft ? -1 : 0) + (polledState.DpadRight ? 1 : 0), (polledState.DpadUp ? -1 : 0) + (polledState.DpadDown ? 1 : 0)));
    if (dv.mag2() > 1) {
        dv = dv.norm();
    }
    dv = dv.muls(polledState.RB ? 0.1 : 1);
    gamepadCursorVel = gamepadCursorVel.add(dv);

    let lastPolledState = lastPolledStates.get(gamepad);
    if (lastPolledState != null) {
        if (polledState.A && !lastPolledState.A) {
            menuInputs.push("select");
        }
        if (polledState.B && !lastPolledState.B) {
            menuInputs.push("back");
        }
        if (polledState.Y && !lastPolledState.Y) {
            setWantWait(true);
        }
        if(!polledState.Y && lastPolledState.Y) {
            setWantWait(false);
        }
        if (polledState.X && !lastPolledState.X) {
            incGlobalBuddyToggle();
        }
        if (polledState.Y) {
            wantFastDialog = true;
        }

        function pollAxisAsButton(axis: "LeftStick" | "RightStick", component: "x" | "y", positive: boolean) {
            if (positive) {
                return (<any>polledState)[axis][component] > 0.8 && (<any>lastPolledState)[axis][component] < 0.8;
            } else {
                return (<any>polledState)[axis][component] < -0.8 && (<any>lastPolledState)[axis][component] > -0.8;
            }
        }

        if (pollAxisAsButton("LeftStick", "x", true))   { menuInputs.push("right"); }
        if (pollAxisAsButton("LeftStick", "x", false))  { menuInputs.push("left"); }
        if (pollAxisAsButton("LeftStick", "y", true))   { menuInputs.push("down"); }
        if (pollAxisAsButton("LeftStick", "y", false))  { menuInputs.push("up"); }
        if (pollAxisAsButton("RightStick", "x", true))  { menuInputs.push("right"); }
        if (pollAxisAsButton("RightStick", "x", false)) { menuInputs.push("left"); }
        if (pollAxisAsButton("RightStick", "y", true))  { menuInputs.push("down"); }
        if (pollAxisAsButton("RightStick", "y", false)) { menuInputs.push("up"); }

        if (polledState.DpadUp && !lastPolledState.DpadUp) {
            menuInputs.push("up");
        } else if (polledState.DpadDown && !lastPolledState.DpadDown) {
            menuInputs.push("down");
        } else if (polledState.DpadLeft && !lastPolledState.DpadLeft) {
            menuInputs.push("left");
        } else if (polledState.DpadRight && !lastPolledState.DpadRight) {
            menuInputs.push("right");
        }

        if (polledState.RT > 0) {
            setTimelineDuration(clamp(timelineDuration + polledState.RT * 5 * deltaTime, 1, 20));
        }
        if (polledState.LT > 0) {
            setTimelineDuration(clamp(timelineDuration - polledState.LT * 5 * deltaTime, 1, 20));
        }
    }
    lastPolledStates.set(gamepad, polledState);
}

//==========
// End of Inputs


//==========
// Drawing

export function drawShape(x: number, y: number, shape: string, color: string, size: number) {
    let halfSize = size / 2;
    ctx.strokeStyle = color;
    if (shape === "square") {
        ctx.strokeRect(x - halfSize, y - halfSize, size, size);
    } else if (shape === "triangle") {
        ctx.beginPath();
        ctx.moveTo(x - halfSize, y + halfSize);
        ctx.lineTo(x + halfSize, y + halfSize);
        ctx.lineTo(x, y - halfSize);
        ctx.closePath();
        ctx.stroke();
    }
}

export function drawLine(x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}
export function drawLinev(a: Vector, b: Vector) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
}


export function getWindowScale() {
    let shorterSide = Math.min(canvas.width, canvas.height);
    let scale = 1 / shorterSide * 1000;
    return scale;
}
export function windowToWorld(windowPos: Vector) {
    let scale = getWindowScale();
    let viewSize = new Vector(canvas.width, canvas.height).muls(scale);
    let center = viewSize.divs(2);
    let offset = cameraFocus.sub(center);
    return windowPos.muls(scale).add(offset);
}
export function worldToWindow(worldPos: Vector) {
    let scale = getWindowScale();
    let viewSize = new Vector(canvas.width, canvas.height).muls(scale);
    let center = viewSize.divs(2);
    let offset = cameraFocus.sub(center);
    return worldPos.sub(offset).divs(scale);
}

function drawEntities(es: Entity[]) {
    ctx.lineWidth = 6;
    for (let {shape, color, position: {x, y}, radius} of es) {
        drawShape(x, y, shape, color, radius);
    }
}
function drawPreviews(es: Map<Entity, Vector>) {
    ctx.lineWidth = 6;
    for (let [{shape, color, radius}, {x, y}] of es) {
        drawShape(x, y, shape, color, radius);
    }
}

type Effect = IterableIterator<any>;

export function* floatingTextEffect(text: string, pos: Vector, vel: Vector, color: [number, number, number], duration: number): Effect {
    yield* overTime(duration, (dt, t) => {
        pos = pos.add(vel.muls(dt));
        // globalAlpha doesn't work in Firefox 49 Ubuntu for text, so do a workaround with fillStyle
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${mix(1, 0, t)})`;
        ctx.font = "48px " + UI_FONT;
        ctx.fillText(text, pos.x - ctx.measureText(text).width / 2, pos.y);
    });
}

export function cameraShake(duration: number, mag: number) {
    cameraShakeTtl = duration;
    cameraShakeMag = mag / duration;
}

export function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    let scale = getWindowScale();
    let width = canvas.width * scale;
    let height = canvas.height * scale;
    ctx.scale(1 / scale, 1 / scale);

    ctx.save();
    let center = new Vector(width / 2, height / 2);
    
    let offset = cameraFocus.sub(center);
    if (cameraShakeTtl > 0) {
        offset = offset.add(Vector.random().muls(cameraShakeTtl * cameraShakeMag));
        cameraShakeTtl -= deltaTime;
    }
    ctx.translate(-offset.x, -offset.y);
    // ctx.fillStyle = "red";
    // ctx.fillRect(-10, -10, 20, 20);

    ctx.drawImage(dbgSvgImage, 0, 0);
    
    for (let polygon of levelPolygons) {
        if (dbgShowPolygons) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = collision.dbgPointInPolygon.has(polygon) ? "yellow" : collision.dbgPolygonRejectedByBBox.has(polygon) ? "red" : "grey";
            ctx.beginPath();
            for (let point of polygon.points) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        if (dbgShowPolygonNormals) {
            for (let line of polygon.lines) {
                let center = line.a.mix(line.b, 0.5);
                let cplusNormal = center.add(line.b.sub(line.a).norm().crossz().muls(10));
                ctx.strokeStyle = "blue";
                ctx.lineWidth = 2;
                drawLine(center.x, center.y, cplusNormal.x, cplusNormal.y);
            }
        }
    }

    if (showBattleBounds) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = combatIsInAction ? "red" : "black";
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([5, 5]);
        drawLinev(battleBounds.min, new Vector(battleBounds.min.x, battleBounds.max.y));
        drawLinev(battleBounds.min, new Vector(battleBounds.max.x, battleBounds.min.y));
        drawLinev(battleBounds.max, new Vector(battleBounds.min.x, battleBounds.max.y));
        drawLinev(battleBounds.max, new Vector(battleBounds.max.x, battleBounds.min.y));
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    // DEBUG
    if (dbgShowEntityCircles) {
        for (let entity of entities) {
            ctx.fillStyle = "black";
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        for (let [entity, position] of previewPosition) {
            ctx.fillStyle = "black";
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.arc(position.x, position.y, entity.radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
    // /DEBUG

    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    for (let entity of entities) {
        ctx.strokeStyle = "black";
        ctx.beginPath();
        ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.3 * 0.25;
    for (let [entity, position] of previewPosition) {
        ctx.strokeStyle = "black";
        ctx.beginPath();
        ctx.arc(position.x, position.y, entity.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    let dummy = drawTargetArea; // Typescript bug
    if (dummy != null) dummy();

    drawEntities(entities);
    ctx.globalAlpha = 0.3;
    drawPreviews(previewPosition);
    ctx.globalAlpha = 1;
    ctx.save();
    drawParticles();
    effects = effects.filter(effect => effect.next().done !== true);
    ctx.restore();
    cursorEntities.forEach(e => drawCursor(e.position.x - e.radius, e.position.y, true));

    ctx.drawImage(dbgSvgImageHighLayer, 0, 0);

    // DEBUG
    if (collision.dbgShowCandidateStatus) {
        for (let [point, status] of collision.dbgCandidateStatus) {
            ctx.fillStyle = status === "considered" ? "cyan" : (status === "rejected" ? "red" : "green");
            ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
        }
    }

    if (collision.dbgShowLineSandwich) {
        for (let {a, b, snug, intersect, ap, bp} of collision.dbgLineSandwich) {
            ctx.strokeStyle = "blue";
            ctx.lineWidth = 2;
            drawLine(a.a.x, a.a.y, a.b.x, a.b.y);
            drawLine(b.a.x, b.a.y, b.b.x, b.b.y);
            ctx.strokeStyle = "orange";
            drawLine(intersect.x, intersect.y, snug.x, snug.y);
            ctx.fillStyle = "cyan";
            ctx.fillRect(intersect.x - 2, intersect.y - 2, 4, 4);
            ctx.fillStyle = "magenta";
            ctx.fillRect(snug.x - 2, snug.y - 2, 4, 4); 
            ctx.fillStyle = "grey";
            ctx.fillRect(ap.x - 2, ap.y - 2, 4, 4); 
            ctx.fillStyle = "grey";
            ctx.fillRect(bp.x - 2, bp.y - 2, 4, 4); 
        }
    }
    // /DEBUG

    ctx.restore();

    if (dbgShowGamepad) {
        let gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] != null) {
                drawGamepad(gamepads[i], 10, height - 200 - i * 50);
            }
        }
    }

    ctx.restore();
}

function drawCursor(x: number, y: number, active: boolean) {
    let size = active? (Math.cos((gNow) * Math.PI * 2 / 1) + 1) / 2 * 0.5 + 0.5 : 1;
    ctx.fillStyle = active ? "white" : "grey";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - size * 5, y);
    ctx.lineTo(x - size * 25, y + size * 20);
    ctx.lineTo(x - size * 25, y - size * 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawGamepad(gamepad: Gamepad, bx: number, by: number) {
    let buttonIndex = 0;
    function drawButton(x: number, y: number, pressed: boolean) {
        ctx.fillStyle = pressed ? "red" : buttonIndex % 8 < 4 ? "green" : "blue";
        ctx.fillRect(x, y, 10, 10);
        buttonIndex += 1;
    }
    function drawAxis(x: number, y: number, value: number) {
        ctx.fillStyle = "black";
        ctx.fillRect(x + 4, y, 2, 20);
        ctx.fillStyle = "red";
        ctx.fillRect(x, y + 5 + value * 10, 10, 10);
    }
    gamepad.buttons.forEach((button, i) => drawButton(bx + i * 20, by - 20, button.pressed));
    gamepad.axes.forEach((axisValue, i) => drawAxis(bx + i * 20, by, axisValue));
}

//==========
// End of Drawing

export function zip<A, B>(a: Iterable<A>, b: Iterable<B>): Iterable<[A, B]>;
export function zip<A, B, C>(a: Iterable<A>, b: Iterable<B>, c: Iterable<C>): Iterable<[A, B, C]>;
export function* zip<T>(...its: Iterable<T>[]): Iterable<T[]> {
    let iters = its.map(it => it[Symbol.iterator]());
    while (true) {
        let rs = iters.map(iter => iter.next());
        if (rs.some(r => r.done)) return;
        yield rs.map(r => r.value);
    }
}

/** Calls callback a variable number of times per frame so that after `durationInSeconds` it will have been called `n` times. */
export function* nOverTime(durationInSeconds: number, n: number, callback: (i: number, t: number) => void): IterableIterator<undefined> {
    let calls = 0;
    yield* overTime(durationInSeconds, (_, t) => {
        let neededCalls = Math.floor(t * n);
        while (neededCalls > calls) {
            callback(calls, calls / n);
            calls += 1;
        }
    });
}

/** Calls callback once per frame until `durationInSeconds` has elapsed. On the last callback `total` will be 1. */
export function* overTime(durationInSeconds: number, callback: (delta: number, total: number) => void): IterableIterator<undefined> {
    let start = gNow;
    let end = start + durationInSeconds;
    let prev = start;
    while (true) {
        yield;
        let now = Math.min(end, gNow);
        let deltaD = (now - prev) / durationInSeconds;
        let t = clamp((now - start) / durationInSeconds, 0, 1);
        prev = now;
        // The sum of all deltaD's passed to callback should be ~1
        // The last t passed to callback should be 1
        if (now === end) {
            callback(deltaD, 1);
            return;
        } else {
            callback(deltaD, t);
        }
    }
}

export function pointsWithinDistance(pa: Vector, pb: Vector, r: number) {
    return pa.sub(pb).mag2() < r * r;
}

export function placeEntitiesAtSpot(es: Entity[], point: Vector) {
    let placedEntities: Entity[] = [];
    for (let entity of es) {
        entity.position = collision.findClosestOpenSpot(point, entity.radius, placedEntities.map(e => ({ center: e.position, radius: e.radius })), levelPolygons, { min: new Vector(0, 0), max: dbgSvgSize });
        placedEntities.push(entity);
    }
}

export function* gameExplore(): IterableIterator<any> {
    while (menuInputs.length > 0) menuInputs.pop();
    let vel = gamepadCursorVel.muls(300 * deltaTime);
    let partyMembers = entities.filter(e => !e.isEnemy);
    let toPoint = partyMembers[0].position.add(vel);
    for (let index = 0; index < partyMembers.length; index++) {
        let entity = partyMembers[index];
        if (index > 0) {
            let dir = toPoint.sub(entity.position);
            let distance = dir.mag();
            dir = dir.norm();
            let followerVelMag = clamp((distance - 100) * 3, 0, 600);
            if (followerVelMag === 0) {
                toPoint = entity.position;
                continue;
            } else if (distance > followerVelMag * deltaTime) {
                toPoint = entity.position.towards(toPoint, followerVelMag * deltaTime);
            } else {
                // no change to toPoint
            }
        }
        let newPos = collision.findClosestOpenSpot(
            toPoint,
            entity.radius,
            entities.filter(e => e.isEnemy).map(({position, radius}) => ({center: position, radius})),
            levelPolygons,
            { min: new Vector(0, 0), max: dbgSvgSize }
        );
        entity.position = newPos;
        toPoint = newPos;
    }
    let nextFocus = partyMembers[0].position;
    if (cameraFocus.sub(nextFocus).mag() > 600 * deltaTime) {
        cameraFocus = cameraFocus.towards(nextFocus, 600 * deltaTime);
    } else {
        cameraFocus = nextFocus;
    }
    draw();
    yield;
}

export function* movePartyToPoint(point: Vector, bounds: BoundingBox): IterableIterator<any> {
    let toPosition = entities.filter(e => !e.isEnemy).slice(0);
    let pendingMovement: [Entity, Vector, Vector][] = [];
    while (toPosition.length > 0) {
        let nextEnt = toPosition[0];
        let spot = collision.findClosestOpenSpot(
            point,
            nextEnt.radius,
            entities
                .filter(e => e.isEnemy).map(e => ({ center: e.position, radius: e.radius }))
                .concat(pendingMovement.map(([e, _, b]) => ({ center: b, radius: e.radius }))),
            levelPolygons,
            bounds
        );
        pendingMovement.push([nextEnt, nextEnt.position, spot]);
        toPosition.shift();
    }
    let movementCo = overTime(0.25, (_, t) => {
        for (let [ent, a, b] of pendingMovement) {
            ent.position = a.mix(b, t);
        }
    });
    for (let _ of movementCo) {
        draw();
        yield;
    }
}

function requirePromise(name: string): Promise<any> {
    return new Promise((resolve, reject) => {
        require([name], (c: any) => { resolve(c); }, (err: any) => { reject(err); });
    });
}

type WaitForPromiseResult<T> = { type: "success", value: T } | { type: "error", error: any };
function* waitForPromise<T>(promise: Promise<T>): IterableIterator<any> {
    let result: WaitForPromiseResult<T>|null = null;
    promise.then(value => { result = { type: "success", value }; }).catch(error => { result = { type: "error", error }; }); 
    while (result == null) {
        yield;
    }
    return result;
}

declare var require: any;
interface LevelScript {
    levelLogic(svg: SVGSVGElement): IterableIterator<any>;
}
type LoadLevelReturnType = WaitForPromiseResult<[LevelScript, SVGSVGElement]>;
function* loadLevel(name: string): IterableIterator<any> {
    return yield* waitForPromise(Promise.all([
        requirePromise("js/levels/" +name + ".js"),
        loadAsync("levels/" +name + ".svg", "document").then(d => <SVGSVGElement>d.children[0])
    ]));
}

export function setCameraFocus(focus: Vector) {
    cameraFocus = focus;
}
export function setEntities(es: Entity[]) {
    entities = es;
}

export function* fadeIn() {
    yield* overTime(0.15, (_, t) => {
        draw();
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    });
}

export function* fadeOut() {
    yield* overTime(0.15, (_, t) => {
        draw();
        ctx.globalAlpha = t;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    });
}

function toStaticImage(img: HTMLImageElement): HTMLImageElement {
    let canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    let ctx = <CanvasRenderingContext2D>canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let result = new Image();
	result.src = canvas.toDataURL("image/png");
	return result;
}

export let previousLevel = "";
function* gameGen() {
    let levelName = "testRoom";
    while (true) {
        let blackScreenMinEnd = gNow + 0.05;
        let debugMessageY = 0;
        function writeDebugMessage(msg: string) {
            ctx.font = "48px " + UI_FONT;
            debugMessageY += 48;
            ctx.fillStyle = "white";
            ctx.fillText(msg, 30, debugMessageY);
        }

        writeDebugMessage("Loading level...");
        let levelResult: LoadLevelReturnType = yield* loadLevel(levelName);
        if (levelResult.type === "error") {
            console.error("Couldn't load level", levelResult.error);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "48px " + UI_FONT;
            ctx.fillText(levelResult.error.toString(), 10, 50);
            return;
        }
        writeDebugMessage("Processing SVGs...");
        let level = levelResult.value;
        console.log(level);
        let [script, dbgSvgElem] = level;
        dbgSvgSize = getSVGSize(dbgSvgElem);
        levelPolygons = svgToPolygons(dbgSvgElem);
        let [dbgSvgLowElem, dbgSvgHighElem] = splitSVG(dbgSvgElem);

        writeDebugMessage("Creating SVG images...");
        let imagesLoaded = 0;
        let imageError = false;
        dbgSvgImage.onload = () => imagesLoaded += 1; 
        dbgSvgImageHighLayer.onload = () => imagesLoaded += 1; 
        dbgSvgImage.onerror = evt => { imageError = true; console.log(evt); }; 
        dbgSvgImageHighLayer.onerror = evt => { imageError = true; console.log(evt); }; 
        dbgSvgImage.src = "data:image/svg+xml;base64,"+btoa((<any>dbgSvgLowElem).outerHTML);
        dbgSvgImageHighLayer.src = "data:image/svg+xml;base64,"+btoa((<any>dbgSvgHighElem).outerHTML);
        writeDebugMessage("Waiting for SVG images...");
        while (imagesLoaded < 2) {
            if (imageError) {
                console.error("I give up");
                return;
            }
            yield;
        }
        if (wantCacheSVG) {
            writeDebugMessage("Creating static images...");
            dbgSvgImage = toStaticImage(dbgSvgImage);
            dbgSvgImageHighLayer = toStaticImage(dbgSvgImageHighLayer);
        }

        while (gNow < blackScreenMinEnd) { yield; }

        let nextLevelName = yield* script.levelLogic(dbgSvgElem);
        previousLevel = levelName;
        levelName = nextLevelName;

        yield* fadeOut();
        entities = entities.filter(e => !e.isEnemy);
    }
}

function logic() {
    gamepadCursorVel = new Vector(0, 0);
    wantFastDialog = false;

    pollKeyboard();
    pollGamepads();

    if (gamepadCursorVel.mag2() > 1) {
        gamepadCursorVel = gamepadCursorVel.norm();
    }
    setGamepadCursor(gamepadCursor.add(gamepadCursorVel.muls(800 / getWindowScale() * deltaTime)).clamp(new Vector(0, 0), new Vector(canvas.width, canvas.height)));

    logicCoroutine.next();
}

class FPSCounter {
    static NUM_SAMPLES = 60;
    fps: number = 0;
    frameDuration: number = 0;
    startToStartSamples: number[] = [];
    startToEndSamples: number[] = [];
    insertIndex = 0;
    lastFrameStart = window.performance.now();
    startFrame() {
        this.insertIndex = mod(this.insertIndex + 1, FPSCounter.NUM_SAMPLES);
        let now = window.performance.now();
        this.startToStartSamples[this.insertIndex] = now - this.lastFrameStart;
        this.lastFrameStart = now;
        if (mod(this.insertIndex, 12) === 0) {
            this.fps = 1000 / (this.startToStartSamples.reduce((a, b) => a + b) / this.startToStartSamples.length);
            this.frameDuration = this.startToEndSamples.reduce((a, b) => a + b) / this.startToEndSamples.length;
        }
    }
    endFrame() {
        this.startToEndSamples[this.insertIndex] = window.performance.now() - this.lastFrameStart;
    }
}

let update = (() => {
    let lastUpdateTime: number;
    let fpsCounter = new FPSCounter();
    return function update() {
        fpsCounter.startFrame();
        let now = window.performance.now();
        if (lastUpdateTime != null) {
            deltaTime = Math.min(now - lastUpdateTime, 100) / 1000;
            gNow += deltaTime;
        }
        lastUpdateTime = now;
        logic();
        ctx.fillStyle = "magenta";
        ctx.font = "12px monospace";
        ctx.fillText(fpsCounter.fps.toFixed(0), 5, 17);
        ctx.fillText(fpsCounter.frameDuration.toFixed(1), 5, 29);
        window.requestAnimationFrame(update);
        fpsCounter.endFrame();
    }
})();

function start() {
    logicCoroutine = gameGen();

    entities.push({
        name: "Squareman",
        position: new Vector(100, 100),
        radius: 30,
        hp: 3,
        maxHp: 20,
        fatigue: 5,
        mp: 0,
        startingMp: 0,
        maxMp: 10,
        rateMp: 1,
        baseStaminaCost: 2.13,
        timeToTurn: 3.0,
        accuracy: 90,
        evasion: 100,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [0, 0, 0],

        shape: "square",
        color: "green",
        isEnemy: false,
        isInCombat: false,
        actions: [Techs.ActionMove, Techs.ActionAttack, Techs.ActionSpy, Techs.ActionCyclone, Techs.ActionDelayingAttack],
    });
    entities.push({
        name: "McSquare",
        position: new Vector(100, 200),
        radius: 30,
        hp: 20,
        maxHp: 20,
        fatigue: 10,
        mp: 0,
        startingMp: 0,
        maxMp: 10,
        rateMp: 1,
        baseStaminaCost: 3.00,
        timeToTurn: 3.0,
        accuracy: 90,
        evasion: 100,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [0, 0, 0],

        shape: "square",
        color: "red",
        isEnemy: false,
        isInCombat: false,
        actions: [Techs.ActionMove, Techs.ActionAttack, Techs.ActionMeditate, Techs.ActionWhirlwind, Techs.ActionPinchHitter, Techs.ActionHeal],
    });
    entities.push({
        name: "Squire",
        position: new Vector(100, 300),
        radius: 30,
        hp: 20,
        maxHp: 20,
        fatigue: 0,
        mp: 0,
        startingMp: 0,
        maxMp: 20,
        rateMp: 2,
        baseStaminaCost: 2.00,
        timeToTurn: 3.0,
        accuracy: 90,
        evasion: 100,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [0, 0, 0],

        shape: "square",
        color: "#00FFBB",
        isEnemy: false,
        isInCombat: false,
        actions: [Techs.ActionMove, Techs.ActionAttack, Techs.ActionMeditate, Techs.ActionCyclone, Techs.ActionPSIFire, Techs.ChainLightning],
    });

    inventory.set(Items.ItemPotion, 2);
    inventory.set(Items.ItemJerky, 1);

    window.requestAnimationFrame(update);
}

start();
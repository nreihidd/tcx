define(["require", "exports", "collision", "particles", "svg", "math", "layout", "techs", "items", "combat"], function (require, exports, collision, particles_1, svg_1, math_1, Layout, Techs, Items, combat_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    //===========================
    // Globals
    exports.wantCacheSVG = false; // navigator.userAgent.indexOf("Chrome") !== -1;
    exports.UI_FONT = "Sans-serif";
    exports.TOOLTIP_COLOR = "black";
    exports.canvas = document.querySelector("#game");
    function getContext2D() {
        let ctx = exports.canvas.getContext('2d');
        if (ctx == null) {
            console.error("Couldn't get 2d context");
            throw "No context";
        }
        else {
            return ctx;
        }
    }
    exports.ctx = getContext2D();
    window.onresize = evt => {
        exports.canvas.width = window.innerWidth;
        exports.canvas.height = window.innerHeight;
    };
    window.onresize(null);
    exports.gNow = 0;
    exports.deltaTime = 0.016;
    exports.entities = [];
    exports.inventory = new Map();
    exports.wantFastDialog = false;
    exports.cameraFocus = new math_1.Vector(0, 0);
    exports.cameraShakeTtl = 0;
    exports.cameraShakeMag = 0;
    exports.lastPolledStates = new WeakMap();
    exports.heldKeys = new Set();
    exports.gamepadCursorVel = new math_1.Vector(0, 0);
    exports.menuInputs = [];
    exports.dbgShowGamepad = false;
    exports.effects = [];
    exports.dbgShowEntityCircles = false;
    exports.dbgShowPolygons = false;
    exports.dbgShowPolygonNormals = false;
    exports.levelPolygons = [];
    exports.dbgSvgUrl = "background.svg";
    exports.dbgSvgImage = new Image();
    exports.dbgSvgImageHighLayer = new Image();
    exports.dbgSvgSize = new math_1.Vector(0, 0);
    exports.bgm = new Audio();
    //===========================
    // Basic SFX
    function playSound(soundURL) {
        let sound = new Audio(soundURL);
        sound.play();
    }
    exports.playSound = playSound;
    // Basic SFX
    //===========================
    //===========================
    // End Globals
    var MagicElement;
    (function (MagicElement) {
        MagicElement[MagicElement["RED"] = 0] = "RED";
        MagicElement[MagicElement["BLUE"] = 1] = "BLUE";
        MagicElement[MagicElement["YELLOW"] = 2] = "YELLOW";
        MagicElement[MagicElement["GREEN"] = 3] = "GREEN";
        MagicElement[MagicElement["WHITE"] = 4] = "WHITE";
        MagicElement[MagicElement["BLACK"] = 5] = "BLACK";
    })(MagicElement = exports.MagicElement || (exports.MagicElement = {}));
    function addItemToInventory(item) {
        let count = exports.inventory.get(item);
        if (count == null) {
            exports.inventory.set(item, 1);
        }
        else {
            exports.inventory.set(item, count + 1);
        }
    }
    exports.addItemToInventory = addItemToInventory;
    function removeItemFromInventory(item) {
        let count = exports.inventory.get(item);
        if (count != null) {
            let newCount = count - 1;
            if (newCount > 0) {
                exports.inventory.set(item, newCount);
            }
            else {
                exports.inventory.delete(item);
            }
        }
    }
    exports.removeItemFromInventory = removeItemFromInventory;
    function getEntityFatiguedMaxHealth(entity) {
        return entity.maxHp - Math.floor(entity.fatigue);
    }
    exports.getEntityFatiguedMaxHealth = getEntityFatiguedMaxHealth;
    //===========
    //=== Menu
    var MenuUpdateResult;
    (function (MenuUpdateResult) {
        MenuUpdateResult[MenuUpdateResult["Finished"] = 0] = "Finished";
        MenuUpdateResult[MenuUpdateResult["Canceled"] = 1] = "Canceled";
        MenuUpdateResult[MenuUpdateResult["StillActive"] = 2] = "StillActive";
    })(MenuUpdateResult = exports.MenuUpdateResult || (exports.MenuUpdateResult = {}));
    class ListMenu {
        constructor(numRows = 3, numColumns = 2) {
            this.numRows = numRows;
            this.numColumns = numColumns;
            this.index = 0;
            this.submenu = null;
        }
        calcRows(l) {
            return Math.floor((l - 1) / this.numColumns) + 1;
        }
        calcCols(l, row) {
            return Math.min(l, (row + 1) * this.numColumns) - row * this.numColumns;
        }
        update(inputs, entries) {
            let needPumpSubmenu = false;
            do {
                if (this.submenu != null) {
                    needPumpSubmenu = false;
                    let r = this.submenu.update(inputs);
                    if (r === MenuUpdateResult.Canceled) {
                        this.submenu = null;
                    }
                    else if (r === MenuUpdateResult.Finished) {
                        this.submenu = null;
                        return MenuUpdateResult.Finished;
                    }
                }
                else if (inputs.length > 0) {
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
                    }
                    else if (input === "back") {
                        playSound("sound/curshoriz.wav");
                        return MenuUpdateResult.Canceled;
                    }
                    else if (input === "up" || input === "down") {
                        let dir = input === "up" ? -1 : 1;
                        playSound("sound/curshoriz.wav");
                        let row = math_1.mod(Math.floor(this.index / this.numColumns) + dir, this.calcRows(entries.length));
                        let col = math_1.mod(this.index, this.numColumns);
                        this.index = math_1.clamp(row * this.numColumns + col, 0, entries.length - 1);
                    }
                    else if (input === "left" || input === "right") {
                        let dir = input === "left" ? -1 : 1;
                        playSound("sound/curshoriz.wav");
                        let row = Math.floor(this.index / this.numColumns);
                        let col = math_1.mod(this.index - row * this.numColumns + dir, this.calcCols(entries.length, row));
                        this.index = math_1.clamp(row * this.numColumns + col, 0, entries.length - 1);
                    }
                }
            } while (inputs.length > 0 || needPumpSubmenu);
            return MenuUpdateResult.StillActive;
        }
        layout(entries) {
            let layout = null;
            if (this.submenu != null) {
                layout = this.submenu.layout();
            }
            if (entries.length === 0) {
                return new CursorLayout(new Layout.Text("-----", [48, exports.UI_FONT], "#999"), true);
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
                }
                else if (endRow > maxRow) {
                    endRow = maxRow;
                    startRow = Math.max(endRow - this.numRows, 0);
                }
                let rowLayouts = [];
                for (let row = startRow; row < endRow; row++) {
                    let colLayouts = [];
                    for (let col = 0; col < this.numColumns; col++) {
                        let i = row * this.numColumns + col;
                        let l;
                        if (i >= entries.length) {
                            l = new Layout.Empty(new math_1.Vector(0, 0));
                        }
                        else {
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
    exports.ListMenu = ListMenu;
    class CursorLayout {
        constructor(inner, focused) {
            this.inner = inner;
            this.focused = focused;
        }
        getSize() {
            return this.inner.getSize();
        }
        draw(pos, size) {
            this.inner.draw(pos, size);
            drawCursor(pos.x - 3, pos.y + this.inner.getSize().y / 2, this.focused);
        }
    }
    exports.CursorLayout = CursorLayout;
    // End Menu
    //==========
    //==========
    // Inputs
    var VK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").reduce((o, c) => {
        o[c] = c.charCodeAt(0);
        return o;
    }, {});
    window.onkeydown = evt => {
        if (String.fromCharCode(evt.which) in VK) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        if (!exports.heldKeys.has(evt.which)) {
            exports.heldKeys.add(evt.which);
            var e = new Event('actualkeydown');
            e['which'] = evt.which;
            window.dispatchEvent(e);
        }
    };
    window.onkeyup = evt => {
        if (String.fromCharCode(evt.which) in VK) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        if (exports.heldKeys.delete(evt.which)) {
            var e = new Event('actualkeyup');
            e['which'] = evt.which;
            window.dispatchEvent(e);
        }
    };
    window.addEventListener("actualkeydown", (evt) => {
        if (evt.which === VK.W) {
            exports.menuInputs.push("up");
        }
        else if (evt.which === VK.S) {
            exports.menuInputs.push("down");
        }
        else if (evt.which === VK.A) {
            exports.menuInputs.push("left");
        }
        else if (evt.which === VK.D) {
            exports.menuInputs.push("right");
        }
        else if (evt.which === VK.E) {
            exports.menuInputs.push("select");
        }
        else if (evt.which === VK.Q || evt.which === 27 /* Esc */) {
            exports.menuInputs.push("back");
        }
        else if (evt.which === VK.T) {
            combat_1.setWantWait(true);
        }
    });
    window.addEventListener("actualkeyup", (evt) => {
        if (evt.which === VK.T) {
            combat_1.setWantWait(false);
        }
    });
    window.addEventListener("wheel", evt => {
        combat_1.setTimelineDuration(math_1.clamp(combat_1.timelineDuration + evt.deltaY / 3, 1, 20));
    });
    window.addEventListener("mousemove", evt => {
        combat_1.setGamepadCursor(new math_1.Vector(evt.clientX, evt.clientY));
    });
    window.addEventListener("mousedown", evt => {
        if (evt.which === 1) {
            exports.menuInputs.push("select");
        }
        else if (evt.which === 3) {
            exports.menuInputs.push("back");
        }
    });
    window.oncontextmenu = evt => {
        evt.preventDefault();
        return false;
    };
    function getGamepadState(gamepad) {
        let buttons = gamepad.buttons.map(val => val.pressed);
        let axes = gamepad.axes.map(val => val);
        function sampleJoystick(axisX, axisY) {
            let vector = new math_1.Vector(axisX, axisY);
            let mag = vector.mag();
            const DEADZONE = 0.2;
            if (mag > DEADZONE) {
                if (mag > 1) {
                    return vector.norm();
                }
                else {
                    return vector.norm().muls((mag - DEADZONE) / (1 - DEADZONE));
                }
            }
            else {
                return new math_1.Vector(0, 0);
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
        }
        else {
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
        let dv = new math_1.Vector((exports.heldKeys.has(VK.A) ? -1 : 0) + (exports.heldKeys.has(VK.D) ? 1 : 0), (exports.heldKeys.has(VK.W) ? -1 : 0) + (exports.heldKeys.has(VK.S) ? 1 : 0));
        if (dv.mag2() > 1) {
            dv = dv.norm();
        }
        exports.gamepadCursorVel = exports.gamepadCursorVel.add(dv);
        exports.wantFastDialog = exports.wantFastDialog || exports.heldKeys.has(VK.T);
    }
    function pollGamepads() {
        let gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            let gamepad = gamepads[i];
            if (gamepad != null)
                pollGamepadInputs(gamepad);
        }
    }
    function pollGamepadInputs(gamepad) {
        let polledState = getGamepadState(gamepad);
        let dv = polledState.LeftStick
            .add(polledState.RightStick)
            .add(new math_1.Vector((polledState.DpadLeft ? -1 : 0) + (polledState.DpadRight ? 1 : 0), (polledState.DpadUp ? -1 : 0) + (polledState.DpadDown ? 1 : 0)));
        if (dv.mag2() > 1) {
            dv = dv.norm();
        }
        dv = dv.muls(polledState.RB ? 0.1 : 1);
        exports.gamepadCursorVel = exports.gamepadCursorVel.add(dv);
        let lastPolledState = exports.lastPolledStates.get(gamepad);
        if (lastPolledState != null) {
            if (polledState.A && !lastPolledState.A) {
                exports.menuInputs.push("select");
            }
            if (polledState.B && !lastPolledState.B) {
                exports.menuInputs.push("back");
            }
            if (polledState.Y && !lastPolledState.Y) {
                combat_1.setWantWait(true);
            }
            if (!polledState.Y && lastPolledState.Y) {
                combat_1.setWantWait(false);
            }
            if (polledState.X && !lastPolledState.X) {
                combat_1.incGlobalBuddyToggle();
            }
            if (polledState.Y) {
                exports.wantFastDialog = true;
            }
            function pollAxisAsButton(axis, component, positive) {
                if (positive) {
                    return polledState[axis][component] > 0.8 && lastPolledState[axis][component] < 0.8;
                }
                else {
                    return polledState[axis][component] < -0.8 && lastPolledState[axis][component] > -0.8;
                }
            }
            if (pollAxisAsButton("LeftStick", "x", true)) {
                exports.menuInputs.push("right");
            }
            if (pollAxisAsButton("LeftStick", "x", false)) {
                exports.menuInputs.push("left");
            }
            if (pollAxisAsButton("LeftStick", "y", true)) {
                exports.menuInputs.push("down");
            }
            if (pollAxisAsButton("LeftStick", "y", false)) {
                exports.menuInputs.push("up");
            }
            if (pollAxisAsButton("RightStick", "x", true)) {
                exports.menuInputs.push("right");
            }
            if (pollAxisAsButton("RightStick", "x", false)) {
                exports.menuInputs.push("left");
            }
            if (pollAxisAsButton("RightStick", "y", true)) {
                exports.menuInputs.push("down");
            }
            if (pollAxisAsButton("RightStick", "y", false)) {
                exports.menuInputs.push("up");
            }
            if (polledState.DpadUp && !lastPolledState.DpadUp) {
                exports.menuInputs.push("up");
            }
            else if (polledState.DpadDown && !lastPolledState.DpadDown) {
                exports.menuInputs.push("down");
            }
            else if (polledState.DpadLeft && !lastPolledState.DpadLeft) {
                exports.menuInputs.push("left");
            }
            else if (polledState.DpadRight && !lastPolledState.DpadRight) {
                exports.menuInputs.push("right");
            }
            if (polledState.RT > 0) {
                combat_1.setTimelineDuration(math_1.clamp(combat_1.timelineDuration + polledState.RT * 5 * exports.deltaTime, 1, 20));
            }
            if (polledState.LT > 0) {
                combat_1.setTimelineDuration(math_1.clamp(combat_1.timelineDuration - polledState.LT * 5 * exports.deltaTime, 1, 20));
            }
        }
        exports.lastPolledStates.set(gamepad, polledState);
    }
    //==========
    // End of Inputs
    //==========
    // Drawing
    function drawShape(x, y, shape, color, size) {
        let halfSize = size / 2;
        exports.ctx.strokeStyle = color;
        if (shape === "square") {
            exports.ctx.strokeRect(x - halfSize, y - halfSize, size, size);
        }
        else if (shape === "triangle") {
            exports.ctx.beginPath();
            exports.ctx.moveTo(x - halfSize, y + halfSize);
            exports.ctx.lineTo(x + halfSize, y + halfSize);
            exports.ctx.lineTo(x, y - halfSize);
            exports.ctx.closePath();
            exports.ctx.stroke();
        }
    }
    exports.drawShape = drawShape;
    function drawLine(x1, y1, x2, y2) {
        exports.ctx.beginPath();
        exports.ctx.moveTo(x1, y1);
        exports.ctx.lineTo(x2, y2);
        exports.ctx.stroke();
    }
    exports.drawLine = drawLine;
    function drawLinev(a, b) {
        exports.ctx.beginPath();
        exports.ctx.moveTo(a.x, a.y);
        exports.ctx.lineTo(b.x, b.y);
        exports.ctx.stroke();
    }
    exports.drawLinev = drawLinev;
    function getWindowScale() {
        let shorterSide = Math.min(exports.canvas.width, exports.canvas.height);
        let scale = 1 / shorterSide * 1000;
        return scale;
    }
    exports.getWindowScale = getWindowScale;
    function windowToWorld(windowPos) {
        let scale = getWindowScale();
        let viewSize = new math_1.Vector(exports.canvas.width, exports.canvas.height).muls(scale);
        let center = viewSize.divs(2);
        let offset = exports.cameraFocus.sub(center);
        return windowPos.muls(scale).add(offset);
    }
    exports.windowToWorld = windowToWorld;
    function worldToWindow(worldPos) {
        let scale = getWindowScale();
        let viewSize = new math_1.Vector(exports.canvas.width, exports.canvas.height).muls(scale);
        let center = viewSize.divs(2);
        let offset = exports.cameraFocus.sub(center);
        return worldPos.sub(offset).divs(scale);
    }
    exports.worldToWindow = worldToWindow;
    function drawEntities(es) {
        exports.ctx.lineWidth = 6;
        for (let { shape, color, position: { x, y }, radius } of es) {
            drawShape(x, y, shape, color, radius);
        }
    }
    function drawPreviews(es) {
        exports.ctx.lineWidth = 6;
        for (let [{ shape, color, radius }, { x, y }] of es) {
            drawShape(x, y, shape, color, radius);
        }
    }
    function* floatingTextEffect(text, pos, vel, color, duration) {
        yield* overTime(duration, (dt, t) => {
            pos = pos.add(vel.muls(dt));
            // globalAlpha doesn't work in Firefox 49 Ubuntu for text, so do a workaround with fillStyle
            exports.ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${math_1.mix(1, 0, t)})`;
            exports.ctx.font = "48px " + exports.UI_FONT;
            exports.ctx.fillText(text, pos.x - exports.ctx.measureText(text).width / 2, pos.y);
        });
    }
    exports.floatingTextEffect = floatingTextEffect;
    function cameraShake(duration, mag) {
        exports.cameraShakeTtl = duration;
        exports.cameraShakeMag = mag / duration;
    }
    exports.cameraShake = cameraShake;
    function draw() {
        exports.ctx.clearRect(0, 0, exports.canvas.width, exports.canvas.height);
        exports.ctx.save();
        let scale = getWindowScale();
        let width = exports.canvas.width * scale;
        let height = exports.canvas.height * scale;
        exports.ctx.scale(1 / scale, 1 / scale);
        exports.ctx.save();
        let center = new math_1.Vector(width / 2, height / 2);
        let offset = exports.cameraFocus.sub(center);
        if (exports.cameraShakeTtl > 0) {
            offset = offset.add(math_1.Vector.random().muls(exports.cameraShakeTtl * exports.cameraShakeMag));
            exports.cameraShakeTtl -= exports.deltaTime;
        }
        exports.ctx.translate(-offset.x, -offset.y);
        // ctx.fillStyle = "red";
        // ctx.fillRect(-10, -10, 20, 20);
        exports.ctx.drawImage(exports.dbgSvgImage, 0, 0);
        for (let polygon of exports.levelPolygons) {
            if (exports.dbgShowPolygons) {
                exports.ctx.globalAlpha = 0.5;
                exports.ctx.fillStyle = collision.dbgPointInPolygon.has(polygon) ? "yellow" : collision.dbgPolygonRejectedByBBox.has(polygon) ? "red" : "grey";
                exports.ctx.beginPath();
                for (let point of polygon.points) {
                    exports.ctx.lineTo(point.x, point.y);
                }
                exports.ctx.closePath();
                exports.ctx.fill();
                exports.ctx.globalAlpha = 1;
            }
            if (exports.dbgShowPolygonNormals) {
                for (let line of polygon.lines) {
                    let center = line.a.mix(line.b, 0.5);
                    let cplusNormal = center.add(line.b.sub(line.a).norm().crossz().muls(10));
                    exports.ctx.strokeStyle = "blue";
                    exports.ctx.lineWidth = 2;
                    drawLine(center.x, center.y, cplusNormal.x, cplusNormal.y);
                }
            }
        }
        if (combat_1.showBattleBounds) {
            exports.ctx.lineWidth = 4;
            exports.ctx.strokeStyle = combat_1.combatIsInAction ? "red" : "black";
            exports.ctx.globalAlpha = 0.5;
            exports.ctx.setLineDash([5, 5]);
            drawLinev(combat_1.battleBounds.min, new math_1.Vector(combat_1.battleBounds.min.x, combat_1.battleBounds.max.y));
            drawLinev(combat_1.battleBounds.min, new math_1.Vector(combat_1.battleBounds.max.x, combat_1.battleBounds.min.y));
            drawLinev(combat_1.battleBounds.max, new math_1.Vector(combat_1.battleBounds.min.x, combat_1.battleBounds.max.y));
            drawLinev(combat_1.battleBounds.max, new math_1.Vector(combat_1.battleBounds.max.x, combat_1.battleBounds.min.y));
            exports.ctx.setLineDash([]);
            exports.ctx.globalAlpha = 1;
        }
        // DEBUG
        if (exports.dbgShowEntityCircles) {
            for (let entity of exports.entities) {
                exports.ctx.fillStyle = "black";
                exports.ctx.globalAlpha = 0.5;
                exports.ctx.beginPath();
                exports.ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
                exports.ctx.closePath();
                exports.ctx.fill();
                exports.ctx.globalAlpha = 1.0;
            }
            for (let [entity, position] of combat_1.previewPosition) {
                exports.ctx.fillStyle = "black";
                exports.ctx.globalAlpha = 0.2;
                exports.ctx.beginPath();
                exports.ctx.arc(position.x, position.y, entity.radius, 0, Math.PI * 2);
                exports.ctx.closePath();
                exports.ctx.fill();
                exports.ctx.globalAlpha = 1.0;
            }
        }
        // /DEBUG
        exports.ctx.globalAlpha = 0.25;
        exports.ctx.lineWidth = 1;
        for (let entity of exports.entities) {
            exports.ctx.strokeStyle = "black";
            exports.ctx.beginPath();
            exports.ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
            exports.ctx.stroke();
        }
        exports.ctx.globalAlpha = 0.3 * 0.25;
        for (let [entity, position] of combat_1.previewPosition) {
            exports.ctx.strokeStyle = "black";
            exports.ctx.beginPath();
            exports.ctx.arc(position.x, position.y, entity.radius, 0, Math.PI * 2);
            exports.ctx.stroke();
        }
        exports.ctx.globalAlpha = 1.0;
        let dummy = combat_1.drawTargetArea; // Typescript bug
        if (dummy != null)
            dummy();
        drawEntities(exports.entities);
        exports.ctx.globalAlpha = 0.3;
        drawPreviews(combat_1.previewPosition);
        exports.ctx.globalAlpha = 1;
        exports.ctx.save();
        particles_1.drawParticles();
        exports.effects = exports.effects.filter(effect => effect.next().done !== true);
        exports.ctx.restore();
        combat_1.cursorEntities.forEach(e => drawCursor(e.position.x - e.radius, e.position.y, true));
        exports.ctx.drawImage(exports.dbgSvgImageHighLayer, 0, 0);
        // DEBUG
        if (collision.dbgShowCandidateStatus) {
            for (let [point, status] of collision.dbgCandidateStatus) {
                exports.ctx.fillStyle = status === "considered" ? "cyan" : (status === "rejected" ? "red" : "green");
                exports.ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
            }
        }
        if (collision.dbgShowLineSandwich) {
            for (let { a, b, snug, intersect, ap, bp } of collision.dbgLineSandwich) {
                exports.ctx.strokeStyle = "blue";
                exports.ctx.lineWidth = 2;
                drawLine(a.a.x, a.a.y, a.b.x, a.b.y);
                drawLine(b.a.x, b.a.y, b.b.x, b.b.y);
                exports.ctx.strokeStyle = "orange";
                drawLine(intersect.x, intersect.y, snug.x, snug.y);
                exports.ctx.fillStyle = "cyan";
                exports.ctx.fillRect(intersect.x - 2, intersect.y - 2, 4, 4);
                exports.ctx.fillStyle = "magenta";
                exports.ctx.fillRect(snug.x - 2, snug.y - 2, 4, 4);
                exports.ctx.fillStyle = "grey";
                exports.ctx.fillRect(ap.x - 2, ap.y - 2, 4, 4);
                exports.ctx.fillStyle = "grey";
                exports.ctx.fillRect(bp.x - 2, bp.y - 2, 4, 4);
            }
        }
        // /DEBUG
        exports.ctx.restore();
        if (exports.dbgShowGamepad) {
            let gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i] != null) {
                    drawGamepad(gamepads[i], 10, height - 200 - i * 50);
                }
            }
        }
        exports.ctx.restore();
    }
    exports.draw = draw;
    function drawCursor(x, y, active) {
        let size = active ? (Math.cos((exports.gNow) * Math.PI * 2 / 1) + 1) / 2 * 0.5 + 0.5 : 1;
        exports.ctx.fillStyle = active ? "white" : "grey";
        exports.ctx.strokeStyle = "black";
        exports.ctx.lineWidth = 4;
        exports.ctx.beginPath();
        exports.ctx.moveTo(x - size * 5, y);
        exports.ctx.lineTo(x - size * 25, y + size * 20);
        exports.ctx.lineTo(x - size * 25, y - size * 20);
        exports.ctx.closePath();
        exports.ctx.fill();
        exports.ctx.stroke();
    }
    function drawGamepad(gamepad, bx, by) {
        let buttonIndex = 0;
        function drawButton(x, y, pressed) {
            exports.ctx.fillStyle = pressed ? "red" : buttonIndex % 8 < 4 ? "green" : "blue";
            exports.ctx.fillRect(x, y, 10, 10);
            buttonIndex += 1;
        }
        function drawAxis(x, y, value) {
            exports.ctx.fillStyle = "black";
            exports.ctx.fillRect(x + 4, y, 2, 20);
            exports.ctx.fillStyle = "red";
            exports.ctx.fillRect(x, y + 5 + value * 10, 10, 10);
        }
        gamepad.buttons.forEach((button, i) => drawButton(bx + i * 20, by - 20, button.pressed));
        gamepad.axes.forEach((axisValue, i) => drawAxis(bx + i * 20, by, axisValue));
    }
    function* zip(...its) {
        let iters = its.map(it => it[Symbol.iterator]());
        while (true) {
            let rs = iters.map(iter => iter.next());
            if (rs.some(r => r.done))
                return;
            yield rs.map(r => r.value);
        }
    }
    exports.zip = zip;
    /** Calls callback a variable number of times per frame so that after `durationInSeconds` it will have been called `n` times. */
    function* nOverTime(durationInSeconds, n, callback) {
        let calls = 0;
        yield* overTime(durationInSeconds, (_, t) => {
            let neededCalls = Math.floor(t * n);
            while (neededCalls > calls) {
                callback(calls, calls / n);
                calls += 1;
            }
        });
    }
    exports.nOverTime = nOverTime;
    /** Calls callback once per frame until `durationInSeconds` has elapsed. On the last callback `total` will be 1. */
    function* overTime(durationInSeconds, callback) {
        let start = exports.gNow;
        let end = start + durationInSeconds;
        let prev = start;
        while (true) {
            yield;
            let now = Math.min(end, exports.gNow);
            let deltaD = (now - prev) / durationInSeconds;
            let t = math_1.clamp((now - start) / durationInSeconds, 0, 1);
            prev = now;
            // The sum of all deltaD's passed to callback should be ~1
            // The last t passed to callback should be 1
            if (now === end) {
                callback(deltaD, 1);
                return;
            }
            else {
                callback(deltaD, t);
            }
        }
    }
    exports.overTime = overTime;
    function pointsWithinDistance(pa, pb, r) {
        return pa.sub(pb).mag2() < r * r;
    }
    exports.pointsWithinDistance = pointsWithinDistance;
    function placeEntitiesAtSpot(es, point) {
        let placedEntities = [];
        for (let entity of es) {
            entity.position = collision.findClosestOpenSpot(point, entity.radius, placedEntities.map(e => ({ center: e.position, radius: e.radius })), exports.levelPolygons, { min: new math_1.Vector(0, 0), max: exports.dbgSvgSize });
            placedEntities.push(entity);
        }
    }
    exports.placeEntitiesAtSpot = placeEntitiesAtSpot;
    function* gameExplore() {
        while (exports.menuInputs.length > 0)
            exports.menuInputs.pop();
        let vel = exports.gamepadCursorVel.muls(300 * exports.deltaTime);
        let partyMembers = exports.entities.filter(e => !e.isEnemy);
        let toPoint = partyMembers[0].position.add(vel);
        for (let index = 0; index < partyMembers.length; index++) {
            let entity = partyMembers[index];
            if (index > 0) {
                let dir = toPoint.sub(entity.position);
                let distance = dir.mag();
                dir = dir.norm();
                let followerVelMag = math_1.clamp((distance - 100) * 3, 0, 600);
                if (followerVelMag === 0) {
                    toPoint = entity.position;
                    continue;
                }
                else if (distance > followerVelMag * exports.deltaTime) {
                    toPoint = entity.position.towards(toPoint, followerVelMag * exports.deltaTime);
                }
                else {
                    // no change to toPoint
                }
            }
            let newPos = collision.findClosestOpenSpot(toPoint, entity.radius, exports.entities.filter(e => e.isEnemy).map(({ position, radius }) => ({ center: position, radius })), exports.levelPolygons, { min: new math_1.Vector(0, 0), max: exports.dbgSvgSize });
            entity.position = newPos;
            toPoint = newPos;
        }
        let nextFocus = partyMembers[0].position;
        if (exports.cameraFocus.sub(nextFocus).mag() > 600 * exports.deltaTime) {
            exports.cameraFocus = exports.cameraFocus.towards(nextFocus, 600 * exports.deltaTime);
        }
        else {
            exports.cameraFocus = nextFocus;
        }
        draw();
        yield;
    }
    exports.gameExplore = gameExplore;
    function* movePartyToPoint(point, bounds) {
        let toPosition = exports.entities.filter(e => !e.isEnemy).slice(0);
        let pendingMovement = [];
        while (toPosition.length > 0) {
            let nextEnt = toPosition[0];
            let spot = collision.findClosestOpenSpot(point, nextEnt.radius, exports.entities
                .filter(e => e.isEnemy).map(e => ({ center: e.position, radius: e.radius }))
                .concat(pendingMovement.map(([e, _, b]) => ({ center: b, radius: e.radius }))), exports.levelPolygons, bounds);
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
    exports.movePartyToPoint = movePartyToPoint;
    function requirePromise(name) {
        return new Promise((resolve, reject) => {
            require([name], (c) => { resolve(c); }, (err) => { reject(err); });
        });
    }
    function* waitForPromise(promise) {
        let result = null;
        promise.then(value => { result = { type: "success", value }; }).catch(error => { result = { type: "error", error }; });
        while (result == null) {
            yield;
        }
        return result;
    }
    function* loadLevel(name) {
        return yield* waitForPromise(Promise.all([
            requirePromise("js/levels/" + name + ".js"),
            svg_1.loadAsync("levels/" + name + ".svg", "document").then(d => d.children[0])
        ]));
    }
    function setCameraFocus(focus) {
        exports.cameraFocus = focus;
    }
    exports.setCameraFocus = setCameraFocus;
    function setEntities(es) {
        exports.entities = es;
    }
    exports.setEntities = setEntities;
    function* fadeIn() {
        yield* overTime(0.15, (_, t) => {
            draw();
            exports.ctx.globalAlpha = 1 - t;
            exports.ctx.fillStyle = "black";
            exports.ctx.fillRect(0, 0, exports.canvas.width, exports.canvas.height);
            exports.ctx.globalAlpha = 1;
        });
    }
    exports.fadeIn = fadeIn;
    function* fadeOut() {
        yield* overTime(0.15, (_, t) => {
            draw();
            exports.ctx.globalAlpha = t;
            exports.ctx.fillStyle = "black";
            exports.ctx.fillRect(0, 0, exports.canvas.width, exports.canvas.height);
            exports.ctx.globalAlpha = 1;
        });
    }
    exports.fadeOut = fadeOut;
    function toStaticImage(img) {
        let canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        let result = new Image();
        result.src = canvas.toDataURL("image/png");
        return result;
    }
    exports.previousLevel = "";
    function* gameGen() {
        let levelName = "testRoom";
        while (true) {
            let blackScreenMinEnd = exports.gNow + 0.05;
            let debugMessageY = 0;
            function writeDebugMessage(msg) {
                exports.ctx.font = "48px " + exports.UI_FONT;
                debugMessageY += 48;
                exports.ctx.fillStyle = "white";
                exports.ctx.fillText(msg, 30, debugMessageY);
            }
            writeDebugMessage("Loading level...");
            let levelResult = yield* loadLevel(levelName);
            if (levelResult.type === "error") {
                console.error("Couldn't load level", levelResult.error);
                exports.ctx.clearRect(0, 0, exports.canvas.width, exports.canvas.height);
                exports.ctx.font = "48px " + exports.UI_FONT;
                exports.ctx.fillText(levelResult.error.toString(), 10, 50);
                return;
            }
            writeDebugMessage("Processing SVGs...");
            let level = levelResult.value;
            console.log(level);
            let [script, dbgSvgElem] = level;
            exports.dbgSvgSize = svg_1.getSVGSize(dbgSvgElem);
            exports.levelPolygons = svg_1.svgToPolygons(dbgSvgElem);
            let [dbgSvgLowElem, dbgSvgHighElem] = svg_1.splitSVG(dbgSvgElem);
            writeDebugMessage("Creating SVG images...");
            let imagesLoaded = 0;
            let imageError = false;
            exports.dbgSvgImage.onload = () => imagesLoaded += 1;
            exports.dbgSvgImageHighLayer.onload = () => imagesLoaded += 1;
            exports.dbgSvgImage.onerror = evt => { imageError = true; console.log(evt); };
            exports.dbgSvgImageHighLayer.onerror = evt => { imageError = true; console.log(evt); };
            exports.dbgSvgImage.src = "data:image/svg+xml;base64," + btoa(dbgSvgLowElem.outerHTML);
            exports.dbgSvgImageHighLayer.src = "data:image/svg+xml;base64," + btoa(dbgSvgHighElem.outerHTML);
            writeDebugMessage("Waiting for SVG images...");
            while (imagesLoaded < 2) {
                if (imageError) {
                    console.error("I give up");
                    return;
                }
                yield;
            }
            if (exports.wantCacheSVG) {
                writeDebugMessage("Creating static images...");
                exports.dbgSvgImage = toStaticImage(exports.dbgSvgImage);
                exports.dbgSvgImageHighLayer = toStaticImage(exports.dbgSvgImageHighLayer);
            }
            while (exports.gNow < blackScreenMinEnd) {
                yield;
            }
            let nextLevelName = yield* script.levelLogic(dbgSvgElem);
            exports.previousLevel = levelName;
            levelName = nextLevelName;
            yield* fadeOut();
            exports.entities = exports.entities.filter(e => !e.isEnemy);
        }
    }
    function logic() {
        exports.gamepadCursorVel = new math_1.Vector(0, 0);
        exports.wantFastDialog = false;
        pollKeyboard();
        pollGamepads();
        if (exports.gamepadCursorVel.mag2() > 1) {
            exports.gamepadCursorVel = exports.gamepadCursorVel.norm();
        }
        combat_1.setGamepadCursor(combat_1.gamepadCursor.add(exports.gamepadCursorVel.muls(800 / getWindowScale() * exports.deltaTime)).clamp(new math_1.Vector(0, 0), new math_1.Vector(exports.canvas.width, exports.canvas.height)));
        exports.logicCoroutine.next();
    }
    class FPSCounter {
        constructor() {
            this.fps = 0;
            this.frameDuration = 0;
            this.startToStartSamples = [];
            this.startToEndSamples = [];
            this.insertIndex = 0;
            this.lastFrameStart = window.performance.now();
        }
        startFrame() {
            this.insertIndex = math_1.mod(this.insertIndex + 1, FPSCounter.NUM_SAMPLES);
            let now = window.performance.now();
            this.startToStartSamples[this.insertIndex] = now - this.lastFrameStart;
            this.lastFrameStart = now;
            if (math_1.mod(this.insertIndex, 12) === 0) {
                this.fps = 1000 / (this.startToStartSamples.reduce((a, b) => a + b) / this.startToStartSamples.length);
                this.frameDuration = this.startToEndSamples.reduce((a, b) => a + b) / this.startToEndSamples.length;
            }
        }
        endFrame() {
            this.startToEndSamples[this.insertIndex] = window.performance.now() - this.lastFrameStart;
        }
    }
    FPSCounter.NUM_SAMPLES = 60;
    let update = (() => {
        let lastUpdateTime;
        let fpsCounter = new FPSCounter();
        return function update() {
            fpsCounter.startFrame();
            let now = window.performance.now();
            if (lastUpdateTime != null) {
                exports.deltaTime = Math.min(now - lastUpdateTime, 100) / 1000;
                exports.gNow += exports.deltaTime;
            }
            lastUpdateTime = now;
            logic();
            exports.ctx.fillStyle = "magenta";
            exports.ctx.font = "12px monospace";
            exports.ctx.fillText(fpsCounter.fps.toFixed(0), 5, 17);
            exports.ctx.fillText(fpsCounter.frameDuration.toFixed(1), 5, 29);
            window.requestAnimationFrame(update);
            fpsCounter.endFrame();
        };
    })();
    function start() {
        exports.logicCoroutine = gameGen();
        exports.entities.push({
            name: "Squareman",
            position: new math_1.Vector(100, 100),
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
        exports.entities.push({
            name: "McSquare",
            position: new math_1.Vector(100, 200),
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
        exports.entities.push({
            name: "Squire",
            position: new math_1.Vector(100, 300),
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
        exports.inventory.set(Items.ItemPotion, 2);
        exports.inventory.set(Items.ItemJerky, 1);
        window.requestAnimationFrame(update);
    }
    start();
});
//# sourceMappingURL=tcx.js.map
define(["require", "exports", "tcx", "techs", "techs", "layout", "math"], function (require, exports, tcx_1, techs_1, Techs, Layout, math_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.gamepadCursor = new math_1.Vector(0, 0); // [-1, 1]
    exports.previewMana = new Map();
    exports.previewHealth = new Map();
    exports.previewTimeToTurnOverrides = new Map();
    exports.previewPosition = new Map();
    exports.cursorEntities = new Set();
    exports.queuedCommands = new Map();
    exports.lastTargetedEnemy = null;
    exports.combatDialog = null;
    exports.combatIsInAction = false;
    exports.timelineDuration = 5;
    exports.showGamepadCursor = false;
    exports.globalBuddyToggle = 0;
    exports.showBattleBounds = false;
    exports.drawTargetArea = null;
    exports.battleBounds = { min: new math_1.Vector(-400, 0), max: new math_1.Vector(600, 600) };
    exports.wantWait = false;
    exports.inBattle = false;
    exports.bgms = [""];
    exports.fanfares = [""];
    function setWantWait(b) {
        exports.wantWait = b;
    }
    exports.setWantWait = setWantWait;
    function setDrawTargetArea(f) {
        exports.drawTargetArea = f;
    }
    exports.setDrawTargetArea = setDrawTargetArea;
    function setGamepadCursor(p) {
        exports.gamepadCursor = p;
    }
    exports.setGamepadCursor = setGamepadCursor;
    function setTimelineDuration(d) {
        exports.timelineDuration = d;
    }
    exports.setTimelineDuration = setTimelineDuration;
    function incGlobalBuddyToggle() {
        exports.globalBuddyToggle += 1;
    }
    exports.incGlobalBuddyToggle = incGlobalBuddyToggle;
    let previewTimeToTurnTs = new WeakMap();
    function getPreviewTimeToTurn(e) {
        let timeToTurnOverride = exports.previewTimeToTurnOverrides.get(e);
        if (timeToTurnOverride != null) {
            if (!previewTimeToTurnTs.has(e)) {
                previewTimeToTurnTs.set(e, tcx_1.gNow);
            }
            let t = Math.min(tcx_1.gNow - previewTimeToTurnTs.get(e), 0.25) / 0.25;
            return math_1.mix(e.timeToTurn, Math.max(0, timeToTurnOverride), t);
        }
        else {
            previewTimeToTurnTs.delete(e);
            return e.timeToTurn;
        }
    }
    function drawTimelineCursor(x, y, up, active) {
        if (!active) {
            tcx_1.ctx.globalAlpha = 0.2;
        }
        tcx_1.ctx.fillStyle = "white";
        tcx_1.ctx.strokeStyle = "black";
        tcx_1.ctx.lineWidth = 2;
        tcx_1.ctx.beginPath();
        tcx_1.ctx.moveTo(x, y);
        let d = up ? -1 : 1;
        tcx_1.ctx.lineTo(x - 4, y + 10 * d);
        tcx_1.ctx.lineTo(x + 4, y + 10 * d);
        tcx_1.ctx.closePath();
        tcx_1.ctx.fill();
        tcx_1.ctx.stroke();
        if (!active) {
            tcx_1.ctx.globalAlpha = 1;
        }
    }
    function drawTimeline(x, y, w) {
        tcx_1.ctx.lineWidth = 1;
        tcx_1.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        for (let t = 0; t < exports.timelineDuration; t += 1) {
            let tickX = x + t / exports.timelineDuration * w;
            tcx_1.drawLine(tickX, y - 5, tickX, y + 5);
        }
        tcx_1.ctx.strokeStyle = "black";
        tcx_1.ctx.lineWidth = 2;
        tcx_1.drawLine(x, y, x + w, y);
        tcx_1.ctx.lineWidth = 4;
        // Put drawing functions in here so they can be sorted to draw in turn order
        let drawFuncs = []; // Writing the type as `[number, () => void][]` works but breaks syntax highlighting for the remainder of the file
        let timelineCursors = [];
        for (let entityLetBug of tcx_1.entities.filter(e => e.isInCombat)) {
            let entity = entityLetBug;
            // Is it absurd that if you destructure in the `for (let HERE of whatever)` it's not block scoped?
            // Seems to be a firefox bug, chrome doesn't need this to be inside the body
            let { shape, radius, color, baseStaminaCost, isEnemy } = entity;
            let d = isEnemy ? -1 : 1;
            let isFirstTurn = true;
            for (let f = getPreviewTimeToTurn(entity); f <= exports.timelineDuration; f += baseStaminaCost) {
                let sx = x + f / exports.timelineDuration * w;
                let sy = y + 20 * d;
                if (exports.cursorEntities.has(entity)) {
                    timelineCursors.push([new math_1.Vector(sx, sy + 15 * d), isEnemy, isFirstTurn]);
                }
                drawFuncs.push([sx, () => {
                        if (!entity.isEnemy && entity.hp <= 0) {
                            tcx_1.ctx.globalAlpha = 0.2;
                        }
                        tcx_1.ctx.lineWidth = 2;
                        tcx_1.drawShape(sx, sy, shape, color, Math.min(10, radius));
                        tcx_1.ctx.lineWidth = 2;
                        tcx_1.ctx.strokeStyle = color;
                        tcx_1.drawLine(sx, y + 10 * d, sx, y);
                        tcx_1.ctx.globalAlpha = 1.0;
                    }]);
                isFirstTurn = false;
            }
            let previewTime = getPreviewTimeToTurn(entity);
            if (previewTime !== entity.timeToTurn) {
                tcx_1.ctx.strokeStyle = color;
                tcx_1.ctx.lineWidth = 2;
                // ctx.globalAlpha = 0.5;
                let start = entity.timeToTurn / exports.timelineDuration * w;
                let end = previewTime / exports.timelineDuration * w;
                /* drawFuncs.push([start, () => {
                    // ctx.globalAlpha = savedIsFirstTurn ? 1.0 : 0.2;
                    ctx.globalAlpha = 0.2;
                    ctx.lineWidth = 2;
                    drawShape(x + start, y + 20 * d, shape, color, 10);
                    ctx.globalAlpha = 1.0;
                }]); */
                if (start > w) {
                    start = w + 50;
                }
                if (end > w) {
                    end = w + 50;
                }
                if (start === end) {
                    if (previewTime > entity.timeToTurn) {
                        start = w + 1;
                    }
                    else {
                        end = w + 1;
                    }
                }
                tcx_1.ctx.globalAlpha = 0.2;
                if (start <= w) {
                    tcx_1.drawLine(x + start, y + 30 * d, x + start, y + 40 * d);
                }
                tcx_1.drawLine(x + start, y + 40 * d, x + end, y + 40 * d);
                if (end <= w && !exports.cursorEntities.has(entity)) {
                    tcx_1.drawLine(x + end, y + 40 * d, x + end, y + 30 * d);
                }
                // drawArrow(new Vector(x + start, y - 20), new Vector(x + end, y - 20), 10);
                tcx_1.ctx.globalAlpha = 1;
            }
        }
        drawFuncs.sort((a, b) => b[0] - a[0]).forEach(([_, f]) => f());
        timelineCursors.forEach(([v, up, active]) => drawTimelineCursor(v.x, v.y, up, active));
    }
    function isEntityActionReady(entity, action) {
        return entity.timeToTurn === 0 && (action.cost == null || action.cost <= entity.mp);
    }
    function isEntityComboTechReady(entity, tech) {
        for (let es of techs_1.getPairings(entity, tech.actions)) {
            if (es.every((e, i) => isEntityActionReady(e, tech.actions[i]))) {
                return true;
            }
        }
        return false;
    }
    function compareKeys(a, b) {
        for (let i = 0; i < a.length; i++) {
            if (a[i] < b[i])
                return -1;
            if (a[i] > b[i])
                return 1;
        }
        return 0;
    }
    function lowerManaCost(e, d) {
        let lowestCost = Infinity;
        for (let es of techs_1.getPairings(e, d.actions)) {
            let cost = d.actions[es.indexOf(e)].cost || 0;
            lowestCost = Math.min(cost, lowestCost);
        }
        return lowestCost;
    }
    class ComboMenu {
        constructor(entity) {
            this.entity = entity;
            this.listMenu = new tcx_1.ListMenu();
        }
        listEntries() {
            return techs_1.getComboTechs(this.entity)
                .sort((a, b) => compareKeys([lowerManaCost(this.entity, a), a.name], [lowerManaCost(this.entity, b), b.name]))
                .map(t => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name, [48, tcx_1.UI_FONT], isEntityComboTechReady(this.entity, t) ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        let pair = techs_1.getPairing(this.entity, t.actions);
                        if (pair != null) {
                            for (let [e, a] of tcx_1.zip(pair, t.actions)) {
                                exports.cursorEntities.add(e);
                                exports.previewMana.set(e, e.mp - (a.cost || 0));
                            }
                        }
                    },
                };
            });
        }
        update(inputs) {
            return this.listMenu.update(inputs, this.listEntries());
        }
        layout() {
            return this.listMenu.layout(this.listEntries());
        }
    }
    function getSpecialAbilities() {
        return [Techs.ActionAttack, Techs.ActionMove, Techs.ActionMeditate, Techs.ActionSpy];
    }
    class AbilityMenu {
        constructor(entity) {
            this.entity = entity;
            this.listMenu = new tcx_1.ListMenu();
        }
        listEntries() {
            return this.entity.actions
                .filter(a => getSpecialAbilities().indexOf(a) === -1)
                .sort((a, b) => compareKeys([a.cost || 0, a.name], [b.cost || 0, b.name]))
                .map(t => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name, [48, tcx_1.UI_FONT], isEntityActionReady(this.entity, t) ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        if (t.cost != null) {
                            exports.previewMana.set(this.entity, this.entity.mp - t.cost);
                        }
                        exports.cursorEntities.add(this.entity);
                    },
                };
            });
        }
        update(inputs) {
            return this.listMenu.update(inputs, this.listEntries());
        }
        layout() {
            return this.listMenu.layout(this.listEntries());
        }
    }
    class InventoryMenu {
        constructor(entity) {
            this.entity = entity;
            this.listMenu = new tcx_1.ListMenu();
        }
        listEntries() {
            return Array.from(tcx_1.inventory)
                .map(([t, amount]) => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name + " x" + amount, [48, tcx_1.UI_FONT], this.entity.timeToTurn === 0 ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        exports.cursorEntities.add(this.entity);
                    },
                };
            });
        }
        update(inputs) {
            return this.listMenu.update(inputs, this.listEntries());
        }
        layout() {
            return this.listMenu.layout(this.listEntries());
        }
    }
    class EntityMenu {
        constructor(entity) {
            this.entity = entity;
            this.listMenu = new tcx_1.ListMenu();
        }
        listEntries() {
            let comboTechs = techs_1.getComboTechs(this.entity);
            let font = [48, tcx_1.UI_FONT];
            let entries = [Techs.ActionAttack, Techs.ActionMove].map(action => {
                return {
                    layout: () => {
                        return new Layout.Text(action.name, font, isEntityActionReady(this.entity, action) ? "black" : "#999");
                    },
                    menu: () => action.menu(this.entity),
                    hover: () => { exports.cursorEntities.add(this.entity); }
                };
            });
            entries.push({
                layout: () => {
                    return new Layout.Text("Ability", font, this.entity.actions
                        .filter(a => getSpecialAbilities().indexOf(a) === -1)
                        .some(a => isEntityActionReady(this.entity, a)) ? "black" : "#999");
                },
                menu: () => new AbilityMenu(this.entity),
                hover: () => { exports.cursorEntities.add(this.entity); }
            });
            entries.push({
                layout: () => {
                    return new Layout.Text("Items", font, tcx_1.inventory.size > 0 ? "black" : "#999");
                },
                menu: () => new InventoryMenu(this.entity),
                hover: () => { exports.cursorEntities.add(this.entity); }
            });
            entries.push({
                layout: () => {
                    return new Layout.Text("Combo", font, comboTechs.some(tech => isEntityComboTechReady(this.entity, tech)) ? "black" : "#999");
                },
                menu: () => new ComboMenu(this.entity),
                hover: () => { exports.cursorEntities.add(this.entity); }
            });
            getSpecialAbilities().filter(a => a !== Techs.ActionAttack && a !== Techs.ActionMove).filter(action => this.entity.actions.indexOf(action) !== -1).map(action => {
                return {
                    layout: () => {
                        return new Layout.Text(action.name, font, isEntityActionReady(this.entity, action) ? "black" : "#999");
                    },
                    menu: () => action.menu(this.entity),
                    hover: () => { exports.cursorEntities.add(this.entity); }
                };
            }).forEach(e => entries.push(e));
            return entries;
        }
        update(inputs) {
            return this.listMenu.update(inputs, this.listEntries());
        }
        layout() {
            return this.listMenu.layout(this.listEntries());
        }
    }
    class RootMenu {
        constructor() {
            this.selectedEntity = null;
            this.submenu = null;
        }
        update(inputs) {
            let partyEntities = tcx_1.entities.filter(e => !e.isEnemy);
            if (this.selectedEntity == null || partyEntities.indexOf(this.selectedEntity) == null) {
                this.selectedEntity = partyEntities[0];
                this.submenu = null;
            }
            if (this.submenu != null && this.selectedEntity.hp <= 0) {
                this.submenu = null;
            }
            do {
                if (this.submenu != null) {
                    let r = this.submenu.update(inputs);
                    if (r !== tcx_1.MenuUpdateResult.StillActive) {
                        this.submenu = null;
                    }
                }
                else if (inputs.length > 0) {
                    let input = inputs.shift();
                    if (input === "select") {
                        if (this.selectedEntity.hp <= 0) {
                            tcx_1.playSound("sound/Invalid cursor selection.wav");
                        }
                        else {
                            tcx_1.playSound("sound/cursverti.wav");
                            this.submenu = new EntityMenu(this.selectedEntity);
                        }
                    }
                    else if (input === "left") {
                        tcx_1.playSound("sound/curshoriz.wav");
                        let index = partyEntities.indexOf(this.selectedEntity);
                        this.selectedEntity = partyEntities[math_1.mod(index - 1, partyEntities.length)];
                    }
                    else if (input === "right") {
                        tcx_1.playSound("sound/curshoriz.wav");
                        let index = partyEntities.indexOf(this.selectedEntity);
                        this.selectedEntity = partyEntities[math_1.mod(index + 1, partyEntities.length)];
                    }
                    else if (input === "back") {
                        tcx_1.playSound("sound/curshoriz.wav");
                        exports.queuedCommands.delete(this.selectedEntity);
                    }
                }
            } while (inputs.length > 0);
            return tcx_1.MenuUpdateResult.StillActive;
        }
        layout() {
            let partyEntities = tcx_1.entities.filter(e => !e.isEnemy);
            let font = [48, tcx_1.UI_FONT];
            let focusedBackground = "rgba(255, 255, 255, 1)";
            // Inner
            let innerLayout;
            if (this.submenu != null) {
                innerLayout = this.submenu.layout() || new Layout.Empty(new math_1.Vector(0, 0));
            }
            else if (this.selectedEntity != null) {
                exports.cursorEntities.add(this.selectedEntity);
                // Layout entity stats
                innerLayout = Layout.vertical([
                    new Layout.Text("Turn in " + this.selectedEntity.timeToTurn.toFixed(1), font, "#999"),
                    Layout.columns([Layout.vertical([
                            // new Layout.Text(queuedCommand == null ? "Nothing" : queuedCommand[1], font, "#999"),
                            new Layout.Text("Speed " + (10 / this.selectedEntity.baseStaminaCost).toFixed(1) + " (" + this.selectedEntity.baseStaminaCost.toFixed(2) + ")", [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Fatigue " + this.selectedEntity.fatigue.toFixed(1), [24, tcx_1.UI_FONT], "#999"),
                        ]), Layout.vertical([
                            new Layout.Text("Magic " + this.selectedEntity.magicPower.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Resistance " + this.selectedEntity.resistance.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Affinities " + this.selectedEntity.affinities.map(n => n.toFixed(1)).join(" | "), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("MP/turn " + this.selectedEntity.rateMp.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                        ]), Layout.vertical([
                            new Layout.Text("Attack " + this.selectedEntity.attack.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Defense " + this.selectedEntity.defense.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Accuracy " + this.selectedEntity.accuracy.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                            new Layout.Text("Evasion " + this.selectedEntity.evasion.toFixed(0), [24, tcx_1.UI_FONT], "#999"),
                        ])])
                ]);
            }
            else {
                innerLayout = new Layout.Empty(new math_1.Vector(0, 0));
            }
            // let innerDetails = globalTooltip || new Layout.Empty(new Vector(0, 0));
            // innerLayout = new Layout.HorizontalWeighted(innerLayout, innerDetails, 0.66);
            innerLayout = new Layout.Background(new Layout.Border(innerLayout, [5, 5, 5, 5], null), focusedBackground);
            innerLayout = new Layout.MinSize(new Layout.MaxSize(innerLayout, new math_1.Vector(750, 1000)), new math_1.Vector(750, 0));
            // Tabs
            let tabsLayoutEntries = [];
            for (let entityLetBug of partyEntities) {
                let entity = entityLetBug;
                // Layout tab headers
                let isFocused = this.selectedEntity === entity;
                let isReady = entity.timeToTurn === 0;
                let hpPercent = math_1.clamp(entity.hp / entity.maxHp, 0, 1);
                let fatiguePercent = math_1.clamp(tcx_1.getEntityFatiguedMaxHealth(entity) / entity.maxHp, 0, 1);
                let previewHpPercent = exports.previewHealth.has(entity) ? math_1.clamp(exports.previewHealth.get(entity) / entity.maxHp, 0, fatiguePercent) : null;
                let labelFont = [24, tcx_1.UI_FONT];
                // "rgba(153, 153, 153, 0.5)"
                let hpLabel = Layout.horizontal([
                    new Layout.Text(entity.hp.toFixed(0), labelFont, "black"),
                    new Layout.Align(new Layout.Text("/" + tcx_1.getEntityFatiguedMaxHealth(entity), [14, tcx_1.UI_FONT], "#999"), 0.0, 1.0),
                ]);
                let mpLabel = Layout.horizontal([
                    new Layout.Text(entity.mp.toFixed(0), labelFont, "black"),
                    new Layout.Align(new Layout.Text("/" + entity.maxMp, [14, tcx_1.UI_FONT], "#999"), 0.0, 1.0),
                ]);
                // let mpLabel = new Layout.Text(" | " + entity.mp + "/" + entity.maxMp, labelFont, "#999");
                let readinessLabel;
                if (entity.hp <= 0.0) {
                    readinessLabel = new Layout.Text("KO", labelFont, "#FF3333");
                }
                else if (isReady) {
                    readinessLabel = new Layout.Text("Ready!", labelFont, "#3399FF");
                }
                else {
                    let queuedCommand = exports.queuedCommands.get(entity);
                    readinessLabel = new Layout.Text(queuedCommand == null ? "Waiting" : queuedCommand[1], labelFont, "#999");
                }
                let tabLayout = Layout.vertical([
                    new Layout.Align(Layout.horizontal([
                        new class {
                            constructor() {
                                this.size = 20;
                            }
                            getSize() { return new math_1.Vector(this.size + 4, this.size + 4); }
                            draw(pos, size) {
                                tcx_1.ctx.lineWidth = 4;
                                let drawPos = pos.add(size.muls(0.5));
                                tcx_1.drawShape(drawPos.x, drawPos.y, entity.shape, entity.color, Math.min(size.x - 4, size.y - 4));
                            }
                        },
                        new Layout.Empty(new math_1.Vector(5, 0)),
                        new Layout.Text(entity.name, font, "black")
                    ]), 0.5, 0),
                    // new Layout.Align(readinessLabel, 0.5, 0.5),
                    new Layout.Border(Layout.horizontal([hpLabel, new Layout.Empty(new math_1.Vector(5, 0)), mpLabel, new Layout.Align(readinessLabel, 1.0, 0.0)]), [3, 3, 3, 3], null),
                    {
                        getSize() { return new math_1.Vector(250, 10); },
                        draw(pos, size) {
                            tcx_1.ctx.fillStyle = "#ff2c32";
                            tcx_1.ctx.fillRect(pos.x, pos.y, hpPercent * size.x, size.y);
                            tcx_1.ctx.fillStyle = "black";
                            tcx_1.ctx.globalAlpha = 0.2;
                            tcx_1.ctx.fillRect(pos.x + hpPercent * size.x, pos.y, (fatiguePercent - hpPercent) * size.x, size.y);
                            tcx_1.ctx.globalAlpha = 1;
                            if (previewHpPercent != null) {
                                tcx_1.ctx.fillStyle = exports.previewHealth.get(entity) < entity.hp ? "red" : "green";
                                tcx_1.ctx.globalAlpha = math_1.mix(0.6, 1, (Math.cos(tcx_1.gNow * Math.PI * 2) + 1) / 2);
                                if (previewHpPercent > hpPercent) {
                                    tcx_1.ctx.fillRect(pos.x + hpPercent * size.x, pos.y, (previewHpPercent - hpPercent) * size.x, size.y);
                                }
                                else {
                                    tcx_1.ctx.fillRect(pos.x + previewHpPercent * size.x, pos.y, (hpPercent - previewHpPercent) * size.x, size.y);
                                }
                                tcx_1.ctx.globalAlpha = 1;
                            }
                        }
                    },
                    {
                        getSize() { return new math_1.Vector(250, 10); },
                        draw(pos, size) {
                            let mpPercent = math_1.clamp(entity.mp / entity.maxMp, 0, 1);
                            tcx_1.ctx.fillStyle = "#35bcff";
                            tcx_1.ctx.fillRect(pos.x, pos.y, mpPercent * size.x, size.y);
                            tcx_1.ctx.fillStyle = "black";
                            tcx_1.ctx.globalAlpha = 0.2;
                            tcx_1.ctx.fillRect(pos.x + mpPercent * size.x, pos.y, (1 - mpPercent) * size.x, size.y);
                            tcx_1.ctx.globalAlpha = 1;
                            let mpPreview = exports.previewMana.get(entity);
                            if (mpPreview != null) {
                                let overlayStartPercent = 0;
                                let overlayEndPercent = 0;
                                if (mpPreview < 0) {
                                    tcx_1.ctx.fillStyle = "red";
                                    overlayStartPercent = mpPercent;
                                    overlayEndPercent = math_1.clamp((entity.mp - mpPreview) / entity.maxMp, 0, 1);
                                }
                                else {
                                    tcx_1.ctx.fillStyle = "blue";
                                    overlayStartPercent = math_1.clamp(mpPreview / entity.maxMp, 0, 1);
                                    overlayEndPercent = mpPercent;
                                }
                                tcx_1.ctx.globalAlpha = math_1.mix(0.6, 1, (Math.cos(tcx_1.gNow * Math.PI * 2) + 1) / 2);
                                tcx_1.ctx.fillRect(pos.x + overlayStartPercent * size.x, pos.y, (overlayEndPercent - overlayStartPercent) * size.x, size.y);
                                tcx_1.ctx.globalAlpha = 1;
                            }
                        }
                    }
                ]);
                if (isFocused) {
                    tabLayout = new tcx_1.CursorLayout(tabLayout, this.submenu == null);
                }
                else if (exports.cursorEntities.has(entity)) {
                    tabLayout = new tcx_1.CursorLayout(tabLayout, true);
                }
                // tabLayout = new Layout.MaxSize(tabLayout, new Vector(250, 1000));
                tabLayout = new Layout.Background(new Layout.Border(tabLayout, [5, 5, 5, 5], null), isFocused ? focusedBackground : "rgba(200, 200, 200, 1)");
                tabLayout = new Layout.MaxSize(tabLayout, new math_1.Vector(250, 1000));
                tabsLayoutEntries.push(tabLayout);
            }
            let tabsLayout = Layout.horizontal(tabsLayoutEntries.concat([new Layout.Empty(new math_1.Vector(0, 0))]));
            // Combined
            let layout = Layout.vertical([tabsLayout, innerLayout]);
            return layout;
        }
    }
    class MenuTargetEntity {
        constructor(targetFilter) {
            this.targetFilter = targetFilter;
            let targetEntityPool = tcx_1.entities.filter(e => e.isInCombat).filter(this.targetFilter);
            this.targetEntity = targetEntityPool.find(e => e === exports.lastTargetedEnemy) || targetEntityPool[0];
        }
        update(inputs) {
            let targetEntityPool = tcx_1.entities.filter(e => e.isInCombat).filter(this.targetFilter);
            if (targetEntityPool.length === 0) {
                this.targetEntity = null;
                return tcx_1.MenuUpdateResult.Canceled;
            }
            if (this.targetEntity == null || targetEntityPool.indexOf(this.targetEntity) === -1) {
                if (targetEntityPool.length === 0) {
                    return tcx_1.MenuUpdateResult.Canceled;
                }
                this.targetEntity = targetEntityPool[0];
                exports.lastTargetedEnemy = this.targetEntity;
            }
            while (inputs.length > 0) {
                let input = inputs.shift();
                if (input === "left" || input === "right") {
                    let dir = input === "left" ? -1 : 1;
                    targetEntityPool.sort((a, b) => a.position.x - b.position.x);
                    let index = targetEntityPool.indexOf(this.targetEntity);
                    this.targetEntity = targetEntityPool[math_1.mod(index + dir, targetEntityPool.length)];
                    exports.lastTargetedEnemy = this.targetEntity;
                    tcx_1.playSound("sound/curshoriz.wav");
                }
                else if (input === "up" || input === "down") {
                    let dir = input === "up" ? -1 : 1;
                    targetEntityPool.sort((a, b) => a.position.y - b.position.y);
                    let index = targetEntityPool.indexOf(this.targetEntity);
                    this.targetEntity = targetEntityPool[math_1.mod(index + dir, targetEntityPool.length)];
                    exports.lastTargetedEnemy = this.targetEntity;
                    tcx_1.playSound("sound/curshoriz.wav");
                }
                else if (input === "back") {
                    tcx_1.playSound("sound/curshoriz.wav");
                    return tcx_1.MenuUpdateResult.Canceled;
                }
                else if (input === "select") {
                    tcx_1.playSound("sound/cursverti.wav");
                    return tcx_1.MenuUpdateResult.Finished;
                }
            }
            return tcx_1.MenuUpdateResult.StillActive;
        }
    }
    function targetEntityMenu(i) {
        let target = new MenuTargetEntity(i.filter);
        return {
            update(inputs) {
                let r = target.update(inputs);
                if (r === tcx_1.MenuUpdateResult.Finished) {
                    i.select(target.targetEntity);
                    return tcx_1.MenuUpdateResult.Finished;
                }
                return r;
            },
            layout() {
                if (target.targetEntity != null) {
                    return i.preview(target.targetEntity);
                }
                return null;
            },
        };
    }
    exports.targetEntityMenu = targetEntityMenu;
    class MenuTargetPoint {
        constructor(startingPoint) {
            exports.gamepadCursor = tcx_1.worldToWindow(startingPoint);
            this.targetPoint = tcx_1.windowToWorld(exports.gamepadCursor);
        }
        update(inputs) {
            this.targetPoint = tcx_1.windowToWorld(exports.gamepadCursor);
            while (inputs.length > 0) {
                let input = inputs.shift();
                if (input === "back") {
                    tcx_1.playSound("sound/curshoriz.wav");
                    return tcx_1.MenuUpdateResult.Canceled;
                }
                else if (input === "select") {
                    tcx_1.playSound("sound/cursverti.wav");
                    return tcx_1.MenuUpdateResult.Finished;
                }
            }
            return tcx_1.MenuUpdateResult.StillActive;
        }
    }
    function targetPointMenu(startingPoint, i) {
        let target = new MenuTargetPoint(startingPoint);
        return {
            update(inputs) {
                let r = target.update(inputs);
                if (r === tcx_1.MenuUpdateResult.Finished) {
                    i.select(target.targetPoint);
                    return tcx_1.MenuUpdateResult.Finished;
                }
                return r;
            },
            layout() {
                exports.showGamepadCursor = true;
                if (target.targetPoint != null) {
                    return i.preview(target.targetPoint);
                }
                return null;
            },
        };
    }
    exports.targetPointMenu = targetPointMenu;
    function livingEntities() {
        return tcx_1.entities.filter(e => e.hp > 0 && e.isInCombat);
    }
    exports.livingEntities = livingEntities;
    function* advanceTime(timeToElapse) {
        let entitiesToAdvance = livingEntities();
        let storedInitialTimes = livingEntities().map(e => [e, e.timeToTurn]);
        let timeStepped = 0;
        yield* tcx_1.overTime(0.125, deltaD => {
            let timeStep = timeToElapse * deltaD;
            timeStepped += timeStep;
            for (let entity of entitiesToAdvance) {
                entity.timeToTurn = Math.max(entity.timeToTurn - timeStep, 0);
            }
        });
        storedInitialTimes.forEach(([e, t]) => e.timeToTurn = Math.max(t - timeToElapse, 0.0));
    }
    function* logicBattle() {
        let previouslyReadyEntities = new Set();
        main: while (true) {
            let readyEntities = livingEntities().filter(e => e.timeToTurn === 0);
            for (let entity of readyEntities) {
                if (!previouslyReadyEntities.has(entity)) {
                    let old = entity.mp;
                    entity.mp = Math.min(entity.mp + entity.rateMp, entity.maxMp);
                    let diff = entity.mp - old;
                    if (!entity.isEnemy) {
                        if (diff !== 0) {
                            tcx_1.effects.push(tcx_1.floatingTextEffect(diff.toFixed(0), entity.position, new math_1.Vector(0, -50), [53, 188, 255], 0.5));
                        }
                        tcx_1.playSound("sound/ready.wav");
                    }
                }
            }
            previouslyReadyEntities.clear();
            for (let entity of readyEntities) {
                previouslyReadyEntities.add(entity);
            }
            if (readyEntities.length === 0) {
                let nextEntity = livingEntities().reduce((a, b) => a.timeToTurn < b.timeToTurn ? a : b);
                yield* advanceTime(nextEntity.timeToTurn);
                continue;
            }
            let readyEnemies = readyEntities.filter(e => e.isEnemy);
            if (readyEnemies.length > 0) {
                let enemy = readyEnemies[0];
                let actionPool = enemy.actions.filter(action => action.cost == null || action.cost <= enemy.mp);
                let action = actionPool.length > 0 ? math_1.choose(actionPool) : Techs.ActionFailToAct;
                exports.combatIsInAction = true;
                yield* action.ai(enemy);
                exports.combatIsInAction = false;
            }
            else {
                // Do player turn whenever they want
                waitingOnPlayer: while (true) {
                    for (let [entity, order] of exports.queuedCommands) {
                        if (entity.hp > 0 && !entity.isEnemy && entity.timeToTurn === 0) {
                            exports.queuedCommands.delete(entity);
                            exports.combatIsInAction = true;
                            yield* order[0];
                            exports.combatIsInAction = false;
                            break waitingOnPlayer;
                        }
                    }
                    if (exports.wantWait) {
                        let pendingEntities = livingEntities().filter(e => e.timeToTurn > 0);
                        if (pendingEntities.length > 0) {
                            let nextEntity = pendingEntities.reduce((a, b) => a.timeToTurn < b.timeToTurn ? a : b);
                            let allyPending = pendingEntities.filter(e => e.timeToTurn === nextEntity.timeToTurn).some(e => !e.isEnemy);
                            let timeToSkip = Math.min(nextEntity.timeToTurn, tcx_1.deltaTime * 2); // This is the only constant involving time here, makes it not so relative
                            for (let entity of livingEntities()) {
                                entity.timeToTurn = Math.max(entity.timeToTurn - timeToSkip, 0.0);
                            }
                            if (nextEntity.timeToTurn === 0) {
                                if (allyPending) {
                                    exports.wantWait = false;
                                }
                                continue main;
                            }
                        }
                    }
                    yield;
                }
            }
            // Clean up dead entities
            let deadEnemies = tcx_1.entities.filter(e => e.hp <= 0 && e.isEnemy);
            for (let e of deadEnemies) {
                // Play death animation
                let startRadius = e.radius;
                yield* tcx_1.overTime(0.1, () => { });
                tcx_1.playSound("sound/enemydie.wav");
                yield* tcx_1.overTime(0.3, (_, t) => {
                    e.radius = Math.max(0, startRadius * (1 - t));
                });
            }
            tcx_1.setEntities(tcx_1.entities.filter(e => deadEnemies.indexOf(e) === -1));
            if (livingEntities().filter(e => e.isEnemy).length === 0) {
                return true;
            }
            if (livingEntities().filter(e => !e.isEnemy).length === 0) {
                return false;
            }
            yield* logicWait(0.080);
        }
    }
    function* logicWait(durationInSeconds) {
        yield* tcx_1.overTime(durationInSeconds, () => { });
    }
    function* showCombatDialog(message, point) {
        yield* tcx_1.overTime(message.length / 60, (_, t) => {
            exports.combatDialog = [message, math_1.clamp(t, 0, 1), point];
        });
        yield* tcx_1.overTime(0.5, () => exports.combatDialog = [message, 1, point]);
    }
    exports.showCombatDialog = showCombatDialog;
    function* gameBattle(bounds) {
        function drawBattleMenus(menusLayout) {
            let scale = tcx_1.getWindowScale();
            let width = tcx_1.canvas.width * scale;
            let height = tcx_1.canvas.height * scale;
            tcx_1.ctx.save();
            tcx_1.ctx.scale(1 / scale, 1 / scale);
            if (exports.combatDialog != null) {
                let font = [36, tcx_1.UI_FONT];
                tcx_1.ctx.font = font[0] + "px " + font[1];
                let textMinSize = new math_1.Vector(tcx_1.ctx.measureText(exports.combatDialog[0]).width, font[0]);
                let message = exports.combatDialog[0].substr(0, Math.floor(exports.combatDialog[1] * exports.combatDialog[0].length));
                let layout = new Layout.Background(new Layout.Border(new Layout.MinSize(new Layout.Text(message, font, "black"), textMinSize), [12, 12, 12, 12], null), "rgba(255, 255, 255, 1)");
                let layoutSize = layout.getSize();
                let viewSize = new math_1.Vector(tcx_1.canvas.width, tcx_1.canvas.height).muls(scale);
                let center = viewSize.divs(2);
                let offset = tcx_1.cameraFocus.sub(center);
                let layoutPos = exports.combatDialog[2].sub(offset).add(new math_1.Vector(-layoutSize.x / 2, -100));
                layoutPos = layoutPos.clamp(new math_1.Vector(0, 0), viewSize.sub(layoutSize));
                layout.draw(layoutPos, layoutSize);
            }
            let menusSize = menusLayout.getSize();
            let menusPos = new math_1.Vector(Math.floor((width - menusSize.x) / 2), height - 20 - menusSize.y);
            menusLayout.draw(menusPos, menusSize);
            let timelineWidth = menusSize.x;
            drawTimeline(Math.floor((width - timelineWidth) / 2), menusPos.y - 50, timelineWidth);
            tcx_1.ctx.restore();
            if (exports.showGamepadCursor) {
                tcx_1.ctx.fillStyle = "black";
                tcx_1.ctx.fillRect(exports.gamepadCursor.x - 3, exports.gamepadCursor.y, 6, 1);
                tcx_1.ctx.fillRect(exports.gamepadCursor.x, exports.gamepadCursor.y - 3, 1, 6);
            }
        }
        tcx_1.bgm.onended = evt => {
            if (exports.inBattle) {
                tcx_1.bgm.src = "music/battle/" + math_1.choose(exports.bgms);
                tcx_1.bgm.play();
            }
        };
        exports.combatIsInAction = false;
        exports.inBattle = true;
        exports.battleBounds = bounds;
        let oldCameraFocus = tcx_1.cameraFocus;
        let newCameraFocus = exports.battleBounds.min.mix(exports.battleBounds.max, 0.5).add(new math_1.Vector(0, 170));
        exports.showBattleBounds = true;
        tcx_1.bgm.src = "music/battle/" + math_1.choose(exports.bgms);
        tcx_1.bgm.play();
        yield* tcx_1.overTime(0.3, (_, t) => {
            tcx_1.setCameraFocus(oldCameraFocus.mix(newCameraFocus, t));
            tcx_1.draw();
        });
        for (let entity of tcx_1.entities) {
            entity.timeToTurn = entity.baseStaminaCost;
            entity.hp = tcx_1.getEntityFatiguedMaxHealth(entity);
            entity.mp = entity.startingMp;
        }
        exports.queuedCommands.clear();
        let menuRoot = new RootMenu();
        let logic = logicBattle();
        while (true) {
            menuRoot.update(tcx_1.menuInputs);
            exports.combatDialog = null;
            let r = logic.next();
            exports.previewPosition.clear();
            exports.cursorEntities.clear();
            exports.showGamepadCursor = false;
            exports.drawTargetArea = null;
            exports.previewMana.clear();
            exports.previewHealth.clear();
            exports.previewTimeToTurnOverrides.clear();
            let menusLayout = menuRoot.layout();
            window['dbgLastLayout'] = menusLayout;
            tcx_1.draw();
            drawBattleMenus(menusLayout);
            if (r.done) {
                exports.previewPosition.clear();
                exports.cursorEntities.clear();
                exports.showBattleBounds = false;
                exports.drawTargetArea = null;
                exports.inBattle = false;
                tcx_1.entities.forEach(e => e.isInCombat = false);
                if (r.value) {
                    tcx_1.bgm.src = "music/fanfare/" + math_1.choose(exports.fanfares);
                    tcx_1.bgm.play();
                }
                return r.value;
            }
            yield;
        }
    }
    exports.gameBattle = gameBattle;
});
//# sourceMappingURL=combat.js.map
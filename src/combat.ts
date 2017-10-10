import {inventory, setEntities, floatingTextEffect, menuInputs, cameraFocus, setCameraFocus, draw, bgm, deltaTime, effects, canvas, getWindowScale, gNow, ctx, entities, zip, overTime, drawLine, drawShape, Entity, ImmediateMenu, ListMenu, ListMenuEntry, UI_FONT, playSound, MenuUpdateResult, getEntityFatiguedMaxHealth, CursorLayout, worldToWindow, windowToWorld} from "tcx";
import {Action, ComboTech, Command, getPairings, getPairing, getComboTechs} from "techs";
import * as Techs from "techs";
import * as Layout from "layout";
import {Vector, mix, mod, clamp, choose} from "math";
import {BoundingBox} from "collision";

export let gamepadCursor = new Vector(0, 0); // [-1, 1]
export let previewMana = new Map<Entity, number>();
export let previewHealth = new Map<Entity, number>();
export let previewTimeToTurnOverrides = new Map<Entity, number>();
export let previewPosition = new Map<Entity, Vector>();
export let cursorEntities = new Set<Entity>();
export let queuedCommands: Map<Entity, Command> = new Map();
export let lastTargetedEnemy: Entity | null = null;
export let combatDialog: [string, number, Vector]|null = null;
export let combatIsInAction = false;
export let timelineDuration = 5;
export let showGamepadCursor = false;
export let globalBuddyToggle = 0;
export let showBattleBounds = false;
export let drawTargetArea: (() => void)|null = null;
export let battleBounds: BoundingBox = { min: new Vector(-400, 0), max: new Vector(600, 600) };
export let wantWait = false;
export let inBattle = false;

export let bgms = [""];

export let fanfares = [""];

export function setWantWait(b: boolean) {
    wantWait = b;
}
export function setDrawTargetArea(f: typeof drawTargetArea) {
    drawTargetArea = f;
}
export function setGamepadCursor(p: Vector) {
    gamepadCursor = p;
}
export function setTimelineDuration(d: number) {
    timelineDuration = d;
}
export function incGlobalBuddyToggle() {
    globalBuddyToggle += 1;
}

let previewTimeToTurnTs = new WeakMap<Entity, number>();
function getPreviewTimeToTurn(e: Entity) {
    let timeToTurnOverride = previewTimeToTurnOverrides.get(e);
    if (timeToTurnOverride != null) {
        if (!previewTimeToTurnTs.has(e)) {
            previewTimeToTurnTs.set(e, gNow);
        }
        let t = Math.min(gNow - previewTimeToTurnTs.get(e)!, 0.25) / 0.25;
        return mix(e.timeToTurn, Math.max(0, timeToTurnOverride), t);
    } else {
        previewTimeToTurnTs.delete(e);
        return e.timeToTurn;
    }
}

function drawTimelineCursor(x: number, y: number, up: boolean, active: boolean) {
    if (!active) { ctx.globalAlpha = 0.2; }
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let d = up ? -1 : 1;
    ctx.lineTo(x - 4, y + 10 * d);
    ctx.lineTo(x + 4, y + 10 * d);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!active) { ctx.globalAlpha = 1; }
}

function drawTimeline(x: number, y: number, w: number) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    for (let t = 0; t < timelineDuration; t += 1) {
        let tickX = x + t / timelineDuration * w;
        drawLine(tickX, y - 5, tickX, y + 5);
    }

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    drawLine(x, y, x + w, y);

    ctx.lineWidth = 4;

    // Put drawing functions in here so they can be sorted to draw in turn order
    let drawFuncs: [number, {(): void}][] = []; // Writing the type as `[number, () => void][]` works but breaks syntax highlighting for the remainder of the file
    let timelineCursors: [Vector, boolean, boolean][] = [];

    for (let entityLetBug of entities.filter(e => e.isInCombat)) {
        let entity = entityLetBug;
        // Is it absurd that if you destructure in the `for (let HERE of whatever)` it's not block scoped?
        // Seems to be a firefox bug, chrome doesn't need this to be inside the body
        let {shape, radius, color, baseStaminaCost, isEnemy} = entity;

        let d = isEnemy? -1 : 1;

        let isFirstTurn = true;
        for (let f = getPreviewTimeToTurn(entity); f <= timelineDuration; f += baseStaminaCost) {
            let sx = x + f / timelineDuration * w;
            let sy = y + 20 * d;
            if (cursorEntities.has(entity)) {
                timelineCursors.push([new Vector(sx, sy + 15 * d), isEnemy, isFirstTurn]);
            }
            drawFuncs.push([sx, () => {
                if (!entity.isEnemy && entity.hp <= 0) {
                    ctx.globalAlpha = 0.2;
                }
                ctx.lineWidth = 2;
                drawShape(sx, sy, shape, color, Math.min(10, radius));
                ctx.lineWidth = 2;
                ctx.strokeStyle = color;
                drawLine(sx, y + 10 * d, sx, y);
                ctx.globalAlpha = 1.0;
            }]);
            isFirstTurn = false;
        }
        let previewTime = getPreviewTimeToTurn(entity);
        if (previewTime !== entity.timeToTurn) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            // ctx.globalAlpha = 0.5;
            let start = entity.timeToTurn / timelineDuration * w;
            let end = previewTime / timelineDuration * w;
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
                if (previewTime > entity.timeToTurn) { start = w + 1; }
                else { end = w + 1; }
            }
            ctx.globalAlpha = 0.2;
            if (start <= w) {
                drawLine(x + start, y + 30 * d, x + start, y + 40 * d);
            }
            drawLine(x + start, y + 40 * d, x + end, y + 40 * d);
            if (end <= w && !cursorEntities.has(entity)) {
                drawLine(x + end, y + 40 * d, x + end, y + 30 * d);
            }
            // drawArrow(new Vector(x + start, y - 20), new Vector(x + end, y - 20), 10);
            ctx.globalAlpha = 1;
        }
    }

    drawFuncs.sort((a, b) => b[0] - a[0]).forEach(([_, f]) => f());
    timelineCursors.forEach(([v, up, active]) => drawTimelineCursor(v.x, v.y, up, active));
}

function isEntityActionReady(entity: Entity, action: Action) {
    return entity.timeToTurn === 0 && (action.cost == null || action.cost <= entity.mp);
}
function isEntityComboTechReady(entity: Entity, tech: ComboTech) {
    for (let es of getPairings(entity, tech.actions)) {
        if (es.every((e, i) => isEntityActionReady(e, tech.actions[i]))) {
            return true;
        }
    }
    return false;
}

function compareKeys<K>(a: K[], b: K[]): number {
    for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}

function lowerManaCost(e: Entity, d: ComboTech) {
    let lowestCost = Infinity;
    for (let es of getPairings(e, d.actions)) {
        let cost = d.actions[es.indexOf(e)].cost || 0;
        lowestCost = Math.min(cost, lowestCost);
    }
    return lowestCost;
}

class ComboMenu implements ImmediateMenu {
    listMenu: ListMenu;
    constructor(public entity: Entity) {
        this.listMenu = new ListMenu();
    }
    listEntries(): ListMenuEntry[] {
        return getComboTechs(this.entity)
            .sort((a, b) => compareKeys([lowerManaCost(this.entity, a), a.name], [lowerManaCost(this.entity, b), b.name]))
            .map(t => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name, [48, UI_FONT], isEntityComboTechReady(this.entity, t) ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        let pair = getPairing(this.entity, t.actions);
                        if (pair != null) {
                            for (let [e, a] of zip(pair, t.actions)) {
                                cursorEntities.add(e);
                                previewMana.set(e, e.mp - (a.cost || 0));
                            }
                        }
                    },
                };
            });
    }
    update(inputs: string[]) {
        return this.listMenu.update(inputs, this.listEntries());
    }
    layout() {
        return this.listMenu.layout(this.listEntries());
    }
}

function getSpecialAbilities(): Action[] {
    return [Techs.ActionAttack, Techs.ActionMove, Techs.ActionMeditate, Techs.ActionSpy];
}

class AbilityMenu implements ImmediateMenu {
    listMenu: ListMenu;
    constructor(public entity: Entity) {
        this.listMenu = new ListMenu();
    }
    listEntries(): ListMenuEntry[] {
        return this.entity.actions
            .filter(a => getSpecialAbilities().indexOf(a) === -1)
            .sort((a, b) => compareKeys([a.cost || 0, a.name], [b.cost || 0, b.name]))
            .map(t => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name, [48, UI_FONT], isEntityActionReady(this.entity, t) ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        if (t.cost != null) {
                            previewMana.set(this.entity, this.entity.mp - t.cost);
                        }
                        cursorEntities.add(this.entity);
                    },
                };
            });
    }
    update(inputs: string[]) {
        return this.listMenu.update(inputs, this.listEntries());
    }
    layout() {
        return this.listMenu.layout(this.listEntries());
    }
}

class InventoryMenu implements ImmediateMenu {
    listMenu: ListMenu;
    constructor(public entity: Entity) {
        this.listMenu = new ListMenu();
    }
    listEntries(): ListMenuEntry[] {
        return Array.from(inventory)
            .map(([t, amount]) => {
                return {
                    layout: () => {
                        return new Layout.Text(t.name + " x" + amount, [48, UI_FONT], this.entity.timeToTurn === 0 ? "black" : "#999");
                    },
                    menu: () => {
                        return t.menu(this.entity);
                    },
                    hover: () => {
                        cursorEntities.add(this.entity);
                    },
                };
            });
    }
    update(inputs: string[]) {
        return this.listMenu.update(inputs, this.listEntries());
    }
    layout() {
        return this.listMenu.layout(this.listEntries());
    }
}

class EntityMenu implements ImmediateMenu {
    listMenu: ListMenu;
    constructor(public entity: Entity) {
        this.listMenu = new ListMenu();
    }
    listEntries(): ListMenuEntry[] {
        let comboTechs = getComboTechs(this.entity);
        let font: [number, string] = [48, UI_FONT];
        let entries = [Techs.ActionAttack, Techs.ActionMove].map(action => {
            return {
                layout: () => {
                    return new Layout.Text(action.name, font, isEntityActionReady(this.entity, action) ? "black" : "#999");
                },
                menu: () => action.menu(this.entity),
                hover: () => { cursorEntities.add(this.entity); }
            };
        });
        entries.push({
            layout: () => {
                return new Layout.Text("Ability", font, this.entity.actions
                    .filter(a => getSpecialAbilities().indexOf(a) === -1)
                    .some(a => isEntityActionReady(this.entity, a)) ? "black" : "#999");
            },
            menu: () => new AbilityMenu(this.entity),
            hover: () => { cursorEntities.add(this.entity); }
        });
        entries.push({
            layout: () => {
                return new Layout.Text("Items", font, inventory.size > 0 ? "black" : "#999");
            },
            menu: () => new InventoryMenu(this.entity),
            hover: () => { cursorEntities.add(this.entity); }
        });
        entries.push({
            layout: () => {
                return new Layout.Text("Combo", font, comboTechs.some(tech => isEntityComboTechReady(this.entity, tech)) ? "black" : "#999");
            },
            menu: () => new ComboMenu(this.entity),
            hover: () => { cursorEntities.add(this.entity); }
        });
        getSpecialAbilities().filter(a => a !== Techs.ActionAttack && a !== Techs.ActionMove).filter(action => this.entity.actions.indexOf(action) !== -1).map(action => {
            return {
                layout: () => {
                    return new Layout.Text(action.name, font, isEntityActionReady(this.entity, action) ? "black" : "#999");
                },
                menu: () => action.menu(this.entity),
                hover: () => { cursorEntities.add(this.entity); }
            };
        }).forEach(e => entries.push(e));
        return entries;
    }
    update(inputs: string[]) {
        return this.listMenu.update(inputs, this.listEntries());
    }
    layout() {
        return this.listMenu.layout(this.listEntries());
    }
}

class RootMenu implements ImmediateMenu {
    selectedEntity: Entity | null;
    submenu: EntityMenu | null;
    constructor() {
        this.selectedEntity = null;
        this.submenu = null;
    }
    update(inputs: string[]): MenuUpdateResult {
        let partyEntities = entities.filter(e => !e.isEnemy);

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
                if (r !== MenuUpdateResult.StillActive) {
                    this.submenu = null;
                }
            } else if (inputs.length > 0) {
                let input = inputs.shift();
                if (input === "select") {
                    if (this.selectedEntity.hp <= 0) {
                        playSound("sound/Invalid cursor selection.wav");
                    } else {
                        playSound("sound/cursverti.wav");
                        this.submenu = new EntityMenu(this.selectedEntity);
                    }
                } else if (input === "left") {
                    playSound("sound/curshoriz.wav");
                    let index: number = partyEntities.indexOf(this.selectedEntity);
                    this.selectedEntity = partyEntities[mod(index - 1, partyEntities.length)];
                } else if (input === "right") {
                    playSound("sound/curshoriz.wav");
                    let index: number = partyEntities.indexOf(this.selectedEntity);
                    this.selectedEntity = partyEntities[mod(index + 1, partyEntities.length)];
                } else if (input === "back") {
                    playSound("sound/curshoriz.wav");
                    queuedCommands.delete(this.selectedEntity);
                }
            }
        } while (inputs.length > 0);
        return MenuUpdateResult.StillActive;
    }
    layout(): Layout.Layout {
        let partyEntities = entities.filter(e => !e.isEnemy);
        let font: [number, string] = [48, UI_FONT];
        let focusedBackground = "rgba(255, 255, 255, 1)";

        // Inner
        let innerLayout: Layout.Layout;
        if (this.submenu != null) {
            innerLayout = this.submenu.layout() || new Layout.Empty(new Vector(0, 0));
        } else if (this.selectedEntity != null) {
            cursorEntities.add(this.selectedEntity);
            // Layout entity stats
            innerLayout = Layout.vertical([
                new Layout.Text("Turn in " + this.selectedEntity.timeToTurn.toFixed(1), font, "#999"),
                Layout.columns([Layout.vertical([
                    // new Layout.Text(queuedCommand == null ? "Nothing" : queuedCommand[1], font, "#999"),
                    new Layout.Text("Speed " + (10 / this.selectedEntity.baseStaminaCost).toFixed(1) + " (" + this.selectedEntity.baseStaminaCost.toFixed(2) + ")", [24, UI_FONT], "#999"),
                    new Layout.Text("Fatigue " + this.selectedEntity.fatigue.toFixed(1), [24, UI_FONT], "#999"),
                ]), Layout.vertical([
                    new Layout.Text("Magic " + this.selectedEntity.magicPower.toFixed(0), [24, UI_FONT], "#999"),
                    new Layout.Text("Resistance " + this.selectedEntity.resistance.toFixed(0), [24, UI_FONT], "#999"),
                    new Layout.Text("Affinities " + this.selectedEntity.affinities.map(n => n.toFixed(1)).join(" | "), [24, UI_FONT], "#999"),
                    new Layout.Text("MP/turn " + this.selectedEntity.rateMp.toFixed(0), [24, UI_FONT], "#999"),
                ]), Layout.vertical([
                    new Layout.Text("Attack " + this.selectedEntity.attack.toFixed(0), [24, UI_FONT], "#999"),
                    new Layout.Text("Defense " + this.selectedEntity.defense.toFixed(0), [24, UI_FONT], "#999"),
                    new Layout.Text("Accuracy " + this.selectedEntity.accuracy.toFixed(0), [24, UI_FONT], "#999"),
                    new Layout.Text("Evasion " + this.selectedEntity.evasion.toFixed(0), [24, UI_FONT], "#999"),
                ])])
            ]);
        } else {
            innerLayout = new Layout.Empty(new Vector(0, 0));
        }
        // let innerDetails = globalTooltip || new Layout.Empty(new Vector(0, 0));
        // innerLayout = new Layout.HorizontalWeighted(innerLayout, innerDetails, 0.66);
        innerLayout = new Layout.Background(new Layout.Border(innerLayout, [5, 5, 5, 5], null), focusedBackground);
        innerLayout = new Layout.MinSize(new Layout.MaxSize(innerLayout, new Vector(750, 1000)), new Vector(750, 0));

        // Tabs
        let tabsLayoutEntries: Layout.Layout[] = [];
        for (let entityLetBug of partyEntities) {
            let entity = entityLetBug;
            // Layout tab headers
            let isFocused = this.selectedEntity === entity;
            let isReady = entity.timeToTurn === 0;

            let hpPercent = clamp(entity.hp / entity.maxHp, 0, 1);
            let fatiguePercent = clamp(getEntityFatiguedMaxHealth(entity) / entity.maxHp, 0, 1);
            let previewHpPercent = previewHealth.has(entity) ? clamp(<number>previewHealth.get(entity) / entity.maxHp, 0, fatiguePercent) : null;
            let labelFont: [number, string] = [24, UI_FONT];
            // "rgba(153, 153, 153, 0.5)"
            let hpLabel = Layout.horizontal([
                new Layout.Text(entity.hp.toFixed(0), labelFont, "black"),
                new Layout.Align(new Layout.Text("/" + getEntityFatiguedMaxHealth(entity), [14, UI_FONT], "#999"), 0.0, 1.0),
            ]);
            let mpLabel = Layout.horizontal([
                new Layout.Text(entity.mp.toFixed(0), labelFont, "black"),
                new Layout.Align(new Layout.Text("/" + entity.maxMp, [14, UI_FONT], "#999"), 0.0, 1.0),
            ]);
            // let mpLabel = new Layout.Text(" | " + entity.mp + "/" + entity.maxMp, labelFont, "#999");

            let readinessLabel: Layout.Layout;
            if (entity.hp <= 0.0) {
                readinessLabel = new Layout.Text("KO", labelFont, "#FF3333");
            } else if (isReady) {
                readinessLabel = new Layout.Text("Ready!", labelFont, "#3399FF");
            } else {
                let queuedCommand = queuedCommands.get(entity);
                readinessLabel = new Layout.Text(queuedCommand == null ? "Waiting" : queuedCommand[1], labelFont, "#999");
            }
            let tabLayout = Layout.vertical([
                new Layout.Align(
                    Layout.horizontal([
                        new class {
                            size = 20;
                            getSize() { return new Vector(this.size + 4, this.size + 4); }
                            draw(pos: Vector, size: Vector) {
                                ctx.lineWidth = 4;
                                let drawPos = pos.add(size.muls(0.5));
                                drawShape(drawPos.x, drawPos.y, entity.shape, entity.color, Math.min(size.x - 4, size.y - 4));
                            }
                        },
                        new Layout.Empty(new Vector(5, 0)),
                        new Layout.Text(entity.name, font, "black")
                    ]), 
                    0.5,0
                ),
                // new Layout.Align(readinessLabel, 0.5, 0.5),
                new Layout.Border(Layout.horizontal([hpLabel, new Layout.Empty(new Vector(5, 0)), mpLabel, new Layout.Align(readinessLabel, 1.0, 0.0)]), [3, 3, 3, 3], null),
                <Layout.Layout>{
                    getSize() { return new Vector(250, 10); },
                    draw(pos, size) {
                        ctx.fillStyle = "#ff2c32";
                        ctx.fillRect(pos.x, pos.y, hpPercent * size.x, size.y);
                        ctx.fillStyle = "black";
                        ctx.globalAlpha = 0.2;
                        ctx.fillRect(pos.x + hpPercent * size.x, pos.y, (fatiguePercent - hpPercent) * size.x, size.y);
                        ctx.globalAlpha = 1;
                        if (previewHpPercent != null) {
                            ctx.fillStyle = <number>previewHealth.get(entity) < entity.hp ? "red" : "green";
                            ctx.globalAlpha = mix(0.6, 1, (Math.cos(gNow * Math.PI * 2) + 1) / 2);
                            if (previewHpPercent > hpPercent) {
                                ctx.fillRect(pos.x + hpPercent * size.x, pos.y, (previewHpPercent - hpPercent) * size.x, size.y);
                            } else {
                                ctx.fillRect(pos.x + previewHpPercent * size.x, pos.y, (hpPercent - previewHpPercent) * size.x, size.y);
                            }
                            ctx.globalAlpha = 1;
                        }
                    }
                },
                <Layout.Layout>{
                    getSize() { return new Vector(250, 10); },
                    draw(pos, size) {
                        let mpPercent = clamp(entity.mp / entity.maxMp, 0, 1);
                        ctx.fillStyle = "#35bcff";
                        ctx.fillRect(pos.x, pos.y, mpPercent * size.x, size.y);
                        ctx.fillStyle = "black";
                        ctx.globalAlpha = 0.2;
                        ctx.fillRect(pos.x + mpPercent * size.x, pos.y, (1 - mpPercent) * size.x, size.y);
                        ctx.globalAlpha = 1;
                        let mpPreview = previewMana.get(entity);
                        if (mpPreview != null) {
                            let overlayStartPercent = 0;
                            let overlayEndPercent = 0;
                            if (mpPreview < 0) {
                                ctx.fillStyle =  "red";
                                overlayStartPercent = mpPercent;
                                overlayEndPercent = clamp((entity.mp - mpPreview) / entity.maxMp, 0, 1);
                            } else {
                                ctx.fillStyle = "blue";
                                overlayStartPercent = clamp(mpPreview / entity.maxMp, 0, 1);
                                overlayEndPercent = mpPercent;
                            }
                            ctx.globalAlpha = mix(0.6, 1, (Math.cos(gNow * Math.PI * 2) + 1) / 2);
                            ctx.fillRect(pos.x + overlayStartPercent * size.x, pos.y, (overlayEndPercent - overlayStartPercent) * size.x, size.y);
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            ]);
            if (isFocused) {
                tabLayout = new CursorLayout(tabLayout, this.submenu == null);
            } else if (cursorEntities.has(entity)) {
                tabLayout = new CursorLayout(tabLayout, true);
            }
            // tabLayout = new Layout.MaxSize(tabLayout, new Vector(250, 1000));
            tabLayout = new Layout.Background(
                new Layout.Border(
                    tabLayout
                    , [5, 5, 5, 5]
                    , null
                )
                , isFocused ? focusedBackground : "rgba(200, 200, 200, 1)"
            );
            tabLayout = new Layout.MaxSize(tabLayout, new Vector(250, 1000));
            tabsLayoutEntries.push(tabLayout);
        }
        let tabsLayout = Layout.horizontal(tabsLayoutEntries.concat([new Layout.Empty(new Vector(0, 0))]));

        // Combined
        let layout = Layout.vertical([tabsLayout, innerLayout]);
        return layout;
    }
}

class MenuTargetEntity {
    public targetEntity: Entity | null;
    constructor(public targetFilter: (e: Entity) => boolean) {
        let targetEntityPool = entities.filter(e => e.isInCombat).filter(this.targetFilter);
        this.targetEntity = targetEntityPool.find(e => e === lastTargetedEnemy) || targetEntityPool[0];
    }
    update(inputs: string[]): MenuUpdateResult {
        let targetEntityPool = entities.filter(e => e.isInCombat).filter(this.targetFilter);
        if (targetEntityPool.length === 0) {
            this.targetEntity = null;
            return MenuUpdateResult.Canceled;
        }
        if (this.targetEntity == null || targetEntityPool.indexOf(this.targetEntity) === -1) {
            if (targetEntityPool.length === 0) { return MenuUpdateResult.Canceled; }
            this.targetEntity = targetEntityPool[0];
            lastTargetedEnemy = this.targetEntity;
        }

        while (inputs.length > 0) {
            let input = inputs.shift();
            if (input === "left" || input === "right") {
                let dir = input === "left" ? -1 : 1;
                targetEntityPool.sort((a, b) => a.position.x - b.position.x);
                let index: number = targetEntityPool.indexOf(this.targetEntity);
                this.targetEntity = targetEntityPool[mod(index + dir, targetEntityPool.length)];
                lastTargetedEnemy = this.targetEntity;
                playSound("sound/curshoriz.wav");
            } else if (input === "up" || input === "down") {
                let dir = input === "up" ? -1 : 1;
                targetEntityPool.sort((a, b) => a.position.y - b.position.y);
                let index: number = targetEntityPool.indexOf(this.targetEntity);
                this.targetEntity = targetEntityPool[mod(index + dir, targetEntityPool.length)];
                lastTargetedEnemy = this.targetEntity;
                playSound("sound/curshoriz.wav");
            } else if (input === "back") {
                playSound("sound/curshoriz.wav");
                return MenuUpdateResult.Canceled;
            } else if (input === "select") {
                playSound("sound/cursverti.wav");
                return MenuUpdateResult.Finished;
            }
        }

        return MenuUpdateResult.StillActive;
    }
}

interface TargetEntity {
    filter(e: Entity): boolean;
    preview(e: Entity): Layout.Layout | null;
    select(e: Entity): void;
}

export function targetEntityMenu(i: TargetEntity): ImmediateMenu {
    let target = new MenuTargetEntity(i.filter);
    return {
        update(inputs: string[]) {
            let r = target.update(inputs);
            if (r === MenuUpdateResult.Finished) {
                i.select(<Entity>target.targetEntity);
                return MenuUpdateResult.Finished;
            }
            return r;
        },
        layout() {
            if (target.targetEntity != null) {
                return i.preview(target.targetEntity);
            }
            return null;
        },
    }
}

class MenuTargetPoint {
    public targetPoint: Vector;
    constructor(startingPoint: Vector) {
        gamepadCursor = worldToWindow(startingPoint);
        this.targetPoint = windowToWorld(gamepadCursor);
    }
    update(inputs: string[]): MenuUpdateResult {
        this.targetPoint = windowToWorld(gamepadCursor);
        while (inputs.length > 0) {
            let input = inputs.shift();
            if (input === "back") {
                playSound("sound/curshoriz.wav");
                return MenuUpdateResult.Canceled;
            } else if (input === "select") {
                playSound("sound/cursverti.wav");
                return MenuUpdateResult.Finished;
            }
        }
        return MenuUpdateResult.StillActive;
    }
}

interface TargetPoint {
    preview(v: Vector): Layout.Layout | null;
    select(v: Vector): void;
}

export function targetPointMenu(startingPoint: Vector, i: TargetPoint): ImmediateMenu {
    let target = new MenuTargetPoint(startingPoint);
    return {
        update(inputs: string[]) {
            let r = target.update(inputs);
            if (r === MenuUpdateResult.Finished) {
                i.select(<Vector>target.targetPoint);
                return MenuUpdateResult.Finished;
            }
            return r;
        },
        layout() {
            showGamepadCursor = true;
            if (target.targetPoint != null) {
                return i.preview(target.targetPoint);
            }
            return null;
        },
    }
}

export function livingEntities() {
    return entities.filter(e => e.hp > 0 && e.isInCombat);
}

function* advanceTime(timeToElapse: number) {
    let entitiesToAdvance = livingEntities();
    let storedInitialTimes = livingEntities().map<[Entity, number]>(e => [e, e.timeToTurn]);
    let timeStepped = 0;
    yield* overTime(0.125, deltaD => {
        let timeStep = timeToElapse * deltaD;
        timeStepped += timeStep;
        for (let entity of entitiesToAdvance) {
            entity.timeToTurn = Math.max(entity.timeToTurn - timeStep, 0);
        }
    });
    storedInitialTimes.forEach(([e, t]) => e.timeToTurn = Math.max(t - timeToElapse, 0.0));
}

function* logicBattle() {
    let previouslyReadyEntities = new Set<Entity>();
    main: while (true) {
        let readyEntities = livingEntities().filter(e => e.timeToTurn === 0);

        for (let entity of readyEntities) {
            if (!previouslyReadyEntities.has(entity)) {
                let old = entity.mp;
                entity.mp = Math.min(entity.mp + entity.rateMp, entity.maxMp);
                let diff = entity.mp - old;
                if (!entity.isEnemy) {
                    if (diff !== 0) {
                        effects.push(floatingTextEffect(diff.toFixed(0), entity.position, new Vector(0, -50), [53, 188, 255], 0.5));
                    }
                    playSound("sound/ready.wav");
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
            let action = actionPool.length > 0 ? choose(actionPool) : Techs.ActionFailToAct;
            combatIsInAction = true;
            yield* action.ai(enemy);
            combatIsInAction = false;
        } else {
            // Do player turn whenever they want
            waitingOnPlayer: while (true) {
                for (let [entity, order] of queuedCommands) {
                    if (entity.hp > 0 && !entity.isEnemy && entity.timeToTurn === 0) {
                        queuedCommands.delete(entity);
                        combatIsInAction = true;
                        yield* order[0];
                        combatIsInAction = false;
                        break waitingOnPlayer;
                    }
                }
                if (wantWait) {
                    let pendingEntities = livingEntities().filter(e => e.timeToTurn > 0);
                    if (pendingEntities.length > 0) {
                        let nextEntity = pendingEntities.reduce((a, b) => a.timeToTurn < b.timeToTurn ? a : b);
                        let allyPending = pendingEntities.filter(e => e.timeToTurn === nextEntity.timeToTurn).some(e => !e.isEnemy);
                        let timeToSkip = Math.min(nextEntity.timeToTurn, deltaTime * 2); // This is the only constant involving time here, makes it not so relative
                        for (let entity of livingEntities()) {
                            entity.timeToTurn = Math.max(entity.timeToTurn - timeToSkip, 0.0);
                        }
                        if (nextEntity.timeToTurn === 0) {
                            if (allyPending) {
                                wantWait = false;
                            }
                            continue main;
                        }
                    }
                }
                yield;
            }
        }

        // Clean up dead entities
        let deadEnemies = entities.filter(e => e.hp <= 0 && e.isEnemy);
        for (let e of deadEnemies) {
            // Play death animation
            let startRadius = e.radius;
            yield* overTime(0.1, () => {});
            playSound("sound/enemydie.wav");
            yield* overTime(0.3, (_, t) => {
                e.radius = Math.max(0, startRadius * (1 - t));
            });
        }
        setEntities(entities.filter(e => deadEnemies.indexOf(e) === -1));
        if (livingEntities().filter(e => e.isEnemy).length === 0) {
            return true;
        }
        if (livingEntities().filter(e => !e.isEnemy).length === 0) {
            return false;
        }
        yield* logicWait(0.080);
    }
}

function* logicWait(durationInSeconds: number) {
    yield* overTime(durationInSeconds, () => {});
}

export function* showCombatDialog(message: string, point: Vector): IterableIterator<any> {
    yield *overTime(message.length / 60, (_, t) => {
        combatDialog = [message, clamp(t, 0, 1), point];
    });
    yield *overTime(0.5, () => combatDialog = [message, 1, point]);
}

export function* gameBattle(bounds: BoundingBox): IterableIterator<any> {
    function drawBattleMenus(menusLayout: Layout.Layout) {
        let scale = getWindowScale();
        let width = canvas.width * scale;
        let height = canvas.height * scale;
        ctx.save();
        ctx.scale(1 / scale, 1 / scale);

        if (combatDialog != null) {
            let font: [number, string] = [36, UI_FONT];
            ctx.font = font[0] + "px " + font[1];
            let textMinSize = new Vector(ctx.measureText(combatDialog[0]).width, font[0]);
            let message = combatDialog[0].substr(0, Math.floor(combatDialog[1] * combatDialog[0].length));

            let layout = new Layout.Background(new Layout.Border(new Layout.MinSize(new Layout.Text(message, font, "black"), textMinSize), [12, 12, 12, 12], null), "rgba(255, 255, 255, 1)");
            let layoutSize = layout.getSize();

            let viewSize = new Vector(canvas.width, canvas.height).muls(scale);
            let center = viewSize.divs(2);
            let offset = cameraFocus.sub(center);

            let layoutPos = combatDialog[2].sub(offset).add(new Vector(-layoutSize.x / 2, -100));
            layoutPos = layoutPos.clamp(new Vector(0, 0), viewSize.sub(layoutSize));

            layout.draw(layoutPos, layoutSize);
        }

        let menusSize = menusLayout.getSize();
        let menusPos = new Vector(Math.floor((width - menusSize.x) / 2), height - 20 - menusSize.y);
        menusLayout.draw(menusPos, menusSize);

        let timelineWidth = menusSize.x;
        drawTimeline(Math.floor((width - timelineWidth) / 2), menusPos.y - 50, timelineWidth);

        ctx.restore();

        if (showGamepadCursor) {
            ctx.fillStyle = "black";
            ctx.fillRect(gamepadCursor.x - 3, gamepadCursor.y, 6, 1);
            ctx.fillRect(gamepadCursor.x, gamepadCursor.y - 3, 1, 6);
        }
    }

    bgm.onended = evt => {
        if (inBattle) {
            bgm.src = "music/battle/" + choose(bgms);
            bgm.play();
        }
    };

    combatIsInAction = false;
    inBattle = true;
    battleBounds = bounds;
    let oldCameraFocus = cameraFocus;
    let newCameraFocus = battleBounds.min.mix(battleBounds.max, 0.5).add(new Vector(0, 170));
    showBattleBounds = true;
    bgm.src = "music/battle/" + choose(bgms);
    bgm.play();
    yield* overTime(0.3, (_, t) => {
        setCameraFocus(oldCameraFocus.mix(newCameraFocus, t));
        draw();
    });

    for (let entity of entities) {
        entity.timeToTurn = entity.baseStaminaCost;
        entity.hp = getEntityFatiguedMaxHealth(entity);
        entity.mp = entity.startingMp;
    }
    queuedCommands.clear();

    let menuRoot = new RootMenu();

    let logic = logicBattle();
    while (true) {
        menuRoot.update(menuInputs);
        combatDialog = null;
        let r = logic.next();

        previewPosition.clear();
        cursorEntities.clear();
        showGamepadCursor = false;
        drawTargetArea = null;
        previewMana.clear();
        previewHealth.clear();
        previewTimeToTurnOverrides.clear();

        let menusLayout = menuRoot.layout();
        (<any>window)['dbgLastLayout'] = menusLayout;

        draw();
        drawBattleMenus(menusLayout);

        if (r.done) {
            previewPosition.clear();
            cursorEntities.clear();
            showBattleBounds = false;
            drawTargetArea = null;
            inBattle = false;
            entities.forEach(e => e.isInCombat = false);
            if (r.value) {
                bgm.src = "music/fanfare/" + choose(fanfares);
                bgm.play();
            }
            return r.value;
        }
        yield;
    }
}
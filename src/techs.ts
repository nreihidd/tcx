import {MagicElement, drawLinev, levelPolygons, cameraShake, entities, getEntityFatiguedMaxHealth, floatingTextEffect, gNow, ctx, effects, zip, Entity, ImmediateMenu, UI_FONT, TOOLTIP_COLOR, playSound, overTime, nOverTime, pointsWithinDistance} from "tcx";
import * as Layout from "layout";
import {Polygon} from "collision";
import * as collision from "collision";
import {Vector, choose, clamp, mix, mod} from "math";
import {setDrawTargetArea, showCombatDialog, globalBuddyToggle, battleBounds, combatDialog, livingEntities, targetPointMenu, targetEntityMenu, previewHealth, previewMana, previewPosition, previewTimeToTurnOverrides, cursorEntities, queuedCommands} from "combat";
import {particles, Particle} from "particles";

export let comboTechs: ComboTech[] = [];

//==========
// Actions

export type Command = [IterableIterator<any>, string];

export interface Action {
    menu(entity: Entity): ImmediateMenu;
    ai(entity: Entity): IterableIterator<any>;
    name: string;
    cost?: number;
}

function* zipGenerators(generators: IterableIterator<any>[]): IterableIterator<undefined> {
    while (true) {
        generators = generators.filter(gen => !gen.next().done);
        if (generators.length === 0) {
            break;
        }
        yield;
    }
}

function costMp(entity: Entity, amount: number): boolean {
    if (entity.mp < amount) return false;
    entity.mp -= amount;
    return true;
}

function drawTargetCircle(position: Vector, radius: number) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "red";
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = gNow * 10;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
}

export function drawRing(color: string, width: number, center: Vector, radius: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();
}

function genericTooltip(entity: Entity, action: Action, description: string, someExtraLineOfSomething: string): Layout.Layout {
    let cost = action.cost || 0;
    return Layout.vertical([
        new Layout.Text(action.name, [48, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(description, [24, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text("x1 Stamina", [24, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(cost + " MP (" + entity.mp + "→" + (entity.mp - cost) + ")", [24, UI_FONT], entity.mp >= cost ? TOOLTIP_COLOR : "red"),
        new Layout.Text(someExtraLineOfSomething, [24, UI_FONT], TOOLTIP_COLOR),
    ]);
}
function genericComboTooltip(entities: Entity[], combo: ComboTech, description: string): Layout.Layout {
    return Layout.vertical([
        new Layout.Text(combo.name, [48, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(description, [24, UI_FONT], TOOLTIP_COLOR),
        Layout.columns(Array.from(zip(entities, combo.actions)).map(([entity, action]) => {
            let cost = action.cost || 0;
            return Layout.vertical([
                new Layout.Text(entity.name, [24, UI_FONT], TOOLTIP_COLOR),
                new Layout.Text("x1 Stamina", [24, UI_FONT], TOOLTIP_COLOR),
                new Layout.Text(cost + " MP (" + entity.mp + "→" + (entity.mp - cost) + ")", [24, UI_FONT], entity.mp >= cost ? TOOLTIP_COLOR : "red"),
            ]);
        }))
    ]);
}

export function damageEntity(e: Entity, amount: number) {
    e.hp -= amount;
    e.fatigue += amount / 8;
    effects.push(floatingTextEffect(amount.toFixed(0), e.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));
    /* if (!e.isEnemy) {
        cameraShake(0.2, 20);
    } */
}
export function physicalDamage(attacker: Entity, defender: Entity, base: number): number {
    return Math.ceil(attacker.attack / defender.defense * base);
}
export function elementalDamage(attacker: Entity, defender: Entity, element: MagicElement, base: number): number {
    let axisSign = (element % 2 === 0) ? -1 : 1;
    let axisIndex = Math.floor(element / 2);
    let attackingAffinity = axisSign * attacker.affinities[axisIndex];
    let defendingAffinity = axisSign * defender.affinities[axisIndex];
    return Math.ceil(attacker.magicPower * Math.pow(2, attackingAffinity) / (defender.resistance * Math.pow(2, defendingAffinity)) * base);
}

export let ActionCyclone = new class implements Action {
    name = "Cyclone";
    cost = 4;
    *command(entity: Entity, targetPoint: Vector) { 
        if (!costMp(entity, this.cost)) return;

        let to = getDestination(entity, targetPoint);
        yield* logicMoveEntity(entity, to, 0.2);

        playSound("sound/cyclone.wav");

        yield* overTime(1.200, (_, t) => {
            let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
            let angle = t * Math.PI * 6;
            let distance = curve * 50;
            entity.position = to.add(new Vector(Math.cos(angle), Math.sin(angle)).muls(distance));
        });

        entity.position = to;
        
        let targets = livingEntities().filter(e => e.isEnemy !== entity.isEnemy && pointsWithinDistance(e.position, entity.position, e.radius + entity.radius + 50));
        for (let e of targets) {
            damageEntity(e, physicalDamage(entity, e, 1));
        }
        if (targets.length > 0) { playSound("sound/enemyhit.wav"); }
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetPointMenu(entity.position, {
            preview: v => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewMana.set(entity, entity.mp - this.cost);
                v = getDestination(entity, v);
                previewPosition.set(entity, v);
                let wouldHit = livingEntities()
                    .filter(e => e.isEnemy !== entity.isEnemy && pointsWithinDistance(e.position, v, e.radius + entity.radius + 50));
                wouldHit.forEach(e => cursorEntities.add(e));
                setDrawTargetArea(() => drawTargetCircle(v, entity.radius + 50));
                return genericTooltip(entity, <any>this, "AoE Attack", "1 Damage"); // The <any> is getting around some weird typescript bug.
                // return genericTooltip(entity, this, "AoE Attack", "1 Damage");
                // return new Layout.Text("AoE Attack", [24, UI_FONT], TOOLTIP_COLOR);
            },
            select: v => queuedCommands.set(entity, [this.command(entity, v), this.name]),
        });
    }
    ai(entity: Entity) {
        let targets = livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
        let target = choose(targets);
        return this.command(entity, target.position);
    }
};

export let ActionHeal = new class implements Action {
    name = "Heal";
    cost = 2;
    *command(entity: Entity, targetEntity: Entity) {
        if (livingEntities().indexOf(targetEntity) === -1) return;
        if (!costMp(entity, this.cost)) return;

        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        
        playSound("sound/heal.wav");
        for (let i = 0; i < 100; i++) {
            particles.push({
                birthday: gNow,
                expirationDate: gNow + 1.0,
                startRadius: 0,
                endRadius: 5,
                startColor: [0, 255, 0],
                endColor: [192, 255, 0],
                startAlpha: 1,
                endAlpha: 0,
                position: targetEntity.position,
                velocity: Vector.random().muls(200 * Math.random())
            });
        }
        yield* overTime(1.0, () => {});
        
        effects.push(floatingTextEffect("+2", targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 255, 0], 1));

        targetEntity.hp = clamp(targetEntity.hp + 2, 0, getEntityFatiguedMaxHealth(targetEntity));
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
            preview: e => {
                previewMana.set(entity, entity.mp - this.cost);
                previewHealth.set(e, e.hp + 2);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Heal " + e.name + " for 2 hp", "2 HP");
            }
        });
    }
    ai(entity: Entity) {
        return this.command(entity, choose(livingEntities().filter(e => e.isEnemy === entity.isEnemy)));
    }
};

export let ActionPinchHitter = new class implements Action {
    name = "Pinch Hitter";
    cost = 2;
    *command(entity: Entity, targetEntity: Entity) {
        if (livingEntities().indexOf(targetEntity) === -1) return;
        if (!costMp(entity, this.cost)) return;

        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        
        playSound("sound/heal.wav");
        yield* zipGenerators([
            nOverTime(1.0, 10, (_, t) => 
                effects.push(overTime(0.5, (_, t) =>
                    drawRing(`rgba(0, 255, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), targetEntity.position, targetEntity.radius + 40 - t * 40)))),
            nOverTime(1.0, 100, (_, t) => particles.push({
                birthday: gNow,
                expirationDate: gNow + 0.5,
                startRadius: 20,
                endRadius: 0,
                startColor: [0, 255, 0],
                endColor: [0, 255, 0],
                startAlpha: 0,
                endAlpha: 1,
                position: targetEntity.position,
                velocity: Vector.random().muls(300 * Math.random())
            }))
        ]);
        
        effects.push(floatingTextEffect("Ready!", targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));

        let originalTime = targetEntity.timeToTurn;
        yield* overTime(0.2, (_, t) => {
            targetEntity.timeToTurn = mix(originalTime, 0, t);
        });
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e !== entity && e.isEnemy === entity.isEnemy && e.hp > 0,
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
            preview: e => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewTimeToTurnOverrides.set(e, 0);
                previewMana.set(entity, entity.mp - this.cost);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Makes " + e.name + " instantly ready", "??");
            }
        });
    }
    ai(entity: Entity) {
        return this.command(entity, choose(livingEntities().filter(e => e.isEnemy === entity.isEnemy && e !== entity)));
    }
}

export let ActionFailToAct = new class implements Action {
    name = "Fail To Act";
    *command(entity: Entity) {
        let message = entity.name + " fails to act!";
        yield* showCombatDialog(message, entity.position);
        
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            preview: e => null,
            select: e => queuedCommands.set(entity, [this.command(entity), this.name]),
            filter: e => e === entity,
        });
    }
    ai = this.command;
};

export let ActionNotInterested = new class implements Action {
    name = "Not Interested";
    *command(entity: Entity) {
        let message = entity.name + choose([
            " isn't interested",
            " is off doing something unrelated",
            " hasn't even noticed you",
            " is ordering a pizza",
            " doesn't realize it's in combat",
            " is taking a nap",
            " is riding a tricycle",
            " is practicing tai chi",
            " is pretending to be a statue",
            " looks elsewhere",
            " ignores you",
        ]);
        yield* showCombatDialog(message, entity.position);
        
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            preview: e => null,
            select: e => queuedCommands.set(entity, [this.command(entity), this.name]),
            filter: e => e === entity,
        });
    }
    ai = this.command;
};

export let ChainLightning = new class implements Action {
    name = "Chain Lightning";
    jumpRange = 300;
    maxJumps = 2;
    targets(entity: Entity, firstTarget: Entity): Entity[] {
        let nextTarget = firstTarget;
        let results: Entity[] = [];
        let targets = new Set();
        while (true) {
            results.push(nextTarget);
            targets.add(nextTarget);
            let chainPoint = nextTarget.position; 
            if (targets.size > this.maxJumps) break;
            let nextTargets = livingEntities().filter(e => e.isEnemy !== entity.isEnemy && !targets.has(e)).sort((a, b) => a.position.sub(chainPoint).mag2() - b.position.sub(chainPoint).mag2());
            if (nextTargets.length === 0) break;
            nextTarget = nextTargets[0];
            if (nextTarget.position.sub(chainPoint).mag2() > this.jumpRange * this.jumpRange) break;
        }
        return results;
    }
    cost = 5;
    *command(entity: Entity, targetEntity: Entity) {
        if (!costMp(entity, this.cost)) return;
        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(125, 255, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));

        let targets = this.targets(entity, targetEntity);
        let chainPoint = entity.position;
        let damage = 3;
        for (let target of targets) {
            let lightningPath: Vector[] = [];
            let norm = target.position.sub(chainPoint).crossz().norm();
            let pathSegments = Math.max(target.position.sub(chainPoint).mag() / 50, 1);
            let offsetMax = 20;
            function regenPath() {
                lightningPath = [];
                for (let i = 0; i <= pathSegments; i++) {
                    let t = i / pathSegments;
                    let sign = (i % 2 === 0) ? -1 : 1;
                    lightningPath.push(target.position.mix(chainPoint, t).add(norm.muls(sign * Math.random() * Math.sin(Math.PI * t) * offsetMax)));
                }
            }
            regenPath();
            effects.push(overTime(0.3, (_, t) => {
                let color = Array.from(zip([255, 255, 255], [125, 0, 255])).map(([a, b]) => Math.round(mix(a, b, t)));
                ctx.strokeStyle = "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + (1 - t) + ")";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(lightningPath[0].x, lightningPath[0].y);
                for (let i = 1; i < lightningPath.length; i++) {
                    ctx.lineTo(lightningPath[i].x, lightningPath[i].y);
                }
                ctx.stroke();
            }));
            yield* zipGenerators([
                nOverTime(0.3, 100, () => {
                    let s = Math.random();
                    let f = Math.floor(s * lightningPath.length);
                    let e = Math.min(f + 1, lightningPath.length - 1);
                    let p = lightningPath[f].mix(lightningPath[e], s % lightningPath.length);
                    particles.push({
                        birthday: gNow,
                        expirationDate: gNow + 0.1,
                        startRadius: 4,
                        endRadius: 1,
                        startColor: [255, 255, 255],
                        endColor: [125, 0, 255],
                        startAlpha: 1,
                        endAlpha: 0,
                        position: p,
                        velocity: Vector.random().muls(500 * Math.random())
                    });
                }),
                overTime(0.3, () => {
                    regenPath();  
                })
            ]);
            damageEntity(target, elementalDamage(entity, target, MagicElement.YELLOW, damage));
            playSound("sound/enemyhit.wav");
            chainPoint = target.position;
            damage -= 1;
        }

        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e.isEnemy !== entity.isEnemy && e.hp > 0,
            preview: e => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewMana.set(entity, entity.mp - this.cost);
                cursorEntities.add(e);
                let targets = this.targets(entity, e);
                // targets.forEach(e => cursorEntities.add(e)); // Need a way to add grey/non-primary cursors?? 
                setDrawTargetArea(() => {
                    ctx.setLineDash([5, 5]);
                    ctx.lineDashOffset = -gNow * 10;
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = "red";
                    ctx.beginPath();
                    ctx.moveTo(targets[0].position.x, targets[0].position.y);
                    for (let target of targets.slice(1)) {
                        ctx.lineTo(target.position.x, target.position.y);
                    }
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;
                });
                return genericTooltip(entity, <any>this, "Chain target", "3 Damage");
            },
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
        });
    }
    ai(entity: Entity) {
        return this.command(entity, choose(livingEntities().filter(e => e.isEnemy !== entity.isEnemy)));
    }
}

export let ActionPSIFire = new class implements Action {
    name = "PSI Fire α";
    width = 300;
    height = 30;
    getPolygon(entity: Entity, targetPoint: Vector) {
        let dir = targetPoint.sub(entity.position).norm();
        if (dir.mag2() < 0.1) dir = new Vector(0, 1);
        let cross = dir.crossz();
        let targetingPolyPoints = [
            targetPoint.add(dir.muls(this.height / 2)).add(cross.muls(-this.width / 2)),
            targetPoint.add(dir.muls(this.height / 2)).add(cross.muls(this.width / 2)),
            targetPoint.add(dir.muls(-this.height / 2)).add(cross.muls(this.width / 2)),
            targetPoint.add(dir.muls(-this.height / 2)).add(cross.muls(-this.width / 2)),
        ];
        return collision.makePolygonFromPoints(targetingPolyPoints);
    }
    targets(entity: Entity, targetingPolygon: Polygon) {
        return livingEntities().filter(e => e.isEnemy !== entity.isEnemy && collision.circleOverlapsPolygons({ center: e.position, radius: e.radius }, [targetingPolygon]));
    }
    cost = 3;
    *command(entity: Entity, targetPoint: Vector) {
        if (!costMp(entity, this.cost)) return;
        let dir = targetPoint.sub(entity.position).norm();
        if (dir.mag2() < 0.1) dir = new Vector(0, 1);
        let cross = dir.crossz();
        let targetingPolygon = this.getPolygon(entity, targetPoint);

        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(255, 0, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));

        let numExplosions = 5;
        let particleLine = cross.muls(this.width / 2).divs(numExplosions);
        playSound("sound/fire.wav");
        for (let i = 0; i < numExplosions; i++) {
            yield* overTime(0.1, () => {});
            cameraShake(0.1, 5);
            for (let dir of [-1, 1]) {
                let p = targetPoint.add(particleLine.muls(dir * (i + 0.5)));
                for (let j = 0; j < 50; j++) {
                    particles.push({
                        birthday: gNow,
                        expirationDate: gNow + 0.5,
                        startRadius: 20,
                        endRadius: 0,
                        startColor: [255, 255, 0],
                        endColor: [255, 0, 0],
                        startAlpha: 1,
                        endAlpha: 0.2,
                        position: p,
                        velocity: Vector.random().muls(200 * Math.random())
                    });
                }
            }
        }
        
        let targets = this.targets(entity, targetingPolygon);
        for (let e of targets) {
            damageEntity(e, elementalDamage(entity, e, MagicElement.RED, 2));
        }
        if (targets.length > 0) { playSound("sound/enemyhit.wav"); }
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetPointMenu(entity.position, {
            preview: v => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewMana.set(entity, entity.mp - this.cost);
                let dir = v.sub(entity.position).norm();
                if (dir.mag2() < 0.1) dir = new Vector(0, 1);
                let targetingPolygon: Polygon = this.getPolygon(entity, v);
                let wouldHit = this.targets(entity, targetingPolygon);
                wouldHit.forEach(e => cursorEntities.add(e));
                setDrawTargetArea(() => {
                    ctx.beginPath();
                    let first = true;
                    for (let p of targetingPolygon.points) {
                        if (first) {
                            ctx.moveTo(p.x, p.y);
                            first = false;
                        } else {
                            ctx.lineTo(p.x, p.y);
                        }
                    }
                    ctx.closePath();
                    ctx.strokeStyle = "red";
                    ctx.setLineDash([5, 5]);
                    ctx.lineDashOffset = gNow * 10;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    let d = v.sub(entity.position).mag();
                    if (d > entity.radius + this.height / 2) {
                        let p1 = entity.position.towards(v, entity.radius);
                        let p2 = v.towards(entity.position, this.height / 2);
                        ctx.strokeStyle = "black";
                        ctx.globalAlpha = 0.5;
                        drawLinev(p2, p1);
                        ctx.globalAlpha = 1;
                    }

                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;
                });
                return genericTooltip(entity, <any>this, "AoE Line", "2 Damage");
            },
            select: v => queuedCommands.set(entity, [this.command(entity, v), this.name]),
        });
    }
    ai(entity: Entity) {
        let targets = livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
        let target = choose(targets);
        return this.command(entity, target.position);
    }
}

export let ActionWhirlwind = new class implements Action {
    name = "Whirlwind";
    cost = 6;
    *command(entity: Entity, targetPoint: Vector) {
        if (!costMp(entity, this.cost)) return;
        let a = entity;
        let target = targetPoint;
        let to = getDestination(a, target);
        yield* logicMoveEntity(a, to, 0.2);

        playSound("sound/cyclone.wav");

        yield* overTime(1.200, (_, t) => {
            let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
            let angle = t * Math.PI * 6;
            let distance = curve * 50;
            a.position = to.add(new Vector(Math.cos(angle), Math.sin(angle)).muls(distance));
        });

        a.position = to;
        
        let targets = livingEntities().filter(e => e.isEnemy !== a.isEnemy && pointsWithinDistance(e.position, a.position, e.radius + a.radius + 50));
        for (let e of targets) {
            damageEntity(e, physicalDamage(entity, e, 1));
        }
        if (targets.length > 0) { playSound("sound/enemyhit.wav"); }
        yield* zipGenerators(targets.map(e => {
            let start = e.timeToTurn;
            let end = e.timeToTurn + 0.5;
            return overTime(0.25, (_, t) => {
                e.timeToTurn = mix(start, end, t);
            });
        }));
        a.timeToTurn = a.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetPointMenu(entity.position, {
            preview: v => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewMana.set(entity, entity.mp - this.cost);
                v = getDestination(entity, v);
                previewPosition.set(entity, v);
                let wouldHit = livingEntities()
                    .filter(e => e.isEnemy !== entity.isEnemy && pointsWithinDistance(e.position, v, e.radius + entity.radius + 50));
                wouldHit.forEach(e => previewTimeToTurnOverrides.set(e, e.timeToTurn + 0.5));
                wouldHit.forEach(e => cursorEntities.add(e));
                setDrawTargetArea(() => drawTargetCircle(v, entity.radius + 50));
                return genericTooltip(entity, <any>this, "AoE Slowing Attack", "1 Damage 0.5 Stamina");
            },
            select: v => queuedCommands.set(entity, [this.command(entity, v), this.name]),
        });
    }
    ai(entity: Entity) {
        let targets = livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
        let target = choose(targets);
        return this.command(entity, target.position);
    }
}

export let ActionSpy = new class implements Action {
    name = "Spy";
    *command(entity: Entity, targetEntity: Entity) {
        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(255, 192, 125, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        yield* showCombatDialog(targetEntity.hp + "/" + getEntityFatiguedMaxHealth(targetEntity), targetEntity.position);
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => true,
            preview: e => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Spy on " + e.name, "??");
            },
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
        });
    }
    ai(entity: Entity) {
        return this.command(entity, choose(livingEntities()));
    }
};

export let ActionMeditate = new class implements Action {
    name = "Meditate";
    *command(entity: Entity) {
        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(125, 192, 255, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        playSound("sound/heal.wav");
        let originalMp = entity.mp;
        yield* overTime(0.2, (_, t) => {
            entity.mp = clamp(mix(originalMp, originalMp + 2, t), 0, entity.maxMp);
        });
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e === entity,
            preview: e => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Gain an extra 2MP", "??");
            },
            select: e => queuedCommands.set(entity, [this.command(entity), this.name]),
        });
    }
    ai(entity: Entity) {
        return this.command(entity);
    }
};

export let ActionAttack = new class implements Action {
    name = "Attack";
    *command(entity: Entity, targetEntity: Entity) {
        if (livingEntities().indexOf(targetEntity) === -1) return;

        let start = entity.position;
        let mid = targetEntity.position;
        let end = getDestination(entity, mid.towards(start, 60));

        let hit = Math.random() < entity.accuracy / targetEntity.evasion;
        
        function bounce(t: number): number {
            return -Math.sin(t * Math.PI * 2) * (1 - t) * 0.25 + t;
        }

        let bStart = targetEntity.position;
        let bDodgePoint = bStart.add(entity.position.sub(targetEntity.position).norm().crossz().muls(30));

        function dodgeBlend(t: number): number {
            return 1 - (Math.cos(t * Math.PI) + 1) / 2;
        }

        yield* overTime(0.250, (_, t) => {
            entity.position = start.mix(mid, bounce(t));
            if (!hit) {
                targetEntity.position = bStart.mix(bDodgePoint, dodgeBlend(t));
            }
        });

        if (hit) {
            damageEntity(targetEntity, physicalDamage(entity, targetEntity, 1));
            playSound("sound/enemyhit.wav");
        } else {
            effects.push(floatingTextEffect("Miss!", targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));
            playSound("sound/dodge.wav");
        }

        function slow(t: number): number {
            let s = 1 - t;
            return 1 - s * s;
        }
        
        yield* zipGenerators([
            overTime(0.150, (_, t) => {
                entity.position = mid.mix(end, slow(t));
            }),
            (function*() {
                if (hit) {
                    yield* shakeEntity(targetEntity, 0.2, 10);
                } else {
                    yield* overTime(0.150, (_, t) => {
                        targetEntity.position = bDodgePoint.mix(bStart, dodgeBlend(t));
                    });
                }
            })()
        ]);

        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e.isEnemy && e.hp > 0,
            preview: e => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                let finalPos = getDestination(entity, e.position.towards(entity.position, 60));
                previewPosition.set(entity, finalPos);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Attack " + e.name, (entity.accuracy / e.evasion * 100).toFixed() + "% chance to hit");
            },
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
        });
    }
    ai(entity: Entity) {
        return this.command(entity, choose(livingEntities().filter(e => e.isEnemy !== entity.isEnemy)));
    }
}
export let ActionDelayingAttack = new class implements Action {
    name = "Delaying Attack";
    cost = 3;
    *command(entity: Entity, targetEntity: Entity) {
        if (!costMp(entity, this.cost)) return;
        let a = entity;
        let b = targetEntity;
        if (livingEntities().indexOf(b) === -1) return;
        let start = a.position;
        let mid = b.position;
        let end = getDestination(a, mid.towards(start, 60));

        let hit = Math.random() < a.accuracy / b.evasion;
        
        function bounce(t: number): number {
            return -Math.sin(t * Math.PI * 2) * (1 - t) * 0.25 + t;
        }

        let bStart = b.position;
        let bDodgePoint = bStart.add(a.position.sub(b.position).norm().crossz().muls(30));

        function dodgeBlend(t: number): number {
            return 1 - (Math.cos(t * Math.PI) + 1) / 2;
        }

        yield* overTime(0.250, (_, t) => {
            a.position = start.mix(mid, bounce(t));
            if (!hit) {
                b.position = bStart.mix(bDodgePoint, dodgeBlend(t));
            }
        });

        if (hit) {
            damageEntity(b, physicalDamage(a, b, 1));
            playSound("sound/enemyhit.wav");
        } else {
            effects.push(floatingTextEffect("Miss!", b.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));
            playSound("sound/dodge.wav");
        }

        function slow(t: number): number {
            let s = 1 - t;
            return 1 - s * s;
        }
        
        yield* overTime(0.150, (_, t) => {
            a.position = mid.mix(end, slow(t));
            if (!hit) {
                b.position = bDodgePoint.mix(bStart, dodgeBlend(t));
            }
        });

        a.timeToTurn = a.baseStaminaCost;
        if (hit) {
            let startB = b.timeToTurn;
            let finalB = b.timeToTurn + 2.0;
            yield* overTime(0.250, (_, t) => {
                b.timeToTurn = mix(startB, finalB, t);
            });
        }
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e.isEnemy && e.hp > 0,
            preview: e => {
                previewTimeToTurnOverrides.set(e, e.timeToTurn + 2);
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewMana.set(entity, entity.mp - this.cost);
                let finalPos = getDestination(entity, e.position.towards(entity.position, 60));
                previewPosition.set(entity, finalPos);
                cursorEntities.add(e);
                return genericTooltip(entity, <any>this, "Delaying attack " + e.name, (entity.accuracy / e.evasion * 100).toFixed() + "% chance to hit");
            },
            select: e => queuedCommands.set(entity, [this.command(entity, e), this.name]),
        });
    }
    ai = ActionAttack.ai;
}

export let ActionMove = new class implements Action {
    name = "Move";
    *command(entity: Entity, targetPoint: Vector) { 
        yield* logicMoveEntity(entity, getDestination(entity, targetPoint), 0.300);
        entity.timeToTurn = entity.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetPointMenu(entity.position, {
            preview: v => {
                previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                previewPosition.set(entity, getDestination(entity, v));
                return genericTooltip(entity, <any>this, "Mosey", "??");
            },
            select: v => queuedCommands.set(entity, [this.command(entity, v), this.name]),
        });
    }
    ai(entity: Entity) {
        return this.command(entity, new Vector(
            mix(battleBounds.min.x, battleBounds.max.x, Math.random()),
            mix(battleBounds.min.y, battleBounds.max.y, Math.random())
        ));
    }
}

function getDestinationWithOverrides(a: Entity, to: Vector, overrides: Map<Entity, Vector|null>) {
    // The `!== null` is intentionally not `!= null` because the entity should NOT be filtered if it has no entry (i.e. when get() returns undefined)
    return collision.findClosestOpenSpot(to, a.radius, entities.filter(e => e !== a && overrides.get(e) !== null).map(e => {
        let override = <Vector|undefined>overrides.get(e);
        // This == null check will only ever find undefined since null specifically has been filtered out
        if (override == null) {
            return { center: e.position, radius: e.radius };
        } else {
            return { center: override, radius: e.radius };
        }
    }), levelPolygons, battleBounds);
}

function getDestination(a: Entity, to: Vector) {
    return collision.findClosestOpenSpot(to, a.radius, entities.filter(e => e !== a).map(({position, radius}) => ({center: position, radius})), levelPolygons, battleBounds);
}

function* logicMoveEntity(entity: Entity, to: Vector, durationInSeconds: number) {
    let start = entity.position;
    yield* overTime(durationInSeconds, (_, t) => {
        entity.position = start.mix(to, t);
    });
}

function* shakeEntity(entity: Entity, duration: number, mag: number) {
    let startPos = entity.position;
    yield* overTime(duration, (_, t) => {
        entity.position = startPos.add(Vector.random().muls((1 - t) * mag));
    });
    entity.position = startPos;
}

//==========
// End of Actions


//==========
// Combo techs

export interface ComboTech extends Action {
    actions: Action[],
}

export function getComboTechs(entity: Entity): ComboTech[] {
    let actions: ComboTech[] = [];
    for (let comboTech of comboTechs) {
        if (getPairings(entity, comboTech.actions).length > 0) {
            actions.push(comboTech);
        }
    }
    return actions;
}

function* permutations<T>(ts: T[], n: number): IterableIterator<T[]> {
    if (n <= 0) { yield []; return; }
    for (let t of ts) {
        for (let rest of permutations(ts.filter(e => e !== t), n - 1)) {
            yield [t].concat(rest);
        }
    }
}

export function getPairings(entity: Entity, actions: Action[]): Entity[][] {
    let allies = livingEntities().filter(e => e !== entity && e.isEnemy === entity.isEnemy);
    let pairings: Entity[][] = [];
    if (allies.length < actions.length) return [];
    for (let i = 0; i < actions.length; i++) {
        for (let permutation of permutations(allies, actions.length - 1)) {
            let ps = permutation.slice(0);
            ps.splice(i, 0, entity);
            if (ps.every((e, i) => e.actions.indexOf(actions[i]) !== -1)) {
                pairings.push(ps);
            }
        }
    }
    return pairings;
}
export function getPairing(entity: Entity, actions: Action[]): Entity[]|null {
    let pairings = getPairings(entity, actions);
    if (pairings.length > 0) {
        return pairings[mod(globalBuddyToggle, pairings.length)];
    } else {
        return null;
    }
}

comboTechs.push(new class implements ComboTech {
    name = "X-Strike";
    actions = [ActionCyclone, ActionWhirlwind];
    *command(entityA: Entity, entityB: Entity, targetEntity: Entity) {
        if (livingEntities().indexOf(entityA) === -1 || entityA.timeToTurn !== 0.0 || entityA.mp < this.actions[0].cost) return;
        if (livingEntities().indexOf(entityB) === -1 || entityB.timeToTurn !== 0.0 || entityB.mp < this.actions[1].cost) return;
        if (livingEntities().indexOf(targetEntity) === -1) return;
        costMp(entityA, this.actions[0].cost);
        costMp(entityB, this.actions[1].cost);

        let startA = entityA.position;
        let startB = entityB.position;

        let mid = targetEntity.position;

        let endA = getDestinationWithOverrides(entityA, mid.towards(startA, -60), new Map([[entityB, null]]));
        let endB = getDestinationWithOverrides(entityB, mid.towards(startB, -60), new Map([[entityA, endA]]));

        let launchA = mid.towards(endA, -300);
        let launchB = mid.towards(endB, -300);

        function slow(t: number): number {
            let s = 1 - t;
            return 1 - s * s;
        }

        yield* overTime(0.200, (_, t) => {
            entityA.position = startA.mix(launchA, slow(t));
            entityB.position = startB.mix(launchB, slow(t));
        });

        let shouldDrawTrail = true;
        effects.push(function*(): IterableIterator<any> {
            while (shouldDrawTrail) {
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.strokeStyle = "red";
                ctx.lineWidth = entityA.radius;
                drawLinev(launchA, entityA.position);
                ctx.lineWidth = entityB.radius;
                drawLinev(launchB, entityB.position);
                ctx.restore();
                yield;
            }
            yield* overTime(1.0, (_, t) => {
                ctx.save();
                ctx.globalAlpha = 0.5 * (1 - t);
                ctx.strokeStyle = "red";
                ctx.lineWidth = entityA.radius;
                drawLinev(launchA, endA);
                ctx.lineWidth = entityB.radius;
                drawLinev(launchB, endB);
                ctx.globalAlpha = 1;
                ctx.restore();
            });
        }());

        yield* overTime(0.150, (_, t) => {
            entityA.position = launchA.mix(mid, t);
            entityB.position = launchB.mix(mid, t);
        });

        damageEntity(targetEntity, physicalDamage(entityA, targetEntity, 2) + physicalDamage(entityB, targetEntity, 2));
        playSound("sound/enemyhit.wav");
        cameraShake(0.2, 10);

        yield* overTime(0.050, (_, t) => {
            entityA.position = mid.mix(endA, slow(t));
            entityB.position = mid.mix(endB, slow(t));
        });

        shouldDrawTrail = false;

        entityA.timeToTurn = entityA.baseStaminaCost;
        entityB.timeToTurn = entityB.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetEntityMenu({
            filter: e => e.isEnemy && e.hp > 0,
            preview: e => {
                let pair = getPairing(entity, this.actions);
                if (pair == null) return null;
                let [entityA, entityB] = pair;
                previewTimeToTurnOverrides.set(entityB, entityB.timeToTurn + entityB.baseStaminaCost);
                previewTimeToTurnOverrides.set(entityA, entityA.timeToTurn + entityA.baseStaminaCost);
                previewMana.set(entityA, entityA.mp - this.actions[0].cost);
                previewMana.set(entityB, entityB.mp - this.actions[1].cost);
                let finalPosA = getDestinationWithOverrides(entityA, e.position.towards(entityA.position, -60), new Map([[entityB, null]]));
                let finalPosB = getDestinationWithOverrides(entityB, e.position.towards(entityB.position, -60), new Map([[entityA, finalPosA]]));
                previewPosition.set(entityA, finalPosA);
                previewPosition.set(entityB, finalPosB);
                cursorEntities.add(e);
                return genericComboTooltip(pair, <any>this, "Double AoE attack");
            },
            select: e => {
                let pair = getPairing(entity, this.actions);
                if (pair != null) {
                    queuedCommands.set(entity, [this.command(pair[0], pair[1], e), this.name]);
                }
            },
        });
    }
    ai = <any>null; // TODO: add an AI implementation or change how AI works so it's not necessary
});

comboTechs.push(new class implements ComboTech {
    name = "Maelstrom";
    actions = [ActionCyclone, ActionCyclone];
    *command(entityA: Entity, entityB: Entity, targetPoint: Vector) {
        if (livingEntities().indexOf(entityA) === -1 || entityA.timeToTurn !== 0.0 || entityA.mp < this.actions[0].cost) return;
        if (livingEntities().indexOf(entityB) === -1 || entityB.timeToTurn !== 0.0 || entityB.mp < this.actions[1].cost) return;
        costMp(entityA, this.actions[0].cost);
        costMp(entityB, this.actions[1].cost);

        let to = getDestinationWithOverrides(entityA, targetPoint, new Map([[entityB, null]]));
        let buddyDst = getDestinationWithOverrides(entityB, to.add(entityB.position.sub(entityA.position).norm().muls(entityA.radius + entityB.radius)), new Map([[entityA, to]]));
        yield* logicMoveEntity(entityA, to, 0.2);
        yield* logicMoveEntity(entityB, to, 0.2);

        playSound("sound/cyclone.wav");

        function spewParticle(a: Vector, b: Vector) {
            particles.push({
                birthday: gNow,
                expirationDate: gNow + 1.0,
                startRadius: 15,
                endRadius: 5,
                startColor: [0, 255, 255],
                endColor: [0, 0, 255],
                startAlpha: 0.2,
                endAlpha: 0,
                position: b,
                velocity: b.sub(a).norm().muls(100).add(Vector.random().muls(20)),
            });
        }
        let prevParticleSpawns: [Vector, Vector][] = [[to, to], [to, to]];
        yield* zipGenerators([
            nOverTime(1.200, 100, () => {
                for (let i = 0; i < prevParticleSpawns.length; i++) {
                    spewParticle(prevParticleSpawns[i][0], prevParticleSpawns[i][1]);
                }
            }),
            overTime(1.200, (_, t) => {
                let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
                let angle = t * Math.PI * 6;
                let distance = curve * 50;
                entityA.position = to.add(Vector.fromAngle(angle).muls(distance));
                entityB.position = to.add(Vector.fromAngle(angle + Math.PI).muls(distance));
                let particleSpawns = [to.add(Vector.fromAngle(angle).muls(distance + entityA.radius)), to.add(Vector.fromAngle(angle + Math.PI).muls(distance + entityB.radius))];
                for (let i = 0; i < prevParticleSpawns.length; i++) {
                    prevParticleSpawns[i][0] = prevParticleSpawns[i][1];
                    prevParticleSpawns[i][1] = particleSpawns[i];
                }
            })
        ]);

        entityA.position = to;

        let targets = livingEntities().filter(e => e.isEnemy !== entityA.isEnemy && pointsWithinDistance(e.position, entityA.position, e.radius + Math.max(entityA.radius, entityB.radius) + 50));
        for (let e of targets) {
            damageEntity(e, physicalDamage(entityA, e, 2) + physicalDamage(entityB, e, 2));
        }
        if (targets.length > 0) { playSound("sound/enemyhit.wav"); }

        yield* logicMoveEntity(entityB, buddyDst, 0.05);

        entityA.timeToTurn = entityA.baseStaminaCost;
        entityB.timeToTurn = entityB.baseStaminaCost;
    }
    menu(entity: Entity) {
        return targetPointMenu(entity.position, {
            preview: v => {
                let pair = getPairing(entity, this.actions);
                if (pair == null) return null;
                let [entityA, entityB] = pair;
                previewTimeToTurnOverrides.set(entityB, entityB.timeToTurn + entityB.baseStaminaCost);
                previewTimeToTurnOverrides.set(entityA, entityA.timeToTurn + entityA.baseStaminaCost);
                previewMana.set(entityA, entityA.mp - this.actions[0].cost);
                previewMana.set(entityB, entityB.mp - this.actions[1].cost);
                let finalPosA = getDestinationWithOverrides(entityA, v, new Map([[entityB, null]]));
                let finalPosB = getDestinationWithOverrides(entityB, finalPosA.add(entityB.position.sub(entityA.position).norm().muls(entityA.radius + entityB.radius)), new Map([[entityA, finalPosA]]));
                previewPosition.set(entityA, finalPosA);
                previewPosition.set(entityB, finalPosB);
                let wouldHit = livingEntities().filter(e => e.isEnemy !== entity.isEnemy && pointsWithinDistance(e.position, finalPosA, e.radius + Math.max(entityA.radius, entityB.radius) + 50));
                wouldHit.forEach(e => cursorEntities.add(e));
                setDrawTargetArea(() => drawTargetCircle(finalPosA, Math.max(entityA.radius, entityB.radius) + 50));
                return genericComboTooltip(pair, <any>this, "Double AoE attack");
            },
            select: v => {
                let pair = getPairing(entity, this.actions);
                if (pair != null) {
                    queuedCommands.set(entity, [this.command(pair[0], pair[1], v), this.name]);
                }
            },
        });
    }
    ai = <any>null; // TODO: see XStrike.ai
});

// End of Combo techs
//==========
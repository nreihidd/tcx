define(["require", "exports", "tcx", "layout", "collision", "math", "combat", "particles"], function (require, exports, tcx_1, Layout, collision, math_1, combat_1, particles_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.comboTechs = [];
    function* zipGenerators(generators) {
        while (true) {
            generators = generators.filter(gen => !gen.next().done);
            if (generators.length === 0) {
                break;
            }
            yield;
        }
    }
    function costMp(entity, amount) {
        if (entity.mp < amount)
            return false;
        entity.mp -= amount;
        return true;
    }
    function drawTargetCircle(position, radius) {
        tcx_1.ctx.beginPath();
        tcx_1.ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        tcx_1.ctx.strokeStyle = "red";
        tcx_1.ctx.setLineDash([5, 5]);
        tcx_1.ctx.lineDashOffset = tcx_1.gNow * 10;
        tcx_1.ctx.lineWidth = 1;
        tcx_1.ctx.stroke();
        tcx_1.ctx.setLineDash([]);
        tcx_1.ctx.lineDashOffset = 0;
    }
    function drawRing(color, width, center, radius) {
        tcx_1.ctx.strokeStyle = color;
        tcx_1.ctx.lineWidth = width;
        tcx_1.ctx.beginPath();
        tcx_1.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        tcx_1.ctx.closePath();
        tcx_1.ctx.stroke();
    }
    exports.drawRing = drawRing;
    function genericTooltip(entity, action, description, someExtraLineOfSomething) {
        let cost = action.cost || 0;
        return Layout.vertical([
            new Layout.Text(action.name, [48, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(description, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text("x1 Stamina", [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(cost + " MP (" + entity.mp + "→" + (entity.mp - cost) + ")", [24, tcx_1.UI_FONT], entity.mp >= cost ? tcx_1.TOOLTIP_COLOR : "red"),
            new Layout.Text(someExtraLineOfSomething, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
        ]);
    }
    function genericComboTooltip(entities, combo, description) {
        return Layout.vertical([
            new Layout.Text(combo.name, [48, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(description, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            Layout.columns(Array.from(tcx_1.zip(entities, combo.actions)).map(([entity, action]) => {
                let cost = action.cost || 0;
                return Layout.vertical([
                    new Layout.Text(entity.name, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
                    new Layout.Text("x1 Stamina", [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
                    new Layout.Text(cost + " MP (" + entity.mp + "→" + (entity.mp - cost) + ")", [24, tcx_1.UI_FONT], entity.mp >= cost ? tcx_1.TOOLTIP_COLOR : "red"),
                ]);
            }))
        ]);
    }
    function damageEntity(e, amount) {
        e.hp -= amount;
        e.fatigue += amount / 8;
        tcx_1.effects.push(tcx_1.floatingTextEffect(amount.toFixed(0), e.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
        /* if (!e.isEnemy) {
            cameraShake(0.2, 20);
        } */
    }
    exports.damageEntity = damageEntity;
    function physicalDamage(attacker, defender, base) {
        return Math.ceil(attacker.attack / defender.defense * base);
    }
    exports.physicalDamage = physicalDamage;
    function elementalDamage(attacker, defender, element, base) {
        let axisSign = (element % 2 === 0) ? -1 : 1;
        let axisIndex = Math.floor(element / 2);
        let attackingAffinity = axisSign * attacker.affinities[axisIndex];
        let defendingAffinity = axisSign * defender.affinities[axisIndex];
        return Math.ceil(attacker.magicPower * Math.pow(2, attackingAffinity) / (defender.resistance * Math.pow(2, defendingAffinity)) * base);
    }
    exports.elementalDamage = elementalDamage;
    exports.ActionCyclone = new class {
        constructor() {
            this.name = "Cyclone";
            this.cost = 4;
        }
        *command(entity, targetPoint) {
            if (!costMp(entity, this.cost))
                return;
            let to = getDestination(entity, targetPoint);
            yield* logicMoveEntity(entity, to, 0.2);
            tcx_1.playSound("sound/cyclone.wav");
            yield* tcx_1.overTime(1.200, (_, t) => {
                let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
                let angle = t * Math.PI * 6;
                let distance = curve * 50;
                entity.position = to.add(new math_1.Vector(Math.cos(angle), Math.sin(angle)).muls(distance));
            });
            entity.position = to;
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy && tcx_1.pointsWithinDistance(e.position, entity.position, e.radius + entity.radius + 50));
            for (let e of targets) {
                damageEntity(e, physicalDamage(entity, e, 1));
            }
            if (targets.length > 0) {
                tcx_1.playSound("sound/enemyhit.wav");
            }
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetPointMenu(entity.position, {
                preview: v => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    v = getDestination(entity, v);
                    combat_1.previewPosition.set(entity, v);
                    let wouldHit = combat_1.livingEntities()
                        .filter(e => e.isEnemy !== entity.isEnemy && tcx_1.pointsWithinDistance(e.position, v, e.radius + entity.radius + 50));
                    wouldHit.forEach(e => combat_1.cursorEntities.add(e));
                    combat_1.setDrawTargetArea(() => drawTargetCircle(v, entity.radius + 50));
                    return genericTooltip(entity, this, "AoE Attack", "1 Damage"); // The <any> is getting around some weird typescript bug.
                    // return genericTooltip(entity, this, "AoE Attack", "1 Damage");
                    // return new Layout.Text("AoE Attack", [24, UI_FONT], TOOLTIP_COLOR);
                },
                select: v => combat_1.queuedCommands.set(entity, [this.command(entity, v), this.name]),
            });
        }
        ai(entity) {
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
            let target = math_1.choose(targets);
            return this.command(entity, target.position);
        }
    };
    exports.ActionHeal = new class {
        constructor() {
            this.name = "Heal";
            this.cost = 2;
        }
        *command(entity, targetEntity) {
            if (combat_1.livingEntities().indexOf(targetEntity) === -1)
                return;
            if (!costMp(entity, this.cost))
                return;
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            tcx_1.playSound("sound/heal.wav");
            for (let i = 0; i < 100; i++) {
                particles_1.particles.push({
                    birthday: tcx_1.gNow,
                    expirationDate: tcx_1.gNow + 1.0,
                    startRadius: 0,
                    endRadius: 5,
                    startColor: [0, 255, 0],
                    endColor: [192, 255, 0],
                    startAlpha: 1,
                    endAlpha: 0,
                    position: targetEntity.position,
                    velocity: math_1.Vector.random().muls(200 * Math.random())
                });
            }
            yield* tcx_1.overTime(1.0, () => { });
            tcx_1.effects.push(tcx_1.floatingTextEffect("+2", targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 255, 0], 1));
            targetEntity.hp = math_1.clamp(targetEntity.hp + 2, 0, tcx_1.getEntityFatiguedMaxHealth(targetEntity));
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
                preview: e => {
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    combat_1.previewHealth.set(e, e.hp + 2);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Heal " + e.name + " for 2 hp", "2 HP");
                }
            });
        }
        ai(entity) {
            return this.command(entity, math_1.choose(combat_1.livingEntities().filter(e => e.isEnemy === entity.isEnemy)));
        }
    };
    exports.ActionPinchHitter = new class {
        constructor() {
            this.name = "Pinch Hitter";
            this.cost = 2;
        }
        *command(entity, targetEntity) {
            if (combat_1.livingEntities().indexOf(targetEntity) === -1)
                return;
            if (!costMp(entity, this.cost))
                return;
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            tcx_1.playSound("sound/heal.wav");
            yield* zipGenerators([
                tcx_1.nOverTime(1.0, 10, (_, t) => tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), targetEntity.position, targetEntity.radius + 40 - t * 40)))),
                tcx_1.nOverTime(1.0, 100, (_, t) => particles_1.particles.push({
                    birthday: tcx_1.gNow,
                    expirationDate: tcx_1.gNow + 0.5,
                    startRadius: 20,
                    endRadius: 0,
                    startColor: [0, 255, 0],
                    endColor: [0, 255, 0],
                    startAlpha: 0,
                    endAlpha: 1,
                    position: targetEntity.position,
                    velocity: math_1.Vector.random().muls(300 * Math.random())
                }))
            ]);
            tcx_1.effects.push(tcx_1.floatingTextEffect("Ready!", targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
            let originalTime = targetEntity.timeToTurn;
            yield* tcx_1.overTime(0.2, (_, t) => {
                targetEntity.timeToTurn = math_1.mix(originalTime, 0, t);
            });
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e !== entity && e.isEnemy === entity.isEnemy && e.hp > 0,
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewTimeToTurnOverrides.set(e, 0);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Makes " + e.name + " instantly ready", "??");
                }
            });
        }
        ai(entity) {
            return this.command(entity, math_1.choose(combat_1.livingEntities().filter(e => e.isEnemy === entity.isEnemy && e !== entity)));
        }
    };
    exports.ActionFailToAct = new class {
        constructor() {
            this.name = "Fail To Act";
            this.ai = this.command;
        }
        *command(entity) {
            let message = entity.name + " fails to act!";
            yield* combat_1.showCombatDialog(message, entity.position);
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                preview: e => null,
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity), this.name]),
                filter: e => e === entity,
            });
        }
    };
    exports.ActionNotInterested = new class {
        constructor() {
            this.name = "Not Interested";
            this.ai = this.command;
        }
        *command(entity) {
            let message = entity.name + math_1.choose([
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
            yield* combat_1.showCombatDialog(message, entity.position);
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                preview: e => null,
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity), this.name]),
                filter: e => e === entity,
            });
        }
    };
    exports.ChainLightning = new class {
        constructor() {
            this.name = "Chain Lightning";
            this.jumpRange = 300;
            this.maxJumps = 2;
            this.cost = 5;
        }
        targets(entity, firstTarget) {
            let nextTarget = firstTarget;
            let results = [];
            let targets = new Set();
            while (true) {
                results.push(nextTarget);
                targets.add(nextTarget);
                let chainPoint = nextTarget.position;
                if (targets.size > this.maxJumps)
                    break;
                let nextTargets = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy && !targets.has(e)).sort((a, b) => a.position.sub(chainPoint).mag2() - b.position.sub(chainPoint).mag2());
                if (nextTargets.length === 0)
                    break;
                nextTarget = nextTargets[0];
                if (nextTarget.position.sub(chainPoint).mag2() > this.jumpRange * this.jumpRange)
                    break;
            }
            return results;
        }
        *command(entity, targetEntity) {
            if (!costMp(entity, this.cost))
                return;
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(125, 255, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            let targets = this.targets(entity, targetEntity);
            let chainPoint = entity.position;
            let damage = 3;
            for (let target of targets) {
                let lightningPath = [];
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
                tcx_1.effects.push(tcx_1.overTime(0.3, (_, t) => {
                    let color = Array.from(tcx_1.zip([255, 255, 255], [125, 0, 255])).map(([a, b]) => Math.round(math_1.mix(a, b, t)));
                    tcx_1.ctx.strokeStyle = "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + (1 - t) + ")";
                    tcx_1.ctx.lineWidth = 4;
                    tcx_1.ctx.beginPath();
                    tcx_1.ctx.moveTo(lightningPath[0].x, lightningPath[0].y);
                    for (let i = 1; i < lightningPath.length; i++) {
                        tcx_1.ctx.lineTo(lightningPath[i].x, lightningPath[i].y);
                    }
                    tcx_1.ctx.stroke();
                }));
                yield* zipGenerators([
                    tcx_1.nOverTime(0.3, 100, () => {
                        let s = Math.random();
                        let f = Math.floor(s * lightningPath.length);
                        let e = Math.min(f + 1, lightningPath.length - 1);
                        let p = lightningPath[f].mix(lightningPath[e], s % lightningPath.length);
                        particles_1.particles.push({
                            birthday: tcx_1.gNow,
                            expirationDate: tcx_1.gNow + 0.1,
                            startRadius: 4,
                            endRadius: 1,
                            startColor: [255, 255, 255],
                            endColor: [125, 0, 255],
                            startAlpha: 1,
                            endAlpha: 0,
                            position: p,
                            velocity: math_1.Vector.random().muls(500 * Math.random())
                        });
                    }),
                    tcx_1.overTime(0.3, () => {
                        regenPath();
                    })
                ]);
                damageEntity(target, elementalDamage(entity, target, tcx_1.MagicElement.YELLOW, damage));
                tcx_1.playSound("sound/enemyhit.wav");
                chainPoint = target.position;
                damage -= 1;
            }
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e.isEnemy !== entity.isEnemy && e.hp > 0,
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    combat_1.cursorEntities.add(e);
                    let targets = this.targets(entity, e);
                    // targets.forEach(e => cursorEntities.add(e)); // Need a way to add grey/non-primary cursors?? 
                    combat_1.setDrawTargetArea(() => {
                        tcx_1.ctx.setLineDash([5, 5]);
                        tcx_1.ctx.lineDashOffset = -tcx_1.gNow * 10;
                        tcx_1.ctx.lineWidth = 1;
                        tcx_1.ctx.strokeStyle = "red";
                        tcx_1.ctx.beginPath();
                        tcx_1.ctx.moveTo(targets[0].position.x, targets[0].position.y);
                        for (let target of targets.slice(1)) {
                            tcx_1.ctx.lineTo(target.position.x, target.position.y);
                        }
                        tcx_1.ctx.stroke();
                        tcx_1.ctx.setLineDash([]);
                        tcx_1.ctx.lineDashOffset = 0;
                    });
                    return genericTooltip(entity, this, "Chain target", "3 Damage");
                },
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            });
        }
        ai(entity) {
            return this.command(entity, math_1.choose(combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy)));
        }
    };
    exports.ActionPSIFire = new class {
        constructor() {
            this.name = "PSI Fire α";
            this.width = 300;
            this.height = 30;
            this.cost = 3;
        }
        getPolygon(entity, targetPoint) {
            let dir = targetPoint.sub(entity.position).norm();
            if (dir.mag2() < 0.1)
                dir = new math_1.Vector(0, 1);
            let cross = dir.crossz();
            let targetingPolyPoints = [
                targetPoint.add(dir.muls(this.height / 2)).add(cross.muls(-this.width / 2)),
                targetPoint.add(dir.muls(this.height / 2)).add(cross.muls(this.width / 2)),
                targetPoint.add(dir.muls(-this.height / 2)).add(cross.muls(this.width / 2)),
                targetPoint.add(dir.muls(-this.height / 2)).add(cross.muls(-this.width / 2)),
            ];
            return collision.makePolygonFromPoints(targetingPolyPoints);
        }
        targets(entity, targetingPolygon) {
            return combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy && collision.circleOverlapsPolygons({ center: e.position, radius: e.radius }, [targetingPolygon]));
        }
        *command(entity, targetPoint) {
            if (!costMp(entity, this.cost))
                return;
            let dir = targetPoint.sub(entity.position).norm();
            if (dir.mag2() < 0.1)
                dir = new math_1.Vector(0, 1);
            let cross = dir.crossz();
            let targetingPolygon = this.getPolygon(entity, targetPoint);
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(255, 0, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            let numExplosions = 5;
            let particleLine = cross.muls(this.width / 2).divs(numExplosions);
            tcx_1.playSound("sound/fire.wav");
            for (let i = 0; i < numExplosions; i++) {
                yield* tcx_1.overTime(0.1, () => { });
                tcx_1.cameraShake(0.1, 5);
                for (let dir of [-1, 1]) {
                    let p = targetPoint.add(particleLine.muls(dir * (i + 0.5)));
                    for (let j = 0; j < 50; j++) {
                        particles_1.particles.push({
                            birthday: tcx_1.gNow,
                            expirationDate: tcx_1.gNow + 0.5,
                            startRadius: 20,
                            endRadius: 0,
                            startColor: [255, 255, 0],
                            endColor: [255, 0, 0],
                            startAlpha: 1,
                            endAlpha: 0.2,
                            position: p,
                            velocity: math_1.Vector.random().muls(200 * Math.random())
                        });
                    }
                }
            }
            let targets = this.targets(entity, targetingPolygon);
            for (let e of targets) {
                damageEntity(e, elementalDamage(entity, e, tcx_1.MagicElement.RED, 2));
            }
            if (targets.length > 0) {
                tcx_1.playSound("sound/enemyhit.wav");
            }
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetPointMenu(entity.position, {
                preview: v => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    let dir = v.sub(entity.position).norm();
                    if (dir.mag2() < 0.1)
                        dir = new math_1.Vector(0, 1);
                    let targetingPolygon = this.getPolygon(entity, v);
                    let wouldHit = this.targets(entity, targetingPolygon);
                    wouldHit.forEach(e => combat_1.cursorEntities.add(e));
                    combat_1.setDrawTargetArea(() => {
                        tcx_1.ctx.beginPath();
                        let first = true;
                        for (let p of targetingPolygon.points) {
                            if (first) {
                                tcx_1.ctx.moveTo(p.x, p.y);
                                first = false;
                            }
                            else {
                                tcx_1.ctx.lineTo(p.x, p.y);
                            }
                        }
                        tcx_1.ctx.closePath();
                        tcx_1.ctx.strokeStyle = "red";
                        tcx_1.ctx.setLineDash([5, 5]);
                        tcx_1.ctx.lineDashOffset = tcx_1.gNow * 10;
                        tcx_1.ctx.lineWidth = 1;
                        tcx_1.ctx.stroke();
                        let d = v.sub(entity.position).mag();
                        if (d > entity.radius + this.height / 2) {
                            let p1 = entity.position.towards(v, entity.radius);
                            let p2 = v.towards(entity.position, this.height / 2);
                            tcx_1.ctx.strokeStyle = "black";
                            tcx_1.ctx.globalAlpha = 0.5;
                            tcx_1.drawLinev(p2, p1);
                            tcx_1.ctx.globalAlpha = 1;
                        }
                        tcx_1.ctx.setLineDash([]);
                        tcx_1.ctx.lineDashOffset = 0;
                    });
                    return genericTooltip(entity, this, "AoE Line", "2 Damage");
                },
                select: v => combat_1.queuedCommands.set(entity, [this.command(entity, v), this.name]),
            });
        }
        ai(entity) {
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
            let target = math_1.choose(targets);
            return this.command(entity, target.position);
        }
    };
    exports.ActionWhirlwind = new class {
        constructor() {
            this.name = "Whirlwind";
            this.cost = 6;
        }
        *command(entity, targetPoint) {
            if (!costMp(entity, this.cost))
                return;
            let a = entity;
            let target = targetPoint;
            let to = getDestination(a, target);
            yield* logicMoveEntity(a, to, 0.2);
            tcx_1.playSound("sound/cyclone.wav");
            yield* tcx_1.overTime(1.200, (_, t) => {
                let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
                let angle = t * Math.PI * 6;
                let distance = curve * 50;
                a.position = to.add(new math_1.Vector(Math.cos(angle), Math.sin(angle)).muls(distance));
            });
            a.position = to;
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== a.isEnemy && tcx_1.pointsWithinDistance(e.position, a.position, e.radius + a.radius + 50));
            for (let e of targets) {
                damageEntity(e, physicalDamage(entity, e, 1));
            }
            if (targets.length > 0) {
                tcx_1.playSound("sound/enemyhit.wav");
            }
            yield* zipGenerators(targets.map(e => {
                let start = e.timeToTurn;
                let end = e.timeToTurn + 0.5;
                return tcx_1.overTime(0.25, (_, t) => {
                    e.timeToTurn = math_1.mix(start, end, t);
                });
            }));
            a.timeToTurn = a.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetPointMenu(entity.position, {
                preview: v => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    v = getDestination(entity, v);
                    combat_1.previewPosition.set(entity, v);
                    let wouldHit = combat_1.livingEntities()
                        .filter(e => e.isEnemy !== entity.isEnemy && tcx_1.pointsWithinDistance(e.position, v, e.radius + entity.radius + 50));
                    wouldHit.forEach(e => combat_1.previewTimeToTurnOverrides.set(e, e.timeToTurn + 0.5));
                    wouldHit.forEach(e => combat_1.cursorEntities.add(e));
                    combat_1.setDrawTargetArea(() => drawTargetCircle(v, entity.radius + 50));
                    return genericTooltip(entity, this, "AoE Slowing Attack", "1 Damage 0.5 Stamina");
                },
                select: v => combat_1.queuedCommands.set(entity, [this.command(entity, v), this.name]),
            });
        }
        ai(entity) {
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy);
            let target = math_1.choose(targets);
            return this.command(entity, target.position);
        }
    };
    exports.ActionSpy = new class {
        constructor() {
            this.name = "Spy";
        }
        *command(entity, targetEntity) {
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(255, 192, 125, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            yield* combat_1.showCombatDialog(targetEntity.hp + "/" + tcx_1.getEntityFatiguedMaxHealth(targetEntity), targetEntity.position);
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => true,
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Spy on " + e.name, "??");
                },
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            });
        }
        ai(entity) {
            return this.command(entity, math_1.choose(combat_1.livingEntities()));
        }
    };
    exports.ActionMeditate = new class {
        constructor() {
            this.name = "Meditate";
        }
        *command(entity) {
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => drawRing(`rgba(125, 192, 255, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            tcx_1.playSound("sound/heal.wav");
            let originalMp = entity.mp;
            yield* tcx_1.overTime(0.2, (_, t) => {
                entity.mp = math_1.clamp(math_1.mix(originalMp, originalMp + 2, t), 0, entity.maxMp);
            });
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e === entity,
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Gain an extra 2MP", "??");
                },
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity), this.name]),
            });
        }
        ai(entity) {
            return this.command(entity);
        }
    };
    exports.ActionAttack = new class {
        constructor() {
            this.name = "Attack";
        }
        *command(entity, targetEntity) {
            if (combat_1.livingEntities().indexOf(targetEntity) === -1)
                return;
            let start = entity.position;
            let mid = targetEntity.position;
            let end = getDestination(entity, mid.towards(start, 60));
            let hit = Math.random() < entity.accuracy / targetEntity.evasion;
            function bounce(t) {
                return -Math.sin(t * Math.PI * 2) * (1 - t) * 0.25 + t;
            }
            let bStart = targetEntity.position;
            let bDodgePoint = bStart.add(entity.position.sub(targetEntity.position).norm().crossz().muls(30));
            function dodgeBlend(t) {
                return 1 - (Math.cos(t * Math.PI) + 1) / 2;
            }
            yield* tcx_1.overTime(0.250, (_, t) => {
                entity.position = start.mix(mid, bounce(t));
                if (!hit) {
                    targetEntity.position = bStart.mix(bDodgePoint, dodgeBlend(t));
                }
            });
            if (hit) {
                damageEntity(targetEntity, physicalDamage(entity, targetEntity, 1));
                tcx_1.playSound("sound/enemyhit.wav");
            }
            else {
                tcx_1.effects.push(tcx_1.floatingTextEffect("Miss!", targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
                tcx_1.playSound("sound/dodge.wav");
            }
            function slow(t) {
                let s = 1 - t;
                return 1 - s * s;
            }
            yield* zipGenerators([
                tcx_1.overTime(0.150, (_, t) => {
                    entity.position = mid.mix(end, slow(t));
                }),
                (function* () {
                    if (hit) {
                        yield* shakeEntity(targetEntity, 0.2, 10);
                    }
                    else {
                        yield* tcx_1.overTime(0.150, (_, t) => {
                            targetEntity.position = bDodgePoint.mix(bStart, dodgeBlend(t));
                        });
                    }
                })()
            ]);
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e.isEnemy && e.hp > 0,
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    let finalPos = getDestination(entity, e.position.towards(entity.position, 60));
                    combat_1.previewPosition.set(entity, finalPos);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Attack " + e.name, (entity.accuracy / e.evasion * 100).toFixed() + "% chance to hit");
                },
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            });
        }
        ai(entity) {
            return this.command(entity, math_1.choose(combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy)));
        }
    };
    exports.ActionDelayingAttack = new class {
        constructor() {
            this.name = "Delaying Attack";
            this.cost = 3;
            this.ai = exports.ActionAttack.ai;
        }
        *command(entity, targetEntity) {
            if (!costMp(entity, this.cost))
                return;
            let a = entity;
            let b = targetEntity;
            if (combat_1.livingEntities().indexOf(b) === -1)
                return;
            let start = a.position;
            let mid = b.position;
            let end = getDestination(a, mid.towards(start, 60));
            let hit = Math.random() < a.accuracy / b.evasion;
            function bounce(t) {
                return -Math.sin(t * Math.PI * 2) * (1 - t) * 0.25 + t;
            }
            let bStart = b.position;
            let bDodgePoint = bStart.add(a.position.sub(b.position).norm().crossz().muls(30));
            function dodgeBlend(t) {
                return 1 - (Math.cos(t * Math.PI) + 1) / 2;
            }
            yield* tcx_1.overTime(0.250, (_, t) => {
                a.position = start.mix(mid, bounce(t));
                if (!hit) {
                    b.position = bStart.mix(bDodgePoint, dodgeBlend(t));
                }
            });
            if (hit) {
                damageEntity(b, physicalDamage(a, b, 1));
                tcx_1.playSound("sound/enemyhit.wav");
            }
            else {
                tcx_1.effects.push(tcx_1.floatingTextEffect("Miss!", b.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
                tcx_1.playSound("sound/dodge.wav");
            }
            function slow(t) {
                let s = 1 - t;
                return 1 - s * s;
            }
            yield* tcx_1.overTime(0.150, (_, t) => {
                a.position = mid.mix(end, slow(t));
                if (!hit) {
                    b.position = bDodgePoint.mix(bStart, dodgeBlend(t));
                }
            });
            a.timeToTurn = a.baseStaminaCost;
            if (hit) {
                let startB = b.timeToTurn;
                let finalB = b.timeToTurn + 2.0;
                yield* tcx_1.overTime(0.250, (_, t) => {
                    b.timeToTurn = math_1.mix(startB, finalB, t);
                });
            }
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e.isEnemy && e.hp > 0,
                preview: e => {
                    combat_1.previewTimeToTurnOverrides.set(e, e.timeToTurn + 2);
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewMana.set(entity, entity.mp - this.cost);
                    let finalPos = getDestination(entity, e.position.towards(entity.position, 60));
                    combat_1.previewPosition.set(entity, finalPos);
                    combat_1.cursorEntities.add(e);
                    return genericTooltip(entity, this, "Delaying attack " + e.name, (entity.accuracy / e.evasion * 100).toFixed() + "% chance to hit");
                },
                select: e => combat_1.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            });
        }
    };
    exports.ActionMove = new class {
        constructor() {
            this.name = "Move";
        }
        *command(entity, targetPoint) {
            yield* logicMoveEntity(entity, getDestination(entity, targetPoint), 0.300);
            entity.timeToTurn = entity.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetPointMenu(entity.position, {
                preview: v => {
                    combat_1.previewTimeToTurnOverrides.set(entity, entity.timeToTurn + entity.baseStaminaCost);
                    combat_1.previewPosition.set(entity, getDestination(entity, v));
                    return genericTooltip(entity, this, "Mosey", "??");
                },
                select: v => combat_1.queuedCommands.set(entity, [this.command(entity, v), this.name]),
            });
        }
        ai(entity) {
            return this.command(entity, new math_1.Vector(math_1.mix(combat_1.battleBounds.min.x, combat_1.battleBounds.max.x, Math.random()), math_1.mix(combat_1.battleBounds.min.y, combat_1.battleBounds.max.y, Math.random())));
        }
    };
    function getDestinationWithOverrides(a, to, overrides) {
        // The `!== null` is intentionally not `!= null` because the entity should NOT be filtered if it has no entry (i.e. when get() returns undefined)
        return collision.findClosestOpenSpot(to, a.radius, tcx_1.entities.filter(e => e !== a && overrides.get(e) !== null).map(e => {
            let override = overrides.get(e);
            // This == null check will only ever find undefined since null specifically has been filtered out
            if (override == null) {
                return { center: e.position, radius: e.radius };
            }
            else {
                return { center: override, radius: e.radius };
            }
        }), tcx_1.levelPolygons, combat_1.battleBounds);
    }
    function getDestination(a, to) {
        return collision.findClosestOpenSpot(to, a.radius, tcx_1.entities.filter(e => e !== a).map(({ position, radius }) => ({ center: position, radius })), tcx_1.levelPolygons, combat_1.battleBounds);
    }
    function* logicMoveEntity(entity, to, durationInSeconds) {
        let start = entity.position;
        yield* tcx_1.overTime(durationInSeconds, (_, t) => {
            entity.position = start.mix(to, t);
        });
    }
    function* shakeEntity(entity, duration, mag) {
        let startPos = entity.position;
        yield* tcx_1.overTime(duration, (_, t) => {
            entity.position = startPos.add(math_1.Vector.random().muls((1 - t) * mag));
        });
        entity.position = startPos;
    }
    function getComboTechs(entity) {
        let actions = [];
        for (let comboTech of exports.comboTechs) {
            if (getPairings(entity, comboTech.actions).length > 0) {
                actions.push(comboTech);
            }
        }
        return actions;
    }
    exports.getComboTechs = getComboTechs;
    function* permutations(ts, n) {
        if (n <= 0) {
            yield [];
            return;
        }
        for (let t of ts) {
            for (let rest of permutations(ts.filter(e => e !== t), n - 1)) {
                yield [t].concat(rest);
            }
        }
    }
    function getPairings(entity, actions) {
        let allies = combat_1.livingEntities().filter(e => e !== entity && e.isEnemy === entity.isEnemy);
        let pairings = [];
        if (allies.length < actions.length)
            return [];
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
    exports.getPairings = getPairings;
    function getPairing(entity, actions) {
        let pairings = getPairings(entity, actions);
        if (pairings.length > 0) {
            return pairings[math_1.mod(combat_1.globalBuddyToggle, pairings.length)];
        }
        else {
            return null;
        }
    }
    exports.getPairing = getPairing;
    exports.comboTechs.push(new class {
        constructor() {
            this.name = "X-Strike";
            this.actions = [exports.ActionCyclone, exports.ActionWhirlwind];
            this.ai = null; // TODO: add an AI implementation or change how AI works so it's not necessary
        }
        *command(entityA, entityB, targetEntity) {
            if (combat_1.livingEntities().indexOf(entityA) === -1 || entityA.timeToTurn !== 0.0 || entityA.mp < this.actions[0].cost)
                return;
            if (combat_1.livingEntities().indexOf(entityB) === -1 || entityB.timeToTurn !== 0.0 || entityB.mp < this.actions[1].cost)
                return;
            if (combat_1.livingEntities().indexOf(targetEntity) === -1)
                return;
            costMp(entityA, this.actions[0].cost);
            costMp(entityB, this.actions[1].cost);
            let startA = entityA.position;
            let startB = entityB.position;
            let mid = targetEntity.position;
            let endA = getDestinationWithOverrides(entityA, mid.towards(startA, -60), new Map([[entityB, null]]));
            let endB = getDestinationWithOverrides(entityB, mid.towards(startB, -60), new Map([[entityA, endA]]));
            let launchA = mid.towards(endA, -300);
            let launchB = mid.towards(endB, -300);
            function slow(t) {
                let s = 1 - t;
                return 1 - s * s;
            }
            yield* tcx_1.overTime(0.200, (_, t) => {
                entityA.position = startA.mix(launchA, slow(t));
                entityB.position = startB.mix(launchB, slow(t));
            });
            let shouldDrawTrail = true;
            tcx_1.effects.push(function* () {
                while (shouldDrawTrail) {
                    tcx_1.ctx.save();
                    tcx_1.ctx.globalAlpha = 0.5;
                    tcx_1.ctx.strokeStyle = "red";
                    tcx_1.ctx.lineWidth = entityA.radius;
                    tcx_1.drawLinev(launchA, entityA.position);
                    tcx_1.ctx.lineWidth = entityB.radius;
                    tcx_1.drawLinev(launchB, entityB.position);
                    tcx_1.ctx.restore();
                    yield;
                }
                yield* tcx_1.overTime(1.0, (_, t) => {
                    tcx_1.ctx.save();
                    tcx_1.ctx.globalAlpha = 0.5 * (1 - t);
                    tcx_1.ctx.strokeStyle = "red";
                    tcx_1.ctx.lineWidth = entityA.radius;
                    tcx_1.drawLinev(launchA, endA);
                    tcx_1.ctx.lineWidth = entityB.radius;
                    tcx_1.drawLinev(launchB, endB);
                    tcx_1.ctx.globalAlpha = 1;
                    tcx_1.ctx.restore();
                });
            }());
            yield* tcx_1.overTime(0.150, (_, t) => {
                entityA.position = launchA.mix(mid, t);
                entityB.position = launchB.mix(mid, t);
            });
            damageEntity(targetEntity, physicalDamage(entityA, targetEntity, 2) + physicalDamage(entityB, targetEntity, 2));
            tcx_1.playSound("sound/enemyhit.wav");
            tcx_1.cameraShake(0.2, 10);
            yield* tcx_1.overTime(0.050, (_, t) => {
                entityA.position = mid.mix(endA, slow(t));
                entityB.position = mid.mix(endB, slow(t));
            });
            shouldDrawTrail = false;
            entityA.timeToTurn = entityA.baseStaminaCost;
            entityB.timeToTurn = entityB.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetEntityMenu({
                filter: e => e.isEnemy && e.hp > 0,
                preview: e => {
                    let pair = getPairing(entity, this.actions);
                    if (pair == null)
                        return null;
                    let [entityA, entityB] = pair;
                    combat_1.previewTimeToTurnOverrides.set(entityB, entityB.timeToTurn + entityB.baseStaminaCost);
                    combat_1.previewTimeToTurnOverrides.set(entityA, entityA.timeToTurn + entityA.baseStaminaCost);
                    combat_1.previewMana.set(entityA, entityA.mp - this.actions[0].cost);
                    combat_1.previewMana.set(entityB, entityB.mp - this.actions[1].cost);
                    let finalPosA = getDestinationWithOverrides(entityA, e.position.towards(entityA.position, -60), new Map([[entityB, null]]));
                    let finalPosB = getDestinationWithOverrides(entityB, e.position.towards(entityB.position, -60), new Map([[entityA, finalPosA]]));
                    combat_1.previewPosition.set(entityA, finalPosA);
                    combat_1.previewPosition.set(entityB, finalPosB);
                    combat_1.cursorEntities.add(e);
                    return genericComboTooltip(pair, this, "Double AoE attack");
                },
                select: e => {
                    let pair = getPairing(entity, this.actions);
                    if (pair != null) {
                        combat_1.queuedCommands.set(entity, [this.command(pair[0], pair[1], e), this.name]);
                    }
                },
            });
        }
    });
    exports.comboTechs.push(new class {
        constructor() {
            this.name = "Maelstrom";
            this.actions = [exports.ActionCyclone, exports.ActionCyclone];
            this.ai = null; // TODO: see XStrike.ai
        }
        *command(entityA, entityB, targetPoint) {
            if (combat_1.livingEntities().indexOf(entityA) === -1 || entityA.timeToTurn !== 0.0 || entityA.mp < this.actions[0].cost)
                return;
            if (combat_1.livingEntities().indexOf(entityB) === -1 || entityB.timeToTurn !== 0.0 || entityB.mp < this.actions[1].cost)
                return;
            costMp(entityA, this.actions[0].cost);
            costMp(entityB, this.actions[1].cost);
            let to = getDestinationWithOverrides(entityA, targetPoint, new Map([[entityB, null]]));
            let buddyDst = getDestinationWithOverrides(entityB, to.add(entityB.position.sub(entityA.position).norm().muls(entityA.radius + entityB.radius)), new Map([[entityA, to]]));
            yield* logicMoveEntity(entityA, to, 0.2);
            yield* logicMoveEntity(entityB, to, 0.2);
            tcx_1.playSound("sound/cyclone.wav");
            function spewParticle(a, b) {
                particles_1.particles.push({
                    birthday: tcx_1.gNow,
                    expirationDate: tcx_1.gNow + 1.0,
                    startRadius: 15,
                    endRadius: 5,
                    startColor: [0, 255, 255],
                    endColor: [0, 0, 255],
                    startAlpha: 0.2,
                    endAlpha: 0,
                    position: b,
                    velocity: b.sub(a).norm().muls(100).add(math_1.Vector.random().muls(20)),
                });
            }
            let prevParticleSpawns = [[to, to], [to, to]];
            yield* zipGenerators([
                tcx_1.nOverTime(1.200, 100, () => {
                    for (let i = 0; i < prevParticleSpawns.length; i++) {
                        spewParticle(prevParticleSpawns[i][0], prevParticleSpawns[i][1]);
                    }
                }),
                tcx_1.overTime(1.200, (_, t) => {
                    let curve = 0.5 - Math.cos(t * Math.PI * 2) / 2;
                    let angle = t * Math.PI * 6;
                    let distance = curve * 50;
                    entityA.position = to.add(math_1.Vector.fromAngle(angle).muls(distance));
                    entityB.position = to.add(math_1.Vector.fromAngle(angle + Math.PI).muls(distance));
                    let particleSpawns = [to.add(math_1.Vector.fromAngle(angle).muls(distance + entityA.radius)), to.add(math_1.Vector.fromAngle(angle + Math.PI).muls(distance + entityB.radius))];
                    for (let i = 0; i < prevParticleSpawns.length; i++) {
                        prevParticleSpawns[i][0] = prevParticleSpawns[i][1];
                        prevParticleSpawns[i][1] = particleSpawns[i];
                    }
                })
            ]);
            entityA.position = to;
            let targets = combat_1.livingEntities().filter(e => e.isEnemy !== entityA.isEnemy && tcx_1.pointsWithinDistance(e.position, entityA.position, e.radius + Math.max(entityA.radius, entityB.radius) + 50));
            for (let e of targets) {
                damageEntity(e, physicalDamage(entityA, e, 2) + physicalDamage(entityB, e, 2));
            }
            if (targets.length > 0) {
                tcx_1.playSound("sound/enemyhit.wav");
            }
            yield* logicMoveEntity(entityB, buddyDst, 0.05);
            entityA.timeToTurn = entityA.baseStaminaCost;
            entityB.timeToTurn = entityB.baseStaminaCost;
        }
        menu(entity) {
            return combat_1.targetPointMenu(entity.position, {
                preview: v => {
                    let pair = getPairing(entity, this.actions);
                    if (pair == null)
                        return null;
                    let [entityA, entityB] = pair;
                    combat_1.previewTimeToTurnOverrides.set(entityB, entityB.timeToTurn + entityB.baseStaminaCost);
                    combat_1.previewTimeToTurnOverrides.set(entityA, entityA.timeToTurn + entityA.baseStaminaCost);
                    combat_1.previewMana.set(entityA, entityA.mp - this.actions[0].cost);
                    combat_1.previewMana.set(entityB, entityB.mp - this.actions[1].cost);
                    let finalPosA = getDestinationWithOverrides(entityA, v, new Map([[entityB, null]]));
                    let finalPosB = getDestinationWithOverrides(entityB, finalPosA.add(entityB.position.sub(entityA.position).norm().muls(entityA.radius + entityB.radius)), new Map([[entityA, finalPosA]]));
                    combat_1.previewPosition.set(entityA, finalPosA);
                    combat_1.previewPosition.set(entityB, finalPosB);
                    let wouldHit = combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy && tcx_1.pointsWithinDistance(e.position, finalPosA, e.radius + Math.max(entityA.radius, entityB.radius) + 50));
                    wouldHit.forEach(e => combat_1.cursorEntities.add(e));
                    combat_1.setDrawTargetArea(() => drawTargetCircle(finalPosA, Math.max(entityA.radius, entityB.radius) + 50));
                    return genericComboTooltip(pair, this, "Double AoE attack");
                },
                select: v => {
                    let pair = getPairing(entity, this.actions);
                    if (pair != null) {
                        combat_1.queuedCommands.set(entity, [this.command(pair[0], pair[1], v), this.name]);
                    }
                },
            });
        }
    });
});
// End of Combo techs
//========== 
//# sourceMappingURL=techs.js.map
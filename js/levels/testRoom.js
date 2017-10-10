define(["require", "exports", "tcx", "collision", "particles", "svg", "math", "techs", "combat", "dialog"], function (require, exports, tcx_1, collision_1, particles_1, svg_1, math_1, techs_1, combat_1, dialog_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function* levelLogic(svg) {
        let entryPoint = svg_1.getSVGCirclePosition(svg, "#entryPoint");
        tcx_1.placeEntitiesAtSpot(tcx_1.entities.filter(e => !e.isEnemy), entryPoint);
        let doorPoly = svg_1.getSVGPolygons(svg, "#beachDoor");
        let npcPos = svg_1.getSVGCirclePosition(svg, "#testNPC");
        let npcGuy = {
            name: "NPC Guy",
            position: npcPos,
            radius: 40,
            hp: 20,
            maxHp: 20,
            baseStaminaCost: 1.2,
            fatigue: 0,
            mp: 0,
            startingMp: 0,
            maxMp: 20,
            rateMp: 3,
            timeToTurn: 7.0,
            accuracy: 90,
            evasion: 100,
            attack: 10,
            defense: 10,
            magicPower: 10,
            resistance: 10,
            affinities: [0, 0, 1],
            shape: "square",
            color: "magenta",
            isEnemy: true,
            isInCombat: false,
            actions: [techs_1.ActionMove, new class {
                    constructor() {
                        this.name = "HYPERBEAM";
                        this.countdown = 3;
                        this.menu = null;
                    }
                    *command(entity) {
                        let message;
                        if (this.countdown > 0) {
                            message = this.countdown + "!";
                        }
                        else {
                            message = entity.name + " uses HYPERBEAM!!!";
                        }
                        yield* combat_1.showCombatDialog(message, entity.position);
                        if (this.countdown <= 0) {
                            this.countdown = 3;
                            tcx_1.effects.push(tcx_1.overTime(1.5, (_, t) => {
                                tcx_1.ctx.strokeStyle = `rgba(125, 0, 255, ${(1 - t) * 0.5})`;
                                tcx_1.ctx.lineWidth = 1 + 30 * (1 - t);
                                tcx_1.ctx.beginPath();
                                tcx_1.ctx.arc(entity.position.x, entity.position.y, entity.radius + 15 + t * 60, 0, Math.PI * 2);
                                tcx_1.ctx.closePath();
                                tcx_1.ctx.stroke();
                            }));
                            yield* tcx_1.overTime(0.75, () => { });
                            for (let i = 0; i < 7; i++) {
                                yield* tcx_1.overTime(0.05 * (7 - i), () => { });
                                tcx_1.cameraShake(0.2, 3 * i);
                                tcx_1.playSound("sound/enemyhit.wav");
                                for (let j = 0; j < 30; j++) {
                                    let duration = 0.5;
                                    let vel = math_1.Vector.random().muls(400).divs(duration);
                                    particles_1.particles.push({
                                        birthday: tcx_1.gNow,
                                        expirationDate: tcx_1.gNow + duration,
                                        startRadius: 0,
                                        endRadius: 30,
                                        startColor: [125, 0, 255],
                                        endColor: [255, 0, 255],
                                        startAlpha: 1,
                                        endAlpha: 0.0,
                                        position: entity.position.add(vel.muls(-duration)),
                                        velocity: vel,
                                    });
                                }
                            }
                            yield* tcx_1.overTime(0.7, () => { });
                            tcx_1.cameraShake(1, 200);
                            yield* tcx_1.overTime(1, (_, t) => {
                                tcx_1.playSound("sound/enemyhit.wav");
                                tcx_1.effects.push(tcx_1.overTime(0.08, (_, t) => {
                                    tcx_1.ctx.strokeStyle = `rgba(0, 255, 255, ${(1 - t) * 0.5})`;
                                    tcx_1.ctx.lineWidth = 1 + 30 * (1 - t);
                                    tcx_1.ctx.beginPath();
                                    tcx_1.ctx.arc(entity.position.x, entity.position.y, entity.radius + 300 - t * 300, 0, Math.PI * 2);
                                    tcx_1.ctx.closePath();
                                    tcx_1.ctx.stroke();
                                }));
                                for (let j = 0; j < 120 * t; j++) {
                                    let duration = 0.08;
                                    let vel = math_1.Vector.random().muls(1000).divs(duration);
                                    particles_1.particles.push({
                                        birthday: tcx_1.gNow,
                                        expirationDate: tcx_1.gNow + duration,
                                        startRadius: 20,
                                        endRadius: 40,
                                        startColor: [125, 0, 255],
                                        endColor: [0, 125, 255],
                                        startAlpha: 0.5,
                                        endAlpha: 0.0,
                                        position: entity.position,
                                        velocity: vel,
                                    });
                                }
                            });
                            yield* tcx_1.overTime(0.5, () => { });
                            yield* combat_1.showCombatDialog("It's super effective!", entity.position);
                            for (let e of combat_1.livingEntities().filter(e => e.isEnemy !== entity.isEnemy)) {
                                techs_1.damageEntity(e, techs_1.elementalDamage(entity, e, tcx_1.MagicElement.BLACK, 3));
                            }
                            tcx_1.playSound("sound/enemyhit.wav");
                        }
                        else {
                            this.countdown -= 1;
                        }
                        entity.timeToTurn = entity.baseStaminaCost;
                    }
                    ai(entity) {
                        return this.command(entity);
                    }
                }],
        };
        let npcGuy2 = {
            name: "NPC Guy",
            position: npcPos.add(new math_1.Vector(-200, 0)),
            radius: 40,
            hp: 20,
            maxHp: 20,
            fatigue: 0,
            mp: 0,
            startingMp: 0,
            maxMp: 0,
            rateMp: 0,
            baseStaminaCost: 1.2,
            timeToTurn: 7.0,
            accuracy: 90,
            evasion: 100,
            attack: 10,
            defense: 10,
            magicPower: 10,
            resistance: 10,
            affinities: [0, 0, 0],
            shape: "square",
            color: "magenta",
            isEnemy: true,
            isInCombat: false,
            actions: [],
        };
        tcx_1.entities.push(npcGuy);
        tcx_1.entities.push(npcGuy2);
        tcx_1.setCameraFocus(tcx_1.entities.filter(e => !e.isEnemy)[0].position);
        yield* tcx_1.fadeIn();
        while (true) {
            let entity = tcx_1.entities.filter(e => !e.isEnemy)[0];
            while (tcx_1.menuInputs.length > 0) {
                let input = tcx_1.menuInputs.shift();
                if (input === "select") {
                    if (entity != null && npcGuy.hp > 0 && npcGuy.position.sub(entity.position).mag() < entity.radius + npcGuy.radius + 50 &&
                        (yield* dialog_1.dialog("<0.3>.<0.4>.<0.5>.\nKick his butt?", ["No", "Yes"])) === 1 &&
                        (yield* dialog_1.dialog("ARE YOU SURE?!", ["Nah", "Nope", "No way", "YES!"])) === 3) {
                        let bounds = { min: new math_1.Vector(90, 96), max: new math_1.Vector(90, 96).add(new math_1.Vector(1000, 600)) };
                        let startingPosition = entity.position;
                        yield* tcx_1.movePartyToPoint(entity.position, bounds);
                        npcGuy.isInCombat = true;
                        tcx_1.entities.filter(e => !e.isEnemy).forEach(e => e.isInCombat = true);
                        yield* combat_1.gameBattle(bounds);
                        yield* tcx_1.movePartyToPoint(startingPosition, bounds);
                    }
                    else if (entity != null && npcGuy2.hp > 0 && npcGuy2.position.sub(entity.position).mag() < entity.radius + npcGuy2.radius + 50) {
                        if (npcGuy.hp > 0) {
                            yield* dialog_1.dialog("Psst!<*>\nBeat up my brother and I'll give you a prize!", ["Okay"]);
                        }
                        else {
                            yield* dialog_1.dialog("I lied!\nYou get<0.3> N<0.4>O<0.35>T<0.3>H<0.25>I<0.2>N<0.15>G<0.1>!", ["aw"]);
                        }
                    }
                }
            }
            if (entity != null && collision_1.circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, doorPoly)) {
                return "testLevel";
            }
            else {
                yield* tcx_1.gameExplore();
            }
        }
    }
    exports.levelLogic = levelLogic;
});
//# sourceMappingURL=testRoom.js.map
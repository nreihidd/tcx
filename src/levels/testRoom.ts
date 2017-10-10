import {MagicElement, ctx, CursorLayout, effects, overTime, cameraShake, Entity, draw, getWindowScale, UI_FONT, canvas, gNow, menuInputs, playSound, wantFastDialog, previousLevel, placeEntitiesAtSpot, entities, cameraFocus, fadeIn, movePartyToPoint, gameExplore, setCameraFocus} from "tcx";
import {circleOverlapsPolygons} from "collision";
import {particles} from "particles";
import {getSVGCirclePosition, getSVGPolygons} from "svg";
import {Vector, mod} from "math";
import {elementalDamage, ActionCyclone, ActionMove, ActionAttack, ActionNotInterested, damageEntity, Action} from "techs";
import {livingEntities, showCombatDialog, gameBattle} from "combat";
import {dialog} from "dialog";

export function* levelLogic(svg: SVGSVGElement): IterableIterator<any> {
    let entryPoint = getSVGCirclePosition(svg, "#entryPoint");
    placeEntitiesAtSpot(entities.filter(e => !e.isEnemy), entryPoint);

    let doorPoly = getSVGPolygons(svg, "#beachDoor");
    
    let npcPos = getSVGCirclePosition(svg, "#testNPC");
    let npcGuy: Entity = {
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
        actions: [ActionMove, new class implements Action {
            name = "HYPERBEAM";
            countdown = 3;
            *command(entity: Entity) {
                let message: string;
                if (this.countdown > 0) {
                    message = this.countdown + "!";
                } else {
                    message = entity.name + " uses HYPERBEAM!!!"
                }
                yield* showCombatDialog(message, entity.position);
                if (this.countdown <= 0) {
                    this.countdown = 3;
                    effects.push(overTime(1.5, (_, t) => {
                        ctx.strokeStyle = `rgba(125, 0, 255, ${ (1 - t) * 0.5 })`;
                        ctx.lineWidth = 1 + 30 * (1 - t);
                        ctx.beginPath();
                        ctx.arc(entity.position.x, entity.position.y, entity.radius + 15 + t * 60, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.stroke();
                    }));
                    yield* overTime(0.75, () => {});
                    for (let i = 0; i < 7; i++) {
                        yield* overTime(0.05 * (7 - i), () => {});
                        cameraShake(0.2, 3 * i);
                        playSound("sound/enemyhit.wav");
                        for (let j = 0; j < 30; j++) {
                            let duration = 0.5;
                            let vel = Vector.random().muls(400).divs(duration);
                            particles.push({
                                birthday: gNow,
                                expirationDate: gNow + duration,
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
                    yield* overTime(0.7, () => {});
                    cameraShake(1, 200);
                    yield* overTime(1, (_, t) => {
                        playSound("sound/enemyhit.wav");
                        effects.push(overTime(0.08, (_, t) => {
                            ctx.strokeStyle = `rgba(0, 255, 255, ${ (1 - t) * 0.5 })`;
                            ctx.lineWidth = 1 + 30 * (1 - t);
                            ctx.beginPath();
                            ctx.arc(entity.position.x, entity.position.y, entity.radius + 300 - t * 300, 0, Math.PI * 2);
                            ctx.closePath();
                            ctx.stroke();
                        }));
                        for (let j = 0; j < 120 * t; j++) {
                            let duration = 0.08;
                            let vel = Vector.random().muls(1000).divs(duration);
                            particles.push({
                                birthday: gNow,
                                expirationDate: gNow + duration,
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
                    yield* overTime(0.5, () => {});
                    yield* showCombatDialog("It's super effective!", entity.position);
                    for (let e of livingEntities().filter(e => e.isEnemy !== entity.isEnemy)) {
                        damageEntity(e, elementalDamage(entity, e, MagicElement.BLACK, 3));
                    }
                    playSound("sound/enemyhit.wav");
                } else {
                    this.countdown -= 1;
                }
                entity.timeToTurn = entity.baseStaminaCost;
            }
            menu = null as any;
            ai(entity: Entity) {
                return this.command(entity);
            }
        }],
    };
    let npcGuy2: Entity = {
        name: "NPC Guy",
        position: npcPos.add(new Vector(-200, 0)),
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
    entities.push(npcGuy);
    entities.push(npcGuy2);

    setCameraFocus(entities.filter(e => !e.isEnemy)[0].position);

    yield* fadeIn();

    while (true) {
        let entity = entities.filter(e => !e.isEnemy)[0];
        while (menuInputs.length > 0) {
            let input = menuInputs.shift();
            if (input === "select") {
                if (entity != null && npcGuy.hp > 0 && npcGuy.position.sub(entity.position).mag() < entity.radius + npcGuy.radius + 50 &&
                    (yield* dialog("<0.3>.<0.4>.<0.5>.\nKick his butt?", ["No", "Yes"])) === 1 &&
                    (yield* dialog("ARE YOU SURE?!", ["Nah", "Nope", "No way", "YES!"])) === 3)
                {
                    let bounds = {min: new Vector(90, 96), max: new Vector(90, 96).add(new Vector(1000, 600))};
                    let startingPosition = entity.position;
                    yield* movePartyToPoint(entity.position, bounds);
                    npcGuy.isInCombat = true;
                    entities.filter(e => !e.isEnemy).forEach(e => e.isInCombat = true);
                    yield* gameBattle(bounds);
                    yield* movePartyToPoint(startingPosition, bounds);
                }
                else if (entity != null && npcGuy2.hp > 0 && npcGuy2.position.sub(entity.position).mag() < entity.radius + npcGuy2.radius + 50)
                {
                    if (npcGuy.hp > 0) {
                        yield* dialog("Psst!<*>\nBeat up my brother and I'll give you a prize!", ["Okay"]);
                    } else {
                        yield* dialog("I lied!\nYou get<0.3> N<0.4>O<0.35>T<0.3>H<0.25>I<0.2>N<0.15>G<0.1>!", ["aw"]);
                    }
                }
            }
        }
        if (entity != null && circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, doorPoly)) {
            return "testLevel";
        } else {
            yield* gameExplore();
        }
    }
}
import {Entity, addItemToInventory, previousLevel, placeEntitiesAtSpot, entities, fadeIn, movePartyToPoint, gameExplore, setCameraFocus} from "tcx";
import {circleOverlapsPolygons} from "collision";
import {getSVGCirclePosition, getSVGPolygons} from "svg";
import {Vector} from "math";
import {ActionCyclone, ActionMove, ActionAttack, ActionNotInterested} from "techs";
import {gameBattle} from "combat";
import {dialog} from "dialog";
import {ItemPotion} from "items";

export function* levelLogic(svg: SVGSVGElement): IterableIterator<any> {
    console.log("Entered");
    let entryPoint = getSVGCirclePosition(svg, "#entryPoint");
    let fromTown = getSVGCirclePosition(svg, "#fromTown");
    let entrySpot = previousLevel === "testTown" ? fromTown : entryPoint;
    placeEntitiesAtSpot(entities.filter(e => !e.isEnemy), entrySpot);

    let yellowPos = getSVGCirclePosition(svg, "#yellowSpawn");
    let bluePos = getSVGCirclePosition(svg, "#blueSpawn");
    let purplePos = getSVGCirclePosition(svg, "#purpleSpawn");

    let triangleCombatZone = getSVGPolygons(svg, "#triangleCombat");
    let doorPoly = getSVGPolygons(svg, "#hutDoor");
    let toTown = getSVGPolygons(svg, "#toTown");

    let yellowTri: Entity = {
        name: "Tasmanian Triangle",
        position: yellowPos,
        radius: 30,
        hp: 20,
        maxHp: 20,
        fatigue: 16,
        mp: 0,
        startingMp: 0,
        maxMp: 10,
        rateMp: 2,
        baseStaminaCost: 1.2,
        timeToTurn: 7.0,
        accuracy: 90,
        evasion: 100,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [0, -1, 0],

        shape: "triangle",
        color: "orange",
        isEnemy: true,
        isInCombat: false,
        actions: [ActionCyclone],
    };
    let blueTri: Entity = {
        name: "Enraged Triangle",
        position: bluePos,
        radius: 30,
        hp: 20,
        maxHp: 20,
        fatigue: 15,
        mp: 0,
        startingMp: 0,
        maxMp: 0,
        rateMp: 0,
        baseStaminaCost: 1.5,
        timeToTurn: 5.0,
        accuracy: 90,
        evasion: 100,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [1, 0, 0],

        shape: "triangle",
        color: "blue",
        isEnemy: true,
        isInCombat: false,
        actions: [ActionAttack],
    };
    let purpleTri: Entity = {
        name: "Aloof Triangle",
        position: purplePos,
        radius: 30,
        hp: 6,
        maxHp: 20,
        fatigue: 14,
        mp: 0,
        startingMp: 0,
        maxMp: 50,
        rateMp: 3,
        baseStaminaCost: 2.35,
        timeToTurn: 6.0,
        accuracy: 90,
        evasion: 200,

        attack: 10,
        defense: 10,
        magicPower: 10,
        resistance: 10,
        affinities: [0, 0, 0],

        shape: "triangle",
        color: "purple",
        isEnemy: true,
        isInCombat: false,
        actions: [ActionMove, ActionNotInterested],
    };
    let tris = [yellowTri, blueTri, purpleTri];
    tris.forEach(tri => entities.push(tri));

    setCameraFocus(entities.filter(e => !e.isEnemy)[0].position);

    yield* fadeIn();

    while (true) {
        let entity = entities.filter(e => !e.isEnemy)[0];
        if (entity != null && tris.every(tri => entities.indexOf(tri) !== -1) && circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, triangleCombatZone)) {
            console.log("Entering battle");
            let bounds = {min: new Vector(788.0709228515625, 707.8781127929688), max: new Vector(1788.0709228515625,1307.8781127929688)};
            let startingPosition = entity.position;
            entities.forEach(e => e.isInCombat = true);
            yield* movePartyToPoint(entity.position, bounds);
            if (yield* gameBattle(bounds)) {
                yield* dialog("You received Potion x1", []);
                addItemToInventory(ItemPotion);
            }
            yield* movePartyToPoint(startingPosition, bounds);
        } else if (entity != null && circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, doorPoly)) {
            return "testRoom";
        } else if (entity != null && circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, toTown)) {
            return "testTown";
        } else {
            yield* gameExplore();
        }
    }
}
define(["require", "exports", "tcx", "collision", "svg", "math", "techs", "combat", "dialog", "items"], function (require, exports, tcx_1, collision_1, svg_1, math_1, techs_1, combat_1, dialog_1, items_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function* levelLogic(svg) {
        console.log("Entered");
        let entryPoint = svg_1.getSVGCirclePosition(svg, "#entryPoint");
        let fromTown = svg_1.getSVGCirclePosition(svg, "#fromTown");
        let entrySpot = tcx_1.previousLevel === "testTown" ? fromTown : entryPoint;
        tcx_1.placeEntitiesAtSpot(tcx_1.entities.filter(e => !e.isEnemy), entrySpot);
        let yellowPos = svg_1.getSVGCirclePosition(svg, "#yellowSpawn");
        let bluePos = svg_1.getSVGCirclePosition(svg, "#blueSpawn");
        let purplePos = svg_1.getSVGCirclePosition(svg, "#purpleSpawn");
        let triangleCombatZone = svg_1.getSVGPolygons(svg, "#triangleCombat");
        let doorPoly = svg_1.getSVGPolygons(svg, "#hutDoor");
        let toTown = svg_1.getSVGPolygons(svg, "#toTown");
        let yellowTri = {
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
            actions: [techs_1.ActionCyclone],
        };
        let blueTri = {
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
            actions: [techs_1.ActionAttack],
        };
        let purpleTri = {
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
            actions: [techs_1.ActionMove, techs_1.ActionNotInterested],
        };
        let tris = [yellowTri, blueTri, purpleTri];
        tris.forEach(tri => tcx_1.entities.push(tri));
        tcx_1.setCameraFocus(tcx_1.entities.filter(e => !e.isEnemy)[0].position);
        yield* tcx_1.fadeIn();
        while (true) {
            let entity = tcx_1.entities.filter(e => !e.isEnemy)[0];
            if (entity != null && tris.every(tri => tcx_1.entities.indexOf(tri) !== -1) && collision_1.circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, triangleCombatZone)) {
                console.log("Entering battle");
                let bounds = { min: new math_1.Vector(788.0709228515625, 707.8781127929688), max: new math_1.Vector(1788.0709228515625, 1307.8781127929688) };
                let startingPosition = entity.position;
                tcx_1.entities.forEach(e => e.isInCombat = true);
                yield* tcx_1.movePartyToPoint(entity.position, bounds);
                if (yield* combat_1.gameBattle(bounds)) {
                    yield* dialog_1.dialog("You received Potion x1", []);
                    tcx_1.addItemToInventory(items_1.ItemPotion);
                }
                yield* tcx_1.movePartyToPoint(startingPosition, bounds);
            }
            else if (entity != null && collision_1.circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, doorPoly)) {
                return "testRoom";
            }
            else if (entity != null && collision_1.circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, toTown)) {
                return "testTown";
            }
            else {
                yield* tcx_1.gameExplore();
            }
        }
    }
    exports.levelLogic = levelLogic;
});
//# sourceMappingURL=testLevel.js.map
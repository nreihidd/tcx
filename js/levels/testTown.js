define(["require", "exports", "tcx", "collision", "svg"], function (require, exports, tcx_1, collision_1, svg_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function* levelLogic(svg) {
        console.log("Entered Town");
        let fromBeach = svg_1.getSVGCirclePosition(svg, "#fromBeach");
        tcx_1.placeEntitiesAtSpot(tcx_1.entities.filter(e => !e.isEnemy), fromBeach);
        let toBeach = svg_1.getSVGPolygons(svg, "#toBeach");
        tcx_1.setCameraFocus(tcx_1.entities.filter(e => !e.isEnemy)[0].position);
        yield* tcx_1.fadeIn();
        while (true) {
            let entity = tcx_1.entities.filter(e => !e.isEnemy)[0];
            if (entity != null && collision_1.circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, toBeach)) {
                return "testLevel";
            }
            else {
                yield* tcx_1.gameExplore();
            }
        }
    }
    exports.levelLogic = levelLogic;
});
//# sourceMappingURL=testTown.js.map
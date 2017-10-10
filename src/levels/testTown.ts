import {fadeIn, entities, placeEntitiesAtSpot, gameExplore, setCameraFocus} from "tcx";
import {circleOverlapsPolygons} from "collision";
import {getSVGCirclePosition, getSVGPolygons} from "svg";

export function* levelLogic(svg: SVGSVGElement): IterableIterator<any> {
    console.log("Entered Town");
    let fromBeach = getSVGCirclePosition(svg, "#fromBeach");
    placeEntitiesAtSpot(entities.filter(e => !e.isEnemy), fromBeach);

    let toBeach = getSVGPolygons(svg, "#toBeach");

    setCameraFocus(entities.filter(e => !e.isEnemy)[0].position);

    yield* fadeIn();

    while (true) {
        let entity = entities.filter(e => !e.isEnemy)[0];
        if (entity != null && circleOverlapsPolygons({ center: entity.position, radius: entity.radius }, toBeach)) {
            return "testLevel";
        } else {
            yield* gameExplore();
        }
    }
}
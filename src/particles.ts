import {ctx, gNow, deltaTime} from "tcx";
import {Vector, mix} from "math";

export interface Particle {
    position: Vector,
    velocity: Vector,
    birthday: number,
    expirationDate: number,
    startRadius: number,
    endRadius: number,
    startColor: [number, number, number];
    endColor: [number, number, number];
    startAlpha: number;
    endAlpha: number;
}

export let particles: Particle[] = [];

export function drawParticles() {
    let cursor = 0;
    ctx.lineCap = "round";
    for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        if (gNow < p.expirationDate) {
            let t = (gNow - p.birthday) / (p.expirationDate - p.birthday);

            let radius = mix(p.startRadius, p.endRadius, t);
            let oldPos = p.position.add(p.velocity.norm().muls(-radius));
            p.position = p.position.add(p.velocity.muls(deltaTime));
            let sc = p.startColor;
            let ec = p.endColor;
            let color = [Math.round(mix(sc[0], ec[0], t)), Math.round(mix(sc[1], ec[1], t)), Math.round(mix(sc[2], ec[2], t))];
            ctx.strokeStyle = "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + mix(p.startAlpha, p.endAlpha, t) + ")";
            ctx.lineWidth = radius;
            ctx.beginPath();
            ctx.moveTo(oldPos.x, oldPos.y);
            ctx.lineTo(p.position.x, p.position.y);
            ctx.stroke();
            // ctx.arc(p.position.x, p.position.y, mix(p.startRadius, p.endRadius, t), 0, Math.PI * 2);
            // ctx.fill();
            particles[cursor] = p;
            cursor += 1;
        }
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
    while (particles.length > cursor) { particles.pop(); }
}
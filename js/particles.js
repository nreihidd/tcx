define(["require", "exports", "tcx", "math"], function (require, exports, tcx_1, math_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.particles = [];
    function drawParticles() {
        let cursor = 0;
        tcx_1.ctx.lineCap = "round";
        for (let i = 0; i < exports.particles.length; i++) {
            let p = exports.particles[i];
            if (tcx_1.gNow < p.expirationDate) {
                let t = (tcx_1.gNow - p.birthday) / (p.expirationDate - p.birthday);
                let radius = math_1.mix(p.startRadius, p.endRadius, t);
                let oldPos = p.position.add(p.velocity.norm().muls(-radius));
                p.position = p.position.add(p.velocity.muls(tcx_1.deltaTime));
                let sc = p.startColor;
                let ec = p.endColor;
                let color = [Math.round(math_1.mix(sc[0], ec[0], t)), Math.round(math_1.mix(sc[1], ec[1], t)), Math.round(math_1.mix(sc[2], ec[2], t))];
                tcx_1.ctx.strokeStyle = "rgba(" + color[0] + "," + color[1] + "," + color[2] + "," + math_1.mix(p.startAlpha, p.endAlpha, t) + ")";
                tcx_1.ctx.lineWidth = radius;
                tcx_1.ctx.beginPath();
                tcx_1.ctx.moveTo(oldPos.x, oldPos.y);
                tcx_1.ctx.lineTo(p.position.x, p.position.y);
                tcx_1.ctx.stroke();
                // ctx.arc(p.position.x, p.position.y, mix(p.startRadius, p.endRadius, t), 0, Math.PI * 2);
                // ctx.fill();
                exports.particles[cursor] = p;
                cursor += 1;
            }
        }
        tcx_1.ctx.lineCap = "butt";
        tcx_1.ctx.globalAlpha = 1;
        while (exports.particles.length > cursor) {
            exports.particles.pop();
        }
    }
    exports.drawParticles = drawParticles;
});
//# sourceMappingURL=particles.js.map
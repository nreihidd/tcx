define(["require", "exports", "tcx", "layout", "math", "combat", "particles", "techs"], function (require, exports, tcx_1, Layout, math_1, Combat, particles_1, techs_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function genericItemTooltip(entity, item, description, someExtraLineOfSomething) {
        let count = tcx_1.inventory.get(item) || 0;
        return Layout.vertical([
            new Layout.Text(item.name, [48, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(description, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text("x1 Stamina", [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(count + "→" + (count - 1), [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
            new Layout.Text(someExtraLineOfSomething, [24, tcx_1.UI_FONT], tcx_1.TOOLTIP_COLOR),
        ]);
    }
    exports.ItemPotion = new class {
        constructor() {
            this.name = "Potion";
        }
        *command(entity, targetEntity) {
            if ((tcx_1.inventory.get(this) || 0) <= 0)
                return;
            if (Combat.livingEntities().indexOf(targetEntity) === -1)
                return;
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => techs_1.drawRing(`rgba(0, 255, 0, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            tcx_1.effects.push(tcx_1.floatingTextEffect("-1x " + this.name, targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
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
            tcx_1.removeItemFromInventory(this);
        }
        menu(entity) {
            return Combat.targetEntityMenu({
                filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
                select: e => Combat.queuedCommands.set(entity, [this.command(entity, e), this.name]),
                preview: e => {
                    Combat.previewHealth.set(e, e.hp + 2);
                    Combat.cursorEntities.add(e);
                    return genericItemTooltip(entity, this, "Heal " + e.name + " for 2 hp", "2 HP");
                }
            });
        }
    };
    exports.ItemJerky = new class {
        constructor() {
            this.name = "Jerky";
        }
        *command(entity, targetEntity) {
            if ((tcx_1.inventory.get(this) || 0) <= 0)
                return;
            if (Combat.livingEntities().indexOf(targetEntity) === -1)
                return;
            tcx_1.effects.push(tcx_1.overTime(0.5, (_, t) => techs_1.drawRing(`rgba(0, 255, 125, ${(1 - t) * 0.5})`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
            tcx_1.effects.push(tcx_1.floatingTextEffect("-1x " + this.name, targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 0, 0], 1));
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
            tcx_1.effects.push(tcx_1.floatingTextEffect("+2", targetEntity.position.add(new math_1.Vector(0, 20)), new math_1.Vector(0, -100), [0, 255, 125], 1));
            targetEntity.fatigue = math_1.clamp(targetEntity.fatigue - 2, 0, targetEntity.maxHp);
            targetEntity.hp = math_1.clamp(targetEntity.hp + 2, 0, tcx_1.getEntityFatiguedMaxHealth(targetEntity));
            entity.timeToTurn = entity.baseStaminaCost;
            tcx_1.removeItemFromInventory(this);
        }
        menu(entity) {
            return Combat.targetEntityMenu({
                filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
                select: e => Combat.queuedCommands.set(entity, [this.command(entity, e), this.name]),
                preview: e => {
                    Combat.previewHealth.set(e, e.hp + 2);
                    Combat.cursorEntities.add(e);
                    return genericItemTooltip(entity, this, "Heal " + e.name + " for 2 fatigue", "2 FP");
                }
            });
        }
    };
});
//# sourceMappingURL=items.js.map
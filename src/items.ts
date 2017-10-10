import {removeItemFromInventory, inventory, Item, drawLinev, levelPolygons, cameraShake, entities, getEntityFatiguedMaxHealth, floatingTextEffect, gNow, ctx, effects, zip, Entity, ImmediateMenu, UI_FONT, TOOLTIP_COLOR, playSound, overTime, nOverTime, pointsWithinDistance} from "tcx";
import * as Layout from "layout";
import {Vector, choose, clamp, mix, mod} from "math";
import * as Combat from "combat";
import {particles} from "particles";
import {drawRing} from "techs";

function genericItemTooltip(entity: Entity, item: Item, description: string, someExtraLineOfSomething: string): Layout.Layout {
    let count = inventory.get(item) || 0;
    return Layout.vertical([
        new Layout.Text(item.name, [48, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(description, [24, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text("x1 Stamina", [24, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(count + "→" + (count - 1), [24, UI_FONT], TOOLTIP_COLOR),
        new Layout.Text(someExtraLineOfSomething, [24, UI_FONT], TOOLTIP_COLOR),
    ]);
}

export let ItemPotion = new class implements Item {
    name = "Potion";
    *command(entity: Entity, targetEntity: Entity) {
        if ((inventory.get(<any>this) || 0) <= 0) return;
        if (Combat.livingEntities().indexOf(targetEntity) === -1) return;

        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 0, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        effects.push(floatingTextEffect("-1x " + this.name, targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));
        
        playSound("sound/heal.wav");
        for (let i = 0; i < 100; i++) {
            particles.push({
                birthday: gNow,
                expirationDate: gNow + 1.0,
                startRadius: 0,
                endRadius: 5,
                startColor: [0, 255, 0],
                endColor: [192, 255, 0],
                startAlpha: 1,
                endAlpha: 0,
                position: targetEntity.position,
                velocity: Vector.random().muls(200 * Math.random())
            });
        }
        yield* overTime(1.0, () => {});
        
        effects.push(floatingTextEffect("+2", targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 255, 0], 1));

        targetEntity.hp = clamp(targetEntity.hp + 2, 0, getEntityFatiguedMaxHealth(targetEntity));
        entity.timeToTurn = entity.baseStaminaCost;
        removeItemFromInventory(<any>this);
    }
    menu(entity: Entity) {
        return Combat.targetEntityMenu({
            filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
            select: e => Combat.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            preview: e => {
                Combat.previewHealth.set(e, e.hp + 2);
                Combat.cursorEntities.add(e);
                return genericItemTooltip(entity, <any>this, "Heal " + e.name + " for 2 hp", "2 HP");
            }
        });
    }
};

export let ItemJerky = new class implements Item {
    name = "Jerky";
    *command(entity: Entity, targetEntity: Entity) {
        if ((inventory.get(<any>this) || 0) <= 0) return;
        if (Combat.livingEntities().indexOf(targetEntity) === -1) return;

        effects.push(overTime(0.5, (_, t) => drawRing(`rgba(0, 255, 125, ${ (1 - t) * 0.5 })`, 1 + 10 * (1 - t), entity.position, entity.radius + 5 + t * 20)));
        effects.push(floatingTextEffect("-1x " + this.name, targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 0, 0], 1));
        
        playSound("sound/heal.wav");
        for (let i = 0; i < 100; i++) {
            particles.push({
                birthday: gNow,
                expirationDate: gNow + 1.0,
                startRadius: 0,
                endRadius: 5,
                startColor: [0, 255, 0],
                endColor: [192, 255, 0],
                startAlpha: 1,
                endAlpha: 0,
                position: targetEntity.position,
                velocity: Vector.random().muls(200 * Math.random())
            });
        }
        yield* overTime(1.0, () => {});
        
        effects.push(floatingTextEffect("+2", targetEntity.position.add(new Vector(0, 20)), new Vector(0, -100), [0, 255, 125], 1));

        targetEntity.fatigue = clamp(targetEntity.fatigue - 2, 0, targetEntity.maxHp);
        targetEntity.hp = clamp(targetEntity.hp + 2, 0, getEntityFatiguedMaxHealth(targetEntity));
        entity.timeToTurn = entity.baseStaminaCost;
        removeItemFromInventory(<any>this);
    }
    menu(entity: Entity) {
        return Combat.targetEntityMenu({
            filter: e => e.isEnemy === entity.isEnemy && e.hp > 0,
            select: e => Combat.queuedCommands.set(entity, [this.command(entity, e), this.name]),
            preview: e => {
                Combat.previewHealth.set(e, e.hp + 2);
                Combat.cursorEntities.add(e);
                return genericItemTooltip(entity, <any>this, "Heal " + e.name + " for 2 fatigue", "2 FP");
            }
        });
    }
};
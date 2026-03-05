import { world, system, Player, } from "@minecraft/server";
const inventoryDataBase = {};
// 1. 죽었을 때 아이템 수거 및 메시지 출력
world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    if (deadEntity instanceof Player) {
        const player = deadEntity;
        const location = player.location;
        const dimension = player.dimension;
        system.run(() => {
            const droppedItems = dimension.getEntities({
                location: location,
                maxDistance: 2,
                type: "minecraft:item",
            });
            const itemsToSave = [];
            droppedItems.forEach((itemEntity) => {
                const itemComponent = itemEntity.getComponent("item");
                if (itemComponent && itemComponent.itemStack) {
                    itemsToSave.push({ itemStack: itemComponent.itemStack.clone() });
                    itemEntity.remove(); // 바닥 아이템 제거
                }
            });
            if (itemsToSave.length > 0) {
                inventoryDataBase[player.name] = itemsToSave;
            }
        });
    }
});
// 2. 부활 시 아이템 복구
world.afterEvents.playerSpawn.subscribe((event) => {
    const { player, initialSpawn } = event;
    // 플레이어에게 경고/안내 메시지 출력 (화면 중앙 타이틀이나 채팅)
    player.sendMessage("§l§c[※] §r§c사망 후 리스폰하지 않고 게임을 나갈 시 보유 중인 §4모든 아이템이 소멸§c됩니다.");
    if (initialSpawn)
        return;
    system.run(() => {
        const saved = inventoryDataBase[player.name];
        if (saved) {
            const inv = player.getComponent("inventory");
            const container = inv.container;
            if (!container)
                return;
            saved.forEach((data) => {
                const remaining = container.addItem(data.itemStack);
                if (remaining) {
                    player.dimension.spawnItem(remaining, player.location);
                }
            });
            delete inventoryDataBase[player.name];
        }
    });
});
// 3. ★ 핵심: 플레이어가 나갈 때 데이터 청소 ★
world.afterEvents.playerLeave.subscribe((event) => {
    const playerName = event.playerName;
    if (inventoryDataBase[playerName]) {
        delete inventoryDataBase[playerName];
    }
});

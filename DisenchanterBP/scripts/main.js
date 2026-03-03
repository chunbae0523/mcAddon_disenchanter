import { world, system, ItemStack, BlockTypes } from "@minecraft/server";

const DISENCHANTER_ID = "chunbae0523:disenchanter";
const ARROW_PARTICLE = "chunbae0523:display_arrow";
const ITEM_LIST = [
  "axe",
  "boots",
  "chestplate",
  "elytra",
  "helmet",
  "hoe",
  "leggings",
  "pickaxe",
  "shovel",
  "sword",
  "book",
];
const TICK_INTERVAL = 20;

// 각 블록의 상태를 저장하는 맵
const blockState = new Map();

// 유틸리티: 좌표를 정수 키로 변환
function getBlockKey(loc) {
  return `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
}

// 1. [디스플레이 로직] 상시 파티클 및 시선 가이드
system.runInterval(() => {
  // 1. 작업 중인 모든 블록 파티클 (상시 표시)
  for (const [blockKey, state] of blockState.entries()) {
    try {
      const [x, y, z] = blockKey.split(",").map(Number);
      const dimId = state.dimensionId || "minecraft:overworld";
      const dim = world.getDimension(dimId);

      // [수정 포인트] isValid()를 제거하고 가장 보수적으로 체크합니다.
      const block = dim.getBlock({ x, y, z });

      // 1. 블록 객체가 아예 없으면 스킵 (언로드된 청크)
      if (!block) continue;

      // 2. [추가 방어선] typeId에 접근했을 때 에러가 안 나면 유효한 블록입니다.
      if (block.typeId === undefined) continue;

      const particleLoc = { x: x + 0.5, y: y + 1, z: z + 0.5 };

      dim.spawnParticle(`chunbae0523:number_${state.neededBooks}`, particleLoc);
      dim.spawnParticle(`chunbae0523:book`, {
        ...particleLoc,
        y: particleLoc.y + 0.5,
      });
    } catch (e) {
      // 여기서 에러가 잡힌다면 십중팔구 청크가 언로드된 것입니다.
      // 조용히 넘어가도록(continue) 둡니다.
      continue;
    }
  }

  // 2. 비어있는 블록 가이드 (기존과 동일)
  for (const player of world.getAllPlayers()) {
    const raycast = player.getBlockFromViewDirection({ maxDistance: 7 });
    if (!raycast || raycast.block.typeId !== DISENCHANTER_ID) continue;

    const blockLoc = raycast.block.location;
    const blockKey = getBlockKey(blockLoc);

    if (!blockState.has(blockKey)) {
      const currentProgress = system.currentTick % TICK_INTERVAL;
      if (currentProgress < 2) continue;

      const index =
        Math.floor(system.currentTick / TICK_INTERVAL) % ITEM_LIST.length;
      const particleLoc = {
        x: blockLoc.x + 0.5,
        y: blockLoc.y + 1,
        z: blockLoc.z + 0.5,
      };

      player.dimension.spawnParticle(ARROW_PARTICLE, particleLoc);
      player.dimension.spawnParticle(`chunbae0523:${ITEM_LIST[index]}`, {
        ...particleLoc,
        y: particleLoc.y + 0.5,
      });
    }
  }
}, 2);

// 2. [블록 파괴 로직] 작업 중 파괴 시 아이템 반환
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { block, dimension } = event;
  if (block.typeId !== DISENCHANTER_ID) return;

  const blockKey = getBlockKey(block.location);
  const state = blockState.get(blockKey);

  if (state) {
    const { x, y, z } = block.location;
    const dropLoc = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };

    system.run(() => {
      dimension.spawnItem(state.itemStack, dropLoc);
      const insertedCount = state.enchantments.length - state.neededBooks;
      if (insertedCount > 0) {
        dimension.spawnItem(
          new ItemStack("minecraft:book", insertedCount),
          dropLoc,
        );
      }
    });
    blockState.delete(blockKey);
  }
});

// 파일 상단에 처리 중임을 나타내는 Set 추가
const processingPlayers = new Set();

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block } = event;
  if (block.typeId !== DISENCHANTER_ID) return;

  // 1. [재귀 방지] 현재 해당 플레이어의 이벤트가 처리 중이라면 무시
  if (processingPlayers.has(player.id)) {
    event.cancel = true;
    return;
  }

  const container = player.getComponent("minecraft:inventory").container;
  const slotIndex = player.selectedSlotIndex;
  const heldItem = container.getItem(slotIndex);

  const blockLoc = block.location;
  const blockKey = getBlockKey(blockLoc);
  const state = blockState.get(blockKey);

  // 2. [설치 로직] 작업 중 아닐 때 웅크리고 설치 (이건 시스템 로직이 아니므로 잠금 불필요)
  const placeableIds = ["minecraft:redstone", "minecraft:string"];
  const isPlaceable =
    heldItem &&
    (BlockTypes.get(heldItem.typeId) !== undefined ||
      heldItem.hasComponent("minecraft:block_placer") ||
      placeableIds.includes(heldItem.typeId));

  if (!state && player.isSneaking && isPlaceable) return;

  // --- 여기서부터는 커스텀 로직이므로 이벤트 취소 ---
  event.cancel = true;

  // 잠금 시작
  processingPlayers.add(player.id);

  system.run(() => {
    try {
      const dropLoc = {
        x: blockLoc.x + 0.5,
        y: blockLoc.y + 0.8,
        z: blockLoc.z + 0.5,
      };

      // 3. [웅크리기 회수 로직]
      if (state && player.isSneaking) {
        player.dimension.spawnItem(state.itemStack, dropLoc);
        const insertedCount = state.enchantments.length - state.neededBooks;
        if (insertedCount > 0) {
          player.dimension.spawnItem(
            new ItemStack("minecraft:book", insertedCount),
            dropLoc,
          );
        }
        blockState.delete(blockKey);
        player.dimension.playSound("block.itemframe.remove_item", blockLoc);
        return; // 처리 완료
      }

      // 4. [투입 로직 (작업 중 아닐 때)]
      if (!state) {
        if (!heldItem) {
          player.onScreenDisplay.setActionBar({
            rawtext: [{ translate: "disenchanter.msg.cannot_disenchant" }],
          });
          return;
        }

        const enchantable = heldItem.getComponent("minecraft:enchantable");
        const enchantments = enchantable?.getEnchantments();

        // 인챈트가 없거나 작업 불가능하면 종료
        if (!enchantments || enchantments.length === 0) {
          player.onScreenDisplay.setActionBar({
            rawtext: [{ translate: "disenchanter.msg.cannot_disenchant" }],
          });
          return;
        }

        // 아이템 소모 및 데이터 등록
        container.setItem(slotIndex, undefined);
        blockState.set(blockKey, {
          itemStack: heldItem.clone(),
          enchantments: enchantments,
          neededBooks: enchantments.length,
          dimensionId: player.dimension.id,
        });

        player.dimension.playSound("conduit.activate", blockLoc, {
          pitch: 4.5,
        });
        player.dimension.playSound("cauldron.add_dye", blockLoc);
      }

      // 5. [책 투입 로직]
      else if (heldItem?.typeId === "minecraft:book") {
        state.neededBooks -= 1;
        if (heldItem.amount > 1) {
          heldItem.amount -= 1;
          container.setItem(slotIndex, heldItem);
        } else {
          container.setItem(slotIndex, undefined);
        }
        player.dimension.playSound(
          "insert_enchanted.chiseled_bookshelf",
          blockLoc,
        );

        if (state.neededBooks <= 0) {
          blockState.delete(blockKey);
          completeDisenchant(player, block, state);
        }
      }

      // 6. [예외] 작업 중인데 인챈트된 아이템을 또 들고 클릭한 경우
      else {
        player.onScreenDisplay.setActionBar({
          rawtext: [{ translate: "disenchanter.msg.sneak_click_to_cancel" }],
        });
      }
    } finally {
      // 7. [잠금 해제] 모든 처리가 끝난 후(성공/실패 무관) 다음 입력을 허용
      processingPlayers.delete(player.id);
    }
  });
});

// 4. [완료 로직]
function completeDisenchant(player, block, state) {
  const dim = player.dimension;
  const loc = {
    x: block.location.x + 0.5,
    y: block.location.y + 1,
    z: block.location.z + 0.5,
  };

  let returnedItem = state.itemStack.clone();

  if (returnedItem.typeId === "minecraft:enchanted_book") {
    returnedItem = new ItemStack("minecraft:book", 1);
  } else {
    const enchantable = returnedItem.getComponent("minecraft:enchantable");
    if (enchantable) enchantable.removeAllEnchantments();
  }

  dim.spawnItem(returnedItem, loc);

  for (const enchant of state.enchantments) {
    const book = new ItemStack("minecraft:enchanted_book", 1);
    const bookEnchantable = book.getComponent("minecraft:enchantable");
    if (bookEnchantable) {
      bookEnchantable.addEnchantment(enchant);
      dim.spawnItem(book, loc);
    }
  }

  dim.playSound("respawn_anchor.set_spawn", block.location, {
    pitch: 3.5,
    volume: 0.6,
  });
}

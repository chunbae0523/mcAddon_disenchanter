import {
  world,
  system,
  Player,
  ItemStack,
  ItemUseAfterEvent,
  EntityHealthComponent,
  Dimension,
  Vector3,
  EquipmentSlot,
  Block,
  EntityDamageCause,
  EntitySwingSource,
  EntityInitializationCause,
} from "@minecraft/server";
import { ActionFormData, ActionFormResponse } from "@minecraft/server-ui";

// ==========================================
// 1. TYPES & INTERFACES
// ==========================================
interface SkillLevel {
  cost: number;
  desc: string;
}

interface SkillBranch {
  id: string;
  name: string;
  icon: string;
  levels: SkillLevel[];
}

interface SkillRoot {
  id: string;
  name: string;
  cost: number;
  desc: string;
  max_lvl: number;
  icon: string;
}

interface SkillCategory {
  title: string;
  color: string;
  root: SkillRoot;
  branches: SkillBranch[];
}

interface SkillTree {
  [key: string]: SkillCategory;
}

// ==========================================
// 2. CONFIGURATION
// ==========================================
const SKILL_TREE: SkillTree = {
  industry: {
    title: "skill.tree.industry.title",
    color: "§2",
    root: {
      id: "ind_root",
      name: "skill.tree.industry.name",
      cost: 15,
      desc: "skill.tree.industry.desc",
      max_lvl: 1,
      icon: "textures/ui/icons/icon_mashupworld", //world_glyph_color
    },
    branches: [
      {
        id: "ind_miner",
        name: "skill.tree.industry.miner.name",
        icon: "textures/ui/haste_effect",
        levels: [
          { cost: 10, desc: "skill.tree.industry.miner.level1" },
          { cost: 20, desc: "skill.tree.industry.miner.level2" },
          { cost: 30, desc: "skill.tree.industry.miner.level3" },
        ],
      },
      {
        id: "ind_lumber",
        name: "skill.tree.industry.lumber.name",
        icon: "textures/items/diamond_axe",
        levels: [
          { cost: 15, desc: "skill.tree.industry.lumber.level1" },
          { cost: 25, desc: "skill.tree.industry.lumber.level2" },
        ],
      },
      {
        id: "ind_pion",
        name: "skill.tree.industry.pioneer.name",
        icon: "textures/ui/speed_effect",
        levels: [
          { cost: 10, desc: "skill.tree.industry.pioneer.level1" },
          { cost: 20, desc: "skill.tree.industry.pioneer.level2" },
          { cost: 35, desc: "skill.tree.industry.pioneer.level3" },
        ],
      },
    ],
  },
  might: {
    title: "skill.tree.might.title",
    color: "§4",
    root: {
      id: "might_root",
      name: "skill.tree.might.root.name",
      cost: 15,
      desc: "skill.tree.might.root.desc",
      max_lvl: 1,
      icon: "textures/ui/icons/icon_piratesofthecaribbean", // textures/ui/hardcore/heart
    },
    branches: [
      {
        id: "might_berserk",
        name: "skill.tree.might.berserker.name",
        icon: "textures/ui/strength_effect",
        levels: [
          { cost: 5, desc: "skill.tree.might.berserker.level1" },
          { cost: 15, desc: "skill.tree.might.berserker.level2" },
          { cost: 30, desc: "skill.tree.might.berserker.level3" },
        ],
      },
      {
        id: "might_sentinel",
        name: "skill.tree.might.sentinel.name",
        icon: "textures/ui/resistance_effect",
        levels: [
          { cost: 10, desc: "skill.tree.might.sentinel.level1" },
          { cost: 20, desc: "skill.tree.might.sentinel.level2" },
        ],
      },
      {
        id: "might_ranger",
        name: "skill.tree.might.ranger.name",
        icon: "textures/items/bow_standby",
        levels: [
          { cost: 5, desc: "skill.tree.might.ranger.level1" },
          { cost: 15, desc: "skill.tree.might.ranger.level2" },
          { cost: 25, desc: "skill.tree.might.ranger.level3" },
        ],
      },
    ],
  },
  agility: {
    title: "skill.tree.agility.title",
    color: "§5",
    root: {
      id: "agi_root",
      name: "skill.tree.agility.root.name",
      cost: 15,
      desc: "skill.tree.agility.root.desc",
      max_lvl: 1,
      icon: "textures/ui/icons/icon_blackfriday", // textures/ui/accessibility_glyph_color
    },
    branches: [
      {
        id: "agi_teleporter",
        name: "skill.tree.agility.teleporter.name",
        icon: "textures/items/ender_pearl",
        levels: [
          { cost: 30, desc: "skill.tree.agility.teleporter.level1" },
          { cost: 35, desc: "skill.tree.agility.teleporter.level2" },
          { cost: 40, desc: "skill.tree.agility.teleporter.level3" },
        ],
      },
      {
        id: "agi_dreamer",
        name: "skill.tree.agility.dreamer.name",
        icon: "textures/items/recovery_compass_item",
        levels: [
          { cost: 30, desc: "skill.tree.agility.dreamer.level1" },
          { cost: 40, desc: "skill.tree.agility.dreamer.level2" },
        ],
      },
      {
        id: "agi_overlord",
        name: "skill.tree.agility.overlord.name",
        icon: "textures/items/echo_shard",
        levels: [{ cost: 50, desc: "skill.tree.agility.overlord.level1" }],
      },
    ],
  },
};

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================
function getSkillLevel(player: Player, skillId: string): number {
  const val = player.getDynamicProperty(skillId);
  return typeof val === "number" ? val : 0;
}

function setSkillLevel(player: Player, skillId: string, level: number): void {
  player.setDynamicProperty(skillId, level);
}

/**
 * 특정 위치 주변의 나무 블록을 찾아 목록에 추가하는 헬퍼 함수
 */
function findNextLogs(
  loc: Vector3,
  dimension: Dimension,
  visited: Set<string>,
  targetList: Vector3[],
) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;

        const nextLoc: Vector3 = {
          x: loc.x + dx,
          y: loc.y + dy,
          z: loc.z + dz,
        };
        const key = `${nextLoc.x},${nextLoc.y},${nextLoc.z}`;

        if (visited.has(key)) continue;

        try {
          const block = dimension.getBlock(nextLoc);
          // 태그를 사용하여 모든 종류의 나무 대응
          if (block && block.typeId.includes("log")) {
            visited.add(key);
            targetList.push(nextLoc);
          }
        } catch (e) {
          // 로드되지 않은 청크 예외 처리
        }
      }
    }
  }
}
/**
 * 찹트리 메인 실행 함수
 */
export function breakConnectedLogs(startBlock: Block, player: Player) {
  const dimension = startBlock.dimension;
  const visited = new Set<string>();
  const startLoc = startBlock.location;

  // 첫 블록 위치는 이미 부서졌으므로 방문 처리만 함
  visited.add(`${startLoc.x},${startLoc.y},${startLoc.z}`);

  // 이번 틱에 부술 블록들 (첫 틱 지연 방지를 위해 주변을 먼저 탐색)
  let currentLevel: Vector3[] = [];
  findNextLogs(startLoc, dimension, visited, currentLevel);

  if (currentLevel.length === 0) return;

  let logsBroken = 0;
  const maxLogs = 128; // 최대 벌목 개수 제한

  const intervalId = system.runInterval(() => {
    // 중단 조건
    if (currentLevel.length === 0 || logsBroken >= maxLogs) {
      system.clearRun(intervalId);
      return;
    }

    const nextLevel: Vector3[] = [];

    // 현재 레벨의 모든 갈래를 동시에 처리 (확산형)
    for (const loc of currentLevel) {
      if (logsBroken >= maxLogs) break;

      try {
        const block = dimension.getBlock(loc);
        if (block && block.typeId.includes("log")) {
          dimension.runCommand(
            `setblock ${loc.x} ${loc.y} ${loc.z} air destroy`,
          );
          logsBroken++;

          // 3. 다음 갈래 탐색
          findNextLogs(loc, dimension, visited, nextLevel);
        }
      } catch (e) {}
    }

    // 4. 피드백: 틱당 한 번만 소리 재생
    player.playSound("dig.wood");

    // 5. 다음 갈래로 교체
    currentLevel = nextLevel;
  }, 4); // 4틱 = 0.2초 간격
}
// 사과 드랍 실행 함수
function dropAppleWithChance(
  player: Player,
  blockLoc: Vector3,
  chancePercentage: number,
) {
  const random = Math.random() * 100; // 0 ~ 100 사이 난수

  if (random <= chancePercentage) {
    // 사과 아이템 생성 (확률 성공 시)
    const dim = player.dimension;
    const centerLoc = {
      x: blockLoc.x + 0.5,
      y: blockLoc.y + 0.5,
      z: blockLoc.z + 0.5,
    };
    dim.spawnItem(new ItemStack("minecraft:apple", 1), centerLoc);
    player.playSound("random.pop");
    for (let i = 0; i < 4; i++) {
      const offset = {
        x: centerLoc.x + (Math.random() - 0.5) * 0.8,
        y: centerLoc.y + (Math.random() - 0.5) * 0.8,
        z: centerLoc.z + (Math.random() - 0.5) * 0.8,
      };
      dim.spawnParticle("minecraft:villager_happy", offset);
    }
  }
}

function isPlayerPlaced(block: Block) {
  const blockKey = `${block.location.x},${block.location.y},${block.location.z}`;
  return world.getDynamicProperty(blockKey) === true;
}

// 최근에 블록과 상호작용했는지 확인하기 위한 맵
const processingPlayers = new Set();

// ==========================================
// 4. UI SYSTEM & COMMANDS
// ==========================================
function isSkillBook(item: ItemStack | undefined): boolean {
  if (!item) return false;
  return item.typeId === "chunbae0523:skill_book";
}

world.afterEvents.itemUse.subscribe((event: ItemUseAfterEvent) => {
  const player = event.source;
  if (processingPlayers.has(player.id)) {
    processingPlayers.delete(player.id);
    return;
  }
  if (isSkillBook(event.itemStack)) {
    system.run(() => {
      playMagicEffect(player);
      showMasterTree(player, false);
    });
  }
});

function playMagicEffect(player: Player): void {
  player.playSound("item.book.page_turn");
  try {
    const head = player.getHeadLocation();
    player.dimension.spawnParticle("minecraft:endrod", {
      x: head.x,
      y: head.y + 0.5,
      z: head.z,
    });
  } catch (e) {}
}

interface ButtonAction {
  type: "toggle" | "header" | "root" | "branch";
  key?: string;
  index?: number;
}

function showMasterTree(player: Player, refundMode: boolean): void {
  const form = new ActionFormData()
    .title({ translate: "skill.ui.title" })
    .body({
      translate: "skill.ui.body",
      with: [player.level.toString()],
    });

  const buttonMap: ButtonAction[] = [];

  // 모드 전환 버튼 등록
  form.button(
    { translate: refundMode ? "skill.ui.mode.forget" : "skill.ui.mode.learn" },
    refundMode
      ? "textures/ui/icon_trash"
      : "textures/ui/achievements_pause_menu_icon",
  );
  buttonMap.push({ type: "toggle" });

  const disciplines: (keyof typeof SKILL_TREE)[] = [
    "industry",
    "might",
    "agility",
  ];

  for (const key of disciplines) {
    const data = SKILL_TREE[key];
    const root = data.root;
    const rootLvl = getSkillLevel(player, root.id);

    // 챕터 버튼 등록
    form.button(
      {
        rawtext: [
          { text: `${data.color}§l======= ` }, // 색상과 굵게 효과
          { translate: data.title }, // .lang 파일의 제목 키값
          { text: " =======" }, // 서식 초기화
        ],
      },
      "textures/ui/chat_down_arrow",
    );
    buttonMap.push({ type: "header", key: key as string });

    const rootTxt = {
      rawtext: [
        { text: `${data.color}§l` },
        { translate: root.name },
        { text: `§r` },
      ],
    };
    let rootSub: any;

    if (refundMode) {
      // 회수 모드
      rootSub =
        rootLvl > 0
          ? {
              translate: "skill.status.forget",
              with: [Math.floor(root.cost / 10).toString()],
            }
          : { translate: "skill.status.unknown" };
    } else {
      // 습득 모드
      rootSub =
        rootLvl > 0
          ? {
              rawtext: [{ translate: "skill.status.mastered" }],
            }
          : { translate: "skill.status.learn", with: [root.cost.toString()] };
    }

    // 직업 버튼 등록
    form.button(
      {
        rawtext: [
          ...rootTxt.rawtext, // 위에서 만든 이름 파트 풀어서 넣기
          { text: "\n" }, // 줄바꿈
          rootSub, // 상태/비용 파트
          { text: `§r§o - ` },
          { translate: root.desc },
        ],
      },
      root.icon,
    );
    buttonMap.push({ type: "root", key: key as string });

    data.branches.forEach((b, i) => {
      const lvl = getSkillLevel(player, b.id);
      const max = b.levels.length;
      const isMaxLvl = lvl >= max;

      const gauge = "§l" + "◆".repeat(lvl) + "◇".repeat(max - lvl) + "§r";

      // 1. 이름 부분 정의 (색상 + 들여쓰기 + 스킬명)
      const nameBase = { text: `${data.color}` };
      const nameLabel = { translate: b.name };
      let descPart;
      let nameSuffix: any;

      // 2. 상태 문구 정의 (학습/망각 모드에 따른 분기)
      let statusPart: any;

      if (refundMode) {
        // [망각 모드]
        descPart = { translate: b.levels[Math.max(lvl - 1, 0)].desc };
        nameSuffix = { text: `${gauge}` };
        statusPart =
          lvl > 0
            ? {
                translate: "skill.status.forget",
                with: [Math.floor(b.levels[lvl - 1].cost / 10).toString()],
              }
            : { translate: "skill.status.unknown" };
      } else {
        // [학습 모드]
        descPart = { translate: b.levels[Math.min(lvl, max - 1)].desc };
        if (isMaxLvl) {
          nameSuffix = { text: "◆".repeat(max) };
          statusPart = { translate: "skill.status.max" }; // 완전 정복
        } else {
          const next = b.levels[lvl];
          nameSuffix = { text: `${gauge}` };
          statusPart = {
            rawtext: [
              {
                translate: "skill.status.learn",
                with: [next.cost.toString()],
              },
            ],
          }; // [학습] 5L: 설명
        }
      }

      // 3. 버튼 등록 (RawText 배열로 조립)
      form.button(
        {
          rawtext: [
            nameBase,
            nameLabel,
            { text: " " },
            nameSuffix,
            { text: "\n" },
            statusPart,
            { text: "§r§o - " },
            descPart,
          ],
        },
        b.icon,
      );

      buttonMap.push({ type: "branch", key: key as string, index: i });
    });
  }

  form.show(player).then((r: ActionFormResponse) => {
    if (r.canceled || r.selection === undefined) return;

    const action = buttonMap[r.selection];
    const reOpen = () => showMasterTree(player, refundMode);

    if (action.type === "toggle") {
      if (!refundMode)
        player.playSound("trial_spawner.close_shutter", { pitch: 0.5 });
      else player.playSound("trial_spawner.open_shutter", { pitch: 1.5 });
      showMasterTree(player, !refundMode);
      return;
    }
    if (action.type === "header") {
      const categoryKey = action.key as keyof typeof SKILL_TREE;
      const data = SKILL_TREE[categoryKey];

      // 상세 정보를 보여주는 새 창 띄우기
      const detailForm = new ActionFormData()
        .title({
          rawtext: [{ text: `${data.color}§l` }, { translate: data.title }],
        }) // 카테고리 제목
        .body({ translate: `skill.tree.${categoryKey}.detail` }) // 상세 설명 키값
        .button({ translate: "skill.ui.back" }, "textures/ui/arrow_left_white"); // 돌아가기 버튼

      detailForm.show(player).then((result: ActionFormResponse) => {
        if (result.canceled) return -1;
        else reOpen();
      });
      return;
    }

    const categoryKey = action.key as keyof typeof SKILL_TREE;
    const data = SKILL_TREE[categoryKey];

    if (action.type === "root") {
      const root = data.root;
      const lvl = getSkillLevel(player, root.id);

      if (refundMode) {
        if (lvl > 0) {
          const hasBranch = data.branches.some(
            (b) => getSkillLevel(player, b.id) > 0,
          );
          if (hasBranch) {
            player.sendMessage({ translate: "skill.warn.need_forget_under" });
            player.playSound("note.bass", { pitch: 1.2 });
          } else {
            player.addLevels(Math.floor(root.cost / 10));
            setSkillLevel(player, root.id, 0);
            player.playSound("block.false_permissions");
          }
        }
      } else if (lvl === 0) {
        if (player.level >= root.cost) {
          player.addLevels(-root.cost);
          setSkillLevel(player, root.id, 1);
          player.playSound("random.levelup");
        } else {
          player.sendMessage({
            translate: "skill.warn.low_level",
            with: [root.cost.toString()],
          });
          player.playSound("note.bass", { pitch: 1.2 });
        }
      }
      reOpen();
    }

    if (action.type === "branch" && action.index !== undefined) {
      const branch = data.branches[action.index];
      const lvl = getSkillLevel(player, branch.id);
      const rootLvl = getSkillLevel(player, data.root.id);

      if (refundMode) {
        if (lvl > 0) {
          player.addLevels(Math.floor(branch.levels[lvl - 1].cost / 10));
          setSkillLevel(player, branch.id, lvl - 1);
          player.playSound("block.false_permissions");
        }
      } else {
        if (rootLvl < 1) {
          player.sendMessage({ translate: "skill.warn.need_origin" });
          player.playSound("note.bass", { pitch: 1.2 });
        } else if (lvl < branch.levels.length) {
          const next = branch.levels[lvl];
          if (player.level >= next.cost) {
            player.addLevels(-next.cost);
            setSkillLevel(player, branch.id, lvl + 1);
            if (lvl + 1 == branch.levels.length)
              player.playSound("random.levelup");
            else player.playSound("random.orb");
          } else {
            player.sendMessage({
              translate: "skill.warn.low_level",
              with: [next.cost.toString()],
            });
            player.playSound("note.bass", { pitch: 1.2 });
          }
        }
      }
      reOpen();
    }
  });
}

// ==========================================
// 5. PASSIVE LOOPS
// ==========================================
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    applyPassives(player);
  }
}, 20);

// for Firework Rocket (Pioneer Lvl 3)
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const pioneerLvl = getSkillLevel(player, "ind_pion");
    if (pioneerLvl >= 3) {
      const inventory = player.getComponent("minecraft:inventory")?.container;
      if (inventory)
        inventory.addItem(new ItemStack("minecraft:firework_rocket", 5));
    }
  }
}, 6000);

function applyPassives(player: Player): void {
  // miner: 성급함 / 야간투시
  const minerLvl = getSkillLevel(player, "ind_miner");
  if (minerLvl >= 1) {
    player.addEffect("haste", 220, {
      amplifier: Math.min(minerLvl - 1, 1),
      showParticles: false,
    });
    if (minerLvl === 3)
      player.addEffect("night_vision", 300, {
        amplifier: 0,
        showParticles: false,
      });
  }

  // pioneer: 신속
  const pioneerLvl = getSkillLevel(player, "ind_pion");
  if (pioneerLvl >= 1) {
    player.addEffect("speed", 220, {
      amplifier: Math.min(pioneerLvl - 1, 1),
      showParticles: false,
    });
  }

  // might_root: 체력 +4 / might_sentinel: 체력 +4
  let totalHp = 0;
  const sentinelLvl = getSkillLevel(player, "might_sentinel");

  // sentinel: 저항
  if (sentinelLvl >= 1) {
    player.addEffect("resistance", 220, {
      amplifier: 0,
      showParticles: false,
    });
    if (sentinelLvl === 2) totalHp += 1;
  }
  if (getSkillLevel(player, "might_root") >= 1) totalHp += 1;
  if (totalHp >= 1)
    player.addEffect("health_boost", 220, {
      amplifier: totalHp - 1,
      showParticles: false,
    });

  // berserker: 힘
  const berserkLvl = getSkillLevel(player, "might_berserk");
  if (berserkLvl >= 1) {
    player.addEffect("strength", 220, {
      amplifier: Math.min(berserkLvl - 1, 1),
      showParticles: false,
    });
  }
}

// ==========================================
// 6. EVENT LISTENERS
// ==========================================
world.afterEvents.entityHealthChanged.subscribe((event) => {
  const { entity, oldValue, newValue } = event;
  if (entity instanceof Player) {
    if (getSkillLevel(entity, "ind_root") >= 1 && oldValue > newValue) {
      const damageTaken = oldValue - newValue; // 깎인 체력량
      const amp = Math.max(Math.round((damageTaken - 1) * 1.5), 0);
      entity.addEffect("saturation", 1, {
        amplifier: amp,
        showParticles: false,
      });
    }
  }
});

world.afterEvents.entityHurt.subscribe((event) => {
  const { damage, damageSource, hurtEntity } = event;
  const attacker = damageSource.damagingEntity;
  const projectile = damageSource.damagingProjectile;

  if (hurtEntity.hasTag("processing_extra_dmg")) return; // 추가피해 처리중이면 발생X

  if (attacker instanceof Player && projectile) {
    // 투사체 공격
    const rangerLvl = getSkillLevel(attacker, "might_ranger");
    if (rangerLvl >= 1) {
      let multiplier = 1.2;
      if (rangerLvl === 2) multiplier = 1.5;
      else if (rangerLvl === 3) multiplier = 2;

      const addedDmg = damage * multiplier - damage;

      hurtEntity.addTag("processing_extra_dmg");
      hurtEntity.applyDamage(addedDmg, {
        damagingEntity: attacker,
        cause: EntityDamageCause.override,
      });
      const dim = hurtEntity.dimension;
      dim.spawnParticle(
        "minecraft:critical_hit_emitter",
        hurtEntity.getHeadLocation(),
      );
      attacker.playSound("mob.zombie.woodbreak", { pitch: 1.4, volume: 0.3 });

      system.run(() => {
        if (hurtEntity.isValid) hurtEntity.removeTag("processing_extra_dmg");
      });
    }
  } else if (attacker instanceof Player) {
    const berserkLvl = getSkillLevel(attacker, "might_berserk");
    if (berserkLvl >= 3) {
      const health = attacker.getComponent(
        "minecraft:health",
      ) as EntityHealthComponent;
      const healAmount = Math.round(damage * 0.1);
      if (healAmount > 0) {
        const currentHp = health.currentValue;
        const maxHp = health.effectiveMax;

        health.setCurrentValue(Math.min(currentHp + healAmount, maxHp));
        attacker.dimension.spawnParticle(
          "chunbae0523:blood",
          hurtEntity.getHeadLocation(),
        );
      }
    }
  }
});

// 2. 이벤트 리스너
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { player, block, brokenBlockPermutation } = event;
  if (getSkillLevel(player, "ind_lumber") >= 1) {
    if (brokenBlockPermutation.type.id.includes("log")) {
      if (isPlayerPlaced(block)) {
        world.setDynamicProperty(
          `${block.location.x},${block.location.y},${block.location.z}`,
          undefined,
        );
        return;
      } else {
        // 도끼를 들고 있는지 확인 (선택 사항: 손으로 캐도 되게 하려면 이 줄 삭제)
        const equipment = player.getComponent("minecraft:equippable");
        const mainHand = equipment?.getEquipment(EquipmentSlot.Mainhand);
        const toolId = mainHand?.typeId;
        if (!toolId || !/(axe|AIOT|Paxel)/i.test(toolId)) return;
        // 찹트리 시작
        breakConnectedLogs(block, player);
      }
    }
  }
  if (getSkillLevel(player, "ind_lumber") >= 2) {
    if (brokenBlockPermutation.type.id.includes("leaves")) {
      dropAppleWithChance(player, block.location, 20);
    }
  }
});

world.afterEvents.itemStopUseOn.subscribe((ev) => {
  const { block, itemStack } = ev;

  if (!itemStack) return;
  // 플레이어가 설치한 블록이 원목(Log) 종류인지 확인
  if (itemStack.typeId.includes("log")) {
    const blockKey = `${block.location.x},${block.location.y},${block.location.z}`;
    world.setDynamicProperty(blockKey, true);
  }
});

world.afterEvents.playerSwingStart.subscribe((event) => {
  const { player, swingSource, heldItemStack } = event;

  if (
    (swingSource === EntitySwingSource.Attack ||
      swingSource === EntitySwingSource.Mine) &&
    isSkillBook(heldItemStack)
  ) {
    // --- [쿨타임 체크 로직] ---
    if (!heldItemStack) return;

    // --- [agi_teleporter 스킬] ---
    if (getSkillLevel(player, "agi_teleporter") >= 1 && player.isSneaking) {
      const cooldownComp = heldItemStack.getComponent("minecraft:cooldown");
      if (cooldownComp && cooldownComp.getCooldownTicksRemaining(player) > 0) {
        const remainingTicks = cooldownComp.getCooldownTicksRemaining(player);
        const remainingSeconds = (remainingTicks / 20).toFixed(1);
        player.onScreenDisplay.setActionBar({
          translate: "skill.cooldown.wait",
          with: [remainingSeconds],
        });
        return;
      }
      const skillLv = getSkillLevel(player, "agi_teleporter");
      const maxDistance = skillLv === 2 ? 50 : skillLv === 3 ? 100 : 10; // 기본값 100
      const raycastOptions = {
        maxDistance: maxDistance,
        includePassableBlocks: false,
      };
      const raycastResult = player.getBlockFromViewDirection(raycastOptions);

      if (raycastResult) {
        const hitBlock = raycastResult.block;
        const hitFace = raycastResult.face;

        const targetLocation = {
          x:
            hitBlock.location.x +
            (hitFace === "West" ? -1 : hitFace === "East" ? 1 : 0),
          y:
            hitBlock.location.y +
            (hitFace === "Down" ? -1 : hitFace === "Up" ? 1 : 0),
          z:
            hitBlock.location.z +
            (hitFace === "North" ? -1 : hitFace === "South" ? 1 : 0),
        };

        const dim = player.dimension;
        player.teleport(targetLocation);

        system.runTimeout(() => {
          if (!player.isValid) return;
          dim.spawnParticle(
            "chunbae0523:teleportOut",
            player.getHeadLocation(),
          );
          dim.spawnParticle("chunbae0523:teleport", targetLocation);
          dim.spawnParticle("chunbae0523:teleportIn", player.getHeadLocation());
          player.playSound("mob.husk.convert_to_zombie");
          player.playSound("mob.endermen.portal", { pitch: 1.2, volume: 1.0 });
        }, 1);

        cooldownComp?.startCooldown(player);
      }
    }
  }
});

const DANGERMOBS = [
  "minecraft:warden",
  "minecraft:wither",
  "minecraft:ender_dragon",
];
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  const targetLoc = target.location;
  // 플레이어, 비유효 엔티티 필터링
  if (target instanceof Player || !target.isValid) {
    system.run(() => {
      playMagicEffect(player);
      showMasterTree(player, false);
    });
  }

  // 포획 이벤트 발동
  if (getSkillLevel(player, "agi_overlord") >= 1 && player.isSneaking) {
    system.run(() => {
      if (DANGERMOBS.includes(target.typeId)) {
        player.playSound("mob.irongolem.repair", { pitch: 1.5 });
        player.dimension.spawnParticle("minecraft:magic_critical_hit_emitter", {
          ...targetLoc,
          y: targetLoc.y + 1.5,
        });
        player.onScreenDisplay.setActionBar({
          translate: "skill.text.strong_entity",
        });
        return;
      }

      const structureName = `chunbae0523:storage_${player.id}`;
      if (world.structureManager.get(structureName) !== undefined) {
        player.onScreenDisplay.setActionBar({
          translate: "skill.overlord.already_exist",
        });
        return;
      }

      // 저장 시작
      player.dimension.spawnParticle("minecraft:sonic_explosion", {
        x: targetLoc.x,
        y: targetLoc.y + 0.8,
        z: targetLoc.z,
      });
      player.playSound("block.end_portal_frame.fill", { pitch: 0.7 });

      world.structureManager.createFromWorld(
        structureName,
        target.dimension,
        target.location,
        target.location,
        {
          includeBlocks: false,
          includeEntities: true,
        },
      );
      target.remove();
    });
  } else {
    system.run(() => {
      playMagicEffect(player);
      showMasterTree(player, false);
    });
  }
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, blockFace, player, itemStack } = event;
  if (
    itemStack &&
    isSkillBook(itemStack) &&
    getSkillLevel(player, "agi_overlord") >= 1 &&
    player.isSneaking
  ) {
    system.run(() => {
      // 구조물 보유중인지 판별
      const structureName = `chunbae0523:storage_${player.id}`;
      const structure = world.structureManager.get(structureName);
      if (structure === undefined) return;

      // 로드 시작
      processingPlayers.add(player.id);

      const faceOffsets: Record<string, { x: number; y: number; z: number }> = {
        Up: { x: 0, y: 1, z: 0 },
        Down: { x: 0, y: -1, z: 0 },
        North: { x: 0, y: 0, z: -1 },
        South: { x: 0, y: 0, z: 1 },
        East: { x: 1, y: 0, z: 0 },
        West: { x: -1, y: 0, z: 0 },
      };
      const offset = faceOffsets[blockFace];
      if (!offset) return; // 오류 방지

      const targetLoc = {
        x: block.location.x + offset.x + 0.5,
        y: block.location.y + offset.y,
        z: block.location.z + offset.z + 0.5,
      };

      player.playSound("ominous_item_spawner.spawn_item");
      player.dimension.spawnParticle("minecraft:sonic_explosion", {
        x: targetLoc.x,
        y: targetLoc.y + 0.8,
        z: targetLoc.z,
      });

      if (world.structureManager.get(structureName) === undefined) return;
      world.structureManager.place(structureName, player.dimension, targetLoc, {
        includeEntities: true,
      });
      world.structureManager.delete(structureName);
    });
  }
});

world.afterEvents.entitySpawn.subscribe((event) => {
  const { entity, cause } = event;
  if (
    cause === EntityInitializationCause.Spawned &&
    entity.typeId === "minecraft:item"
  ) {
    const itemComp = entity.getComponent("minecraft:item");
    if (itemComp && isSkillBook(itemComp.itemStack)) {
      const player = entity.dimension.getPlayers({
        location: entity.location,
        maxDistance: 2, // 아주 가까운 거리 내의 플레이어
      })[0];
      if (getSkillLevel(player, "agi_dreamer") >= 1) {
        const playerSP = player.getSpawnPoint();
        const skillLv = getSkillLevel(player, "agi_dreamer");
        let targetLoc, targetDim;
        if (skillLv === 1) {
          const playerLoc = player.location;
          const topBlock = player.dimension.getTopmostBlock({
            x: playerLoc.x,
            z: playerLoc.z,
          });
          if (topBlock === undefined) {
            player.onScreenDisplay.setActionBar({
              translate: "skill.text.block_not_exist",
            });
            return;
          } else if (topBlock.typeId === "minecraft:bedrock") {
            player.onScreenDisplay.setActionBar({
              translate: "skill.text.top_is_bedrock",
            });
            return;
          }
          targetLoc = { ...topBlock, y: topBlock.location.y + 1 };
          targetDim = player.dimension;
        } else {
          // === 2
          if (playerSP) {
            targetLoc = { x: playerSP.x, y: playerSP.y, z: playerSP.z };
            targetDim = playerSP.dimension;
          } else {
            const topBlock = world
              .getDimension("overworld")
              .getTopmostBlock({ x: 0, z: 0 });
            targetLoc = {
              x: 0,
              y: topBlock ? topBlock.location.y + 1 : -60,
              z: 0,
            };
            targetDim = world.getDimension("minecraft:overworld");
          }
        }
        player.teleport(targetLoc, {
          dimension: targetDim,
          checkForBlocks: false,
        });

        system.runTimeout(() => {
          if (!player.isValid) return;
          targetDim.playSound("random.totem", targetLoc);
          targetDim.playSound("mob.endermen.portal", targetLoc);
          targetDim.spawnParticle("minecraft:witchspell_emitter", targetLoc);
          targetDim.spawnParticle("chunbae0523:teleport", targetLoc);
          targetDim.spawnParticle(
            "chunbae0523:teleportIn",
            player.getHeadLocation(),
          );
        }, 1);
        entity.remove();
      }
    }
  }
});

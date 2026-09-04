/**
 * 出手预览台。只看人 + 家伙，不进战斗。
 * 和局内共用 UnitActor，这里点到满意，局内不用另做一套。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
import { resolveAttackFx } from '@/balance/fx';
import { HAND_GEAR, handIdOf, wearOf } from '@/balance/gear';
import { VILLAGERS, getVillager } from '@/balance/villagers';
import { preloadBattleArt, watchArt } from '@/core/TextureLoader';
import { motionFor, UnitActor } from '@/fx/UnitActor';

const W = 640;
const H = 720;
const FEET_X = 300;
const FEET_Y = 500;
const BODY = 168;

const HAND_CHOICES = [
  { id: '', name: '起手家伙' },
  { id: 'wrench', name: '扳手' },
  { id: 'hammer', name: '大锤' },
  { id: 'cleaver', name: '砍刀' },
  { id: 'driver', name: '改锥' },
  { id: 'radio', name: '音响' },
  { id: 'sling', name: '弹弓' },
  { id: 'pipe', name: '水管' },
  { id: 'chainsaw', name: '电锯' },
  { id: 'weight', name: '秤砣' },
  { id: 'pot', name: '锅' },
  { id: 'speaker', name: '广场舞音响' },
  { id: 'blower', name: '鼓风机' },
  { id: 'firecracker', name: '鞭炮' },
  { id: 'wire', name: '电线' },
] as const;

/**
 * 穿戴不再手挑：这一版身上穿什么由「村民 + 进化阶」定死（gear.wearOf）。
 * 预览台要看的就是**这三阶到底分不分得开**（§4.1 的硬约束），
 * 所以这里挑的是阶，不是零件。
 */
const STAGE_CHOICES = [
  { id: '1', name: '一阶' },
  { id: '2', name: '二阶' },
  { id: '3', name: '三阶' },
] as const;

const GEAR_FX: Readonly<Record<string, AttackFx>> = {
  wrench: 'slash',
  hammer: 'smash',
  cleaver: 'slash',
  driver: 'poke',
  radio: 'orb',
  sling: 'sniper',
  pipe: 'poke',
  chainsaw: 'saw',
  weight: 'smash',
  pot: 'smash',
  speaker: 'orb',
  blower: 'wind',
  firecracker: 'blast',
  wire: 'pierce',
};

const MOTION_NAME: Readonly<Record<string, string>> = {
  lunge: '抡',
  crush: '砸',
  recoil: '捅 / 后坐',
  sling: '拉弹',
};

const canvas = document.getElementById('view') as HTMLCanvasElement;
const app = new PIXI.Application({
  view: canvas,
  width: W,
  height: H,
  backgroundColor: 0x2a1c12,
  antialias: true,
  resolution: Math.min(2, window.devicePixelRatio || 1),
  autoDensity: true,
});

const ground = new PIXI.Graphics();
ground.beginFill(0x000000, 0.35).drawEllipse(FEET_X, FEET_Y + 10, 78, 18).endFill();
ground.lineStyle(2, 0xc9a46a, 0.45).drawEllipse(FEET_X, FEET_Y + 10, 70, 14).lineStyle(0);
app.stage.addChild(ground);

const dummy = new PIXI.Graphics();
dummy.beginFill(0x6b8f9a, 0.9).drawCircle(0, 0, 18).endFill();
dummy.position.set(520, 250);
app.stage.addChild(dummy);

const actor = new UnitActor();
app.stage.addChild(actor.view);

let heroId = 'dachui';
let handId = '';
let evoStage = 1;
let faceRight = true;
let auto = true;
let acc = 0;

function currentHand(): string {
  return handId || handIdOf(heroId, evoStage);
}

/** 这一阶实际用的打击特效。不传 handId 时就是局里那一下 */
function currentFx(): AttackFx {
  if (handId) return GEAR_FX[handId] ?? 'slash';
  return resolveAttackFx(getVillager(heroId), evoStage);
}

function apply(): void {
  const v = getVillager(heroId);
  actor.bindHero(v.id, v.lane, evoStage);
  actor.equip(evoStage, handId || undefined);
  actor.place(FEET_X, FEET_Y, BODY);
  actor.faceToward(faceRight ? FEET_X + 200 : FEET_X - 200);
  dummy.position.set(faceRight ? 520 : 120, 250);
  const gear = HAND_GEAR[currentHand()];
  const wear = wearOf(v.id, v.lane, evoStage);
  const on = [wear.head, wear.back, wear.body].filter(Boolean).join(' + ') || '空手空身';
  const now = document.getElementById('now');
  if (now) {
    now.textContent = [
      `${v.name} ${'一二三'[evoStage - 1]}阶「${v.evo[evoStage - 1]!.name}」`,
      gear?.id ?? currentHand(),
      on,
      MOTION_NAME[motionFor(currentFx())] ?? currentFx(),
    ].join(' · ');
  }
  paintButtons();
}

function swing(): void {
  actor.playAttack(dummy.x, dummy.y, motionFor(currentFx()));
}

function paintButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    const kind = btn.dataset.kind;
    const id = btn.dataset.id ?? '';
    if (kind === 'hero') btn.classList.toggle('on', id === heroId);
    if (kind === 'hand') btn.classList.toggle('on', id === handId);
    if (kind === 'wear') btn.classList.toggle('on', id === String(evoStage));
    if (kind === 'face') btn.classList.toggle('on', id === (faceRight ? 'right' : 'left'));
  }
}

function mount(): void {
  const heroes = document.getElementById('heroes')!;
  for (const h of VILLAGERS) {
    const b = document.createElement('button');
    b.textContent = h.name;
    b.dataset.kind = 'hero';
    b.dataset.id = h.id;
    b.addEventListener('click', () => {
      heroId = h.id;
      apply();
    });
    heroes.appendChild(b);
  }

  const hands = document.getElementById('hands')!;
  for (const item of HAND_CHOICES) {
    const b = document.createElement('button');
    b.textContent = item.name;
    b.dataset.kind = 'hand';
    b.dataset.id = item.id;
    b.addEventListener('click', () => {
      handId = item.id;
      apply();
    });
    hands.appendChild(b);
  }

  const wearBox = document.getElementById('worn')!;
  for (const item of STAGE_CHOICES) {
    const b = document.createElement('button');
    b.textContent = item.name;
    b.dataset.kind = 'wear';
    b.dataset.id = item.id;
    b.addEventListener('click', () => {
      evoStage = Number(item.id);
      apply();
    });
    wearBox.appendChild(b);
  }

  const face = document.getElementById('face')!;
  for (const [id, name] of [['left', '朝左'], ['right', '朝右']] as const) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.kind = 'face';
    b.dataset.id = id;
    b.addEventListener('click', () => {
      faceRight = id === 'right';
      apply();
    });
    face.appendChild(b);
  }

  document.getElementById('hit')!.addEventListener('click', () => {
    acc = 0;
    swing();
  });
  const autoBox = document.getElementById('auto') as HTMLInputElement;
  autoBox.checked = auto;
  autoBox.addEventListener('change', () => {
    auto = autoBox.checked;
    acc = 0;
  });
  canvas.addEventListener('pointerdown', (ev) => {
    dummy.position.set(ev.offsetX, ev.offsetY);
    faceRight = dummy.x >= FEET_X;
    apply();
    swing();
  });
}

preloadBattleArt();
watchArt(() => apply());
mount();
apply();

app.ticker.add((dt) => {
  const sec = dt / 60;
  actor.update(sec);
  if (!auto) return;
  acc += sec;
  if (acc >= 1.15) {
    acc = 0;
    swing();
  }
});

/**
 * 出手预览台。只看人 + 家伙，不进战斗。
 * 和局内共用 UnitActor，这里点到满意，局内不用另做一套。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
import { HAND_GEAR, STARTER_HAND } from '@/balance/gear';
import { HEROES } from '@/balance/heroes';
import { getMod } from '@/balance/mods';
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

const WEAR_CHOICES = [
  { id: 'helmet', name: '头盔' },
  { id: 'quilt', name: '棉被' },
  { id: 'steelplate', name: '钢板' },
  { id: 'pressurecooker', name: '高压锅' },
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
let worn = new Set<string>();
let faceRight = true;
let auto = true;
let acc = 0;

function currentHand(): string {
  return handId || STARTER_HAND[heroId] || 'wrench';
}

function apply(): void {
  const mods = [...worn];
  actor.bindHero(heroId, mods);
  actor.equip(mods, currentHand());
  actor.place(FEET_X, FEET_Y, BODY);
  actor.faceToward(faceRight ? FEET_X + 200 : FEET_X - 200);
  dummy.position.set(faceRight ? 520 : 120, 250);
  const fx = GEAR_FX[currentHand()] ?? 'slash';
  const hero = HEROES.find((h) => h.id === heroId);
  const gear = HAND_GEAR[currentHand()];
  const now = document.getElementById('now');
  if (now) {
    now.textContent = `${hero?.name ?? heroId} · ${gear?.id ?? currentHand()} · ${MOTION_NAME[motionFor(fx)] ?? fx}`;
  }
  paintButtons();
}

function swing(): void {
  const fx = GEAR_FX[currentHand()] ?? 'slash';
  actor.playAttack(dummy.x, dummy.y, motionFor(fx));
}

function paintButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    const kind = btn.dataset.kind;
    const id = btn.dataset.id ?? '';
    if (kind === 'hero') btn.classList.toggle('on', id === heroId);
    if (kind === 'hand') btn.classList.toggle('on', id === handId);
    if (kind === 'wear') btn.classList.toggle('on', worn.has(id));
    if (kind === 'face') btn.classList.toggle('on', id === (faceRight ? 'right' : 'left'));
  }
}

function mount(): void {
  const heroes = document.getElementById('heroes')!;
  for (const h of HEROES) {
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
  for (const item of WEAR_CHOICES) {
    const b = document.createElement('button');
    b.textContent = item.name;
    b.dataset.kind = 'wear';
    b.dataset.id = item.id;
    b.title = getMod(item.id).name;
    b.addEventListener('click', () => {
      if (worn.has(item.id)) worn.delete(item.id);
      else worn.add(item.id);
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

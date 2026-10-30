/**
 * 运行时冒烟（Playwright + Chromium）：逻辑验证见 verify.ts，这里补 Phaser 运行时链路——
 * 渲染、点击命中、倒水动画、撤销 / 提示 / 色盲 / 重开、胜利面板、高关卡两行布局，
 * 以及 Bridge loading overlay 是否及时消失。
 *
 * 运行：bun run smoke   （需先 `bun run build`，smoke 跑的是 dist 产物）
 * 产物：docs/smoke/*.png + 断言汇总；任何 console error / pageerror / 断言失败即退出码 1。
 * 断言依据场景暴露的只读快照（GameScene.exposeDebug，仅 ?debug=1 时启用）。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const OUT = "docs/smoke";
const DESIGN_W = 720;
const DESIGN_H = 1280;

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) {
    failures++;
    console.error(`✗ ${name} ${detail}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

/** GameScene.exposeDebug 暴露的只读快照。 */
interface Snapshot {
  level: number;
  moves: number;
  par: number;
  tubes: number[][];
  initialTubes: number[][];
  freeHints: number;
  colorBlind: boolean;
  tubeCount: number;
  tubeW: number;
  jungle: number;
  modalOpen: boolean;
  positions: { x: number; y: number }[];
  stuck: boolean;
}

interface Probe {
  errors: string[];
}

function attachProbe(page: Page): Probe {
  const probe: Probe = { errors: [] };
  page.on("console", (msg) => {
    const text = msg.text();
    // "Failed to load resource" 多为 goto 切页时取消上一页的音频加载（net::ERR_CONNECTION_CLOSED），
    // 属测试噪声；资源是否真的可用由 checkAssets() 单独断言，不靠这类日志。
    if (msg.type() === "error" && !text.includes("Failed to load resource")) probe.errors.push(`console: ${text}`);
  });
  page.on("pageerror", (err) => probe.errors.push(`pageerror: ${err.message}`));
  return probe;
}

/** 资源可达性：音频/图标真的在 dist 里，且能被取到。 */
async function checkAssets(page: Page): Promise<void> {
  const results = await page.evaluate(async () => {
    const paths = ["audio/pour.wav", "audio/click.mp3", "audio/win.ogg", "audio/ding.mp3", "audio/fail.mp3", "favicon.svg"];
    const out: Record<string, number> = {};
    for (const p of paths) {
      try {
        const r = await fetch(p);
        out[p] = r.status;
      } catch {
        out[p] = -1;
      }
    }
    return out;
  });
  const bad = Object.entries(results).filter(([, s]) => s !== 200);
  check("资源可达（音频/图标）", bad.length === 0, JSON.stringify(results));
}

/** 设计坐标 → 页面坐标（Scale.FIT 下 canvas 会整体缩放居中）。 */
async function tap(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("canvas not found");
  await page.mouse.click(box.x + (x / DESIGN_W) * box.width, box.y + (y / DESIGN_H) * box.height);
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __juice: { snapshot: unknown } }).__juice.snapshot as never);
}

function sameTubes(a: number[][], b: number[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 同一排内相邻试管中心距必须 ≥ 管宽，否则是重叠（布局回归；管宽随管数自适应）。 */
function overlapIssues(s: Snapshot): string[] {
  const w = s.tubeW || 100;
  const rows = new Map<number, { x: number; y: number }[]>();
  for (const p of s.positions) {
    const key = Math.round(p.y);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push(p);
  }
  const issues: string[] = [];
  for (const [y, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const dx = row[i].x - row[i - 1].x;
      if (dx < w) issues.push(`y=${y} dx=${dx.toFixed(0)}`);
    }
  }
  return issues;
}

/** 管子必须全部落在画布内（30 管 5 行布局回归）。 */
function outOfBounds(s: Snapshot): string[] {
  return s.positions
    .filter((p) => p.x < 20 || p.x > DESIGN_W - 20 || p.y < 200 || p.y > DESIGN_H - 40)
    .map((p) => `(${p.x},${p.y})`);
}

/** 打开自测场景并等快照就绪；返回"游戏已就绪后 overlay 还挡多久"（真正的 UX 指标）。 */
async function open(page: Page, query: string): Promise<number> {
  // domcontentloaded：goto 默认等 load 事件，会被 Bridge 探测外部平台的挂起请求拖住
  await page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window as unknown as { __juice?: unknown }).__juice);
  const tReady = Date.now();
  // Bridge 的 #loading-overlay 会拦鼠标；game_ready 应让它立刻消失
  await page.waitForSelector("#loading-overlay", { state: "detached", timeout: 8_000 });
  return Date.now() - tReady;
}

function startPreview(): ChildProcess {
  return spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
}

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server not ready: ${url}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const server = startPreview();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

    // --- 1) Bridge loading overlay 必须在玩家可玩前消失（挡 3 秒就是开局流失）---
    let probe = attachProbe(page);
    const ms = await open(page, "?debug=1");
    check("游戏就绪后 overlay 立刻放行（< 800ms）", ms < 800, `blocked ${ms}ms after ready`);
    const s0 = await snap(page);
    check("开局免费提示就绪", s0.freeHints === 1, `freeHints=${s0.freeHints}`);
    check("开局步数为 0", s0.moves === 0, `moves=${s0.moves}`);
    // 废关卡防线：开局就全归位 = 生成器兜底造的假关卡（实测踩过）
    const doneAtStart = s0.tubes.filter((t) => t.length === 4 && t.every((c) => c === t[0])).length;
    check("开局是真乱局（非完成态）", doneAtStart === 0, `已归位 ${doneAtStart} 管`);
    await checkAssets(page);
    // 绞盘机开局演出（差异化卖点）：抓一张"绞出中"的截图，再等落位后的完整盘面
    await page.screenshot({ path: `${OUT}/00-winch-intro.png` });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/02-board.png` });

    // --- 2) 真实倒水动画链路（?anim=1 自动选中 → 倒水 → animatePour 全流程）---
    await open(page, "?debug=1&anim=1");
    await page.waitForTimeout(2200);
    const s1 = await snap(page);
    check("倒水动画走完并计步", s1.moves === 1, `moves=${s1.moves}`);
    await page.screenshot({ path: `${OUT}/01-pour-anim.png` });
    check("倒水动画链路无运行时错误", probe.errors.length === 0, probe.errors.slice(0, 3).join(" | "));

    // --- 3) 撤销：步数与局面都要还原 ---
    await tap(page, 172, 88);
    await page.waitForTimeout(400);
    const s2 = await snap(page);
    check("撤销后步数还原", s2.moves === 0, `moves=${s2.moves}`);
    check("撤销后局面还原", sameTubes(s2.tubes, s2.initialTubes));
    await page.screenshot({ path: `${OUT}/05-undo.png` });

    // --- 4) 免费提示：第一次不该要广告，直接给提示 ---
    await tap(page, 82, 88);
    await page.waitForTimeout(400);
    const s3 = await snap(page);
    check("首次提示走免费额度", s3.freeHints === 0, `freeHints=${s3.freeHints}`);
    await page.screenshot({ path: `${OUT}/06-hint.png` });

    // --- 5) 色盲辅助纹样开关 ---
    await tap(page, 548, 88);
    await page.waitForTimeout(400);
    const s4 = await snap(page);
    check("色盲纹样可关闭", s4.colorBlind === false, `colorBlind=${s4.colorBlind}`);
    await page.screenshot({ path: `${OUT}/07-colorblind-off.png` });
    check("撤销 / 提示 / 色盲无运行时错误", probe.errors.length === 0, probe.errors.slice(0, 3).join(" | "));

    // --- 6) 重开本关：必须是同一题（par 与初始局面不变），不能悄悄换题 ---
    // 换干净页面（不带 anim，否则重开后 demo 又自动走一步），手动走一步再点重开
    await open(page, "?debug=1");
    const sBefore = await snap(page);
    const parBefore = sBefore.par;
    for (let i = 0; i < sBefore.tubeCount; i++) {
      if ((await snap(page)).moves > 0) break;
      for (let j = 0; j < sBefore.tubeCount; j++) {
        if (i === j) continue;
        await tap(page, sBefore.positions[i].x, sBefore.positions[i].y);
        await tap(page, sBefore.positions[j].x, sBefore.positions[j].y);
        await page.waitForTimeout(1100);
        if ((await snap(page)).moves > 0) break;
      }
    }
    const sMoved = await snap(page);
    check("手动点击能走一步（命中判定正确）", sMoved.moves > 0, `moves=${sMoved.moves}`);
    await tap(page, 638, 88);
    await page.waitForTimeout(900);
    const s5 = await snap(page);
    check("重开保持同一题（par 不变）", s5.par === parBefore, `par ${parBefore}→${s5.par}`);
    check("重开回到开局局面", sameTubes(s5.tubes, s5.initialTubes) && s5.moves === 0);
    check("重开重置免费提示额度", s5.freeHints === 1, `freeHints=${s5.freeHints}`);
    await page.screenshot({ path: `${OUT}/08-restart.png` });

    // --- 7) 胜利面板 + 彩带 ---
    probe = attachProbe(page);
    await open(page, "?debug=1&win=1");
    await page.waitForTimeout(1200);
    const s6 = await snap(page);
    check("胜利面板打开（模态屏蔽管点击）", s6.modalOpen === true, `modalOpen=${s6.modalOpen}`);
    await page.screenshot({ path: `${OUT}/09-win.png` });
    check("胜利面板无运行时错误", probe.errors.length === 0, probe.errors.slice(0, 3).join(" | "));

    // --- 8) 高关卡多行布局（L25 ≈ 23 管）不越界、不重叠、不报错 ---
    probe = attachProbe(page);
    await open(page, "?debug=1&level=25");
    await page.waitForTimeout(4200); // 等绞盘机开局演出收尾（最坏 9 批 ≈ 2.6s + 清理），截图才是完整盘面
    const s7 = await snap(page);
    check("高关卡管数正确（多行布局）", s7.tubeCount >= 15 && s7.tubeCount <= 30, `tubes=${s7.tubeCount}`);
    check("高关卡同排试管互不重叠", overlapIssues(s7).length === 0, overlapIssues(s7).join(" "));
    check("高关卡管子不出界", outOfBounds(s7).length === 0, outOfBounds(s7).join(" "));
    await page.screenshot({ path: `${OUT}/10-multi-rows.png` });
    check("高关卡布局无运行时错误", probe.errors.length === 0, probe.errors.slice(0, 3).join(" | "));

    // --- 9) 7 根管是布局临界点（单行放不下，必须换行而不是重叠）---
    await open(page, "?debug=1&level=5");
    await page.waitForTimeout(1600);
    const s8 = await snap(page);
    check("7 根管不重叠（布局临界）", s8.tubeCount === 7 && overlapIssues(s8).length === 0, `tubes=${s8.tubeCount} ${overlapIssues(s8).join(" ")}`);
    await page.screenshot({ path: `${OUT}/11-seven-tubes.png` });

    // --- 10) 30 管盲盒盘面（L50 五行布局）：管数到顶、不重叠、不出界 ---
    probe = attachProbe(page);
    await open(page, "?debug=1&level=50");
    await page.waitForTimeout(4600); // 30 管 ≈ 11 批绞出（2.8s）+ 清理，等演出收尾
    const s9 = await snap(page);
    check("30 管盲盒盘面成型", s9.tubeCount === 30, `tubes=${s9.tubeCount}`);
    check("30 管同排试管互不重叠", overlapIssues(s9).length === 0, overlapIssues(s9).join(" "));
    check("30 管管子不出界", outOfBounds(s9).length === 0, outOfBounds(s9).join(" "));
    await page.screenshot({ path: `${OUT}/12-blindbox-30.png` });
    check("30 管布局无运行时错误", probe.errors.length === 0, probe.errors.slice(0, 3).join(" | "));
  } finally {
    await browser?.close();
    server.kill();
  }
  console.log(failures > 0 ? `\n${failures} 项失败` : "\n冒烟全部通过 ✅");
  if (failures > 0) process.exit(1);
}

void main();

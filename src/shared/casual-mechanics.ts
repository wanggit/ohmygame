/**
 * Casual game mechanics offered on the home composer before creating a game.
 *
 * The catalog mirrors `templates/casual-games/` in this repository: every
 * mechanic has a directory there with a `PLAYBOOK.md` design handbook.
 * `test/casual-mechanics.test.ts` asserts the two stay in sync, so adding a
 * playbook directory requires adding an entry here (and vice versa).
 */

export interface CasualMechanic {
  /** Directory name under `templates/casual-games/`. */
  id: string;
  /** Chinese display name. */
  zh: string;
  /** English display name. */
  en: string;
  /** One-sentence English rule injected into the creation prompt. */
  summary: string;
}

export const CASUAL_MECHANICS: readonly CasualMechanic[] = [
  {
    id: "water-sort",
    zh: "水排序",
    en: "Water Sort",
    summary:
      "Pour the top same-color segment between tubes until every tube holds a single color.",
  },
  {
    id: "merge-2048",
    zh: "合并2048",
    en: "Merge 2048",
    summary:
      "Slide the board so identical numbers collide and merge into their double; reach the target number.",
  },
  {
    id: "blast",
    zh: "两消消除",
    en: "Blast Clear",
    summary:
      "Tap groups of two or more adjacent same-colored blocks to clear them.",
  },
  {
    id: "one-tap-timing",
    zh: "一键时机",
    en: "One-tap Timing",
    summary:
      "Tap at the perfect moment when the moving object aligns with the target.",
  },
  {
    id: "match-3",
    zh: "三消",
    en: "Match-3",
    summary: "Swap adjacent pieces to line up three or more of the same color.",
  },
  {
    id: "falling-blocks",
    zh: "俄罗斯方块类",
    en: "Falling Blocks",
    summary:
      "Rotate and place falling blocks to complete full rows, which clear.",
  },
  {
    id: "solitaire",
    zh: "纸牌接龙",
    en: "Solitaire",
    summary: "Stack cards in suit order to clear the tableau.",
  },
  {
    id: "breakout",
    zh: "打砖块",
    en: "Breakout",
    summary: "Bounce the ball with the paddle to break all the bricks.",
  },
  {
    id: "snake",
    zh: "贪吃蛇",
    en: "Snake",
    summary:
      "Steer the snake to eat food and grow without hitting walls or yourself.",
  },
  {
    id: "memory-match",
    zh: "记忆翻牌",
    en: "Memory Match",
    summary: "Flip two cards at a time and match identical pairs.",
  },
  {
    id: "link-match",
    zh: "连连看/麻将接龙",
    en: "Link Match",
    summary: "Remove identical tiles connected by a path of at most two turns.",
  },
  {
    id: "spot-difference",
    zh: "找不同",
    en: "Spot the Difference",
    summary: "Find all differences between two similar pictures.",
  },
  {
    id: "jigsaw",
    zh: "拼图",
    en: "Jigsaw",
    summary: "Drag puzzle pieces into place to rebuild the picture.",
  },
  {
    id: "color-by-number",
    zh: "按数字填色",
    en: "Color by Number",
    summary: "Tap numbered areas and fill them with the matching color.",
  },
  {
    id: "sudoku",
    zh: "数独",
    en: "Sudoku",
    summary:
      "Fill the grid so every row, column and box contains 1-9 exactly once.",
  },
  {
    id: "tap-away",
    zh: "消箭头",
    en: "Tap Away",
    summary:
      "Tap arrows to fly them away; blocked arrows cannot move until their path clears.",
  },
  {
    id: "pull-the-pin",
    zh: "拔针",
    en: "Pull the Pin",
    summary:
      "Pull pins in the right order so items fall into the right containers.",
  },
  {
    id: "unblock",
    zh: "挪车",
    en: "Unblock",
    summary:
      "Slide blocking pieces aside to free the target piece to the exit.",
  },
  {
    id: "pipe-connect",
    zh: "管道接水",
    en: "Pipe Connect",
    summary: "Rotate pipe segments to connect the source to the outlet.",
  },
  {
    id: "one-line",
    zh: "一笔画",
    en: "One Line",
    summary: "Draw one line through every dot without crossing itself.",
  },
  {
    id: "peg-pop",
    zh: "弹球钉板",
    en: "Peg Pop",
    summary: "Launch balls to bounce off pegs and clear all target pegs.",
  },
  {
    id: "territory-io",
    zh: "圈地",
    en: "Territory io",
    summary:
      "Draw loops back into your land to claim territory and cut off rivals.",
  },
  {
    id: "stacking",
    zh: "堆叠平衡",
    en: "Stacking",
    summary:
      "Drop moving blocks to stack a tower; misaligned parts get trimmed.",
  },
  {
    id: "slice",
    zh: "切割ASMR",
    en: "Satisfying Slice",
    summary: "Cut smooth, even slices for satisfying ASMR feedback.",
  },
  {
    id: "chain-reaction",
    zh: "连锁反应",
    en: "Chain Reaction",
    summary: "Drop one ball to trigger a full-screen chain explosion.",
  },
  {
    id: "physics-flip",
    zh: "物理翻转",
    en: "Physics Flip",
    summary: "Flip a bottle so it lands upright.",
  },
  {
    id: "runner",
    zh: "跑酷",
    en: "Runner",
    summary: "Run, dodge obstacles, and go as far as possible.",
  },
  {
    id: "aim-shoot",
    zh: "弹射瞄准",
    en: "Aim & Shoot",
    summary: "Aim and launch projectiles to hit the targets.",
  },
  {
    id: "draw-line",
    zh: "画线",
    en: "Draw Line",
    summary: "Draw a line to guide the object safely to its goal.",
  },
];

/** "水排序 / Water Sort" — the label style requested for the picker. */
export function casualMechanicLabel(mechanic: CasualMechanic): string {
  return `${mechanic.zh} / ${mechanic.en}`;
}

/**
 * Prepends the English mechanic brief and the casual-game quality gates to the
 * user's prompt so a new game starts from the chosen playbook's rules.
 */
export function mechanicCreationBrief(
  mechanic: CasualMechanic,
  prompt: string,
): string {
  const brief = `Build a new casual game with the "${mechanic.en}" mechanic (${mechanic.zh}): ${mechanic.summary}\n\nFollow these constraints:\n- The game must pass a 3-second comprehension test: a new player understands the goal with no instructions.\n- Use a single input primitive (tap, drag, swipe, or timing) with at most one risk/reward dimension.\n- Include a complete core loop: start -> play -> clear win/lose -> restart.`;
  return prompt ? `${brief}\n\n---\n\n${prompt}` : brief;
}

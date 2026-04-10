/**
 * @module キーボードショートカット定数
 */

export const SHORTCUTS = {
  /** 事業/非事業トグル */
  BUSINESS_TOGGLE: ['p', 'P'],
  /** ルール追加トグル */
  RULE_ADD: ['r', 'R'],
  /** 対象外トグル */
  EXCLUDE: ['e', 'E'],
  /** 次の仕訳 */
  NEXT: ['n', 'N'],
  /** 前の仕訳 */
  PREV_SHIFT: true,
  /** 一覧モード進入 */
  ENTER_LIST: ['i', 'I'],
} as const;

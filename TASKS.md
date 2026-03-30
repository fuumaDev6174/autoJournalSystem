# TASKS-improvements.md — システム改善6項目
# ============================================================
# 改善1: ルール競合検出（マッチ候補の可視化）
# 改善2: ルール逆引き（取引先→適用ルール一覧）
# 改善3: 学習フィードバックループ（修正履歴→ルール自動提案→AIプロンプト改善）
# 改善4: 家事按分の管理整理（ルール按分 vs 顧客按分の優先順位明確化）
# 改善5: 取引先名寄せ精度の向上（正規化+alias自動追加）
# 改善6: multi_entry対応（1ドキュメント→N仕訳のUI）
# ============================================================
#
# 実行順序: 改善1→2→3→4→5→6
# 改善3はDBテーブル追加が必要（Supabase SQL Editorで実行）。
# それ以外はDB変更なし。
# ============================================================


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善1: ルール競合検出 — マッチ候補の可視化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 概要
現在は matchProcessingRules が最初にマッチした1件だけを返す。
複数のルールがマッチする場合、適用されなかった候補も返すように改善し、
仕訳確認画面で「他にマッチしたルール」をバッジ表示する。

## ファイル: src/server/services.ts

### 変更1-A: matchProcessingRulesWithCandidates 関数を新規追加

既存の matchProcessingRules はそのまま残し、後方互換を保つ。

```typescript
/**
 * ルールマッチング（候補付きバージョン）
 * 最優先のマッチルールに加えて、他にマッチしたルール候補も返す。
 */
export function matchProcessingRulesWithCandidates(
  rules: Parameters<typeof matchProcessingRules>[0],
  input: RuleMatchInput
): {
  matched: MatchedRule | null;
  candidates: Array<MatchedRule & { scope: string; priority: number }>;
} {
  const activeRules = rules.filter(r => r.is_active);
  const allMatched: Array<MatchedRule & { scope: string; priority: number }> = [];

  const clientRules = activeRules
    .filter(r => r.scope === 'client' && r.client_id === input.client_id)
    .sort((a, b) => a.priority - b.priority);
  const industryRules = activeRules
    .filter(r => r.scope === 'industry' && r.industry_id && input.industry_ids_with_ancestors.includes(r.industry_id))
    .sort((a, b) => {
      const depthA = input.industry_depths.get(a.industry_id!) ?? 999;
      const depthB = input.industry_depths.get(b.industry_id!) ?? 999;
      if (depthA !== depthB) return depthA - depthB;
      return a.priority - b.priority;
    });
  const sharedRules = activeRules
    .filter(r => r.scope === 'shared')
    .sort((a, b) => a.priority - b.priority);

  const orderedRules = [...clientRules, ...industryRules, ...sharedRules];

  for (const rule of orderedRules) {
    if (matchesConditions(rule.conditions, input) && rule.actions.account_item_id) {
      allMatched.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        account_item_id: rule.actions.account_item_id,
        tax_category_id: rule.actions.tax_category_id || null,
        description_template: rule.actions.description_template || null,
        business_ratio: rule.actions.business_ratio || null,
        business_ratio_note: rule.actions.business_ratio_note || null,
        entry_type_hint: rule.actions.entry_type_hint || null,
        requires_manual_review: rule.actions.requires_manual_review === true,
        confidence: 0.95,
        scope: rule.scope,
        priority: rule.priority,
      });
    }
  }

  return {
    matched: allMatched.length > 0 ? allMatched[0] : null,
    candidates: allMatched.slice(1),
  };
}
```

## ファイル: src/server/api.ts

### 変更1-B: 仕訳生成エンドポイントでcandidatesも返す

matchProcessingRulesWithCandidates をimportし、既存のmatchProcessingRules呼び出しを置き換え。レスポンスに `rule_candidates` を追加。

## ファイル: src/client/pages/review.tsx

### 変更1-C: 仕訳確認画面に候補ルールバッジを表示

DocumentWithEntry型に `ruleCandidates` フィールドを追加。
個別チェック画面のヘッダー付近に候補バッジを表示し、クリックで適用切替可能に。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善2: ルール逆引き — 取引先→適用ルール一覧
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/master/suppliers.tsx

### 変更2-A: state追加
```typescript
const [supplierRules, setSupplierRules] = useState<Array<{
  id: string; rule_name: string; priority: number; scope: string;
  conditions: any; actions: any;
}>>([]);
```

### 変更2-B: 取引先選択時にマッチするルールを検索

```typescript
const loadSupplierRules = async (supplierName: string) => {
  const { data: rules } = await supabase
    .from('processing_rules')
    .select('id, rule_name, priority, scope, conditions, actions')
    .eq('is_active', true)
    .order('priority');

  if (rules) {
    const matched = rules.filter(r => {
      const pattern = r.conditions?.supplier_pattern?.toLowerCase();
      if (!pattern) return false;
      return supplierName.toLowerCase().includes(pattern) || pattern.includes(supplierName.toLowerCase());
    });
    setSupplierRules(matched);
  }
};
```

取引先の編集モーダルを開いた時、またはテーブル行をクリックした時に `loadSupplierRules(supplier.name)` を呼ぶ。

### 変更2-C: UIにルール一覧を表示

取引先テーブルの詳細部分または編集モーダル内に、マッチしたルール一覧を表示。
各ルールにスコープバッジ（共通/業種別/顧客別）と勘定科目名を表示。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善3: 学習フィードバックループ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 前提: DBテーブルの作成（Supabase SQL Editorで実行）

```sql
CREATE TABLE IF NOT EXISTS journal_entry_corrections (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  journal_entry_id  uuid REFERENCES journal_entries(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  field_name        varchar(50) NOT NULL,
  original_value    text,
  corrected_value   text,
  original_name     text,
  corrected_name    text,
  supplier_name     text,
  corrected_by      uuid REFERENCES users(id),
  corrected_at      timestamptz DEFAULT now(),
  rule_suggested    boolean DEFAULT false,
  rule_accepted     boolean DEFAULT null
);

CREATE INDEX idx_jec_client ON journal_entry_corrections(client_id);
CREATE INDEX idx_jec_field ON journal_entry_corrections(field_name, corrected_value);
CREATE INDEX idx_jec_supplier ON journal_entry_corrections(supplier_name);

ALTER TABLE journal_entry_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY jec_select ON journal_entry_corrections FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY jec_insert ON journal_entry_corrections FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
```

## ファイル: src/client/pages/review.tsx

### 変更3-A: saveCurrentItem で修正履歴を記録

saveCurrentItem関数内で、AI初期値（aiOriginalForm）と保存時の値を比較し、
変更があった場合にjournal_entry_correctionsにINSERTする。
比較対象フィールド: accountItemId, taxCategoryId, lineAmount, description。

### 変更3-B: aiOriginalFormの設定を確実にする

openDetail, openDetailFromTop, goNext, goPrev の全箇所で
`setAiOriginalForm({ ...items[index] })` を呼んでAI初期値を保存。

### 変更3-C: ルール自動提案

saveCurrentItem内で、修正履歴記録の後に同一パターン（同一取引先×同一修正先科目）が
3回以上あるか検索し、あれば `setRuleSuggestion()` と `setAddRule(true)` を実行。
rule_suggestedフラグを更新して二重提案を防止。

## ファイル: src/server/services.ts

### 変更3-D: AIプロンプトに修正ヒントを注入

JournalEntryInputに追加:
```typescript
  correction_hints?: Array<{ supplier: string; original: string; corrected: string; count: number }>;
```

generateJournalEntryのプロンプトの【取引情報】セクションの後に追加:
```typescript
${input.correction_hints && input.correction_hints.length > 0 ? `
【過去の修正履歴（参考にしてください）】
${input.correction_hints.map(h => `- 「${h.supplier}」: ${h.original} → ${h.corrected}（${h.count}回修正）`).join('\n')}
` : ''}
```

## ファイル: src/server/api.ts

### 変更3-E: 仕訳生成時に修正履歴を取得してプロンプトに渡す

generateJournalEntry呼び出しの前に、journal_entry_correctionsから
同一顧客の過去の修正パターン上位5件を取得し、correction_hintsとして渡す。
同一パターンは集約してカウント。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善4: 家事按分の管理整理
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/review.tsx

### 変更4-A: DocumentWithEntry型に追加
```typescript
  matchedRuleBusinessRatio: number | null;
```

### 変更4-B: 家事按分セクションに出典バッジを表示

家事按分スライダーの近くに、按分率の出典を表示:
- ルール按分が適用されている場合: 紫バッジ「ルール按分: 70%」
- client_account_ratiosから来ている場合: 青バッジ「顧客設定: 70%」
- どちらでもない場合: グレーバッジ「手動設定」


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善5: 取引先名寄せ精度の向上
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/server/services.ts

### 変更5-A: normalizeJapanese関数を追加

ファイル冒頭に以下を追加:

```typescript
/**
 * 日本語の取引先名を正規化する。
 * 半角カナ→全角、全角英数→半角、法人格除去、スペース統一。
 */
export function normalizeJapanese(text: string): string {
  let result = text;

  // 半角カナ→全角カナ
  result = result.replace(/[\uFF66-\uFF9F]/g, (s) => {
    const kanaMap: Record<string, string> = {
      'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ',
      'ｰ':'ー','ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
      'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
      'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
      'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
      'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ﾝ':'ン','ﾞ':'゛','ﾟ':'゜',
    };
    return kanaMap[s] || s;
  });

  // 全角英数→半角
  result = result.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );

  // 法人格の除去
  result = result
    .replace(/株式会社|㈱|\(株\)|（株）/g, '')
    .replace(/有限会社|㈲|\(有\)|（有）/g, '')
    .replace(/合同会社|合名会社|合資会社/g, '');

  // スペースの統一
  result = result.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();

  return result;
}
```

### 変更5-B: mapLinesToDBFormat の取引先マッチングに正規化を適用

比較前に normalizeJapanese を適用してマッチング精度を上げる。

### 変更5-C: フロント側の自動マッチにも正規化を適用

review.tsxのloadAllData内の取引先自動マッチで、比較前にnormalizeJapaneseを適用。
normalizeJapanese関数はフロントにも実装（またはsrc/shared/utils.tsに切り出し）。

### 変更5-D: alias自動追加

review.tsxのsaveCurrentItem内で、form.supplierIdが設定されていて
取引先名とOCR読取名が異なる場合、OCR名をsupplier_aliasesに自動INSERT。
source: 'ai_suggested' で登録。既存aliasとの重複チェックを行う。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 改善6: multi_entry対応（1ドキュメント→N仕訳のUI）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ファイル: src/client/pages/review.tsx

### 変更6-A: 型追加

```typescript
interface MultiEntryGroup {
  documentId: string;
  fileName: string;
  entries: EntryRow[];
  totalAmount: number;
  entryCount: number;
  isExpanded: boolean;
}
```

state追加: `const [multiGroups, setMultiGroups] = useState<MultiEntryGroup[]>([]);`

### 変更6-B: loadAllData内でdocument_idでグループ化

allEntriesをdocument_idで集約し、2件以上のグループをmultiGroupsに設定。

### 変更6-C: 一覧テーブルで折りたたみ行を表示

multi_entryグループの親行: ドキュメント名＋件数＋合計金額＋「全て確認」ボタン
展開時の子行: 通常の仕訳行（インデント付き）

toggleMultiGroup関数:
```typescript
const toggleMultiGroup = (docId: string) => {
  setMultiGroups(prev => prev.map(g =>
    g.documentId === docId ? { ...g, isExpanded: !g.isExpanded } : g
  ));
};
```

### 変更6-D: 個別チェックモードでmulti_entry対応

multi_entryの場合、左に証憑画像を固定し、右側に全仕訳をスクロール表示。
各仕訳に個別の確認ボタンを配置。

これは大規模改修なので、review.tsxの現在の構造を読んだ上で
Claude Codeが判断して実装すること。


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 完了チェックリスト
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. `npx tsc --noEmit` でコンパイルエラーがないこと
2. matchProcessingRulesWithCandidates が候補ルールを返すこと
3. review.tsx に候補ルールバッジが表示されること
4. suppliers.tsx に取引先の適用ルール一覧が表示されること
5. journal_entry_corrections テーブルが作成されていること（SQL実行要）
6. 仕訳修正時に修正履歴が記録されること
7. 同一パターン3回以上修正でルール提案が表示されること
8. AIプロンプトに修正ヒントが注入されること
9. 家事按分の出典バッジが表示されること
10. normalizeJapanese関数が正しく動作すること
11. alias自動追加が保存時に動作すること
12. multi_entryの折りたたみ行が一覧に表示されること
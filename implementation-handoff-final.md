# Tax Copilot — 実装セッション 引き継ぎ書（最終版）
# 作成日: 2026-03-26
# 対象: 設計議論セッションの引き継ぎ書を受けて、第1弾〜第3弾(3-4まで)を実装したセッション

---

## 完了した作業の全一覧

### 第1弾: DB基盤の整備（全完了）

**Phase A（非破壊的変更）7タスク:**
- A-1: industry_closure テーブル新規作成（227行） + industries に path/path_ids 追加
- A-2: document_types テーブル DROP＆再作成 + 25種別シードデータ
- A-3: approval_requests テーブル新規作成（14カラム）
- A-4: notes テーブル新規作成（9カラム）
- A-5: notifications テーブル拡張（link_url追加、type 13種に拡張）
- A-6: journal_entries.status CHECK制約を5種に拡張（draft/reviewed/approved/posted/amended）
- A-7: documents テーブルに5カラム追加（doc_classification, ocr_step1_type/confidence, ocr_step, restore_status）

**Phase B（tags関連の完全削除）:**
- DB: tags/document_tags/journal_entry_tags テーブル削除、6テーブルのtags uuid[]カラム削除
- フロント: tags.tsx削除、api.ts/main.tsx/Layout.tsx/review.tsx/types/index.tsからtags参照を全削除

**Phase C（ロール体系変更）:**
- DB: users.role 5種→4種（admin/manager/operator/viewer）、資格フラグ2カラム追加、テストユーザー5名更新、RLSポリシー42テーブル全面書き換え
- フロント: types/index.ts、accounts.tsx、suppliers.tsx、items.tsx、industries.tsx、taxCategories.tsx、settings.tsxのロール名を全更新
- auth.uid()問題: 調査の結果、全5ユーザーがMATCH（解消済み）

### 第2弾: ルールエンジン強化（全完了）

- types/index.ts: Rule.conditions 4→11キー、Rule.actions 4→8キー
- services.ts: matchProcessingRules()の階層遡り対応（industry_closure活用）、matchesConditions()の11キー対応、generateRuleName()新規追加
- api.ts: industry_closureからclosureData取得、新フィールドをmatchProcessingRulesに渡す
- rules.tsx: formData/resetForm/handleSubmit/handleOpenEditModalに新フィールド対応

### 第3弾: 仕訳フロー + UI（3-1〜3-4完了）

**3-1: ステータス遷移5段階 + ロール別ボタン切り替え（完了）**
- review.tsx: userRole取得、isManagerOrAdmin、ロール別ステータス遷移、journal_entry_approvals記録、handleRevert拡張、handleApproveFromList、一括承認ボタン、reviewedタブ、5段階ステータスバッジ、ロール別ボタンラベル

**3-2: rules.tsx フォーム拡張（完了）**
- モーダルフォームに品目パターン・支払方法・証憑種別の条件フィールド追加
- アクションに按分根拠メモ・仕訳タイプ・強制レビューフラグ追加
- テーブル一覧の「取引先パターン」列→「ルール名/条件」列（チップスバッジ表示）
- 按分/フラグ列に特殊仕訳タイプ・強制レビューバッジ追加
- 検索フィルターにルール名・品目パターン追加

**3-3: industries.tsx N階層対応（完了）**
- getLevelLabel/parentOptions/levelCountsを再帰関数でN階層対応
- 「子項目追加」ボタンのlevel < 2制限を撤廃
- レベルバッジを「Level N」に汎用化
- パンくずリスト追加（親を辿ってクリッカブル表示）
- 子項目一覧ヘッダーを「子項目一覧（N件）」に変更

**3-4: 承認ダッシュボード新規作成（完了）**
- approvals.tsx: 新規ページ（約300行）
- manager/admin専用画面（他ロールは権限エラー表示）
- 4サマリーカード（承認待ち/承認済み/要修正/全件）をタブフィルターとして使用
- 顧客フィルター
- 複数選択チェックボックス + 一括承認
- 個別承認/差し戻しボタン
- フラグ表示（要確認/AI生成/低信頼度）
- main.tsxにRoute追加、Layout.tsxのサイドバーに「承認ダッシュボード」リンク追加

---

## 未完了の作業（次のチャットで実施）

### 第3弾の残り
- 3-5: viewer専用アップロード画面（新規ページ: /upload-only）

### 第4弾: 1ドキュメント→N仕訳
- T1: 書類種別の自動判定（Step 0/Step 1相当）
- T2: 明細分割エンジン（statement_extract対応）
- T3: 複合仕訳の自動生成（Geminiプロンプト拡充、6パターン）
- T4: review.tsxのmulti_entry対応

### 第5弾: freee連携 + 自動処理 + その他
- freee API 8エンドポイント連携
- account_items.freee_account_item_id 追加
- 自動処理13項目
- 通知パネルUI（ヘッダーベルアイコン + ドロップダウン）
- メモ機能UI（notesテーブル活用）
- マルチタブUI
- ルール承認UI（approval_requestsテーブル活用）

### 将来のUI大規模改修（第3弾設計書に記載済みだが持ち越し）
- rules.tsx: 4タブ構成（全て/汎用/業種テンプレート/顧客別）+ 承認待ちタブ、右スライドパネルの2層表示、業種テンプレートタブのツリー表示
- industries.tsx: ルール件数バッジのツリー表示連携

---

## 現在のDB構造

### テーブル数: 44テーブル
- users.role: admin/manager/operator/viewer の4種
- users: is_licensed_tax_accountant, qualification_type 追加
- industries: path, path_ids 追加
- industry_closure: 227行（ancestor_id, descendant_id, depth）
- document_types: 25種別（完全再作成済み）
- journal_entries.status: draft/reviewed/approved/posted/amended の5種
- documents: doc_classification, ocr_step1_type/confidence, ocr_step, restore_status 追加
- notifications: link_url追加、type 13種
- approval_requests: 新規（14カラム）
- notes: 新規（9カラム）
- tags/document_tags/journal_entry_tags: 削除済み
- RLSポリシー: 全テーブル新ロール名対応済み

### processing_rules のJSONB構造
- conditions: 11キー（supplier_pattern, transaction_pattern, amount_min, amount_max, item_pattern, payment_method, document_type, has_invoice_number, tax_rate_hint, is_internal_tax, frequency_hint）
- actions: 8キー（account_item_id, tax_category_id, description_template, business_ratio, business_ratio_note, entry_type_hint, requires_manual_review, auto_tags）

### テストユーザー（5名、全てauth.uid() MATCH済み）
- 山田太郎: admin
- 田中花子: manager + is_licensed_tax_accountant=true
- 佐藤次郎: operator
- 中村健一: viewer
- 鈴木美咲: viewer

---

## 新規追加したページ
- /approvals → approvals.tsx（承認ダッシュボード、manager/admin専用）

## 修正した主要ページ
- review.tsx: ステータス5段階、ロール別ボタン、承認履歴記録、一括承認
- rules.tsx: フォーム拡張（11条件+8アクション）、テーブル列改善
- industries.tsx: N階層対応、パンくずリスト
- settings.tsx: 4ロール対応
- accounts.tsx/suppliers.tsx/items.tsx/taxCategories.tsx: ロール名更新
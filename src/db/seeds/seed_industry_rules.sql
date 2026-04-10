-- ============================================================
-- 業種別・顧客別仕訳ルール シードデータ
-- ============================================================
-- 使い方: Supabase SQL Editor にて実行
-- 前提: industries, account_items, tax_categories, organizations,
--       clients にデータが存在すること
-- 含む:
--   ■ 飲食業 / 建設業 / IT業 / 小売業 / 不動産業 / 医療業 / 運輸業
--   ■ 配送ドライバー（業種別、金額条件・税率ヒント付き）
--   ■ 配信者（業種INSERT + 家事按分率つき業種ルール + 顧客別ルール）
-- ============================================================

DO $$
DECLARE
  v_org_id         uuid;
  v_acct_id        uuid;
  v_tax_id         uuid;
  v_tax_id_8       uuid;  -- 軽減税率8%
  v_tax_id_ex      uuid;  -- 非課税/対象外用
  v_tax_id_sale    uuid;  -- 課税売上10%
  v_industry_id    uuid;
  v_client_id      uuid;
  v_industry_rule_id uuid;  -- 顧客ルールの derived_from 用
BEGIN
  -- 組織ID取得（1件前提）
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organizations テーブルにデータがありません';
  END IF;

  -- 汎用税区分の取得
  SELECT id INTO v_tax_id     FROM tax_categories WHERE name LIKE '%課税仕入%10%' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id_8   FROM tax_categories WHERE name LIKE '%課税仕入%8%'  AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id_sale FROM tax_categories WHERE name LIKE '%課税売上%10%' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id_ex  FROM tax_categories WHERE name LIKE '%非課税%' AND is_active = true LIMIT 1;
  IF v_tax_id_ex IS NULL THEN
    SELECT id INTO v_tax_id_ex FROM tax_categories WHERE name LIKE '%対象外%' AND is_active = true LIMIT 1;
  END IF;

  -- ============================================================
  -- ■ 飲食業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE name LIKE '%飲食%' AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '仕入高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '食材仕入 → 仕入高（飲食業）', 50, 'industry', '支出',
        '{"supplier_pattern": "(市場|青果|精肉|鮮魚|食品卸|業務スーパー|食材)", "item_pattern": "(食材|野菜|肉|魚|米|調味料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 食材仕入'),
        true, true);
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '酒類仕入 → 仕入高（飲食業）', 55, 'industry', '支出',
        '{"supplier_pattern": "(酒販|酒店|リカー|カクヤス|やまや)", "item_pattern": "(ビール|日本酒|ワイン|焼酎|酒類)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 酒類仕入'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '消耗品費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '厨房用品 → 消耗品費（飲食業）', 60, 'industry', '支出',
        '{"item_pattern": "(割箸|紙ナプキン|ラップ|アルミホイル|洗剤|スポンジ|使い捨て容器|テイクアウト容器)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 厨房消耗品'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '広告宣伝費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'グルメサイト掲載 → 広告宣伝費（飲食業）', 70, 'industry', '支出',
        '{"supplier_pattern": "(食べログ|ぐるなび|ホットペッパー|Retty|一休)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 掲載料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '飲食売上 → 売上高（飲食業）', 50, 'industry', '収入',
        '{"transaction_pattern": "(レジ売上|POSレジ|売上入金|食事代)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '飲食売上'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 飲食業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 飲食業スキップ（industries に該当なし）';
  END IF;

  -- ============================================================
  -- ■ 建設業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE name LIKE '%建設%' AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '仕入高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '建設資材 → 仕入高（建設業）', 50, 'industry', '支出',
        '{"supplier_pattern": "(建材|コメリ|カインズ|コーナン|ナフコ|材木|セメント|鋼材)", "item_pattern": "(木材|鉄筋|セメント|砂利|塗料|断熱材|配管)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 建設資材'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '外注費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '外注工事 → 外注費（建設業）', 50, 'industry', '支出',
        '{"transaction_pattern": "(外注工事|下請|施工費|工事代金|人工代)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 外注工事費'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name IN ('賃借料', 'リース料') AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '重機リース → 賃借料（建設業）', 60, 'industry', '支出',
        '{"supplier_pattern": "(リース|レンタル|アクティオ|カナモト|ニッケン)", "item_pattern": "(ユンボ|クレーン|足場|重機|ダンプ)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 重機リース'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '工事売上 → 売上高（建設業）', 50, 'industry', '収入',
        '{"transaction_pattern": "(工事代金|請負代金|施工完了|出来高)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 工事売上'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 建設業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 建設業スキップ';
  END IF;

  -- ============================================================
  -- ■ IT・情報通信業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE (name LIKE '%IT%' OR name LIKE '%情報%' OR name LIKE '%ソフトウェア%') AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '通信費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'クラウドサービス → 通信費（IT業）', 50, 'industry', '支出',
        '{"supplier_pattern": "(AWS|Amazon Web Services|Google Cloud|GCP|Azure|Microsoft Azure|さくらインターネット|Heroku|Vercel|Render|Cloudflare)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} クラウド利用料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '支払手数料' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'SaaS利用料 → 支払手数料（IT業）', 60, 'industry', '支出',
        '{"supplier_pattern": "(Slack|Notion|GitHub|GitLab|Figma|Jira|Confluence|Zoom|ChatGPT|OpenAI|Anthropic|Copilot|JetBrains)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} SaaS利用料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '外注費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '外注開発 → 外注費（IT業）', 50, 'industry', '支出',
        '{"transaction_pattern": "(開発委託|システム開発|プログラミング|コーディング|デザイン委託|業務委託費)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 外注開発費'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '開発・保守売上 → 売上高（IT業）', 50, 'industry', '収入',
        '{"transaction_pattern": "(開発報酬|保守料|SaaS利用料収入|ライセンス収入|月額利用料|システム利用料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 開発・保守売上'),
        true, true);
    END IF;
    RAISE NOTICE '✅ IT・情報通信業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ IT・情報通信業スキップ';
  END IF;

  -- ============================================================
  -- ■ 小売業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE name LIKE '%小売%' AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '仕入高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '商品仕入 → 仕入高（小売業）', 50, 'industry', '支出',
        '{"transaction_pattern": "(商品仕入|仕入代金|問屋|卸売|メーカー直送)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 商品仕入'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '荷造運賃' AND is_active = true LIMIT 1;
    IF v_acct_id IS NULL THEN
      SELECT id INTO v_acct_id FROM account_items WHERE name LIKE '%荷造%' AND is_active = true LIMIT 1;
    END IF;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '配送・梱包 → 荷造運賃（小売業）', 60, 'industry', '支出',
        '{"supplier_pattern": "(ヤマト|佐川|日本郵便|ゆうパック|クロネコ|西濃運輸|福山通運)", "item_pattern": "(送料|配送|梱包|段ボール|緩衝材)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 配送・梱包費'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '支払手数料' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'EC手数料 → 支払手数料（小売業）', 65, 'industry', '支出',
        '{"supplier_pattern": "(楽天|Yahoo!ショッピング|Amazon|メルカリ|BASE|STORES|Shopify)", "transaction_pattern": "(販売手数料|システム利用料|決済手数料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} EC販売手数料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '店舗・EC売上 → 売上高（小売業）', 50, 'industry', '収入',
        '{"transaction_pattern": "(レジ売上|POS|EC売上|ネット売上|店舗売上)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '店舗・EC売上'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 小売業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 小売業スキップ';
  END IF;

  -- ============================================================
  -- ■ 不動産業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE name LIKE '%不動産%' AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '修繕費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '物件修繕 → 修繕費（不動産業）', 50, 'industry', '支出',
        '{"transaction_pattern": "(修繕|リフォーム|原状回復|クリーニング|内装工事|設備修理)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 物件修繕費'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '支払手数料' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '管理委託料 → 支払手数料（不動産業）', 55, 'industry', '支出',
        '{"transaction_pattern": "(管理委託|管理手数料|PM費|プロパティマネジメント)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 管理委託料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '住居賃料収入 → 売上高（不動産業・非課税）', 50, 'industry', '収入',
        '{"transaction_pattern": "(家賃収入|賃料収入|共益費収入|住居)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '賃料収入（住居用）'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 不動産業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 不動産業スキップ';
  END IF;

  -- ============================================================
  -- ■ 医療・福祉業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE (name LIKE '%医療%' OR name LIKE '%福祉%' OR name LIKE '%クリニック%') AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name = '仕入高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '医薬品 → 仕入高（医療業）', 50, 'industry', '支出',
        '{"supplier_pattern": "(医薬品|製薬|メディカル|医療機器|ディスポ)", "item_pattern": "(薬品|注射器|ガーゼ|手袋|マスク|消毒)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 医療材料'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '診療報酬 → 売上高（医療業・非課税）', 50, 'industry', '収入',
        '{"transaction_pattern": "(診療報酬|社会保険診療|国保連|支払基金|レセプト)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '診療報酬'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 医療・福祉業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 医療・福祉業スキップ';
  END IF;

  -- ============================================================
  -- ■ 運輸・物流業
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE (name LIKE '%運輸%' OR name LIKE '%物流%' OR name LIKE '%運送%') AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN
    SELECT id INTO v_acct_id FROM account_items WHERE name IN ('車両費', '燃料費') AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '燃料費 → 車両費（運輸業）', 50, 'industry', '支出',
        '{"supplier_pattern": "(ガソリンスタンド|ENEOS|出光|コスモ|Shell|昭和シェル|軽油)", "item_pattern": "(ガソリン|軽油|燃料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 燃料費'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '修繕費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '車両修理 → 修繕費（運輸業）', 55, 'industry', '支出',
        '{"supplier_pattern": "(整備|オートバックス|イエローハット|タイヤ館|車検)", "transaction_pattern": "(車検|修理|整備|タイヤ交換|オイル交換)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 車両修理・整備'),
        true, true);
    END IF;
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '運送売上 → 売上高（運輸業）', 50, 'industry', '収入',
        '{"transaction_pattern": "(運賃|配送料|運送代金|輸送費|傭車料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 運送売上'),
        true, true);
    END IF;
    RAISE NOTICE '✅ 運輸・物流業ルール投入完了';
  ELSE
    RAISE NOTICE '⏭ 運輸・物流業スキップ';
  END IF;

  -- ============================================================
  -- ■ 配送ドライバー
  --   金額条件(amount_min/max)、税率ヒント(tax_rate_hint)、
  --   支払方法(payment_method)、家事按分率 を含むテストデータ
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE (name LIKE '%配送%' OR name LIKE '%ドライバー%' OR name LIKE '%宅配%') AND is_active = true LIMIT 1;
  IF v_industry_id IS NOT NULL THEN

    -- 1. ガソリン代（少額/日常） → 車両費  ※金額上限つき
    SELECT id INTO v_acct_id FROM account_items WHERE name IN ('車両費', '燃料費') AND is_active = true LIMIT 1;
    IF v_acct_id IS NULL THEN
      SELECT id INTO v_acct_id FROM account_items WHERE name = '旅費交通費' AND is_active = true LIMIT 1;
    END IF;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'ガソリン代（日常） → 車両費（配送ドライバー）', 40, 'industry', '支出',
        '{"supplier_pattern": "(ENEOS|出光|コスモ|Shell|昭和シェル|ガソリンスタンド|GS)", "amount_max": 15000, "payment_method": "cash", "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} ガソリン代',
          'business_ratio', 0.9, 'business_ratio_note', '業務使用90%（自宅⇔配送エリア通勤含む）'),
        true, true);

      -- 2. ガソリン代（大量給油） → 車両費  ※金額下限つき、要確認
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply, require_confirmation)
      VALUES (v_org_id, v_industry_id, 'ガソリン代（大量給油） → 車両費（配送ドライバー）', 35, 'industry', '支出',
        '{"supplier_pattern": "(ENEOS|出光|コスモ|Shell|昭和シェル|ガソリンスタンド|GS)", "amount_min": 15001, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} ガソリン代（大量）',
          'requires_manual_review', true, 'business_ratio', 1.0, 'business_ratio_note', '業務専用車両のため100%'),
        true, true, true);
    END IF;

    -- 3. 高速代・ETC → 旅費交通費  ※金額帯で分類
    SELECT id INTO v_acct_id FROM account_items WHERE name = '旅費交通費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '高速代（通常） → 旅費交通費（配送ドライバー）', 45, 'industry', '支出',
        '{"supplier_pattern": "(ETC|NEXCO|首都高|阪神高速|高速道路)", "amount_max": 5000, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 高速道路料金'),
        true, true);

      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '高速代（長距離） → 旅費交通費（配送ドライバー）', 44, 'industry', '支出',
        '{"supplier_pattern": "(ETC|NEXCO|首都高|阪神高速|高速道路)", "amount_min": 5001, "amount_max": 30000, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 高速道路（長距離配送）',
          'requires_manual_review', true),
        true, true);
    END IF;

    -- 4. 車両修理・整備 → 修繕費
    SELECT id INTO v_acct_id FROM account_items WHERE name = '修繕費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '車両整備 → 修繕費（配送ドライバー）', 50, 'industry', '支出',
        '{"supplier_pattern": "(オートバックス|イエローハット|タイヤ館|整備工場|ディーラー|車検)", "transaction_pattern": "(車検|修理|整備|タイヤ|オイル交換|バッテリー)", "amount_min": 3000}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 車両整備費',
          'business_ratio', 0.9, 'business_ratio_note', '業務使用90%'),
        true, true);
    END IF;

    -- 5. 駐車場代 → 地代家賃  ※月極は非課税ヒントあり
    SELECT id INTO v_acct_id FROM account_items WHERE name = '地代家賃' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '月極駐車場 → 地代家賃（配送ドライバー）', 50, 'industry', '支出',
        '{"transaction_pattern": "(月極駐車場|駐車場賃料|ガレージ)", "is_internal_tax": true}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '月極駐車場代',
          'business_ratio', 1.0, 'business_ratio_note', '業務車両専用駐車場'),
        true, true);
    END IF;

    -- 6. コインパーキング → 旅費交通費  ※少額・現金多い
    SELECT id INTO v_acct_id FROM account_items WHERE name = '旅費交通費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'コインパーキング → 旅費交通費（配送ドライバー）', 55, 'industry', '支出',
        '{"supplier_pattern": "(タイムズ|リパーク|三井のリパーク|コインパーキング|NPC)", "amount_max": 3000, "payment_method": "cash", "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 駐車料金'),
        true, true);
    END IF;

    -- 7. 配送用消耗品 → 消耗品費  ※軽減税率8%テスト（飲料等含む）
    SELECT id INTO v_acct_id FROM account_items WHERE name = '消耗品費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '配送用消耗品 → 消耗品費（配送ドライバー）', 60, 'industry', '支出',
        '{"item_pattern": "(軍手|台車|養生テープ|カッター|結束バンド|ガムテープ|段ボール)", "amount_max": 10000, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 配送用消耗品'),
        true, true);
    END IF;

    -- 8. 自動車保険 → 保険料  ※非課税
    SELECT id INTO v_acct_id FROM account_items WHERE name = '保険料' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '自動車保険 → 保険料（配送ドライバー）', 50, 'industry', '支出',
        '{"supplier_pattern": "(損保|東京海上|三井住友海上|あいおい|損保ジャパン|自動車保険|任意保険)", "tax_rate_hint": 0}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '{supplier} 自動車保険料',
          'business_ratio', 0.9, 'business_ratio_note', '業務使用90%'),
        true, true);
    END IF;

    -- 9. 配送売上 → 売上高
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '配送報酬 → 売上高（配送ドライバー）', 40, 'industry', '収入',
        '{"transaction_pattern": "(配送報酬|配達報酬|運賃|業務委託料|Uber|出前館|Wolt|menu)", "amount_min": 1000}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 配送報酬'),
        true, true);
    END IF;

    RAISE NOTICE '✅ 配送ドライバールール投入完了 (industry_id: %)', v_industry_id;
  ELSE
    RAISE NOTICE '⏭ 配送ドライバーが industries に見つかりません。スキップ。';
  END IF;

  -- ============================================================
  -- ■ 配信者（YouTuber/ストリーマー）
  --   ★ 業種が無ければ新規INSERT
  --   ★ 家事按分率つき業種ルール + 顧客別ルール
  -- ============================================================
  SELECT id INTO v_industry_id FROM industries WHERE (name LIKE '%配信%' OR name LIKE '%YouTub%' OR name LIKE '%ストリーマー%') AND is_active = true LIMIT 1;
  IF v_industry_id IS NULL THEN
    INSERT INTO industries (code, name, description, sort_order, is_active)
    VALUES ('9100', '配信者・クリエイター', 'YouTuber、ライブ配信者、動画クリエイター等。自宅兼事務所で活動するケースが多く、家事按分が重要。', 91, true)
    RETURNING id INTO v_industry_id;
    RAISE NOTICE '✅ 業種「配信者・クリエイター」を新規作成 (id: %)', v_industry_id;
  END IF;

  IF v_industry_id IS NOT NULL THEN

    -- 1. 撮影機材（高額） → 消耗品費 or 工具器具備品  ※金額で分岐
    --    10万未満 → 消耗品費
    SELECT id INTO v_acct_id FROM account_items WHERE name = '消耗品費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '撮影機材（10万未満） → 消耗品費（配信者）', 45, 'industry', '支出',
        '{"supplier_pattern": "(ヨドバシ|ビックカメラ|Amazon|ケーズデンキ|ヤマダ電機)", "item_pattern": "(カメラ|マイク|照明|三脚|リングライト|キャプチャーボード|Webカメラ|ヘッドセット)", "amount_max": 99999, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 撮影機材',
          'business_ratio', 0.8, 'business_ratio_note', '配信業務使用80%（私的利用20%）'),
        true, true);
    END IF;

    --    10万以上 → 工具器具備品（要確認）
    SELECT id INTO v_acct_id FROM account_items WHERE name IN ('工具器具備品', '備品') AND is_active = true LIMIT 1;
    IF v_acct_id IS NULL THEN
      SELECT id INTO v_acct_id FROM account_items WHERE name LIKE '%備品%' AND is_active = true LIMIT 1;
    END IF;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply, require_confirmation)
      VALUES (v_org_id, v_industry_id, '撮影機材（10万以上） → 工具器具備品（配信者）', 40, 'industry', '支出',
        '{"supplier_pattern": "(ヨドバシ|ビックカメラ|Amazon|ケーズデンキ|ヤマダ電機)", "item_pattern": "(カメラ|一眼|レンズ|PC|パソコン|MacBook|iMac|モニター)", "amount_min": 100000, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 撮影機材（固定資産候補）',
          'requires_manual_review', true, 'business_ratio', 0.8, 'business_ratio_note', '配信業務使用80%（減価償却対象の可能性）'),
        true, true, true);
    END IF;

    -- 2. 自宅インターネット → 通信費  ★家事按分60%
    SELECT id INTO v_acct_id FROM account_items WHERE name = '通信費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'インターネット回線 → 通信費（配信者・按分60%）', 50, 'industry', '支出',
        '{"supplier_pattern": "(フレッツ|光回線|NURO|ビッグローブ|OCN|So-net|@nifty|プロバイダ)", "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} インターネット回線',
          'business_ratio', 0.6, 'business_ratio_note', '自宅兼事務所：配信・編集業務60%'),
        true, true);

      -- 3. 携帯電話 → 通信費  ★家事按分50%
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '携帯電話 → 通信費（配信者・按分50%）', 55, 'industry', '支出',
        '{"supplier_pattern": "(docomo|au|softbank|ソフトバンク|楽天モバイル|ahamo|povo|LINEMO|UQ|ワイモバイル)", "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 携帯電話料金',
          'business_ratio', 0.5, 'business_ratio_note', '仕事・プライベート半々'),
        true, true);
    END IF;

    -- 4. 自宅家賃 → 地代家賃  ★家事按分30%
    SELECT id INTO v_acct_id FROM account_items WHERE name = '地代家賃' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '自宅家賃 → 地代家賃（配信者・按分30%）', 45, 'industry', '支出',
        '{"transaction_pattern": "(家賃|賃料|賃貸|共益費|管理費)", "is_internal_tax": true}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '自宅家賃（配信スペース）',
          'business_ratio', 0.3, 'business_ratio_note', '自宅面積のうち配信スペース30%'),
        true, true);
    END IF;

    -- 5. 自宅電気代 → 水道光熱費  ★家事按分30%
    SELECT id INTO v_acct_id FROM account_items WHERE name = '水道光熱費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '電気代 → 水道光熱費（配信者・按分30%）', 55, 'industry', '支出',
        '{"supplier_pattern": "(東京電力|関西電力|中部電力|東北電力|九州電力|TEPCO|電力)", "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 電気代',
          'business_ratio', 0.3, 'business_ratio_note', 'PC・照明・空調の配信使用分30%'),
        true, true);
    END IF;

    -- 6. 配信プラットフォーム手数料 → 支払手数料
    SELECT id INTO v_acct_id FROM account_items WHERE name = '支払手数料' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, 'プラットフォーム手数料 → 支払手数料（配信者）', 50, 'industry', '支出',
        '{"supplier_pattern": "(YouTube|Google|Twitch|TikTok|SHOWROOM|17LIVE|ニコニコ)", "transaction_pattern": "(手数料|プラットフォーム利用料|決済手数料)"}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} プラットフォーム手数料'),
        true, true);
    END IF;

    -- 7. 動画編集外注 → 外注費  ★金額帯テスト
    SELECT id INTO v_acct_id FROM account_items WHERE name = '外注費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '動画編集外注 → 外注費（配信者）', 50, 'industry', '支出',
        '{"transaction_pattern": "(動画編集|サムネイル|テロップ|カット編集|エフェクト)", "amount_min": 5000, "amount_max": 200000, "tax_rate_hint": 10}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 動画編集外注費'),
        true, true);
    END IF;

    -- 8. 企画用飲食（軽減税率8%テスト） → 取材費 or 会議費
    SELECT id INTO v_acct_id FROM account_items WHERE name = '会議費' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL AND v_tax_id_8 IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '企画用食品購入 → 会議費（配信者・軽減8%）', 65, 'industry', '支出',
        '{"item_pattern": "(食品|お菓子|飲料|ドリンク|弁当|おにぎり)", "transaction_pattern": "(企画|撮影用|レビュー)", "amount_max": 10000, "tax_rate_hint": 8}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_8, 'description_template', '{supplier} 企画用食品',
          'business_ratio', 1.0, 'business_ratio_note', '撮影企画用のため100%経費'),
        true, true);
    END IF;

    -- 9. 配信収益 → 売上高
    SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
    IF v_acct_id IS NOT NULL THEN
      INSERT INTO processing_rules (organization_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
      VALUES (v_org_id, v_industry_id, '配信収益 → 売上高（配信者）', 40, 'industry', '収入',
        '{"transaction_pattern": "(広告収益|YouTube収益|スーパーチャット|投げ銭|サブスク収益|メンバーシップ|案件報酬|PR報酬|タイアップ)", "amount_min": 1000}'::jsonb,
        jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 配信収益'),
        true, true);
    END IF;

    RAISE NOTICE '✅ 配信者ルール投入完了 (industry_id: %)', v_industry_id;

    -- ==========================================================
    -- ■ 配信者 → 顧客別ルール（scope='client'）
    --   配信者業種に紐づく顧客を取得し、顧客固有ルールを作成
    -- ==========================================================
    SELECT c.id INTO v_client_id
    FROM clients c
    WHERE c.industry_id = v_industry_id
      AND c.organization_id = v_org_id
      AND c.status = 'active'
    LIMIT 1;

    -- 顧客がなければテスト用に作成
    IF v_client_id IS NULL THEN
      INSERT INTO clients (organization_id, name, industry_id, annual_sales, tax_category, invoice_registered, use_custom_rules, status, is_taxable, auto_rule_addition)
      VALUES (v_org_id, 'テスト配信者A（ゲーム実況）', v_industry_id, 8000000, '原則課税', true, true, 'active', true, true)
      RETURNING id INTO v_client_id;
      RAISE NOTICE '✅ テスト顧客「テスト配信者A」を作成 (id: %)', v_client_id;
    END IF;

    IF v_client_id IS NOT NULL THEN

      -- 顧客ルール1: ゲーミングPC → 工具器具備品（按分90%）
      --   この顧客はゲーム実況がメインなのでPC按分率が高い
      SELECT id INTO v_acct_id FROM account_items WHERE name IN ('工具器具備品', '備品') AND is_active = true LIMIT 1;
      IF v_acct_id IS NULL THEN
        SELECT id INTO v_acct_id FROM account_items WHERE name LIKE '%備品%' AND is_active = true LIMIT 1;
      END IF;
      -- 業種ルール（撮影機材10万以上）のIDを取得して derived_from にセット
      SELECT id INTO v_industry_rule_id FROM processing_rules
        WHERE industry_id = v_industry_id AND scope = 'industry' AND rule_name LIKE '%撮影機材（10万以上）%' LIMIT 1;
      IF v_acct_id IS NOT NULL THEN
        INSERT INTO processing_rules (organization_id, client_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply, derived_from_rule_id)
        VALUES (v_org_id, v_client_id, v_industry_id, 'ゲーミングPC → 工具器具備品（配信者A・按分90%）', 20, 'client', '支出',
          '{"supplier_pattern": "(ドスパラ|ツクモ|パソコン工房|マウスコンピューター|GALLERIA|自作PC|BTOパソコン)", "item_pattern": "(ゲーミングPC|グラフィックボード|GPU|メモリ|SSD)", "amount_min": 100000, "tax_rate_hint": 10}'::jsonb,
          jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} ゲーミングPC関連',
            'requires_manual_review', true, 'business_ratio', 0.9, 'business_ratio_note', 'ゲーム実況メインのため業務使用率90%'),
          true, true, v_industry_rule_id);
      END IF;

      -- 顧客ルール2: ゲームソフト購入 → 消耗品費（按分100%）
      SELECT id INTO v_acct_id FROM account_items WHERE name = '消耗品費' AND is_active = true LIMIT 1;
      IF v_acct_id IS NOT NULL THEN
        INSERT INTO processing_rules (organization_id, client_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
        VALUES (v_org_id, v_client_id, v_industry_id, 'ゲームソフト → 消耗品費（配信者A）', 25, 'client', '支出',
          '{"supplier_pattern": "(Steam|Nintendo|PlayStation|Xbox|Epic Games|任天堂)", "item_pattern": "(ゲームソフト|DLC|ダウンロード版|パッケージ版)", "amount_max": 15000, "tax_rate_hint": 10}'::jsonb,
          jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} ゲームソフト（実況用）',
            'business_ratio', 1.0, 'business_ratio_note', '実況コンテンツ制作目的のため100%経費'),
          true, true);
      END IF;

      -- 顧客ルール3: この顧客固有の案件収益 → 売上高（源泉徴収あり）
      SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
      IF v_acct_id IS NOT NULL THEN
        INSERT INTO processing_rules (organization_id, client_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
        VALUES (v_org_id, v_client_id, v_industry_id, '案件収益 → 売上高（配信者A・源泉徴収）', 20, 'client', '収入',
          '{"transaction_pattern": "(案件報酬|PR報酬|タイアップ|スポンサー)", "amount_min": 50000, "tax_rate_hint": 10}'::jsonb,
          jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_sale, 'description_template', '{supplier} 案件報酬',
            'withholding_tax_handling', '源泉徴収あり（10.21%）'),
          true, true);
      END IF;

      -- 顧客ルール4: 自宅家賃の按分率を業種デフォルト30%→40%にオーバーライド
      SELECT id INTO v_acct_id FROM account_items WHERE name = '地代家賃' AND is_active = true LIMIT 1;
      SELECT id INTO v_industry_rule_id FROM processing_rules
        WHERE industry_id = v_industry_id AND scope = 'industry' AND rule_name LIKE '%自宅家賃%' LIMIT 1;
      IF v_acct_id IS NOT NULL THEN
        INSERT INTO processing_rules (organization_id, client_id, industry_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply, derived_from_rule_id)
        VALUES (v_org_id, v_client_id, v_industry_id, '自宅家賃 → 地代家賃（配信者A・按分40%）', 20, 'client', '支出',
          '{"transaction_pattern": "(家賃|賃料|賃貸|共益費|管理費)", "is_internal_tax": true}'::jsonb,
          jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id_ex, 'description_template', '自宅家賃（配信スペース）',
            'business_ratio', 0.4, 'business_ratio_note', '2LDKのうち1部屋を専用配信ルームとして使用（40%）'),
          true, true, v_industry_rule_id);
      END IF;

      RAISE NOTICE '✅ 配信者A 顧客別ルール投入完了 (client_id: %)', v_client_id;
    END IF;

  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE '全業種ルールのシードデータ投入完了';
  RAISE NOTICE '========================================';
END $$;

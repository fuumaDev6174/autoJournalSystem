-- ============================================================
-- 汎用仕訳ルール（scope='shared'）シードデータ
-- ============================================================
-- 使い方: Supabase SQL Editor にて実行
-- 注意: organization_id は既存のorganizationsテーブルから取得
--       account_item_id, tax_category_id も既存データから動的に参照
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;
  v_acct_id uuid;
  v_tax_id  uuid;
BEGIN
  -- 組織ID取得（1件前提）
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organizations テーブルにデータがありません';
  END IF;

  -- ========================================
  -- 1. 通信費（携帯電話・インターネット）
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '通信費' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id  FROM tax_categories WHERE name LIKE '%課税仕入%10%' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '携帯電話料金 → 通信費', 100, 'shared', '支出',
      '{"supplier_pattern": "(docomo|au|softbank|ソフトバンク|NTT|KDDI|楽天モバイル|ahamo|povo|LINEMO|UQ|ワイモバイル)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 携帯電話料金'),
      true, true);

    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'インターネット回線 → 通信費', 110, 'shared', '支出',
      '{"supplier_pattern": "(フレッツ|光回線|NURO|ビッグローブ|OCN|So-net|@nifty|プロバイダ)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} インターネット回線'),
      true, true);
  END IF;

  -- ========================================
  -- 2. 水道光熱費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '水道光熱費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '電気料金 → 水道光熱費', 100, 'shared', '支出',
      '{"supplier_pattern": "(東京電力|関西電力|中部電力|東北電力|九州電力|北海道電力|四国電力|中国電力|北陸電力|沖縄電力|TEPCO|電力)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 電気料金'),
      true, true);

    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'ガス料金 → 水道光熱費', 100, 'shared', '支出',
      '{"supplier_pattern": "(東京ガス|大阪ガス|東邦ガス|西部ガス|ガス)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} ガス料金'),
      true, true);

    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '水道料金 → 水道光熱費', 100, 'shared', '支出',
      '{"supplier_pattern": "(水道局|水道)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 水道料金'),
      true, true);
  END IF;

  -- ========================================
  -- 3. 旅費交通費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '旅費交通費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '交通系IC → 旅費交通費', 100, 'shared', '支出',
      '{"supplier_pattern": "(Suica|PASMO|ICOCA|チャージ|JR|電車|バス|タクシー|モバイルSuica)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 交通費'),
      true, true);

    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'ETC・高速道路 → 旅費交通費', 110, 'shared', '支出',
      '{"supplier_pattern": "(ETC|高速|NEXCO|首都高|阪神高速)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 高速道路料金'),
      true, true);
  END IF;

  -- ========================================
  -- 4. 消耗品費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '消耗品費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '100均・文具 → 消耗品費', 120, 'shared', '支出',
      '{"supplier_pattern": "(ダイソー|セリア|キャンドゥ|文具|ステーショナリー|コクヨ|アスクル|カウネット)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 消耗品'),
      true, true);

    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'Amazon → 消耗品費', 130, 'shared', '支出',
      '{"supplier_pattern": "(Amazon|アマゾン|AMZN)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 消耗品購入'),
      true, true);
  END IF;

  -- ========================================
  -- 5. 地代家賃
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '地代家賃' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    -- 家賃は非課税の場合が多い（住居用）
    SELECT id INTO v_tax_id FROM tax_categories WHERE name LIKE '%非課税%' AND is_active = true LIMIT 1;
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '家賃・賃料 → 地代家賃', 90, 'shared', '支出',
      '{"transaction_pattern": "(家賃|賃料|賃貸|マンション管理|共益費|管理費)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '事務所家賃', 'business_ratio', 1.0, 'business_ratio_note', '事務所専用'),
      true, true);
  END IF;

  -- ========================================
  -- 6. 接待交際費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '接待交際費' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id  FROM tax_categories WHERE name LIKE '%課税仕入%10%' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '飲食店（5,000円超） → 接待交際費', 100, 'shared', '支出',
      '{"supplier_pattern": "(居酒屋|レストラン|焼肉|寿司|割烹|料亭|バー|スナック)", "amount_min": 5001}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 接待', 'requires_manual_review', true),
      true, true);
  END IF;

  -- ========================================
  -- 7. 会議費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '会議費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'カフェ・喫茶 → 会議費', 100, 'shared', '支出',
      '{"supplier_pattern": "(スターバックス|ドトール|タリーズ|コメダ|サンマルク|カフェ|喫茶|STARBUCKS|Starbucks)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 打合せ'),
      true, true);
  END IF;

  -- ========================================
  -- 8. 新聞図書費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '新聞図書費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '書籍・新聞 → 新聞図書費', 120, 'shared', '支出',
      '{"supplier_pattern": "(書店|本屋|紀伊國屋|ジュンク堂|丸善|honto|Kindle|新聞|日経|読売|朝日|毎日)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 書籍・新聞'),
      true, true);
  END IF;

  -- ========================================
  -- 9. 支払手数料
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '支払手数料' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '振込手数料 → 支払手数料', 80, 'shared', '支出',
      '{"transaction_pattern": "(振込手数料|振込料|送金手数料|ATM手数料)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '振込手数料'),
      true, true);
  END IF;

  -- ========================================
  -- 10. 広告宣伝費
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '広告宣伝費' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'Web広告 → 広告宣伝費', 110, 'shared', '支出',
      '{"supplier_pattern": "(Google Ads|Facebook|Meta|Instagram|Twitter|X広告|Yahoo広告|リスティング)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 広告費'),
      true, true);
  END IF;

  -- ========================================
  -- 11. 保険料
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '保険料' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    SELECT id INTO v_tax_id FROM tax_categories WHERE name LIKE '%非課税%' AND is_active = true LIMIT 1;
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '保険料 → 保険料', 100, 'shared', '支出',
      '{"supplier_pattern": "(損保|生命保険|損害保険|東京海上|三井住友海上|あいおい|損保ジャパン|日本生命|第一生命|明治安田)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 保険料'),
      true, true);
  END IF;

  -- ========================================
  -- 12. 租税公課
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '租税公課' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    SELECT id INTO v_tax_id FROM tax_categories WHERE name LIKE '%対象外%' AND is_active = true LIMIT 1;
    IF v_tax_id IS NULL THEN
      SELECT id INTO v_tax_id FROM tax_categories WHERE name LIKE '%不課税%' AND is_active = true LIMIT 1;
    END IF;
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '税金・公的費用 → 租税公課', 90, 'shared', '支出',
      '{"transaction_pattern": "(固定資産税|自動車税|印紙|収入印紙|登録免許|個人事業税|償却資産税)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '租税公課'),
      true, true);
  END IF;

  -- ========================================
  -- 13. 雑費（汎用フォールバック）
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '雑費' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id  FROM tax_categories WHERE name LIKE '%課税仕入%10%' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, 'コンビニ → 雑費（要確認）', 200, 'shared', '支出',
      '{"supplier_pattern": "(セブンイレブン|ファミリーマート|ローソン|ミニストップ|デイリーヤマザキ|コンビニ)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier}', 'requires_manual_review', true),
      true, true);
  END IF;

  -- ========================================
  -- 14. 売上高（収入ルール）
  -- ========================================
  SELECT id INTO v_acct_id FROM account_items WHERE name = '売上高' AND is_active = true LIMIT 1;
  SELECT id INTO v_tax_id  FROM tax_categories WHERE name LIKE '%課税売上%10%' AND is_active = true LIMIT 1;
  IF v_acct_id IS NOT NULL AND v_tax_id IS NOT NULL THEN
    INSERT INTO processing_rules (organization_id, rule_name, priority, scope, rule_type, conditions, actions, is_active, auto_apply)
    VALUES (v_org_id, '入金・売上 → 売上高', 100, 'shared', '収入',
      '{"transaction_pattern": "(売上|報酬|入金|振込入金|業務委託料)"}'::jsonb,
      jsonb_build_object('account_item_id', v_acct_id, 'tax_category_id', v_tax_id, 'description_template', '{supplier} 売上'),
      true, true);
  END IF;

  RAISE NOTICE '汎用仕訳ルールのシードデータ投入完了（organization_id: %）', v_org_id;
END $$;

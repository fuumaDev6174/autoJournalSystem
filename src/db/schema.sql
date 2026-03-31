# Tax Copilot — DBスキーマリファレンス
取得日: 2026-03-31 / industries N階層廃止・derived_from_rule_id追加 適用後

## サマリー
- **テーブル数**: 44（+ v_liver_id ビュー1件 = 計45エントリ）
- **CHECK制約**: 37件
- **RLSポリシー**: 87件

---

## テーブル一覧

| # | テーブル名 | カラム数 | 主要FK | CHECK | RLS |
|---|-----------|---------|--------|-------|-----|
| 1 | account_categories | 6 | — | type: bs/pl | SELECT(全員) |
| 2 | account_items | 24 | organizations, clients, industries, account_categories, tax_categories | — | org_id or NULL |
| 3 | actual_vs_budget | 11 | clients, client_fiscal_years, account_items, departments | — | can_access_client |
| 4 | ai_suggestions | 17 | documents, journal_entries, account_items, tax_categories, suppliers, users | user_action: accepted/rejected/modified | doc→org |
| 5 | approval_requests | 14 | organizations, users, processing_rules, journal_entries, documents | request_type/status/trigger_source | org_id |
| 6 | budget_entries | 10 | clients, client_fiscal_years, account_items, departments, users | — | can_access_client |
| 7 | client_account_ratios | 10 | organizations, clients, account_items | ratio: 0~1 | org_id |
| 8 | client_contacts | 12 | clients | — | can_access_client |
| 9 | client_fiscal_years | 10 | clients, users | — | can_access_client |
| 10 | client_industries | 5 | clients, industries | — | client→org |
| 11 | client_settings | 15 | clients, departments | — | can_access_client |
| 12 | client_tax_category_settings | 9 | organizations, clients, tax_categories | — | org_id |
| 13 | clients | 39 | organizations, industries, users | tax_category/status/accounting_method/tax_method | org_id |
| 14 | closing_entries | 7 | client_fiscal_years, journal_entries, users | — | fiscal→client |
| 15 | departments | 10 | organizations, clients, departments(self) | — | org_id |
| 16 | document_attachments | 9 | documents, users | — | doc→org |
| 17 | document_types | 15 | — | display_group/processing_pattern | SELECT(全員) |
| 18 | documents | 35 | organizations, clients, document_types, suppliers, users | ocr_status/status | org_id |
| 19 | export_entries | 5 | exports, journal_entries | sync_status | (RLSなし) |
| 20 | exports | 20 | organizations, clients, users, posting_periods | status | org_id |
| 21 | freee_connections | 14 | organizations, clients, users | sync_status | (RLSなし) |
| 22 | freee_tokens | 10 | organizations, clients | — | (RLSなし) |
| 23 | industries | 8 | — ※parent_id削除済み | — | SELECT(全員) |
| 24 | item_aliases | 5 | items | source: manual/ocr_learned/ai_suggested | item→org |
| 25 | items | 15 | organizations, clients, account_items, tax_categories | — | org_id or NULL |
| 26 | journal_entries | 30 | organizations, clients, documents, posting_periods, processing_rules, suppliers, users, exports | entry_type/status | org_id |
| 27 | journal_entry_approvals | 9 | journal_entries, users | approval_status | approver_id |
| 28 | journal_entry_lines | 15 | journal_entries, account_items, suppliers, items, departments, tax_categories | debit_credit: debit/credit | entry→org |
| 29 | notes | 9 | organizations, users | entity_type: journal_entry/document/client | org_id |
| 30 | notifications | 12 | organizations, users | type: 13種 | org_id + user_id |
| 31 | ocr_corrections | 8 | ocr_results, users | — | ocr→doc→org |
| 32 | ocr_results | 19 | documents | — | (RLSなし) |
| 33 | organizations | 18 | — | plan_type/status | org_id |
| 34 | payment_methods | 15 | organizations, clients, account_items | type: cash/bank/card/electronic/other | (RLSなし) |
| 35 | posting_periods | 11 | clients, client_fiscal_years, users | — | (RLSなし) |
| 36 | **processing_rules** | **20** | organizations, clients, industries, users, **processing_rules(self=derived_from)** | scope/rule_type | (RLSなし※service_role) |
| 37 | rule_execution_logs | 8 | processing_rules, documents, journal_entries | execution_result | (RLSなし) |
| 38 | supplier_aliases | 5 | suppliers | source: manual/ocr_learned/ai_suggested | (RLSなし) |
| 39 | suppliers | 21 | organizations, clients, account_items, tax_categories | — | org_id |
| 40 | tax_categories | 16 | tax_rates | type/direction | SELECT(全員) |
| 41 | tax_rates | 7 | — | — | (RLSなし) |
| 42 | user_activity_logs | 10 | users, organizations | — | (RLSなし) |
| 43 | users | 17 | organizations | role/qualification_type | (RLSなし) |
| 44 | workflows | 15 | organizations, clients, client_fiscal_years, users | status/current_step(1~8) | (RLSなし) |

---

## 主要テーブル詳細

### processing_rules（自動仕訳ルール）★今回の改修対象
| カラム | 型 | NULL | デフォルト | FK | 備考 |
|--------|-----|------|-----------|-----|------|
| id | uuid | NO | uuid_generate_v4() | PK | |
| organization_id | uuid | YES | | → organizations.id | |
| client_id | uuid | YES | | → clients.id | scope='client'時 |
| industry_id | uuid | YES | | → industries.id | scope='industry'時 |
| rule_name | varchar(255) | NO | | | |
| priority | integer | YES | 100 | | 小さいほど優先 |
| scope | varchar(20) | NO | | | CHECK: shared/industry/client |
| rule_type | varchar(20) | NO | | | CHECK: 支出/収入 |
| conditions | jsonb | NO | | | 16キー |
| actions | jsonb | NO | | | 9キー |
| is_active | boolean | YES | true | | |
| auto_apply | boolean | YES | true | | |
| require_confirmation | boolean | YES | false | | |
| match_count | integer | YES | 0 | | |
| last_matched_at | timestamptz | YES | | | |
| created_at | timestamptz | YES | now() | | |
| updated_at | timestamptz | YES | now() | | |
| created_by | uuid | YES | | → users.id | |
| updated_by | uuid | YES | | → users.id | |
| **derived_from_rule_id** | **uuid** | **YES** | | **→ processing_rules.id** | **★新規追加** |

### industries（業種マスタ）★N階層廃止後
| カラム | 型 | NULL | デフォルト | FK | 備考 |
|--------|-----|------|-----------|-----|------|
| id | uuid | NO | uuid_generate_v4() | PK | |
| code | varchar(50) | NO | | UQ | |
| name | varchar(100) | NO | | | |
| description | text | YES | | | |
| sort_order | integer | YES | 0 | | |
| is_active | boolean | YES | true | | |
| created_at | timestamptz | YES | now() | | |
| updated_at | timestamptz | YES | now() | | |

※ parent_id, level, path, path_ids は削除済み
※ industry_closure テーブルは削除済み

### clients（顧客）
| カラム | 型 | NULL | デフォルト | FK | 備考 |
|--------|-----|------|-----------|-----|------|
| id | uuid | NO | uuid_generate_v4() | PK | |
| organization_id | uuid | YES | | → organizations | |
| industry_id | uuid | YES | | → industries | |
| client_code | varchar(50) | YES | | UQ | |
| name | varchar(255) | NO | | | |
| tax_category | varchar(20) | YES | '原則課税' | | 原則課税/簡易課税/免税 |
| invoice_registered | boolean | YES | false | | |
| invoice_number | varchar(20) | YES | | | |
| annual_sales | bigint | YES | | | |
| status | varchar(20) | YES | 'active' | | active/inactive/suspended |
| (他29カラム省略) | | | | | |

### supplier_aliases（取引先別名）
| カラム | 型 | NULL | FK | 備考 |
|--------|-----|------|-----|------|
| id | uuid | NO | PK | |
| supplier_id | uuid | NO | → suppliers.id | UQ |
| **alias_name** | varchar(255) | NO | | **UQ** ※review.tsxの`alias`は誤り |
| source | varchar(20) | YES | | manual/ocr_learned/ai_suggested |
| created_at | timestamptz | YES | | |

---

## CHECK制約一覧

| テーブル | 制約名 | 許容値 |
|---------|--------|--------|
| account_categories | type_check | bs, pl, BS, PL |
| ai_suggestions | user_action_check | accepted, rejected, modified |
| approval_requests | request_type_check | rule_add, rule_modify, rule_delete, ratio_change |
| approval_requests | status_check | pending, approved, rejected, cancelled |
| approval_requests | trigger_source_check | journal_review, ai_suggestion, manual |
| client_account_ratios | business_ratio_check | 0 ≤ ratio ≤ 1 |
| clients | accounting_method_check | 発生主義, 現金主義 |
| clients | status_check | active, inactive, suspended |
| clients | tax_category_check | 原則課税, 簡易課税, 免税 |
| clients | tax_method_check | 原則課税, 簡易課税 |
| document_types | display_group_check | journal, non_journal |
| document_types | processing_pattern_check | daily_expense, billing_payment, statement_extract, payroll_process, sales_recording, archive_only |
| documents | ocr_status_check | pending, processing, completed, error, skipped |
| documents | status_check | uploaded, ocr_processing, ocr_completed, ai_processing, reviewed, approved, exported, excluded |
| export_entries | sync_status_check | synced, error, pending |
| exports | status_check | pending, processing, completed, error, cancelled |
| freee_connections | sync_status_check | active, expired, revoked, error |
| item_aliases | source_check | manual, ocr_learned, ai_suggested |
| journal_entries | entry_type_check | normal, adjusting, closing, opening, reversal |
| journal_entries | status_check | draft, reviewed, approved, posted, amended |
| journal_entry_approvals | approval_status_check | pending, approved, rejected |
| journal_entry_lines | debit_credit_check | debit, credit |
| notes | entity_type_check | journal_entry, document, client |
| notifications | type_check | upload, approval_needed, approved, rejected, exported, ocr_completed, ocr_error, system, journal_returned, rule_proposal_approved, rule_proposal_rejected, excluded_restored, unprocessed_alert |
| organizations | plan_type_check | free, basic, standard, premium, pro |
| organizations | status_check | active, inactive, suspended |
| payment_methods | type_check | cash, bank, card, electronic, other |
| processing_rules | rule_type_check | 支出, 収入 |
| processing_rules | scope_check | shared, industry, client |
| rule_execution_logs | execution_result_check | success, error, skipped |
| supplier_aliases | source_check | manual, ocr_learned, ai_suggested |
| tax_categories | direction_check | 売上, 仕入, その他 |
| tax_categories | type_check | 課税, 非課税, 不課税, 免税 |
| users | qualification_type_check | tax_accountant, certified_accountant, tax_office_experienced, bookkeeper, none |
| users | role_check | admin, manager, operator, viewer |
| workflows | current_step_check | 1 ≤ step ≤ 8 |
| workflows | status_check | in_progress, completed, cancelled |

---

## RLSポリシー概要

### グローバルマスタ（全ユーザーSELECT可能）
- `industries` — SELECT: true / INSERT/UPDATE/DELETE: admin, manager, operator
- `document_types` — SELECT: true / INSERT/UPDATE/DELETE: admin
- `tax_categories` — (RLSポリシーなし = service_role のみ)
- `tax_rates` — (RLSポリシーなし)
- `account_categories` — (RLSポリシーなし)

### 組織スコープ（organization_id = get_my_organization_id()）
- `organizations`, `clients`, `departments`, `documents`, `journal_entries`, `exports`, `notifications`, `notes`, `approval_requests`

### クライアントアクセス（can_access_client(client_id)）
- `client_contacts`, `client_fiscal_years`, `client_settings`, `actual_vs_budget`, `budget_entries`

### 中間テーブル（client→org サブクエリ）
- `client_industries`, `client_tax_category_settings`

### RLSポリシーなし（service_role のみ操作可能）
- `processing_rules`, `supplier_aliases`, `freee_connections`, `freee_tokens`, `export_entries`, `rule_execution_logs`, `ocr_results`, `payment_methods`, `posting_periods`, `user_activity_logs`, `users`, `workflows`
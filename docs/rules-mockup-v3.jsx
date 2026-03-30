import { useState } from "react";

// ============================================
// モックデータ（derived_from_rule_id 付き）
// ============================================
const MOCK_SHARED_RULES = [
  { id: "sr-1", rule_name: "ENEOS → 車両費", priority: 100, conditions: { supplier_pattern: "ENEOS" }, actions: { account_name: "車両費", tax_category: "課対仕入10%" }, match_count: 234, is_active: true },
  { id: "sr-2", rule_name: "Amazon → 消耗品費", priority: 100, conditions: { supplier_pattern: "Amazon" }, actions: { account_name: "消耗品費", tax_category: "課対仕入10%" }, match_count: 189, is_active: true },
  { id: "sr-3", rule_name: "ヤマト運輸 → 荷造運賃", priority: 100, conditions: { supplier_pattern: "ヤマト運輸" }, actions: { account_name: "荷造運賃", tax_category: "課対仕入10%" }, match_count: 156, is_active: true },
  { id: "sr-4", rule_name: "NTT → 通信費", priority: 100, conditions: { supplier_pattern: "NTT" }, actions: { account_name: "通信費", tax_category: "課対仕入10%" }, match_count: 120, is_active: true },
  { id: "sr-5", rule_name: "セブンイレブン → 雑費", priority: 100, conditions: { supplier_pattern: "セブンイレブン" }, actions: { account_name: "雑費", tax_category: "課対仕入10%" }, match_count: 98, is_active: true },
  { id: "sr-6", rule_name: "au → 通信費(按分60%)", priority: 100, conditions: { supplier_pattern: "au", payment_method: "bank_transfer" }, actions: { account_name: "通信費", tax_category: "課対仕入10%", business_ratio: 0.6 }, match_count: 67, is_active: true },
];

const MOCK_INDUSTRY_RULES = [
  { id: "ir-1", rule_name: "ENEOS → 燃料費", priority: 150, conditions: { supplier_pattern: "ENEOS" }, actions: { account_name: "燃料費", tax_category: "課対仕入10%" }, match_count: 87, is_active: true, derived_from_rule_id: "sr-1" },
  { id: "ir-2", rule_name: "ETC利用 → 旅費交通費", priority: 150, conditions: { document_type: "etc_statement" }, actions: { account_name: "旅費交通費", tax_category: "課対仕入10%" }, match_count: 65, is_active: true, derived_from_rule_id: null },
  { id: "ir-3", rule_name: "車検 → 車両費", priority: 150, conditions: { supplier_pattern: "車検" }, actions: { account_name: "車両費", tax_category: "課対仕入10%" }, match_count: 12, is_active: true, derived_from_rule_id: null },
  { id: "ir-4", rule_name: "自動車保険 → 損害保険料", priority: 150, conditions: { supplier_pattern: "保険", transaction_pattern: "自動車" }, actions: { account_name: "損害保険料", tax_category: "非課税" }, match_count: 8, is_active: true, derived_from_rule_id: null },
  { id: "ir-5", rule_name: "駐車場 → 地代家賃", priority: 150, conditions: { supplier_pattern: "駐車場" }, actions: { account_name: "地代家賃", tax_category: "課対仕入10%" }, match_count: 45, is_active: true, derived_from_rule_id: null },
];

const MOCK_INDUSTRIES = [
  { id: "ind-1", code: "DELIVERY", name: "配送ドライバー", description: "個人事業主の配送・運送業。軽貨物、宅配、フードデリバリー等を含む。車両関連経費、ガソリン代、高速代の計上が多い業種です。車両の減価償却や自動車保険、駐車場代など、車両に関連する経費科目の適切な振り分けが重要になります。", clientCount: 10, ruleCount: 5 },
  { id: "ind-2", code: "RESTAURANT", name: "飲食業", description: "レストラン、カフェ、居酒屋等の飲食店経営。仕入（食材）、光熱費、人件費が主な経費。軽減税率8%の仕入が多く、税区分の正確な判定が重要です。", clientCount: 5, ruleCount: 12 },
  { id: "ind-3", code: "IT_FREELANCE", name: "ITフリーランス", description: "ソフトウェア開発、Web制作、コンサルティング等のIT系個人事業主。通信費、クラウドサービス、外注費が主な経費。源泉徴収の処理が頻繁に発生します。", clientCount: 8, ruleCount: 6 },
  { id: "ind-4", code: "BEAUTY", name: "美容業", description: "美容室、ネイルサロン、エステサロン等。材料費、家賃、広告宣伝費が主な経費。", clientCount: 3, ruleCount: 4 },
  { id: "ind-5", code: "CONSTRUCTION", name: "建設業", description: "内装工事、リフォーム、設備工事等。外注費、材料費、車両費が多い。", clientCount: 4, ruleCount: 5 },
  { id: "ind-6", code: "RETAIL", name: "小売業", description: "実店舗・ECの物販。仕入高、荷造運賃、広告宣伝費が主な経費。", clientCount: 6, ruleCount: 3 },
];

const MOCK_CLIENTS = [
  { id: "cl-1", name: "田中太郎", tax_category: "免税", invoice_registered: false, annual_sales: 4500000, clientRuleCount: 2 },
  { id: "cl-2", name: "佐藤花子", tax_category: "簡易課税", invoice_registered: true, annual_sales: 8200000, clientRuleCount: 3 },
  { id: "cl-3", name: "鈴木一郎", tax_category: "免税", invoice_registered: false, annual_sales: 3800000, clientRuleCount: 0 },
  { id: "cl-4", name: "高橋和也", tax_category: "原則課税", invoice_registered: true, annual_sales: 12000000, clientRuleCount: 1 },
  { id: "cl-5", name: "山田美咲", tax_category: "免税", invoice_registered: false, annual_sales: 2900000, clientRuleCount: 0 },
  { id: "cl-6", name: "中村健二", tax_category: "免税", invoice_registered: false, annual_sales: 3200000, clientRuleCount: 0 },
  { id: "cl-7", name: "小林直人", tax_category: "簡易課税", invoice_registered: true, annual_sales: 7100000, clientRuleCount: 1 },
  { id: "cl-8", name: "加藤裕子", tax_category: "免税", invoice_registered: false, annual_sales: 4100000, clientRuleCount: 0 },
  { id: "cl-9", name: "渡辺大輔", tax_category: "免税", invoice_registered: false, annual_sales: 2600000, clientRuleCount: 0 },
  { id: "cl-10", name: "松本翔太", tax_category: "原則課税", invoice_registered: true, annual_sales: 15000000, clientRuleCount: 2 },
];

const MOCK_CLIENT_RULES = [
  { id: "cr-1", rule_name: "出光 → 燃料費（田中専用）", priority: 200, conditions: { supplier_pattern: "出光" }, actions: { account_name: "燃料費", tax_category: "課対仕入10%" }, match_count: 15, is_active: true, derived_from_rule_id: null },
  { id: "cr-2", rule_name: "自宅駐車場 → 地代家賃 80%", priority: 200, conditions: { supplier_pattern: "田中パーキング" }, actions: { account_name: "地代家賃", tax_category: "課対仕入10%", business_ratio: 0.8, business_ratio_note: "自宅兼事業所" }, match_count: 12, is_active: true, derived_from_rule_id: null },
];

// ============================================
// 派生ロジックヘルパー
// ============================================
function getDerivedSharedIds(industryRules) {
  const ids = new Set();
  for (const r of industryRules) {
    if (r.derived_from_rule_id) ids.add(r.derived_from_rule_id);
  }
  return ids;
}

function getParentRule(derivedFromId, sharedRules) {
  if (!derivedFromId) return null;
  return sharedRules.find((r) => r.id === derivedFromId) || null;
}

// ============================================
// メインアプリ
// ============================================
export default function RulesMockup() {
  const [page, setPage] = useState("shared");
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState("shared");

  const nav = (p, industry = null, client = null) => {
    setPage(p);
    if (industry !== null) setSelectedIndustry(industry);
    if (client !== null) setSelectedClient(client);
    if (p === "shared") setActiveMainTab("shared");
    if (p === "industryList") setActiveMainTab("industry");
  };

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: "#f3f4f6", minHeight: "100vh" }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 210, background: "#fff", borderRight: "1px solid #e5e7eb", padding: "18px 0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "0 14px", marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e40af", letterSpacing: -0.5 }}>Tax Copilot</div>
          </div>
          <nav style={{ fontSize: 13, flex: 1 }}>
            {[
              { label: "顧客一覧", icon: "👥", k: "clients" },
              { label: "仕訳ルール", icon: "📋", k: "rules", active: true },
              { label: "勘定科目", icon: "📊", k: "accounts" },
              { label: "税区分", icon: "🏷", k: "tax" },
              { label: "業種", icon: "🏢", k: "ind" },
              { label: "取引先", icon: "🏪", k: "sup" },
              { label: "品目", icon: "📦", k: "item" },
            ].map((it) => (
              <div key={it.k} onClick={() => it.active && nav("shared")} style={{
                padding: "8px 16px", color: it.active ? "#1d4ed8" : "#4b5563",
                background: it.active ? "#eff6ff" : "transparent", fontWeight: it.active ? 600 : 400,
                cursor: "pointer", borderRight: it.active ? "3px solid #2563eb" : "3px solid transparent",
                display: "flex", alignItems: "center", gap: 7, fontSize: 12.5,
              }}>
                <span style={{ fontSize: 14 }}>{it.icon}</span>{it.label}
              </div>
            ))}
          </nav>
        </aside>
        <main style={{ flex: 1, padding: "22px 28px", overflowY: "auto" }}>
          {page === "shared" && <SharedPage tab={activeMainTab} setTab={(t) => { setActiveMainTab(t); if (t === "industry") nav("industryList"); }} />}
          {page === "industryList" && <IndustryListPage nav={nav} tab={activeMainTab} setTab={(t) => { setActiveMainTab(t); if (t === "shared") nav("shared"); }} />}
          {page === "industryDetail" && <IndustryDetailPage ind={selectedIndustry} nav={nav} />}
          {page === "clientList" && <ClientListPage ind={selectedIndustry} nav={nav} />}
          {page === "clientDetail" && <ClientDetailPage cl={selectedClient} ind={selectedIndustry} nav={nav} />}
        </main>
      </div>
    </div>
  );
}

// ============================================
// 共通UI
// ============================================
function BC({ items }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#6b7280", marginBottom: 16 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {i > 0 && <span style={{ color: "#d1d5db", fontSize: 10 }}>›</span>}
          {it.onClick ? <span onClick={it.onClick} style={{ cursor: "pointer", color: "#2563eb", fontWeight: 500 }}>{it.label}</span> : <span style={{ color: "#111827", fontWeight: 600 }}>{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

function Tabs({ active, setActive }) {
  return (
    <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", marginBottom: 18 }}>
      {[{ k: "shared", l: "🌐 汎用ルール" }, { k: "industry", l: "🏢 業種別テンプレート" }].map((t) => (
        <button key={t.k} onClick={() => setActive(t.k)} style={{
          padding: "9px 22px", fontSize: 12.5, fontWeight: active === t.k ? 700 : 500,
          color: active === t.k ? "#1d4ed8" : "#6b7280", background: "none", border: "none",
          borderBottom: active === t.k ? "3px solid #2563eb" : "3px solid transparent",
          cursor: "pointer", marginBottom: -2,
        }}>{t.l}</button>
      ))}
    </div>
  );
}

const S = {
  shared: { bg: "#f9fafb", left: "#d1d5db", bbg: "#e5e7eb", bc: "#6b7280", l: "汎用" },
  industry: { bg: "#f0f7ff", left: "#60a5fa", bbg: "#dbeafe", bc: "#1d4ed8", l: "業種別" },
  client: { bg: "#fef7f7", left: "#f87171", bbg: "#fee2e2", bc: "#dc2626", l: "顧客別" },
};

function RuleRow({ rule, scope, expanded, onToggle, editable = true, onDelete, onCopy, parentRule }) {
  const s = S[scope];
  const rat = rule.actions?.business_ratio;
  const pct = rat != null ? Math.round(rat * 100) : null;
  const hasDerived = !!rule.derived_from_rule_id;

  return (
    <div style={{ marginBottom: 1 }}>
      <div onClick={editable ? onToggle : undefined} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
        background: s.bg, borderLeft: `4px solid ${s.left}`, borderRadius: expanded ? "5px 5px 0 0" : 5,
        cursor: editable ? "pointer" : "default", opacity: rule.is_active === false ? 0.4 : 1,
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: s.bbg, color: s.bc, flexShrink: 0, letterSpacing: 0.2 }}>{s.l}</span>
        <div style={{ minWidth: 110, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{rule.conditions?.supplier_pattern || rule.conditions?.document_type || rule.conditions?.transaction_pattern || "—"}</div>
          {rule.conditions?.transaction_pattern && rule.conditions?.supplier_pattern && <div style={{ fontSize: 10, color: "#9ca3af" }}>摘要: {rule.conditions.transaction_pattern}</div>}
          {(rule.conditions?.amount_min || rule.conditions?.amount_max) && <div style={{ fontSize: 10, color: "#9ca3af" }}>¥{rule.conditions?.amount_min?.toLocaleString() || "0"}〜¥{rule.conditions?.amount_max?.toLocaleString() || "∞"}</div>}
        </div>
        <span style={{ color: "#cbd5e1", fontSize: 13, flexShrink: 0 }}>→</span>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 75, flexShrink: 0 }}>{rule.actions?.account_name}</div>
        <div style={{ fontSize: 11, color: "#6b7280", minWidth: 75, flexShrink: 0 }}>{rule.actions?.tax_category || "—"}</div>
        {pct != null && pct < 100 && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 7, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", flexShrink: 0 }}>按分{pct}%</span>}

        {/* 派生元バッジ */}
        {hasDerived && parentRule && (
          <span style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 4, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 8, color: "#9ca3af" }}>↑</span> 派生: {parentRule.actions?.account_name}
          </span>
        )}

        <div style={{ marginLeft: "auto", fontSize: 10, color: "#b0b8c4", flexShrink: 0 }}>{rule.match_count > 0 && `${rule.match_count}回`}</div>
        {editable && <span style={{ color: "#b0b8c4", fontSize: 9, flexShrink: 0, transition: "transform 0.15s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>}
        {!editable && onCopy && (
          <button onClick={(e) => { e.stopPropagation(); onCopy(); }} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe", cursor: "pointer", flexShrink: 0 }}>派生ルール作成</button>
        )}
        {!editable && !onCopy && <span style={{ fontSize: 9.5, color: "#d1d5db", flexShrink: 0 }}>参照</span>}
      </div>

      {/* アコーディオン */}
      {expanded && (
        <div style={{ background: "#fff", border: `1px solid ${scope === "industry" ? "#bfdbfe" : scope === "client" ? "#fecaca" : "#e5e7eb"}`, borderTop: "none", borderRadius: "0 0 5px 5px", padding: "14px 18px" }}>
          {/* 派生元の汎用ルール表示 */}
          {hasDerived && parentRule && (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6b7280", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 12 }}>↑</span> 派生元の汎用ルール
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: "#e5e7eb", color: "#6b7280" }}>汎用</span>
                <span style={{ fontWeight: 600, color: "#6b7280" }}>{parentRule.conditions?.supplier_pattern || "—"}</span>
                <span style={{ color: "#d1d5db" }}>→</span>
                <span style={{ fontWeight: 600, color: "#6b7280", textDecoration: "line-through" }}>{parentRule.actions?.account_name}</span>
                <span style={{ color: "#9ca3af", fontSize: 11 }}>{parentRule.actions?.tax_category}</span>
                <span style={{ marginLeft: 8, fontSize: 10.5, color: "#2563eb", fontWeight: 600 }}>この業種では「{rule.actions?.account_name}」に変更</span>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#374151", marginBottom: 8, borderBottom: "1px solid #f3f4f6", paddingBottom: 4 }}>条件</div>
              <div style={{ display: "grid", gap: 7 }}>
                <F l="取引先パターン" v={rule.conditions?.supplier_pattern} p="取引先名（部分一致）" />
                <F l="摘要パターン（取引内容）" v={rule.conditions?.transaction_pattern} p="摘要キーワード" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <F l="金額下限" v={rule.conditions?.amount_min} p="0" t="number" />
                  <F l="金額上限" v={rule.conditions?.amount_max} p="∞" t="number" />
                </div>
                <F l="品目パターン" v={rule.conditions?.item_pattern} p="品目キーワード" />
                <F l="支払方法" v={rule.conditions?.payment_method} p="cash / credit_card / bank_transfer" />
                <F l="証憑種別" v={rule.conditions?.document_type} p="receipt / invoice / etc_statement" />
                <F l="但書きパターン" v={rule.conditions?.tategaki_pattern} p="〇〇代として" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#374151", marginBottom: 8, borderBottom: "1px solid #f3f4f6", paddingBottom: 4 }}>アクション</div>
              <div style={{ display: "grid", gap: 7 }}>
                <F l="勘定科目" v={rule.actions?.account_name} p="勘定科目を選択" />
                <F l="税区分" v={rule.actions?.tax_category} p="税区分を選択" />
                <F l="摘要テンプレート" v={rule.actions?.description_template} p="{supplier} ガソリン代" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <F l="家事按分率(%)" v={pct} p="100" t="number" />
                  <F l="按分根拠" v={rule.actions?.business_ratio_note} p="按分理由" />
                </div>
                <F l="優先度" v={rule.priority} t="number" />
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 14, justifyContent: "flex-end" }}>
                {onDelete && <button onClick={onDelete} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer" }}>削除</button>}
                <button style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ l, v, p, t = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 1.5 }}>{l}</label>
      <input type={t} defaultValue={v || ""} placeholder={p} style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
        onFocus={(e) => e.target.style.borderColor = "#60a5fa"} onBlur={(e) => e.target.style.borderColor = "#d1d5db"} />
    </div>
  );
}

function Toggle({ on, set, label }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
      <div onClick={() => set(!on)} style={{ width: 34, height: 18, borderRadius: 9, position: "relative", background: on ? "#2563eb" : "#d1d5db", cursor: "pointer", transition: "background 0.2s" }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: on ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: on ? "#1d4ed8" : "#6b7280" }}>{label}</span>
    </label>
  );
}

function Warn({ msg, onOk, onNo }) {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 5, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>{msg}</div>
        <div style={{ fontSize: 11, color: "#a16207", marginTop: 1 }}>汎用ルールで対応できる場合は、汎用ルールの使用を推奨します。</div>
      </div>
      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
        <button onClick={onNo} style={{ padding: "4px 10px", fontSize: 11, background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer" }}>やめる</button>
        <button onClick={onOk} style={{ padding: "4px 10px", fontSize: 11, background: "#f59e0b", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>それでも追加</button>
      </div>
    </div>
  );
}

// ============================================
// 画面1: 汎用ルール
// ============================================
function SharedPage({ tab, setTab }) {
  const [exp, setExp] = useState(new Set());
  const [q, setQ] = useState("");
  const toggle = (id) => setExp((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const list = MOCK_SHARED_RULES.filter((r) => !q.trim() || r.rule_name.toLowerCase().includes(q.toLowerCase()) || (r.conditions?.supplier_pattern || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <BC items={[{ label: "仕訳ルール管理" }]} />
      <h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: "0 0 3px" }}>仕訳ルール管理</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>仕訳自動生成のルールを管理します</p>
      <Tabs active={tab} setActive={setTab} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "#374151" }}><b style={{ fontSize: 17 }}>{MOCK_SHARED_RULES.length}</b> 件の汎用ルール</span>
          <div style={{ position: "relative" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ルールを検索..." style={{ padding: "6px 10px 6px 28px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5, width: 220, outline: "none" }} />
            <span style={{ position: "absolute", left: 8, top: 7, color: "#9ca3af", fontSize: 12 }}>🔍</span>
          </div>
        </div>
        <button style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: "#2563eb", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>＋ 新規汎用ルール</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {list.map((r) => <RuleRow key={r.id} rule={r} scope="shared" expanded={exp.has(r.id)} onToggle={() => toggle(r.id)} onDelete={() => alert(`削除: ${r.rule_name}`)} />)}
      </div>
      {list.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 12.5 }}>{q ? "検索結果なし" : "汎用ルールがありません"}</div>}
    </div>
  );
}

// ============================================
// 画面2: 業種一覧
// ============================================
function IndustryListPage({ nav, tab, setTab }) {
  const [q, setQ] = useState("");
  const list = [...MOCK_INDUSTRIES].sort((a, b) => b.ruleCount - a.ruleCount).filter((i) => !q.trim() || i.name.includes(q) || i.code.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <BC items={[{ label: "仕訳ルール管理" }]} />
      <h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: "0 0 3px" }}>仕訳ルール管理</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>業種を選択して、業種別テンプレートを管理します</p>
      <Tabs active={tab} setActive={setTab} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "#374151" }}><b style={{ fontSize: 17 }}>{MOCK_INDUSTRIES.length}</b> 業種</span>
          <div style={{ position: "relative" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="業種を検索..." style={{ padding: "6px 10px 6px 28px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5, width: 220, outline: "none" }} />
            <span style={{ position: "absolute", left: 8, top: 7, color: "#9ca3af", fontSize: 12 }}>🔍</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>業種名</th><th style={th}>コード</th><th style={th}>説明</th><th style={{ ...th, textAlign: "center" }}>ルール</th><th style={{ ...th, textAlign: "center" }}>顧客</th>
          </tr></thead>
          <tbody>{list.map((i) => (
            <tr key={i.id} onClick={() => nav("industryDetail", i)} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
              onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{i.name}</td>
              <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>{i.code}</td>
              <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11.5, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.description?.slice(0, 45)}...</td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: "#dbeafe", color: "#1d4ed8" }}>{i.ruleCount}</span></td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: "#d1fae5", color: "#059669" }}>{i.clientCount}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11.5 };

// ============================================
// 画面3: 業種詳細（★派生ルール対応）
// ============================================
function IndustryDetailPage({ ind, nav }) {
  const [exp, setExp] = useState(new Set());
  const [showShared, setShowShared] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [derivingRule, setDerivingRule] = useState(null); // 派生作成中の汎用ルール

  const toggle = (id) => setExp((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (!ind) return null;

  // 派生元IDの集合
  const derivedIds = getDerivedSharedIds(MOCK_INDUSTRY_RULES);
  // 汎用ルールから派生済みを除外
  const filteredShared = MOCK_SHARED_RULES.filter((r) => !derivedIds.has(r.id));
  const hiddenCount = MOCK_SHARED_RULES.length - filteredShared.length;

  return (
    <div>
      <BC items={[{ label: "仕訳ルール管理", onClick: () => nav("industryList") }, { label: ind.name }]} />

      {/* 業種説明 */}
      <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", padding: "18px 22px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>{ind.name}</h1>
            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{ind.code}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ background: "#dbeafe", color: "#1d4ed8", padding: "3px 10px", borderRadius: 5, fontSize: 11.5, fontWeight: 700 }}>📋 {MOCK_INDUSTRY_RULES.length} ルール</span>
            <span style={{ background: "#d1fae5", color: "#059669", padding: "3px 10px", borderRadius: 5, fontSize: 11.5, fontWeight: 700 }}>👤 {ind.clientCount} 顧客</span>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "#4b5563", lineHeight: 1.7, margin: 0 }}>{ind.description}</p>
      </div>

      {/* 顧客一覧リンク */}
      <div onClick={() => nav("clientList", ind)} style={{
        background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", padding: "12px 22px", marginBottom: 18,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
      }} onMouseOver={(e) => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.background = "#f8fafc"; }}
         onMouseOut={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fff"; }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>👤</span>
          <div><div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>顧客一覧へ</div><div style={{ fontSize: 11.5, color: "#6b7280" }}>{ind.clientCount}名の顧客と顧客別ルールを管理</div></div>
        </div>
        <span style={{ fontSize: 16, color: "#9ca3af" }}>→</span>
      </div>

      {/* 業種別ルール */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 700, color: "#111827", margin: 0 }}>業種別ルール</h2>
            <Toggle on={showShared} set={setShowShared} label={`汎用ルールも表示（${filteredShared.length}件）`} />
            {showShared && hiddenCount > 0 && (
              <span style={{ fontSize: 10.5, color: "#9ca3af", fontStyle: "italic" }}>※ 派生済み{hiddenCount}件は非表示</span>
            )}
          </div>
          <button onClick={() => setShowWarn(true)} style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, background: "#2563eb", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>＋ 業種ルール追加</button>
        </div>

        {showWarn && <Warn msg='既存の汎用ルールと同じ取引先パターンです。業種別ルールとして採用しますか？' onOk={() => setShowWarn(false)} onNo={() => setShowWarn(false)} />}

        {/* 派生作成プレビュー */}
        {derivingRule && (
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 6, padding: "14px 18px", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#1d4ed8", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              ✨ 汎用ルール「{derivingRule.rule_name}」から業種ルールを派生
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>条件（汎用から引き継ぎ）</div>
                <div style={{ fontSize: 12, color: "#374151", background: "#fff", padding: "8px 10px", borderRadius: 4, border: "1px solid #dbeafe" }}>
                  取引先: <b>{derivingRule.conditions?.supplier_pattern || "—"}</b>
                  {derivingRule.conditions?.amount_min && <span> / ¥{derivingRule.conditions.amount_min.toLocaleString()}〜</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>アクション（ここを変更）</div>
                <div style={{ display: "grid", gap: 6 }}>
                  <F l="勘定科目" v="" p={`元: ${derivingRule.actions?.account_name} → 新しい科目を入力`} />
                  <F l="税区分" v={derivingRule.actions?.tax_category} p="税区分を選択" />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDerivingRule(null)} style={{ padding: "5px 12px", fontSize: 11, background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer" }}>キャンセル</button>
              <button onClick={() => { alert(`「${derivingRule.conditions?.supplier_pattern}」の業種ルールを作成しました（derived_from_rule_id = ${derivingRule.id}）`); setDerivingRule(null); }}
                style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>派生ルールとして保存</button>
            </div>
          </div>
        )}

        {/* ルール一覧 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {MOCK_INDUSTRY_RULES.map((r) => (
            <RuleRow key={r.id} rule={r} scope="industry" expanded={exp.has(r.id)} onToggle={() => toggle(r.id)}
              onDelete={() => alert(`削除: ${r.rule_name}`)}
              parentRule={getParentRule(r.derived_from_rule_id, MOCK_SHARED_RULES)} />
          ))}
          {showShared && filteredShared.map((r) => (
            <RuleRow key={`s-${r.id}`} rule={r} scope="shared" expanded={false} onToggle={() => {}} editable={false}
              onCopy={() => setDerivingRule(r)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 画面4: 顧客一覧
// ============================================
function ClientListPage({ ind, nav }) {
  const [q, setQ] = useState("");
  if (!ind) return null;
  const list = MOCK_CLIENTS.filter((c) => !q.trim() || c.name.includes(q));

  return (
    <div>
      <BC items={[{ label: "仕訳ルール管理", onClick: () => nav("industryList") }, { label: ind.name, onClick: () => nav("industryDetail", ind) }, { label: "顧客一覧" }]} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div><h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: "0 0 2px" }}>{ind.name} — 顧客一覧</h1><p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>{list.length}名の顧客</p></div>
        <div style={{ position: "relative" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="顧客名で検索..." style={{ padding: "6px 10px 6px 28px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5, width: 200, outline: "none" }} />
          <span style={{ position: "absolute", left: 8, top: 7, color: "#9ca3af", fontSize: 12 }}>🔍</span>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <th style={th}>顧客名</th><th style={th}>課税区分</th><th style={th}>インボイス</th><th style={{ ...th, textAlign: "right" }}>年間売上</th><th style={{ ...th, textAlign: "center" }}>個別ルール</th>
          </tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id} onClick={() => nav("clientDetail", ind, c)} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
              onMouseOver={(e) => e.currentTarget.style.background = "#f8fafc"} onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{c.name}</td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                  background: c.tax_category === "原則課税" ? "#dbeafe" : c.tax_category === "簡易課税" ? "#fef3c7" : "#f3f4f6",
                  color: c.tax_category === "原則課税" ? "#1d4ed8" : c.tax_category === "簡易課税" ? "#92400e" : "#6b7280" }}>{c.tax_category}</span>
              </td>
              <td style={{ padding: "10px 12px" }}>{c.invoice_registered ? <span style={{ color: "#059669", fontWeight: 600, fontSize: 12 }}>✓ 登録済</span> : <span style={{ color: "#9ca3af", fontSize: 12 }}>未登録</span>}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>¥{c.annual_sales?.toLocaleString()}</td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                {c.clientRuleCount > 0 ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: "#fee2e2", color: "#dc2626" }}>{c.clientRuleCount}件</span> : <span style={{ fontSize: 10.5, color: "#d1d5db" }}>—</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// 画面5: 顧客詳細
// ============================================
function ClientDetailPage({ cl, ind, nav }) {
  const [exp, setExp] = useState(new Set());
  const [showInh, setShowInh] = useState(false);
  const [derivingRule, setDerivingRule] = useState(null);
  const [derivingScope, setDerivingScope] = useState(null); // "industry" or "shared"
  const toggle = (id) => setExp((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (!cl || !ind) return null;

  const derivedIds = getDerivedSharedIds(MOCK_INDUSTRY_RULES);
  const filteredShared = MOCK_SHARED_RULES.filter((r) => !derivedIds.has(r.id));

  const startDeriving = (rule, scope) => { setDerivingRule(rule); setDerivingScope(scope); };

  const scopeLabel = derivingScope === "industry" ? "業種別" : "汎用";
  const scopeColor = derivingScope === "industry" ? "#1d4ed8" : "#6b7280";

  return (
    <div>
      <BC items={[
        { label: "仕訳ルール管理", onClick: () => nav("industryList") },
        { label: ind.name, onClick: () => nav("industryDetail", ind) },
        { label: "顧客一覧", onClick: () => nav("clientList", ind) },
        { label: cl.name },
      ]} />

      <div style={{ background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb", padding: "18px 22px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div><h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>{cl.name}</h1><span style={{ fontSize: 11.5, color: "#9ca3af" }}>業種: {ind.name}</span></div>
          <span style={{ background: "#fee2e2", color: "#dc2626", padding: "3px 10px", borderRadius: 5, fontSize: 11.5, fontWeight: 700 }}>📋 {MOCK_CLIENT_RULES.length} 顧客別ルール</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { l: "課税区分", v: cl.tax_category },
            { l: "インボイス", v: cl.invoice_registered ? "登録済" : "未登録", c: cl.invoice_registered ? "#059669" : "#9ca3af" },
            { l: "年間売上", v: `¥${cl.annual_sales?.toLocaleString()}` },
            { l: "適用ルール合計", v: `${filteredShared.length + MOCK_INDUSTRY_RULES.length + MOCK_CLIENT_RULES.length}件`, sub: `汎用${filteredShared.length} + 業種${MOCK_INDUSTRY_RULES.length} + 個別${MOCK_CLIENT_RULES.length}` },
          ].map((it, i) => (
            <div key={i}><div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", marginBottom: 1.5 }}>{it.l}</div><div style={{ fontSize: 13, fontWeight: 600, color: it.c || "#111827" }}>{it.v}</div>{it.sub && <div style={{ fontSize: 10, color: "#9ca3af" }}>{it.sub}</div>}</div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 700, color: "#111827", margin: 0 }}>顧客別ルール</h2>
            <Toggle on={showInh} set={setShowInh} label={`継承ルールも表示（業種${MOCK_INDUSTRY_RULES.length} + 汎用${filteredShared.length}件）`} />
          </div>
          <button style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 700, background: "#dc2626", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>＋ 顧客ルール追加</button>
        </div>

        {/* 派生作成パネル */}
        {derivingRule && (
          <div style={{ background: "#fef7f7", border: "1px solid #fca5a5", borderRadius: 6, padding: "14px 18px", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#dc2626", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              ✨ {scopeLabel}ルール「{derivingRule.rule_name}」から顧客別ルールを派生
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>条件（{scopeLabel}ルールから引き継ぎ）</div>
                <div style={{ fontSize: 12, color: "#374151", background: "#fff", padding: "8px 10px", borderRadius: 4, border: "1px solid #fecaca" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: derivingScope === "industry" ? "#dbeafe" : "#e5e7eb", color: scopeColor }}>{scopeLabel}</span>
                    <span style={{ fontWeight: 600 }}>{derivingRule.conditions?.supplier_pattern || derivingRule.conditions?.document_type || "—"}</span>
                    <span style={{ color: "#d1d5db" }}>→</span>
                    <span style={{ fontWeight: 600, color: "#6b7280" }}>{derivingRule.actions?.account_name}</span>
                  </div>
                  {derivingRule.conditions?.transaction_pattern && <div style={{ fontSize: 11, color: "#9ca3af" }}>摘要: {derivingRule.conditions.transaction_pattern}</div>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>アクション（この顧客用に変更）</div>
                <div style={{ display: "grid", gap: 6 }}>
                  <F l="勘定科目" v="" p={`元: ${derivingRule.actions?.account_name} → 新しい科目を入力`} />
                  <F l="税区分" v={derivingRule.actions?.tax_category} p="税区分を選択" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <F l="家事按分率(%)" v={derivingRule.actions?.business_ratio ? Math.round(derivingRule.actions.business_ratio * 100) : ""} p="100" t="number" />
                    <F l="按分根拠" v="" p="按分理由" />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDerivingRule(null)} style={{ padding: "5px 12px", fontSize: 11, background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer" }}>キャンセル</button>
              <button onClick={() => { alert(`「${derivingRule.conditions?.supplier_pattern || derivingRule.conditions?.document_type}」の顧客別ルールを作成しました\n派生元: ${scopeLabel}「${derivingRule.rule_name}」\nderived_from_rule_id = ${derivingRule.id}`); setDerivingRule(null); }}
                style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, background: "#dc2626", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>顧客別ルールとして保存</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {MOCK_CLIENT_RULES.map((r) => <RuleRow key={r.id} rule={r} scope="client" expanded={exp.has(r.id)} onToggle={() => toggle(r.id)} onDelete={() => alert(`削除: ${r.rule_name}`)} />)}
          {MOCK_CLIENT_RULES.length === 0 && !showInh && (
            <div style={{ background: "#fef7f7", borderRadius: 5, border: "1px dashed #fecaca", padding: "32px 0", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, color: "#9ca3af" }}>個別ルールなし — 汎用・業種別ルールが適用されます</div>
            </div>
          )}
          {showInh && (
            <>
              {MOCK_INDUSTRY_RULES.map((r) => (
                <RuleRow key={`i-${r.id}`} rule={r} scope="industry" expanded={false} onToggle={() => {}} editable={false}
                  parentRule={getParentRule(r.derived_from_rule_id, MOCK_SHARED_RULES)}
                  onCopy={() => startDeriving(r, "industry")} />
              ))}
              {filteredShared.map((r) => (
                <RuleRow key={`s-${r.id}`} rule={r} scope="shared" expanded={false} onToggle={() => {}} editable={false}
                  onCopy={() => startDeriving(r, "shared")} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
// 通知作成サービス

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

export async function createNotification(params: {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  linkUrl?: string;
}) {
  try {
    await supabaseAdmin.from('notifications').insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      link_url: params.linkUrl || null,
    });
  } catch (e: any) {
    console.error('[通知] 作成エラー:', e.message);
  }
}

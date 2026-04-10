// 後方互換ラッパー — 実体は domain/ と shared/utils/ に分散済み
// 各ルートファイルが直接 import に移行したらこのファイルを削除する

export { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';

export { isValidUUID, sanitizeBody, isValidStoragePath, safeErrorMessage } from '../../shared/utils/request-helpers.js';

export {
  verifyClientOwnership,
  verifyDocumentOwnership,
  verifyJournalEntryOwnership,
  verifyWorkflowOwnership,
} from '../../domain/auth/authorization.service.js';

export { createNotification } from '../../domain/notification/notification.service.js';

export {
  getOrganizationId,
  fetchAccountItems,
  fetchTaxCategories,
  findFallbackAccountId,
} from '../../domain/master/master-data.service.js';

/**
 * @module アプリケーションエラー
 * @description 構造化エラークラス。HTTP ステータスコードとメッセージを保持する。
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'リソースが見つかりません') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'アクセス権がありません') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '認証が必要です') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

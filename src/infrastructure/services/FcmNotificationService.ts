import admin from 'firebase-admin';
import fs from 'fs';
import { env } from '../../config/env';
import { dbQuery } from '../database/pgPool';

export class FcmNotificationService {
  private isInitialized = false;

  constructor() {
    if (
      env.FIREBASE_ENABLED &&
      env.FIREBASE_SERVICE_ACCOUNT_PATH &&
      fs.existsSync(env.FIREBASE_SERVICE_ACCOUNT_PATH)
    ) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf-8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.isInitialized = true;
    }
  }

  async sendToSchoolBk(params: {
    schoolId: string;
    violationId?: string;
    cycleId?: string;
    recipientInstitution?: 'POLRI' | 'SCHOOL_BK';
    policeAccountId?: string;
    bkAccountId?: string;
    fcmTokens: string[];
    title: string;
    body: string;
    dataPayload: Record<string, string>;
  }): Promise<void> {
    const validTokens = params.fcmTokens.filter(Boolean);
    const destination = validTokens.join(',') || 'NO_FCM_TOKEN';
    const institution = params.recipientInstitution ?? 'SCHOOL_BK';

    if (!this.isInitialized || validTokens.length === 0) {
      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'FCM', $7, $8, $9, $10, 'SKIPPED', $11)`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          destination.slice(0, 180),
          destination,
          params.title,
          params.body,
          'Firebase disabled in dev or BK token empty',
        ]
      );
      return;
    }

    try {
      const payloadData: Record<string, string> = {
        ...params.dataPayload,
        title: params.title,
        body: params.body,
      };

      const response = await admin.messaging().sendEachForMulticast({
        tokens: validTokens,
        data: payloadData,
        android: {
          priority: 'high',
        },
      });

      const isMissedResend = params.dataPayload?.missedNotification === 'true';
      const providerResp = isMissedResend
        ? `RESENT_COPY: Success: ${response.successCount}, Failure: ${response.failureCount}`
        : `Success: ${response.successCount}, Failure: ${response.failureCount}`;

      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'FCM', $7, $8, $9, $10, 'SENT', $11)`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          destination.slice(0, 180),
          `Tokens(${validTokens.length})`,
          params.title,
          params.body,
          providerResp,
        ]
      );
    } catch (err: any) {
      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'FCM', $7, $8, $9, $10, 'FAILED', $11)`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          destination.slice(0, 180),
          destination,
          params.title,
          params.body,
          err?.message ?? 'Unknown FCM error',
        ]
      );
    }
  }
}

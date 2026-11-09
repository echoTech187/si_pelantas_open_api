import axios from 'axios';
import { env } from '../../config/env';
import { dbQuery } from '../database/pgPool';

export class WablasWhatsappService {
  async sendWhatsappAlert(params: {
    schoolId: string;
    violationId?: string;
    cycleId?: string;
    recipientInstitution?: 'POLRI' | 'SCHOOL_BK';
    policeAccountId?: string;
    bkAccountId?: string;
    phoneWa: string;
    title: string;
    message: string;
  }): Promise<void> {
    const institution = params.recipientInstitution ?? 'SCHOOL_BK';

    if (!env.WABLAS_ENABLED || !env.WABLAS_API_TOKEN) {
      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'WABLAS', $7, $8, $9, $10, 'SKIPPED', 'Wablas disabled or token not configured')`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          params.phoneWa,
          params.phoneWa,
          params.title,
          params.message,
        ]
      );
      return;
    }

    try {
      const authHeader = env.WABLAS_SECRET_KEY
        ? `${env.WABLAS_API_TOKEN}.${env.WABLAS_SECRET_KEY}`
        : env.WABLAS_API_TOKEN;

      const res = await axios.post(
        env.WABLAS_API_URL,
        {
          data: [
            {
              phone: params.phoneWa,
              message: params.message,
              isGroup: 'false',
            },
          ],
        },
        {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          timeout: 8000,
        }
      );

      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'WABLAS', $7, $8, $9, $10, 'SENT', $11)`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          params.phoneWa,
          params.phoneWa,
          params.title,
          params.message,
          JSON.stringify(res.data),
        ]
      );
    } catch (err: any) {
      await dbQuery(
        `INSERT INTO notification_logs (
           school_id, cycle_id, violation_id, recipient_institution,
           police_account_id, bk_account_id, channel, destination_target,
           recipient_target, title, message_body, delivery_status, provider_response
         ) VALUES ($1, $2, $3, $4, $5, $6, 'WABLAS', $7, $8, $9, $10, 'FAILED', $11)`,
        [
          params.schoolId,
          params.cycleId ?? null,
          params.violationId ?? null,
          institution,
          params.policeAccountId ?? null,
          params.bkAccountId ?? null,
          params.phoneWa,
          params.phoneWa,
          params.title,
          params.message,
          err?.message ?? 'Wablas request error',
        ]
      );
    }
  }
}

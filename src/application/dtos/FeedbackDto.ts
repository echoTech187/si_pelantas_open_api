import { z } from 'zod';

export const CreateBkFeedbackDtoSchema = z.object({
  inspectionLogId: z.string().uuid('ID Log Sidak/Kunjungan wajib valid UUID'),
  ratingStars: z.number().int().min(1, 'Rating minimal 1 bintang').max(5, 'Rating maksimal 5 bintang'),
  clarityRating: z.number().int().min(1).max(5).optional(),
  helpfulnessRating: z.number().int().min(1).max(5).optional(),
  attitudeRating: z.number().int().min(1).max(5).optional(),
  feedbackNotes: z.string().min(3, 'Catatan feedback minimal 3 karakter').max(2000),
});

export type CreateBkFeedbackDto = z.infer<typeof CreateBkFeedbackDtoSchema>;


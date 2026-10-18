import { Router } from 'express';
import type { RemindersRepository } from '../repositories/remindersRepository.js';
import { remindersQuerySchema } from '../validation.js';

/** GET /api/reminders/due?date=YYYY-MM-DD — open tasks of all projects due on that day or earlier (desktop reminders). */
export function remindersRouter(reminders: RemindersRepository): Router {
  const router = Router();

  router.get('/due', (req, res) => {
    const { date } = remindersQuerySchema.parse(req.query);
    res.json(reminders.due(date));
  });

  return router;
}

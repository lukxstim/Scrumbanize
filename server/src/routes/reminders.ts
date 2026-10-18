import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import type { RemindersRepository } from '../repositories/remindersRepository.js';
import { remindersQuerySchema } from '../validation.js';

/** GET /api/reminders/due?date=YYYY-MM-DD — open tasks of the user's projects due on that day or earlier (desktop reminders). */
export function remindersRouter(reminders: RemindersRepository, access: Access): Router {
  const router = Router();

  router.get('/due', (req, res) => {
    const { date } = remindersQuerySchema.parse(req.query);
    const mine = access.projectIds(userOf(res)!);
    res.json(reminders.due(date).filter((task) => mine.has(task.projectId)));
  });

  return router;
}

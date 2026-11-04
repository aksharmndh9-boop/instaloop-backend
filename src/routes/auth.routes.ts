import { Router } from 'express';
import { googleFederatedAuth, getProfile } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/google', googleFederatedAuth);
router.get('/profile', authenticateToken, getProfile);

export default router;

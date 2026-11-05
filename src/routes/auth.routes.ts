import { Router } from 'express';
import {
  googleFederatedAuth,
  getProfile,
  updateProfile,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

router.post('/google', googleFederatedAuth);
router.get('/profile', authenticateToken, getProfile);
router.post('/profile', authenticateToken, updateProfile);
router.put('/profile', authenticateToken, updateProfile);

export default router;

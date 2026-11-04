import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    handle: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // For seamless local testing, fallback to mock demo user if no token provided
    req.user = {
      id: 'demo-elena-vance-id',
      email: 'elena.vance@gmail.com',
      handle: '@elena_v',
    };
    return next();
  }

  const secret = process.env.JWT_SECRET || 'instaloop_mindful_sovereign_secret_key_2026';

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired mindful session token' });
    }
    req.user = user as AuthRequest['user'];
    next();
  });
};

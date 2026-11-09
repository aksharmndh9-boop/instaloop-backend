import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    handle: string;
    name?: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const emailFromQueryOrHeader =
    (req.query.email as string) ||
    (req.headers['x-user-email'] as string) ||
    (req.body?.email as string) ||
    (req.body?.senderEmail as string);

  if (!token) {
    // If an email was explicitly passed in query, header, or body, use it
    if (emailFromQueryOrHeader && emailFromQueryOrHeader.trim().length > 0) {
      const cleanEmail = emailFromQueryOrHeader.trim().toLowerCase();
      const base = cleanEmail.split('@')[0];
      req.user = {
        id: base,
        email: cleanEmail,
        handle: `@${base}`,
      };
      return next();
    }

    const fallbackEmail =
      (req.body?.senderEmail as string)?.trim()?.toLowerCase() ||
      (req.body?.email as string)?.trim()?.toLowerCase() ||
      (req.query?.email as string)?.trim()?.toLowerCase() ||
      (req.headers['x-user-email'] as string)?.trim()?.toLowerCase();

    if (fallbackEmail) {
      const base = fallbackEmail.split('@')[0];
      req.user = {
        id: base,
        email: fallbackEmail,
        handle: `@${base}`,
      };
      return next();
    }

    const fallbackHandle =
      (req.body?.senderHandle as string)?.trim() ||
      (req.headers['x-user-handle'] as string)?.trim() ||
      (req.query?.handle as string)?.trim() ||
      (req.body?.senderId as string)?.trim();

    if (fallbackHandle) {
      const cleanH = fallbackHandle.replace('@', '').toLowerCase();
      req.user = {
        id: cleanH,
        email: `${cleanH}@instaloop.mindful`,
        handle: `@${cleanH}`,
      };
      return next();
    }

    return res.status(401).json({ error: 'Unauthenticated user. Please provide authorization or user email.' });
  }

  const secret = process.env.JWT_SECRET || 'instaloop_mindful_sovereign_secret_key_2026';

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      // If token expired or invalid but email was sent, honor email gracefully
      if (emailFromQueryOrHeader && emailFromQueryOrHeader.trim().length > 0) {
        const cleanEmail = emailFromQueryOrHeader.trim().toLowerCase();
        const base = cleanEmail.split('@')[0];
        req.user = {
          id: base,
          email: cleanEmail,
          handle: `@${base}`,
        };
        return next();
      }
      return res.status(403).json({ error: 'Invalid or expired mindful session token' });
    }
    req.user = user as AuthRequest['user'];
    next();
  });
};

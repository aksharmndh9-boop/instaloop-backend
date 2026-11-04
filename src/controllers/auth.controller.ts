import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'instaloop_mindful_sovereign_secret_key_2026';

export const googleFederatedAuth = async (req: Request, res: Response) => {
  try {
    const { email, name, avatarUrl } = req.body;

    const userEmail = email || 'elena.vance@gmail.com';
    const userName = name || 'Elena Vance';
    const userHandle = `@${userEmail.split('@')[0]}`;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userName,
          handle: userHandle,
          avatarUrl: avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCmvTvw2vUiNi2t66ONaWIluHLI9OBm4euIQS92BMXtTJsfDOJvur_Mpba2Cc6f2EHULwiVe43Uel0hRAFmMYj68Pa8g2PpXfgJNzAh4l28Mm4PNy4Y-UuDKEH4_yKjVkF9XM-zix8Z-VbIn5qjNQVW7_xxgvBqTz-en8iQoe8g4iCUsUjz6jsgWhkcfCe2NsA9cY2xTcN6HhvG08UJD4AvnBJA3tOIvgLHbwS4CoBIYejaOUVpiBPD',
          streakDays: 19,
          reclaimedToday: 760,
          loopsBrokenToday: 14,
        },
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, handle: user.handle },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      message: 'Mindful sovereign authentication successful',
      token,
      user,
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Federated authentication failed' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Fallback Elena Vance profile for mock demo
      return res.json({
        id: 'demo-elena-vance-id',
        name: 'Elena Vance',
        handle: '@elena_v',
        email: 'elena.vance@gmail.com',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCmvTvw2vUiNi2t66ONaWIluHLI9OBm4euIQS92BMXtTJsfDOJvur_Mpba2Cc6f2EHULwiVe43Uel0hRAFmMYj68Pa8g2PpXfgJNzAh4l28Mm4PNy4Y-UuDKEH4_yKjVkF9XM-zix8Z-VbIn5qjNQVW7_xxgvBqTz-en8iQoe8g4iCUsUjz6jsgWhkcfCe2NsA9cY2xTcN6HhvG08UJD4AvnBJA3tOIvgLHbwS4CoBIYejaOUVpiBPD',
        streakDays: 19,
        reclaimedToday: 760,
        loopsBrokenToday: 14,
      });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
};

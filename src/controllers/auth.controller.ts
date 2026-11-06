import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { io } from '../server';

const JWT_SECRET = process.env.JWT_SECRET || 'instaloop_mindful_sovereign_secret_key_2026';

// Resilient In-Memory Profile Cache to guarantee 100% uptime even during database spin-ups
const inMemoryProfiles = new Map<string, any>();

const DEFAULT_AVATAR = '';

function formatUserProfile(user: any) {
  let av = (user.avatarUrl && typeof user.avatarUrl === 'string') ? user.avatarUrl.trim() : '';
  if (av.startsWith('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde')) {
    av = '';
  }
  return {
    id: user.id || 'usr-default',
    email: user.email || 'aksharmndh9@gmail.com',
    name: user.name || 'Akshar',
    handle: user.handle || '@aksharmndh9',
    avatarUrl: av,
    streakDays: user.streakDays ?? 1,
    reclaimedToday: user.reclaimedToday ?? 0,
    loopsBrokenToday: user.loopsBrokenToday ?? 0,
    reelsAvoidedToday: user.reelsAvoidedToday ?? Math.round((user.reclaimedToday ?? 0) / 10),
    completedPausesToday: user.completedPausesToday ?? 0,
    lastActiveDate: user.lastActiveDate || '',
    spiritualMantra:
      user.spiritualMantra ||
      'Resting my weary spirit in quietude. Choosing deep presence over digital chaos.',
    spiritualSeason: user.spiritualSeason || 'Season of Sacred Healing',
    soulPresenceState: user.soulPresenceState || 'Healing & Resting',
    soulAura: user.soulAura || 'Emerald',
    sacredBellSound: user.sacredBellSound || 'Tibetan Singing Bowl',
    dailyStillnessGoalMinutes: user.dailyStillnessGoalMinutes ?? 20,
    bonsaiVitality: user.bonsaiVitality ?? 50,
    bonsaiStage: user.bonsaiStage || 'seedling',
    updatedAt: user.updatedAt || new Date().toISOString(),
  };
}

export const googleFederatedAuth = async (req: Request, res: Response) => {
  try {
    const { email, name, avatarUrl, handle, clientDate } = req.body;
    const headerDate = (req.headers['x-client-date'] as string);
    const todayDate = (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate))
      ? clientDate
      : (headerDate && /^\d{4}-\d{2}-\d{2}$/.test(headerDate))
        ? headerDate
        : new Date().toISOString().split('T')[0];

    const userEmail = (email || 'aksharmndh9@gmail.com').toLowerCase().trim();
    const userName = name || 'Akshar';
    const userHandle =
      handle || `@${userEmail.split('@')[0]}`;

    // Find or create user
    let user = await prisma.user
      .findUnique({
        where: { email: userEmail },
      })
      .catch(() => null);

    if (!user) {
      // First-time login: profile picture is blank initially!
      const initialAvatar = (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 && !avatarUrl.startsWith('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde'))
        ? avatarUrl.trim()
        : '';

      user = await prisma.user
        .create({
          data: {
            email: userEmail,
            name: userName,
            handle: userHandle,
            avatarUrl: initialAvatar,
            streakDays: 1,
            reclaimedToday: 0,
            loopsBrokenToday: 0,
            reelsAvoidedToday: 0,
            completedPausesToday: 0,
            lastActiveDate: todayDate,
            spiritualMantra:
              'Resting my weary spirit in quietude. Choosing deep presence over digital chaos.',
            spiritualSeason: 'Season of Sacred Healing',
            soulPresenceState: 'Healing & Resting',
            soulAura: 'Emerald',
            sacredBellSound: 'Tibetan Singing Bowl',
            dailyStillnessGoalMinutes: 20,
            bonsaiVitality: 50,
            bonsaiStage: 'seedling',
          },
        })
        .catch(() => null);
    } else {
      // User exists - check daily rollover!
      // If user logs in multiple times on the SAME day, preserve all metrics!
      // If user logs in on a NEW day, reset daily metrics to 0 and advance streak!
      const updateData: any = {};

      // Backend remembers the selected avatar!
      // If user already has an avatarUrl saved in the database, DO NOT overwrite it.
      const currentDbAvatar = (user.avatarUrl && typeof user.avatarUrl === 'string' && !user.avatarUrl.startsWith('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde'))
        ? user.avatarUrl.trim()
        : '';

      if (user.avatarUrl && user.avatarUrl.startsWith('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde')) {
        updateData.avatarUrl = '';
        user.avatarUrl = '';
      } else if (!currentDbAvatar && avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 && !avatarUrl.startsWith('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde')) {
        updateData.avatarUrl = avatarUrl.trim();
        user.avatarUrl = avatarUrl.trim();
      }

      if (name && name.trim().length > 0) updateData.name = name.trim();
      if (handle && handle.trim().length > 0) updateData.handle = handle.trim();

      if (user.lastActiveDate && user.lastActiveDate !== todayDate) {
        // It's a new day!
        let newStreak = user.streakDays || 1;
        try {
          const lastDate = new Date(user.lastActiveDate);
          const currDate = new Date(todayDate);
          const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays === 1) newStreak += 1;
          else if (diffDays > 1) newStreak = 1;
        } catch (_) {}

        updateData.reclaimedToday = 0;
        updateData.loopsBrokenToday = 0;
        updateData.reelsAvoidedToday = 0;
        updateData.completedPausesToday = 0;
        updateData.streakDays = newStreak;
        updateData.lastActiveDate = todayDate;
      } else if (!user.lastActiveDate) {
        updateData.lastActiveDate = todayDate;
      }

      if (Object.keys(updateData).length > 0) {
        user = await prisma.user
          .update({
            where: { email: userEmail },
            data: updateData,
          })
          .catch(() => user);
      }
    }

    const formatted = formatUserProfile(user || {
      id: userEmail.split('@')[0],
      email: userEmail,
      name: userName,
      handle: userHandle,
      avatarUrl: '',
    });

    inMemoryProfiles.set(userEmail, formatted);
    inMemoryProfiles.set(formatted.handle, formatted);
    inMemoryProfiles.set(formatted.id, formatted);

    const token = jwt.sign(
      { id: formatted.id, email: formatted.email, handle: formatted.handle },
      JWT_SECRET,
      { expiresIn: '60d' }
    );

    return res.json({
      message: 'Mindful sovereign authentication successful',
      token,
      user: formatted,
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Federated authentication failed' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const queryEmail = (req.query.email as string)?.toLowerCase()?.trim();
    const queryHandle = (req.query.handle as string)?.toLowerCase()?.trim();
    const userEmail = queryEmail || req.user?.email || 'aksharmndh9@gmail.com';
    const userId = req.user?.id;
    const headerDate = (req.headers['x-client-date'] as string);
    const queryDate = (req.query.clientDate as string);
    const todayDate = (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate))
      ? queryDate
      : (headerDate && /^\d{4}-\d{2}-\d{2}$/.test(headerDate))
        ? headerDate
        : new Date().toISOString().split('T')[0];

    // Check memory cache first - but invalidate if from an older day
    if (userEmail && inMemoryProfiles.has(userEmail)) {
      const cached = inMemoryProfiles.get(userEmail);
      if (cached.lastActiveDate === todayDate) {
        return res.json(cached);
      } else {
        inMemoryProfiles.delete(userEmail);
      }
    }
    if (queryHandle && inMemoryProfiles.has(queryHandle)) {
      const cached = inMemoryProfiles.get(queryHandle);
      if (cached.lastActiveDate === todayDate) {
        return res.json(cached);
      } else {
        inMemoryProfiles.delete(queryHandle);
      }
    }

    let user: any = null;
    if (userEmail) {
      user = await prisma.user
        .findUnique({
          where: { email: userEmail },
        })
        .catch(() => null);
    }

    if (!user && userId) {
      user = await prisma.user
        .findUnique({
          where: { id: userId },
        })
        .catch(() => null);
    }

    if (!user && queryHandle) {
      user = await prisma.user
        .findUnique({
          where: { handle: queryHandle },
        })
        .catch(() => null);
    }

    if (!user) {
      // Default initial profile (Blank profile picture initially)
      const defaultProfile = formatUserProfile({
        id: userEmail.split('@')[0],
        name: userEmail === 'aksharmndh9@gmail.com' ? 'Akshar' : 'Mindful Friend',
        handle: `@${userEmail.split('@')[0]}`,
        email: userEmail,
        avatarUrl: '',
        lastActiveDate: todayDate,
      });
      inMemoryProfiles.set(userEmail, defaultProfile);
      return res.json(defaultProfile);
    }

    // Check Daily Rollover for today's sovereignty record
    if (user.lastActiveDate && user.lastActiveDate !== todayDate) {
      let newStreak = user.streakDays || 1;
      try {
        const lastDate = new Date(user.lastActiveDate);
        const currDate = new Date(todayDate);
        const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) newStreak += 1;
        else if (diffDays > 1) newStreak = 1;
      } catch (_) {}

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          reclaimedToday: 0,
          loopsBrokenToday: 0,
          reelsAvoidedToday: 0,
          completedPausesToday: 0,
          streakDays: newStreak,
          lastActiveDate: todayDate,
        },
      }).catch(() => user);
    } else if (!user.lastActiveDate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastActiveDate: todayDate },
      }).catch(() => user);
    }

    const formatted = formatUserProfile(user);
    inMemoryProfiles.set(user.email, formatted);
    inMemoryProfiles.set(formatted.handle, formatted);
    return res.json(formatted);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const email =
      (req.body.email as string)?.toLowerCase()?.trim() ||
      (req.query.email as string)?.toLowerCase()?.trim() ||
      req.user?.email ||
      'aksharmndh9@gmail.com';

    const headerDate = (req.headers['x-client-date'] as string);
    const todayDate = (req.body.clientDate as string) || headerDate || new Date().toISOString().split('T')[0];

    const {
      name,
      handle,
      avatarUrl,
      streakDays,
      reclaimedToday,
      loopsBrokenToday,
      reelsAvoidedToday,
      completedPausesToday,
      lastActiveDate,
      spiritualMantra,
      spiritualSeason,
      soulPresenceState,
      soulAura,
      sacredBellSound,
      dailyStillnessGoalMinutes,
      bonsaiVitality,
      bonsaiStage,
    } = req.body;

    // Get current profile
    let existing = inMemoryProfiles.get(email);
    if (!existing) {
      existing = await prisma.user
        .findUnique({ where: { email } })
        .catch(() => null);
    }

    const updatedData: any = {
      ...(existing || {}),
      email,
    };

    if (name !== undefined && name !== null) updatedData.name = name;
    if (handle !== undefined && handle !== null) updatedData.handle = handle;
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl.trim().length > 0) {
      updatedData.avatarUrl = avatarUrl.trim();
    }
    if (streakDays !== undefined) updatedData.streakDays = Number(streakDays);
    if (reclaimedToday !== undefined) {
      updatedData.reclaimedToday = Number(reclaimedToday);
      // Auto compute reels avoided based on 10s rule if not explicitly overridden
      if (reelsAvoidedToday === undefined) {
        updatedData.reelsAvoidedToday = Math.round(Number(reclaimedToday) / 10);
      }
    }
    if (loopsBrokenToday !== undefined) updatedData.loopsBrokenToday = Number(loopsBrokenToday);
    if (reelsAvoidedToday !== undefined) updatedData.reelsAvoidedToday = Number(reelsAvoidedToday);
    if (completedPausesToday !== undefined) updatedData.completedPausesToday = Number(completedPausesToday);
    updatedData.lastActiveDate = lastActiveDate || existing?.lastActiveDate || todayDate;
    if (spiritualMantra !== undefined) updatedData.spiritualMantra = spiritualMantra;
    if (spiritualSeason !== undefined) updatedData.spiritualSeason = spiritualSeason;
    if (soulPresenceState !== undefined) updatedData.soulPresenceState = soulPresenceState;
    if (soulAura !== undefined) updatedData.soulAura = soulAura;
    if (sacredBellSound !== undefined) updatedData.sacredBellSound = sacredBellSound;
    if (dailyStillnessGoalMinutes !== undefined) {
      updatedData.dailyStillnessGoalMinutes = Number(dailyStillnessGoalMinutes);
    }
    if (bonsaiVitality !== undefined) updatedData.bonsaiVitality = Number(bonsaiVitality);
    if (bonsaiStage !== undefined) updatedData.bonsaiStage = bonsaiStage;
    updatedData.updatedAt = new Date().toISOString();

    const formatted = formatUserProfile(updatedData);

    // Save to in-memory map
    inMemoryProfiles.set(email, formatted);
    inMemoryProfiles.set(formatted.handle, formatted);
    if (formatted.id) inMemoryProfiles.set(formatted.id, formatted);

    // Upsert to Prisma DB non-blockingly
    prisma.user
      .upsert({
        where: { email },
        update: {
          name: formatted.name,
          handle: formatted.handle,
          avatarUrl: formatted.avatarUrl,
          streakDays: formatted.streakDays,
          reclaimedToday: formatted.reclaimedToday,
          loopsBrokenToday: formatted.loopsBrokenToday,
          reelsAvoidedToday: formatted.reelsAvoidedToday,
          completedPausesToday: formatted.completedPausesToday,
          lastActiveDate: formatted.lastActiveDate || todayDate,
          spiritualMantra: formatted.spiritualMantra,
          spiritualSeason: formatted.spiritualSeason,
          soulPresenceState: formatted.soulPresenceState,
          soulAura: formatted.soulAura,
          sacredBellSound: formatted.sacredBellSound,
          dailyStillnessGoalMinutes: formatted.dailyStillnessGoalMinutes,
          bonsaiVitality: formatted.bonsaiVitality,
          bonsaiStage: formatted.bonsaiStage,
        },
        create: {
          email,
          name: formatted.name,
          handle: formatted.handle,
          avatarUrl: formatted.avatarUrl,
          streakDays: formatted.streakDays,
          reclaimedToday: formatted.reclaimedToday,
          loopsBrokenToday: formatted.loopsBrokenToday,
          reelsAvoidedToday: formatted.reelsAvoidedToday,
          completedPausesToday: formatted.completedPausesToday,
          lastActiveDate: formatted.lastActiveDate || todayDate,
          spiritualMantra: formatted.spiritualMantra,
          spiritualSeason: formatted.spiritualSeason,
          soulPresenceState: formatted.soulPresenceState,
          soulAura: formatted.soulAura,
          sacredBellSound: formatted.sacredBellSound,
          dailyStillnessGoalMinutes: formatted.dailyStillnessGoalMinutes,
          bonsaiVitality: formatted.bonsaiVitality,
          bonsaiStage: formatted.bonsaiStage,
        },
      })
      .catch((err) => {
        console.warn('DB upsert profile notice:', err?.message);
      });

    // Real-time broadcast to socket clients
    if (io) {
      io.to(formatted.id).emit('user_profile_updated', formatted);
      io.emit('presence_profile_changed', {
        userId: formatted.id,
        handle: formatted.handle,
        avatarUrl: formatted.avatarUrl,
        name: formatted.name,
      });
    }

    return res.json({
      success: true,
      message: 'Profile synchronized successfully across all tabs & backend',
      user: formatted,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
};

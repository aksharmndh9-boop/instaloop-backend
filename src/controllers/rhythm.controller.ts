import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../config/db';
import genAI from '../config/gemini';

const withTimeout = <T>(promise: Promise<T>, ms = 2000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms)),
  ]);
};

export function getTodayDateString(clientDate?: string): string {
  if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate.trim())) {
    return clientDate.trim();
  }
  return new Date().toISOString().split('T')[0];
}

export const getRhythmStats = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.query.email as string)?.toLowerCase()?.trim() || req.user?.email;
    const userId = req.user?.id;
    const clientDate = (req.headers['x-client-date'] as string) || (req.query.clientDate as string);
    const todayDate = getTodayDateString(clientDate);

    let user: any = null;
    if (userEmail) {
      user = await prisma.user.findUnique({
        where: { email: userEmail },
      }).catch(() => null);
    }
    if (!user && userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      }).catch(() => null);
    }

    // Check Daily Rollover for today's sovereignty record
    if (user) {
      if (user.lastActiveDate && user.lastActiveDate !== todayDate) {
        // It's a new day! Reset daily metrics to 0
        let newStreak = user.streakDays || 1;
        try {
          const lastDate = new Date(user.lastActiveDate);
          const currDate = new Date(todayDate);
          const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays === 1) {
            newStreak += 1;
          } else if (diffDays > 1) {
            newStreak = 1;
          }
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
    }

    const reclaimedSeconds = user?.reclaimedToday ?? 0;
    const streakDays = user?.streakDays ?? 1;
    const loopsBroken = user?.loopsBrokenToday ?? 0;
    // Exactly 10 seconds per reel avoided average screen time
    const reelsAvoided = user?.reelsAvoidedToday ?? Math.round(reclaimedSeconds / 10);
    const completedPauses = user?.completedPausesToday ?? 0;
    const dailyStillnessGoalMinutes = user?.dailyStillnessGoalMinutes ?? 20;
    const bonsaiVitality = user?.bonsaiVitality ?? 50;
    const bonsaiStage = user?.bonsaiStage || 'seedling';

    const progressVal = dailyStillnessGoalMinutes > 0
      ? Math.min(1.0, reclaimedSeconds / (dailyStillnessGoalMinutes * 60))
      : 0.0;

    const weeklyBars = [
      { day: 'M', val: 0.0, sec: '0s', isToday: false },
      { day: 'T', val: 0.0, sec: '0s', isToday: false },
      { day: 'W', val: 0.0, sec: '0s', isToday: false },
      { day: 'T', val: 0.0, sec: '0s', isToday: false },
      { day: 'F', val: 0.0, sec: '0s', isToday: false },
      { day: 'S', val: 0.0, sec: '0s', isToday: false },
      { day: 'Today', val: progressVal, sec: `${reclaimedSeconds}s`, isToday: true },
    ];

    return res.json({
      reclaimedSeconds,
      reclaimedMinutes: Math.floor(reclaimedSeconds / 60),
      streakDays,
      loopsBroken,
      reelsAvoided,
      completedPauses,
      dailyStillnessGoalMinutes,
      bonsaiVitality,
      bonsaiStage,
      weeklyBars,
      lastActiveDate: user?.lastActiveDate || todayDate,
      philosophy: 'Quantifying attention saved from infinite feeds. Every second paused is life reclaimed (10s avg per reel).',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve rhythm metrics' });
  }
};

export const recordLoopBroken = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.body.email as string)?.toLowerCase()?.trim() || req.user?.email || 'aksharmndh9@gmail.com';
    const { secondsReclaimed, bonsaiVitality, clientDate } = req.body;
    const headerDate = (req.headers['x-client-date'] as string);
    const todayDate = getTodayDateString(clientDate || headerDate);
    const seconds = Number(secondsReclaimed) || 15;

    let user = null;
    if (userEmail) {
      let existingUser = await prisma.user.findUnique({ where: { email: userEmail } }).catch(() => null);
      if (!existingUser) {
        existingUser = await prisma.user.create({
          data: {
            email: userEmail,
            name: userEmail.split('@')[0],
            handle: `@${userEmail.split('@')[0]}`,
            lastActiveDate: todayDate,
            streakDays: 1,
            reclaimedToday: 0,
            loopsBrokenToday: 0,
            reelsAvoidedToday: 0,
            completedPausesToday: 0,
          },
        }).catch(() => null);
      }
      if (existingUser) {
        const isNewDay = existingUser.lastActiveDate && existingUser.lastActiveDate !== todayDate;
        const prevVit = existingUser.bonsaiVitality ?? 50;
        const targetVit = bonsaiVitality !== undefined
          ? Math.min(100, Math.max(10, Math.round(Number(bonsaiVitality))))
          : Math.min(100, prevVit + 10);

        let prevReclaimed = isNewDay ? 0 : (existingUser.reclaimedToday ?? 0);
        let prevLoops = isNewDay ? 0 : (existingUser.loopsBrokenToday ?? 0);
        let prevPauses = isNewDay ? 0 : (existingUser.completedPausesToday ?? 0);
        let newStreak = existingUser.streakDays ?? 1;

        if (isNewDay) {
          try {
            const lastDate = new Date(existingUser.lastActiveDate!);
            const currDate = new Date(todayDate);
            const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
            if (diffDays === 1) newStreak += 1;
            else if (diffDays > 1) newStreak = 1;
          } catch (_) {}
        }

        const newReclaimed = prevReclaimed + seconds;
        const newLoops = prevLoops + 1;
        const newReelsAvoided = Math.round(newReclaimed / 10);

        user = await prisma.user.update({
          where: { email: userEmail },
          data: {
            loopsBrokenToday: newLoops,
            reclaimedToday: newReclaimed,
            reelsAvoidedToday: newReelsAvoided,
            completedPausesToday: prevPauses,
            streakDays: newStreak,
            bonsaiVitality: targetVit,
            lastActiveDate: todayDate,
          },
        }).catch(() => null);
      }
    }

    return res.json({
      success: true,
      message: 'Scroll loop interrupted. Reclaimed attention updated.',
      secondsAdded: seconds,
      user: user || {
        reclaimedToday: seconds,
        loopsBrokenToday: 1,
        reelsAvoidedToday: Math.round(seconds / 10),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record loop break' });
  }
};

export const recordPauseCompleted = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.body.email as string)?.toLowerCase()?.trim() || req.user?.email || 'aksharmndh9@gmail.com';
    const { durationSeconds, bonsaiVitality, clientDate } = req.body;
    const headerDate = (req.headers['x-client-date'] as string);
    const todayDate = getTodayDateString(clientDate || headerDate);
    const seconds = Number(durationSeconds) || 15;

    let user = null;
    if (userEmail) {
      let existingUser = await prisma.user.findUnique({ where: { email: userEmail } }).catch(() => null);
      if (!existingUser) {
        existingUser = await prisma.user.create({
          data: {
            email: userEmail,
            name: userEmail.split('@')[0],
            handle: `@${userEmail.split('@')[0]}`,
            lastActiveDate: todayDate,
            streakDays: 1,
            reclaimedToday: 0,
            loopsBrokenToday: 0,
            reelsAvoidedToday: 0,
            completedPausesToday: 0,
          },
        }).catch(() => null);
      }
      if (existingUser) {
        const isNewDay = existingUser.lastActiveDate && existingUser.lastActiveDate !== todayDate;
        const prevVit = existingUser.bonsaiVitality ?? 50;
        let prevReclaimed = isNewDay ? 0 : (existingUser.reclaimedToday ?? 0);
        let prevLoops = isNewDay ? 0 : (existingUser.loopsBrokenToday ?? 0);
        let prevPauses = isNewDay ? 0 : (existingUser.completedPausesToday ?? 0);
        let newStreak = existingUser.streakDays ?? 1;

        if (isNewDay) {
          try {
            const lastDate = new Date(existingUser.lastActiveDate!);
            const currDate = new Date(todayDate);
            const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
            if (diffDays === 1) newStreak += 1;
            else if (diffDays > 1) newStreak = 1;
          } catch (_) {}
        }

        const newTotalReclaimed = prevReclaimed + seconds;
        const newPauses = prevPauses + 1;
        const newReelsAvoided = Math.round(newTotalReclaimed / 10);

        let newStage = "seedling";
        if (newTotalReclaimed >= 6000) newStage = "ancientCanopy";
        else if (newTotalReclaimed >= 2400) newStage = "flourishingBonsai";
        else if (newTotalReclaimed >= 900) newStage = "youngBonsai";
        else if (newTotalReclaimed >= 300) newStage = "sprout";

        const targetVit = bonsaiVitality !== undefined
          ? Math.min(100, Math.max(10, Math.round(Number(bonsaiVitality))))
          : Math.min(100, Math.max(10, prevVit + Math.max(5, Math.round(seconds * 1.5))));

        user = await prisma.user.update({
          where: { email: userEmail },
          data: {
            completedPausesToday: newPauses,
            reclaimedToday: newTotalReclaimed,
            reelsAvoidedToday: newReelsAvoided,
            loopsBrokenToday: prevLoops,
            streakDays: newStreak,
            bonsaiVitality: targetVit,
            bonsaiStage: newStage,
            lastActiveDate: todayDate,
          },
        }).catch(() => null);
      }
    }

    return res.json({
      success: true,
      message: 'Mindful stillness pause recorded on cloud backend.',
      secondsAdded: seconds,
      user,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record completed pause' });
  }
};

export const getGeminiRhythmInsight = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.body?.email as string)?.toLowerCase()?.trim() || req.user?.email;
    const userId = req.user?.id || 'usr-mindful';
    const { mood } = req.body;

    let user: any = null;
    if (userEmail) {
      user = await prisma.user.findUnique({
        where: { email: userEmail },
      }).catch(() => null);
    }
    if (!user && userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      }).catch(() => null);
    }

    const reclaimedSeconds = user?.reclaimedToday ?? 0;
    const streakDays = user?.streakDays ?? 1;
    const loopsBroken = user?.loopsBrokenToday ?? 0;

    if (genAI) {
      const candidateModels = [
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
      ];
      const prompt = `You are the Spiritual Sanctuary & Mindful Healing Oracle in Instaloop, a contemplative refuge for weary souls seeking peace, presence, and healing from digital exhaustion.
User context:
- Sacred stillness accumulated today: ${reclaimedSeconds} seconds
- Digital noise loops surrendered: ${loopsBroken}
- Daily sanctuary devotion streak: ${streakDays} days
- Current emotional and spiritual state: ${mood || 'seeking stillness and spiritual healing'}

Respond with a JSON object in this EXACT structure (no markdown, just raw JSON):
{
  "title": "A 2-3 word poetic sanctuary title like 'Sanctuary of Peace', 'The Healing Well', 'Whisper of Grace', or 'Restored Spirit'",
  "levelTitle": "Dwelling in Serenity",
  "xpPoints": ${reclaimedSeconds},
  "nextLevelXp": 1000,
  "insight": "Exactly TWO deeply compassionate, spiritually soothing, and comforting sentences that heal digital fatigue, honor their fragile nervous system, and remind them that their worth is sacred and untouched by the noise of the world.",
  "prescription": "ONE tender, loving somatic micro-healing ritual under 14 words (e.g., 'Place a gentle hand over your heart and whisper: I am safe here.')."
}`;

      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json' },
          });
          const result = await withTimeout(model.generateContent(prompt), 6000);
          const text = result.response.text();
          if (text && text.trim().length > 0) {
            const parsed = JSON.parse(text.trim());
            return res.json({
              ...parsed,
              isAiGenerated: true,
              model: modelName,
            });
          }
        } catch (err: any) {
          // Fall through swiftly
        }
      }
    }

    // Dynamic Intelligent Mindful Fallback
    const fallbacks = [
      {
        title: "Sanctuary of Peace",
        levelTitle: "Dwelling in Serenity",
        xpPoints: reclaimedSeconds,
        nextLevelXp: 1000,
        insight: "By turning away from endless feeds 14 times today, you offered your spirit a sacred refuge. You do not have to carry the weight of the digital world; peace is already waiting inside your quiet breath.",
        prescription: "Place a gentle hand on your heart and exhale all hurry.",
        isAiGenerated: false,
      },
      {
        title: "The Healing Well",
        levelTitle: "Dwelling in Serenity",
        xpPoints: reclaimedSeconds,
        nextLevelXp: 1000,
        insight: "Your 19 days of mindful sanctuary are a testament to your soul's desire for wholeness. In this sacred pause, let the tension in your jaw and shoulders melt like morning mist.",
        prescription: "Close your eyes, breathe in pure grace, and feel the ground holding you.",
        isAiGenerated: false,
      },
      {
        title: "Whisper of Grace",
        levelTitle: "Dwelling in Serenity",
        xpPoints: reclaimedSeconds,
        nextLevelXp: 1000,
        insight: "Every moment you stepped away from the screen returned life, quietude, and sovereignty to your heart. You are not meant to be endlessly consumed; your true nature is vast and still.",
        prescription: "Drink a sip of cool water slowly, thanking your body for being here.",
        isAiGenerated: false,
      },
    ];

    const chosen = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    return res.json(chosen);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate rhythm insight' });
  }
};

export const getGeminiSoulMantra = async (req: AuthRequest, res: Response) => {
  try {
    const { season, presenceState, currentIntention } = req.body;

    const chosenSeason = season || 'Season of Sacred Healing';
    const chosenState = presenceState || 'Healing & Resting';

    if (genAI) {
      const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
      ];

      const prompt = `You are the Spiritual Sanctuary & Mindful Healing Oracle in Instaloop, an anti-scroll refuge for souls healing from digital exhaustion.
The user is tailoring their sacred soul profile.
Context:
- Spiritual Season: ${chosenSeason}
- Current Soul Presence State: ${chosenState}
- User's existing intention or feeling: ${currentIntention || 'seeking stillness and releasing digital hurry'}

Generate a JSON object with this EXACT structure (no markdown, just raw JSON):
{
  "mantra": "A single deeply comforting, first-person spiritual soul mantra under 18 words that honors their healing and grounds them in peace.",
  "blessing": "A tender 1-sentence spiritual blessing honoring their quiet devotion."
}`;

      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json' },
          });
          const result = await withTimeout(model.generateContent(prompt), 6000);
          const text = result.response.text();
          if (text && text.trim().length > 0) {
            const parsed = JSON.parse(text.trim());
            return res.json({
              ...parsed,
              isAiGenerated: true,
              model: modelName,
            });
          }
        } catch (err: any) {
          // Fall through to next model
        }
      }
    }

    // Dynamic intelligent spiritual fallbacks based on presence state
    const spiritualFallbacks: Record<string, { mantra: string; blessing: string }> = {
      'Healing & Resting': {
        mantra: 'Resting my weary spirit in quietude. Choosing deep presence over digital chaos.',
        blessing: 'May gentle peace shelter your heart and grant you deep restoration today.',
      },
      'Deep Stillness': {
        mantra: 'Anchored in this silent moment. The world can spin; my spirit remains calm and still.',
        blessing: 'Your stillness is a sacred well of renewal for all you touch.',
      },
      'Guarded Sanctuary': {
        mantra: 'I tenderly protect my attention and boundaries from hurry, comparison, and noise.',
        blessing: 'Grace surrounds your sanctuary; you are safe to dwell in peace.',
      },
      'Gentle Wanderer': {
        mantra: 'Walking lightly without rush, trusting the gentle unfolding of this day.',
        blessing: 'Every unhurried step you take is a blessing of awareness.',
      },
      'Radiant & Open': {
        mantra: 'Grounded in peace, radiating kindness to myself and everyone I meet.',
        blessing: 'May your presence bring quiet light into a noisy world.',
      },
    };

    const chosen = spiritualFallbacks[chosenState] || {
      mantra: 'Resting my weary spirit in quietude. Choosing deep presence over digital chaos.',
      blessing: 'May gentle stillness surround your heart and bring peace to your mind.',
    };

    return res.json({
      ...chosen,
      isAiGenerated: false,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate soul mantra' });
  }
};

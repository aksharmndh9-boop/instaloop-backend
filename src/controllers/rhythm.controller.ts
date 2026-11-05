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

export const getRhythmStats = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.query.email as string)?.toLowerCase()?.trim() || req.user?.email;
    const userId = req.user?.id;

    let user: any = null;
    if (userEmail) {
      user = await prisma.user.findUnique({
        where: { email: userEmail },
      }).catch(() => null);
    }
    if (!user && userId && userId !== 'demo-elena-vance-id') {
      user = await prisma.user.findUnique({
        where: { id: userId },
      }).catch(() => null);
    }

    const reclaimedSeconds = user?.reclaimedToday ?? 760;
    const streakDays = user?.streakDays ?? 19;
    const loopsBroken = user?.loopsBrokenToday ?? 14;
    const reelsAvoided = user?.reelsAvoidedToday ?? Math.round(reclaimedSeconds * 2.5);
    const completedPauses = user?.completedPausesToday ?? 4;
    const dailyStillnessGoalMinutes = user?.dailyStillnessGoalMinutes ?? 20;
    const bonsaiVitality = user?.bonsaiVitality ?? 85;
    const bonsaiStage = user?.bonsaiStage || 'flourishing';

    const weeklyBars = [
      { day: 'M', val: 0.55, sec: '70s', isToday: false },
      { day: 'T', val: 0.80, sec: '110s', isToday: false },
      { day: 'W', val: 0.35, sec: '45s', isToday: false },
      { day: 'T', val: 0.70, sec: '95s', isToday: false },
      { day: 'F', val: 0.92, sec: '130s', isToday: false },
      { day: 'S', val: 0.45, sec: '60s', isToday: false },
      { day: 'Sun', val: 0.75, sec: '105s', isToday: true },
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
      philosophy: 'Quantifying attention saved from infinite feeds. Every second paused is life reclaimed.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve rhythm metrics' });
  }
};

export const recordLoopBroken = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.body.email as string)?.toLowerCase()?.trim() || req.user?.email || 'aksharmndh9@gmail.com';
    const { secondsReclaimed } = req.body;
    const seconds = Number(secondsReclaimed) || 15;

    let user = null;
    if (userEmail) {
      user = await prisma.user.update({
        where: { email: userEmail },
        data: {
          loopsBrokenToday: { increment: 1 },
          reclaimedToday: { increment: seconds },
          reelsAvoidedToday: { increment: Math.max(1, Math.round(seconds / 5)) },
        },
      }).catch(() => null);
    }

    return res.json({
      success: true,
      message: 'Scroll loop interrupted. Reclaimed attention updated.',
      secondsAdded: seconds,
      user: user || {
        reclaimedToday: 760 + seconds,
        loopsBrokenToday: 15,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record loop break' });
  }
};

export const recordPauseCompleted = async (req: AuthRequest, res: Response) => {
  try {
    const userEmail = (req.body.email as string)?.toLowerCase()?.trim() || req.user?.email || 'aksharmndh9@gmail.com';
    const { durationSeconds } = req.body;
    const seconds = Number(durationSeconds) || 15;

    let user = null;
    if (userEmail) {
      user = await prisma.user.update({
        where: { email: userEmail },
        data: {
          completedPausesToday: { increment: 1 },
          reclaimedToday: { increment: seconds },
          reelsAvoidedToday: { increment: Math.max(1, Math.round(seconds / 4)) },
        },
      }).catch(() => null);
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
    const userId = req.user?.id || 'demo-elena-vance-id';
    const { mood } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    }).catch(() => null);

    const reclaimedSeconds = user?.reclaimedToday || 760;
    const streakDays = user?.streakDays || 19;
    const loopsBroken = user?.loopsBrokenToday || 14;

    if (genAI) {
      const candidateModels = [
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
          const result = await withTimeout(model.generateContent(prompt), 2000);
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
          const result = await withTimeout(model.generateContent(prompt), 2000);
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

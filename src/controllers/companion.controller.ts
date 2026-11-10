import { Request, Response } from 'express';
import genAI from '../config/gemini';
import prisma from '../config/db';
import { io } from '../server';
import { addInboxMessage } from './inbox.controller';

const withTimeout = <T>(promise: Promise<T>, ms = 2000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI generation timed out')), ms)),
  ]);
};

const COMPANIONS = [
  {
    id: 'c1',
    name: 'Luna',
    role: 'Somatic Breathwork Guide',
    accentColor: '#D2F84E',
    voiceType: 'Gentle Calming Whisper',
    isMuted: false,
    promptPhilosophy: 'Focuses on parasympathetic nervous system down-regulation and somatic body awareness.',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD3n8mJYq9x0Z3hj1V0pKSHxokroOSrB5eRhM8UikIwPie4J7yns7ANpFY5lPJw09QYzoA1uKT9XJqpXC7-lrJOD7JTmhVaTCkNBA34M9q1k74x4lMINi1A2XeMhshEfmnaftQzJ5HSOFxspHydr1jocDZdoUuNcyBkRPPOybBK4SSkJyHO7sL7aP0Ui4QjSynCDKg_k7pcc1IL_vg3dC-83rP19WQCqxDmW3hTsn_sqMgFyYVIDMeG',
  },
  {
    id: 'c2',
    name: 'Maya',
    role: 'Anxiety & Grounding Anchor',
    accentColor: '#9C88FF',
    voiceType: 'Warm Earthy Resonance',
    isMuted: false,
    promptPhilosophy: 'Guides attention back from thought loops to physical senses in the immediate space.',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBCsTgRO8DKZg15v99q1KpNfHGinoGwxL05Nit2mcrl4f3RysCuwY8D4ck77l8a0cpIXu_RqmoHCX7DznCxeZNlVENx9PcCJxsLCgJK84INXPiss9cWF5mArExJPtKuq082EJ7bw2ffAvd6vBs-VnBVDPJGfZ1h0m9AxOKF3g6D-9y8Uxa325oishY6ZRsulTiq-O_1QUmFs4QHD-7pmkf6L8PF_CH_OvjUhqI95HZLAx-zF5SpnDF5',
  },
  {
    id: 'c3',
    name: 'Atlas',
    role: 'Doomscroll Stoic Interrupter',
    accentColor: '#6355E6',
    voiceType: 'Steady Grounded Baritone',
    isMuted: true,
    promptPhilosophy: 'Challenges algorithmic dopamine entrapment with gentle stoic clarity.',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHX47poB-2bkPA2inOPdZB_AiAktHe76VyGyBOlXe_khVvRCPpe75MWgSd-7KN_3h6Ar0h1DSRDcEN2-BnZYPokBTv_qOpv-WirxwLzETLS-SWlKibH838aYqniDR7g-Pb8qW7NrCsYaTYYA3BX1QyzuoWIpMEIgqNTP-Uzfo6vju2jS1mm1taoCLCtVdd4Z01ZT2ZTT4IHHsfU7Bwug0bSwEs5QDyrTgVmrHy7ELeUK7A3fECAvg9',
  },
  {
    id: 'c4',
    name: 'Orion',
    role: 'Nighttime Wind-Down Sentinel',
    accentColor: '#4ADE80',
    voiceType: 'Nocturnal Ambient Softness',
    isMuted: false,
    promptPhilosophy: 'Shields late-night rest from blue-light stimulation and endless scrolling voids.',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbVVIib_6LmkwYCNKtRPq0217mgbku_-bH2gJQNjcNcs5ZvJjyCPnUeUnTyy2nnBh8mgk_R4JF3N5DagvoaGH1YUAQgtLZNnxtuX4AQPGLiJTEo3RTol2vXdS63vb0KdKMg1-LhFDTvms3lGj_mC7ZHnQIN6nchESfNNI_jcQXS6gWIxsUQGjdrNHnGIl-kosSxamLdFaZ4gPoElkzwWYFOVd_Dq8o3qp_-8sD4wwT',
  },
  {
    id: 'c5',
    name: 'Silas',
    role: 'Zen Presence Observer',
    accentColor: '#F59E0B',
    voiceType: 'Minimalist Bell & Monastic Tone',
    isMuted: false,
    promptPhilosophy: 'Cultivates silent non-reactive awareness without digital demands.',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfyYJT2xMkFLSVku_3SkpcUpwAcSiWn2ni6F1Rq8hfVT_NtHiHJSG6J2HqJhu-TlQm6Pf8K-HPj7fdpjf0kjpPxo0RD_QayZWSkP2lJnvwpN1HdbonYyzCrE_lSTQn8epa6euUpIwq3pNUBfO-5wsBYsLdiM789U8EtbViuOO9i0Zjl9gy2KSjN0PDoHekJ2A0ff2oep7jWB9Ocrag9034nrkyux6b4l0wVG7nGwY-Dgjl_r_y2e7p',
  },
];

export const getCompanions = (req: Request, res: Response) => {
  return res.json(COMPANIONS);
};

export const getCompanionBreathingPrompt = async (req: Request, res: Response) => {
  const { companionId, companionName, mood } = req.body;

  const companion = COMPANIONS.find(
    (c) => c.id === companionId || c.name.toLowerCase() === (companionName || '').toLowerCase()
  ) || COMPANIONS[0];

  // Try live Gemini AI generation if API key is supplied
  if (genAI) {
    const candidateModels = [
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest',
    ];
    const prompt = `You are ${companion.name}, an AI ${companion.role} in Instaloop, 
an anti-scroll social network.
Philosophy: ${companion.promptPhilosophy}
User state: ${mood || 'scrolling aimlessly on phone'}.
Respond with exactly TWO short, grounding sentences guiding them through a calm breathing pause.
No hashtags, no emojis, no hype, just pure stillness.`;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await withTimeout(model.generateContent(prompt), 2000);
        const text = result.response.text();
        if (text && text.trim().length > 0) {
          return res.json({
            companion: companion.name,
            role: companion.role,
            guidance: text.trim(),
            durationSeconds: 15,
            isAiGenerated: true,
            model: modelName,
          });
        }
      } catch (err: any) {
        // Fall through swiftly
      }
    }
  }

  // Dynamic Archetype Synthesizers (Rich adaptive mindful prompts)
  const dynamicSynthesizers: Record<string, string[]> = {
    Luna: [
      "Feel the floor supporting you and release your belly. Inhale for four gentle seconds, hold stillness, and let the breath dissolve softly.",
      "Drop your shoulders away from your ears and soften your stomach. Breathe in calm stillness for four counts, pause in peace, and let go completely.",
      "Release tension from behind your eyes and let your jaw unhinge. Inhale deep nourishment, hold the stillness gently, and exhale all hurry.",
      "Notice the physical rhythm of your breath right now. Expand your ribs gently on the inhale, rest in the quiet, and release the tension with ease.",
    ],
    Maya: [
      "Notice three distinct sounds in the room right now. You are here in physical reality, safe from algorithmic demands.",
      "Touch two physical surfaces near you right now. Ground your awareness into the tactile present; the digital world can wait.",
      "Feel the temperature of the air entering your nostrils. You are anchored here in reality, safe from algorithmic urgency.",
      "Notice three distinct textures around you. Let your nervous system settle into the physical room you inhabit.",
    ],
    Atlas: [
      "The infinite feed will never show you the last post because none exists. Put the screen face-down and take your time back.",
      "The infinite feed has no finish line, no final post, and no treasure at the bottom. Reclaim your sovereignty and close the loop.",
      "Your attention is your life itself. Do not trade irreplaceable moments for automated dopamine triggers. Breathe, and step away.",
      "No algorithm cares about your peace of mind—only your clicks. Choose to be sovereign: pause, breathe, and put the device down.",
    ],
    Orion: [
      "The day is already finished and you have done enough. Soften your eyelids and let your nervous system transition to peaceful rest.",
      "The day is already complete and you have done enough. Soften your gaze, release tomorrow's plans, and invite restorative rest.",
      "Blue light promises endless answers to questions you never asked. Dim the screen, unclench your forehead, and breathe into darkness.",
      "Your nervous system longs for quiet darkness. Allow every muscle to sink heavily into the mattress and welcome peaceful sleep.",
    ],
    Silas: [
      "In this moment, there is nowhere else you need to be. Watch one breath arrive and departure without holding on.",
      "In this single breath, nothing is lacking and nothing needs fixing. Watch awareness gently rest upon itself without seeking anything.",
      "Silence is not the absence of sound, but the presence of your own uncluttered mind. Rest in the pure space between thoughts.",
      "The clock moves forward, but stillness remains right here. Be the silent witness to this breath arriving and dissolving.",
    ],
  };

  const pool = dynamicSynthesizers[companion.name] || dynamicSynthesizers.Luna;
  const pickedGuidance = pool[Math.floor(Math.random() * pool.length)];

  return res.json({
    companion: companion.name,
    role: companion.role,
    guidance: pickedGuidance,
    durationSeconds: 15,
    isAiGenerated: false,
  });
};

export const getDailyCompanionPause = async (req: Request, res: Response) => {
  try {
    const { companionName, userId } = req.body;

    // Rotate companion daily based on current day of year
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    const companion = companionName
      ? COMPANIONS.find((c) => c.name.toLowerCase() === companionName.toLowerCase()) ||
        COMPANIONS[dayOfYear % COMPANIONS.length]
      : COMPANIONS[dayOfYear % COMPANIONS.length];

    let title = "⚡ Gift of Sacred Presence";
    let note = "A dramatic mindful intercession sent to break the digital loop.";
    let durationSeconds = 15;
    let isAiGenerated = false;

    // If Gemini AI is configured, synthesize a dramatic intercession
    if (genAI) {
      const candidateModels = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
      ];

      const dramaticSystemPrompt = `You are ${companion.name}, an AI ${companion.role} in Instaloop, an anti-scroll social refuge.
Philosophy: ${companion.promptPhilosophy}

Write a DRAMATIC, POETIC, and DEEPLY MOVING pause message sent to the user's inbox today to rescue them from the infinite feed and digital exhaustion.
Speak with high dramatic gravitas, deep empathy, and stoic/somatic presence.
Demand they pause their scroll and reclaim their human attention right now.

Respond ONLY with valid JSON in this exact format:
{
  "title": "Dramatic Title with emoji (max 6 words, e.g. ⚡ A Crack in the Algorithmic Mirror)",
  "note": "A moving 2-3 sentence dramatic intercession (max 45 words)",
  "durationSeconds": 15
}`;

      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
          });
          const result = await withTimeout(model.generateContent(dramaticSystemPrompt), 2000);
          const rawText = result.response.text();
          if (rawText) {
            const parsed = JSON.parse(rawText);
            if (parsed.title && parsed.note) {
              title = parsed.title;
              note = parsed.note;
              durationSeconds = parsed.durationSeconds || 15;
              isAiGenerated = true;
              break;
            }
          }
        } catch (_) {
          // Fall through swiftly to curated dramatic pool
        }
      }
    }

    // Curated dramatic fallback library for 100% offline reliability
    if (!isAiGenerated) {
      const dramaticFallbackPool: Record<string, Array<{ title: string; note: string; duration: number }>> = {
        Atlas: [
          {
            title: "⚡ A Crack in the Algorithmic Mirror",
            note: "The infinite feed was engineered to devour your mortal hours, but I am standing between you and the vortex. Turn the glass face-down. Exhale the artificial urgency of a machine that does not know your name.",
            duration: 15,
          },
          {
            title: "🛑 The Sovereign Stand",
            note: "There is no prize at the bottom of the scroll. No secret enlightenment waiting five swipes down. Reclaim your sovereignty right now; take this fifteen seconds as your rebellion.",
            duration: 15,
          },
          {
            title: "⚔️ Breaking the Skinner Box",
            note: "Every millisecond you pause is attention stolen back from algorithmic capture. Feel your feet on the earth. You are human, not digital fodder.",
            duration: 20,
          },
        ],
        Luna: [
          {
            title: "🌿 Sanctuary of the Exhale",
            note: "I sense the tight coil behind your eyes and the shallow tension in your chest. The digital world demands your speed, but your body demands your reverence. Drop your shoulders into gravity and breathe.",
            duration: 15,
          },
          {
            title: "🌊 Parasympathetic Awakening",
            note: "Unclench your teeth and release your belly. Inhale the stillness of the living room, hold the sacred pause, and let the exhalation wash away the digital haze.",
            duration: 15,
          },
          {
            title: "🕊️ Release the Gripping",
            note: "You have been holding your breath while reading screens. Let your ribs soften, let your pulse slow, and return to physical reality with undivided grace.",
            duration: 15,
          },
        ],
        Maya: [
          {
            title: "🌱 The Physical Ground Beneath You",
            note: "Phantom notifications are pulling your mind into static. Touch the nearest physical surface with your fingertips. Notice the coolness of real wood or stone. You are here, safe and alive.",
            duration: 15,
          },
          {
            title: "🍃 Sensory Re-Anchoring",
            note: "Listen to three physical sounds around you right now. The refrigerator hum, the breeze against glass, your own heartbeat. Reality is gentle; leave the feed behind.",
            duration: 15,
          },
          {
            title: "🌾 The Return to Senses",
            note: "The online world is an abstract hallucination. Press both soles of your feet firmly into the floor. Breathe in the scent of the room. You have arrived home.",
            duration: 20,
          },
        ],
        Orion: [
          {
            title: "🌙 Cloak of Sacred Silence",
            note: "The nocturnal world is sleeping, yet artificial blue light is burning your retinas. The algorithm never tires, but your soul is exhausted. I am cloaking you in stillness. Put the device away.",
            duration: 20,
          },
          {
            title: "🕯️ Midnight Wind-Down Intercession",
            note: "You have done enough today. The notifications can wait until the morning sun. Soften your eyelids, sink into darkness, and allow restorative calm to take over.",
            duration: 15,
          },
          {
            title: "🌌 Surrender to Restorative Dark",
            note: "No more input. No more opinions. No more feeds. Let the screen go dark and give your nervous system the gift of complete, tranquil quietude.",
            duration: 20,
          },
        ],
        Silas: [
          {
            title: "🕯️ The Temple Bell Across the Void",
            note: "A bell chimes in the empty courtyard of your mind. For fifteen seconds, there is no one to impress, nothing to buy, nowhere to arrive. You are already complete.",
            duration: 15,
          },
          {
            title: "🧘 Pure Non-Reactive Stillness",
            note: "The machine demands your reaction, your outrage, your desire. Give it nothing. Simply observe this one breath arriving and departing like a wave.",
            duration: 15,
          },
          {
            title: "🕊️ The Space Between Thoughts",
            note: "Behind all digital clamor lies unbroken silence. Rest in that sacred silence for fifteen seconds. Reclaim your peace.",
            duration: 15,
          },
        ],
      };

      const companionPool = dramaticFallbackPool[companion.name] || dramaticFallbackPool.Atlas;
      const picked = companionPool[Math.floor(Math.random() * companionPool.length)];
      title = picked.title;
      note = picked.note;
      durationSeconds = picked.duration;
    }

    const newPause = {
      id: `daily-ai-${Date.now()}`,
      senderId: companion.id,
      senderName: companion.name,
      senderRole: `${companion.role} • Gemini AI Companion`,
      avatarUrl: companion.avatarUrl,
      title: title,
      subtitle: `Daily Mindful Intercession from ${companion.name}`,
      note: note,
      durationSeconds: durationSeconds,
      tag: 'Daily AI Gift',
      isRead: false,
      isCompleted: false,
      steppedAwayEarly: false,
      timestamp: 'Just now',
    };

    // Save to database if Prisma is connected
    if (userId) {
      prisma.pauseMessage
        .create({
          data: {
            senderId: companion.id,
            receiverId: userId,
            title: newPause.title,
            note: newPause.note,
            durationSeconds: newPause.durationSeconds,
            tag: newPause.tag,
          },
        })
        .catch(() => {});
    }

    // Save to in-memory messages for 15-day inbox persistence
    addInboxMessage(newPause);

    // Broadcast live over WebSockets ONLY to the requesting user (no global broadcast)
    if (io && userId) {
      const cleanUser = String(userId).trim().toLowerCase();
      io.to(userId).emit('new_pause_received', newPause);
      io.to(cleanUser).emit('new_pause_received', newPause);
      io.to(cleanUser.replace('@', '')).emit('new_pause_received', newPause);
    }

    return res.status(201).json(newPause);
  } catch (error) {
    console.error('Error generating daily companion pause:', error);
    return res.status(500).json({ error: 'Failed to generate daily companion pause' });
  }
};

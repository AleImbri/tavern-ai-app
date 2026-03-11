import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { GAME_CONSTANTS } from '@/lib/constants';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SUMMARIZER_PROMPT = `You are a game state summarizer. Combine the existing summary with these old messages into a new concise summary under ${GAME_CONSTANTS.MEMORY.MAX_SUMMARY_WORDS} words. Keep important lore and facts.`;

const MASTER_PROMPT = `You are an expert Dungeon Master. You will receive a JSON payload with: S_t (Current Character State including full stats and inventory), R_t (Long-Term Summary), W_t (Recent conversation history), and U_t (User action). Output a JSON strictly containing "message" (the narrative) and "state_updates" (mutations). Narrative MUST be written in ${GAME_CONSTANTS.DM_BEHAVIOR.GAME_LANGUAGE}. Keep narrative under ${GAME_CONSTANTS.DM_BEHAVIOR.MAX_RESPONSE_WORDS} words. Balance brevity with epic storytelling.`;

export async function POST(req: NextRequest) {
    try {
        const { history, message, summary, character } = await req.json();

        if (!message || !character) {
            return NextResponse.json({ error: 'Message and character state are required' }, { status: 400 });
        }

        // --- 1. Rolling Summary Logic --- //
        let activeHistory = history || [];
        let currentSummary = summary || "";
        let summarizedMessageIds: string[] = [];

        // Filter out already summarized messages from the local active context (W_t)
        activeHistory = activeHistory.filter((msg: any) => !msg.isSummarized);

        if (activeHistory.length >= GAME_CONSTANTS.MEMORY.MAX_SHORT_TERM_MESSAGES) {
            const numToSummarize = Math.ceil(activeHistory.length * GAME_CONSTANTS.MEMORY.PERCENTAGE_TO_SUMMARIZE);
            const messagesToSummarize = activeHistory.slice(0, numToSummarize);
            
            // Extract IDs to pass back to the client for marking `isSummarized: true`
            summarizedMessageIds = messagesToSummarize.map((m: any) => m.id).filter(Boolean);

            const summarizerModel = genAI.getGenerativeModel({
                model: GAME_CONSTANTS.MODELS.SUMMARIZER,
                systemInstruction: SUMMARIZER_PROMPT,
            });

            const summaryPayload = `
EXISTING SUMMARY:
${currentSummary ? currentSummary : "None"}

OLD MESSAGES TO SUMMARIZE:
${messagesToSummarize.map((m: any) => `${m.role.toUpperCase()}: ${m.parts[0].text}`).join("\n\n")}
            `;

            const summaryResult = await summarizerModel.generateContent(summaryPayload);
            currentSummary = summaryResult.response.text();

            // Mutate W_t by slicing off the newly summarized slice
            activeHistory = activeHistory.slice(numToSummarize);
        } // --- End Rolling Summary --- //


        // --- 2. Build S_t (Character & Inventory) --- //
        const S_t = {
            character_sheet: {
                name: character.name,
                race: character.race,
                class: character.class,
                level: character.level,
                xp: character.xp,
                hp: character.currentHp,
                maxHp: character.maxHp,
                armorClass: character.stats.destrezza >= 10 
                    ? 10 + Math.floor((character.stats.destrezza - 10) / 2) 
                    : 10 - Math.ceil((10 - character.stats.destrezza) / 2),
                stats: character.stats,
                appearance: character.physicalDesc,
                backstory: character.background,
            },
            inventory: {
                coins: character.coins,
                items: character.inventory,
            }
        };

        // --- 3. Master Execution --- //
        const masterModel = genAI.getGenerativeModel({
            model: GAME_CONSTANTS.MODELS.MASTER,
            systemInstruction: MASTER_PROMPT,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        // W_t mapping formatting
        const W_t = activeHistory.map((m: any) => ({ role: m.role, content: m.parts[0].text }));

        const generatePayload = JSON.stringify({
            S_t: S_t,
            R_t: currentSummary,
            W_t: W_t,
            U_t: message
        });

        const result = await masterModel.generateContent(generatePayload);
        const responseText = result.response.text();

        return NextResponse.json({ 
            response: responseText, 
            newSummary: currentSummary,
            summarizedMessageIds: summarizedMessageIds
        });

    } catch (error) {
        console.error('Error in chat API route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

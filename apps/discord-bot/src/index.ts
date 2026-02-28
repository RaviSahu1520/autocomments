import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const ALLOWED_GUILD_IDS = (process.env.ALLOWED_GUILD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_CHANNEL_IDS = (process.env.ALLOWED_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const INCLUDE_KEYWORDS = (process.env.INCLUDE_KEYWORDS || 'rent,buy,flat,apartment,bhk,pg,property').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is required. Set it in .env');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, (c) => {
    console.log(`✅ Discord bot connected as ${c.user.tag}`);
    console.log(`   Watching ${ALLOWED_GUILD_IDS.length || 'all'} guilds, ${ALLOWED_CHANNEL_IDS.length || 'all'} channels`);
    console.log(`   Keywords: ${INCLUDE_KEYWORDS.join(', ')}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore bots
    if (message.author.bot) return;

    // Check guild filter
    if (ALLOWED_GUILD_IDS.length > 0 && message.guild) {
        if (!ALLOWED_GUILD_IDS.includes(message.guild.id)) return;
    }

    // Check channel filter
    if (ALLOWED_CHANNEL_IDS.length > 0) {
        if (!ALLOWED_CHANNEL_IDS.includes(message.channel.id)) return;
    }

    // Keyword pre-filter
    const content = message.content.toLowerCase();
    const hasKeyword = INCLUDE_KEYWORDS.some(kw => content.includes(kw));
    if (!hasKeyword) return;

    console.log(`[Discord] Match: "${message.content.substring(0, 80)}..." from ${message.author.username}`);

    // Build message URL
    const messageUrl = message.guild
        ? `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`
        : `discord://message/${message.id}`;

    // Send to backend
    const opportunity = {
        source: 'discord',
        source_id: message.id,
        source_url: messageUrl,
        title: '',
        content: message.content,
        author: message.author.username,
        created_at_source: message.createdAt.toISOString(),
        engagement: {
            comments: 0,
        },
        raw: {
            guild_id: message.guild?.id || '',
            guild_name: message.guild?.name || '',
            channel_id: message.channel.id,
            channel_name: 'name' in message.channel ? message.channel.name : '',
            author_id: message.author.id,
            message_id: message.id,
        },
    };

    try {
        const res = await fetch(`${BACKEND_URL}/api/discord/opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opportunity),
        });

        if (!res.ok) {
            console.error(`[Discord] Backend error: ${res.status} ${await res.text()}`);
        } else {
            const result = await res.json() as any;
            console.log(`[Discord] Sent to backend: ${result.status} (id: ${result.id})`);
        }
    } catch (err) {
        console.error('[Discord] Failed to send to backend:', err);
    }
});

client.login(DISCORD_TOKEN);

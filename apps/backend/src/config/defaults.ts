import type { AppConfig } from '../types.js';

export const defaultConfig: AppConfig = {
    include_keywords: [
        // General real estate
        'rent', 'buy', 'lease', '2bhk', '3bhk', '1bhk', '4bhk',
        'pg', 'paying guest', 'office space', 'coworking',
        'investment', 'property', 'flat', 'apartment',
        'villa', 'plot', 'house', 'real estate',
        'broker', 'owner', 'tenant', 'landlord',
        'society', 'builder', 'possession', 'rera',
        'home loan', 'emi', 'carpet area', 'super built up',
        // NCR-specific
        'sector', 'dlf', 'sohna', 'golf course road', 'metro',
        'new gurgaon', 'dwarka expressway', 'nh8', 'spr',
        'southern peripheral road', 'cyber city', 'udyog vihar',
        'manesar', 'greater noida', 'noida extension',
    ],
    exclude_keywords: [
        'meme', 'joke', 'lol', 'haha', 'shitpost',
        'crypto', 'stock market', 'nft', 'bitcoin',
    ],
    locations: {
        gurugram: [
            'sector 49', 'sector 57', 'sector 82', 'sector 56', 'sector 67',
            'golf course road', 'sohna road', 'mg road', 'dlf phase 1',
            'dlf phase 2', 'dlf phase 3', 'dlf phase 4', 'dlf phase 5',
            'udyog vihar', 'cyber city', 'manesar', 'palam vihar',
            'dwarka expressway', 'new gurgaon', 'sushant lok',
            'south city', 'nirvana country',
        ],
        delhi: [
            'dwarka', 'rohini', 'saket', 'south delhi', 'vasant kunj',
            'janakpuri', 'rajouri garden', 'lajpat nagar', 'connaught place',
            'greater kailash', 'hauz khas', 'pitampura', 'paschim vihar',
        ],
        noida: [
            'sector 62', 'sector 137', 'sector 150', 'sector 75', 'sector 76',
            'greater noida', 'noida extension', 'gaur city', 'jaypee greens',
        ],
        faridabad: [
            'sector 15', 'sector 21', 'ballabgarh', 'neharpar',
            'sector 86', 'sector 88',
        ],
        ghaziabad: [
            'indirapuram', 'vaishali', 'raj nagar extension',
            'crossing republik', 'kaushambi',
        ],
    },
    reddit: {
        enabled: true,
        subreddits: ['gurgaon', 'delhi', 'noida', 'indianrealestate'],
        search_queries: [
            'flat rent gurgaon',
            '2BHK buy noida',
            'PG accommodation delhi NCR',
            'property gurugram',
            'rent apartment golf course road',
        ],
        poll_interval_minutes: 5,
    },
    discord: {
        enabled: false,
        bot_token: '',
        allowed_guild_ids: [],
        allowed_channel_ids: [],
    },
    quora: {
        enabled: true,
        manual_submission_enabled: true,
    },
    scoring: {
        weights: {
            intent: 0.35,
            freshness: 0.15,
            engagement: 0.15,
            source: 0.15,
            keyword: 0.20,
        },
        threshold: 30,
        source_weights: {
            reddit: 80,
            discord: 70,
            quora: 90,
        },
    },
    notifications: {
        slack_webhook_url: '',
        smtp: {
            host: '',
            port: 587,
            user: '',
            pass: '',
            from: '',
        },
        email_to: '',
    },
    brand: {
        company_name: 'YourRealEstateCo',
        base_landing_url: 'https://yoursite.com',
        supported_areas: ['gurugram', 'delhi', 'noida', 'faridabad', 'ghaziabad'],
        tone: 'Friendly, knowledgeable, helpful. Like a neighbor who happens to know real estate well.',
        use_hinglish: false,
        forbidden_claims: [
            'guaranteed returns',
            'best price ever',
            '100% safe investment',
            'prices will definitely go up',
        ],
    },
    do_not_engage: {
        subreddits: [],
        channels: [],
        keywords: ['politics', 'religion', 'caste', 'communal'],
    },
};

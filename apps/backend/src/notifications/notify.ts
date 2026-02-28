import type { OpportunityItem, AppConfig } from '../types.js';

/**
 * Send notifications for new pending opportunities.
 */
export async function sendNotification(
    opportunityId: string,
    item: OpportunityItem,
    score: number,
    config: AppConfig
): Promise<void> {
    const promises: Promise<void>[] = [];

    if (config.notifications.slack_webhook_url) {
        console.log(`[Notify] Sending Slack notification for opportunity ${opportunityId}...`);
        promises.push(sendSlackNotification(opportunityId, item, score, config));
    }

    if (config.notifications.smtp.host && config.notifications.smtp.user && config.notifications.email_to) {
        console.log(`[Notify] Sending email notification to ${config.notifications.email_to} for opportunity ${opportunityId}...`);
        promises.push(sendEmailNotification(opportunityId, item, score, config));
    }

    if (promises.length > 0) {
        const results = await Promise.allSettled(promises);
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error('[Notify] Notification failed:', result.reason);
            }
        }
        console.log(`[Notify] ${promises.length} notification(s) dispatched for opportunity ${opportunityId}`);
    } else {
        console.warn('[Notify] No notification channels configured — skipping notification for opportunity ' + opportunityId);
    }
}

async function sendSlackNotification(
    opportunityId: string,
    item: OpportunityItem,
    score: number,
    config: AppConfig
): Promise<void> {
    try {
        const port = process.env.PORT || 3000;
        const approvalUrl = `http://localhost:${port}/opportunity/${opportunityId}`;

        const payload = {
            text: `🏠 New Real Estate Lead (Score: ${score}/100)`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*🏠 New Lead from ${item.source}* (Score: ${score}/100)\n*Title:* ${item.title || '(no title)'}\n*Author:* ${item.author}\n${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '👀 Review' },
                            url: approvalUrl,
                        },
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '🔗 Source' },
                            url: item.source_url,
                        },
                    ],
                },
            ],
        };

        await fetch(config.notifications.slack_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('[Slack] Notification error:', err);
    }
}

async function sendEmailNotification(
    opportunityId: string,
    item: OpportunityItem,
    score: number,
    config: AppConfig
): Promise<void> {
    try {
        // Dynamic import to avoid requiring nodemailer if not used
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
            host: config.notifications.smtp.host,
            port: config.notifications.smtp.port,
            secure: config.notifications.smtp.port === 465,
            auth: {
                user: config.notifications.smtp.user,
                pass: config.notifications.smtp.pass,
            },
        });

        const port = process.env.PORT || 3000;
        await transporter.sendMail({
            from: config.notifications.smtp.from,
            to: config.notifications.email_to,
            subject: `🏠 New Lead (Score: ${score}) - ${item.title || item.source}`,
            html: `
        <h2>New Real Estate Lead</h2>
        <p><strong>Source:</strong> ${item.source}</p>
        <p><strong>Score:</strong> ${score}/100</p>
        <p><strong>Title:</strong> ${item.title || '(no title)'}</p>
        <p><strong>Author:</strong> ${item.author}</p>
        <p><strong>Content:</strong> ${item.content.substring(0, 500)}</p>
        <p><a href="http://localhost:${port}/opportunity/${opportunityId}">Review in Dashboard →</a></p>
        <p><a href="${item.source_url}">View Original →</a></p>
      `,
        });
    } catch (err) {
        console.error('[Email] Notification error:', err);
    }
}

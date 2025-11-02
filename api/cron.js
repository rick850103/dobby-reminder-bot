import { Redis } from '@upstash/redis';
import { Client } from '@line/bot-sdk';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// 這支是「提醒時間到了，主動推訊息」的 API
// 將來我們用免費的外部 cron/ping 服務來每分鐘打這支
export default async function handler(req, res) {
  try {
    const nowMs = Date.now();

    // 拿所有人的 reminders:* 清單
    const allKeys = await redis.keys('reminders:*');

    for (const listKey of allKeys) {
      const userId = listKey.split(':')[1];

      // 把已經到時間的提醒都拿出來
      const dueTasks = await redis.zrangebyscore(listKey, 0, nowMs);

      if (dueTasks.length === 0) continue;

      // 對這個 userId 發 LINE push 訊息
      for (const task of dueTasks) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `⏰ 提醒：${task}`,
        });
      }

      // 刪掉已經提醒過的（避免重複噹）
      await redis.zremrangebyscore(listKey, 0, nowMs);
    }

    res.status(200).send('cron ok');
  } catch (err) {
    console.error('cron error', err);
    res.status(500).send('cron error');
  }
}

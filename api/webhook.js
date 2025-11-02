import { Redis } from '@upstash/redis';
import { Client } from '@line/bot-sdk';
import * as chrono from 'chrono-node';

// 連接 Redis（雲端記事本）
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 連接 LINE Bot，用來回訊息
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  try {
    // LINE 的 webhook 只會用 POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const events = req.body.events || [];

    // 處理每一個 event（訊息、加好友等等）
    for (const event of events) {
      // 我們只管文字訊息
      if (event.type === 'message' && event.message?.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;
        const replyToken = event.replyToken;

        // 嘗試把訊息解析成提醒
        const parsed = parseReminder(userText);

        // 如果解析不出時間，就教用戶怎麼講
        if (!parsed) {
          await replyText(replyToken,
            "我可以幫你記提醒唷 🙋\n試試說：\n「明天晚上8點提醒我帶藥」\n「週五下午3點叫我傳報告」"
          );
          continue;
        }

        // 時間（毫秒）當成排序用的 score
        const remindAtMs = parsed.time.getTime();
        const listKey = `reminders:${userId}`;

        // 存進 Redis 的 sorted set，之後 cron 會掃這個列表
        await redis.zadd(listKey, {
          score: remindAtMs,
          member: parsed.task,
        });

        // 回覆使用者設定成功
        await replyText(
          replyToken,
          [
            "✅ 提醒已記下！",
            `🕓 時間：${formatTimeForHuman(parsed.time)}`,
            `📌 內容：${parsed.task}`,
            "",
            "到時間我會主動傳訊息提醒你 ⏰",
          ].join('\n')
        );
      }
    }

    // 告訴 LINE：我們處理好了
    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error', err);
    // 告訴 LINE：我們出錯（LINE 會重送，所以沒關係）
    res.status(500).send('Error');
  }
}

// 正確的回覆 helper：replyToken 是字串，messages 是陣列
async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken,
    messages: [
      { type: 'text', text },
    ],
  });
}

// 把使用者的句子像「明天晚上8點提醒我帶藥」→ 解析出時間 + 內容
function parseReminder(text) {
  // chrono 會找文字裡的「時間」片段
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (!results || results.length === 0) return null;

  const best = results[0];
  const time = best.date(); // 轉成 Date 物件

  // 從原句子裡扣掉解析到的時間這一段，剩下的就是任務內容
  const timeText = text.slice(best.index, best.index + best.text.length);

  let task = text.replace(timeText, '');
  // 清掉「提醒我/叫我/幫我/...」這些口語字
  task = task.replace(/(提醒我|叫我|幫我|提醒一下|記得|提醒|一下)/g, '');
  task = task.trim();

  if (!task) {
    task = '提醒事項';
  }

  return { time, task };
}

// 讓時間顯示漂亮一點
function formatTimeForHuman(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mi = String(dateObj.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

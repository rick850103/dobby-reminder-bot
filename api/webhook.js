import { Redis } from '@upstash/redis';
import { Client } from '@line/bot-sdk';
import * as chrono from 'chrono-node';

// 連接 Redis（我們等一下會把 URL/TOKEN 放在 Vercel 環境變數）
// 這裡不要手動寫死，把秘密放環境變數才安全
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 連接 LINE Bot
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// LINE 的 webhook 會 POST 訊息到這支 API
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const events = req.body.events || [];

    for (const event of events) {
      // 我們只處理使用者傳來的文字訊息
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userText = event.message.text;

        // 用 chrono-node 試著讀時間
        const parsed = parseReminder(userText);

        if (!parsed) {
          // 如果聽不懂，就教他怎麼講
          await replyText(
            event.replyToken,
            "我可以幫你記提醒唷 🙋\n試試說：\n「明天晚上8點提醒我帶藥」\n「週五下午3點叫我傳報告」"
          );
          continue;
        }

        // 把提醒存進 Redis，用 sorted set 依時間排序
        const remindAtMs = parsed.time.getTime();
        const listKey = `reminders:${userId}`;

        await redis.zadd(listKey, {
          score: remindAtMs,
          member: parsed.task,
        });

        // 回覆使用者，確認已經記下了
        await replyText(
          event.replyToken,
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

    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).send('Error');
  }
}

// 回覆當下這句訊息（不是推播，是直接回覆）
async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

// 把自然語言轉成 {time: Date, task: string}
function parseReminder(text) {
  // forwardDate: true = 如果沒講日期，就抓最近的未來（避免抓到過去）
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (!results || results.length === 0) return null;

  const best = results[0];
  const time = best.date(); // Date 物件

  // 把時間這一段文字拿掉，剩下的就是任務內容
  const timeText = text.slice(best.index, best.index + best.text.length);
  let task = text.replace(timeText, '');

  // 清除常見垃圾詞
  task = task.replace(/(提醒我|叫我|記得|幫我|提醒一下|提醒|一下)/g, '');
  task = task.trim();

  if (!task) {
    task = '提醒事項';
  }

  return { time, task };
}

// 把 Date 轉成人看得懂的文字
function formatTimeForHuman(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mi = String(dateObj.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

import { Client } from '@line/bot-sdk';

// 用環境變數的 token 連到 LINE
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// 主入口：LINE 會 POST 到這裡
export default async function handler(req, res) {
  try {
    // 只允許 POST，其他的直接擋掉
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // LINE 送來的事件列表
    const events = req.body?.events || [];

    // 逐一處理事件
    for (const event of events) {
      // 我們只處理使用者傳來的文字訊息
      if (event.type === 'message' && event.message?.type === 'text') {
        const replyToken = event.replyToken;
        const userText = event.message.text || '';

        // 統一回一段簡單文字
        await replyText(replyToken, `我在這 👋\n你剛剛說：「${userText}」`);
      }
    }

    // 回 200 給 LINE，代表「我收到了，不要重送」
    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error', err);
    // 出錯就回 500
    res.status(500).send('Error');
  }
}

// 小工具：用 replyToken 回訊息給用戶
async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: 'text',
        text,
      },
    ],
  });
}

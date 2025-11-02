// api/webhook.js
import { Client } from '@line/bot-sdk';

// 連到 LINE，等一下要用它回訊息
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// 告訴 Vercel：這支函式只跑在「Edge Function」以外的 Node runtime
// （避免某些平台差異，這是保險用，但不加通常也沒關係）
// export const config = {
//   runtime: 'nodejs18.x',
// };

export default async function handler(req, res) {
  try {
    // LINE webhook 只會用 POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // LINE 會把所有事件丟在 body.events 這個陣列裡
    const events = req.body.events || [];

    // 我們逐一處理
    for (const event of events) {
      // 只處理「使用者傳文字訊息」這種情況
      if (event.type === 'message' && event.message?.type === 'text') {
        const replyToken = event.replyToken;

        // 回一句固定文字，先證明 webhook 正常能回
        await replyText(replyToken, `我在這 👋\n你剛剛說的是：「${event.message.text}」`);
      }
    }

    // 告訴 LINE：我收到了，別重送
    res.status(200).send('OK');
  } catch (err) {
    console.error('webhook error', err);
    // 出錯就回 500，讓我們在 log 看到
    res.status(500).send('Error');
  }
}

// 幫你把訊息回給使用者的 helper
async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken, // 必須是字串
    messages: [
      {
        type: 'text',
        text, // 回覆內容
      },
    ],
  });
}

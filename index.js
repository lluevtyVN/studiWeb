const mineflayer = require("mineflayer");
const { Vec3 } = require('vec3');
const n = require("./new.js");
const bot = mineflayer.createBot({
  host: "lluevtyB.aternos.me",
  port: 44038,
  username: "Nhingi",
  version: "1.20.1",
  auth: "offline",
});

let farming = false;  
let farmingInterval = null;

bot.once('spawn', () => {
  console.log('Bot đã vào server!');

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    if (message === '!bot 1') {
      if (!farming) {
        farming = true;
        startFarming();
        bot.chat('Bắt đầu đặt đập block!');
      } else {
        bot.chat('Đang đặt đập rồi!');
      }
    }

    if (message === '!bot 0') {
      if (farming) {
        farming = false;
        stopFarming();
        bot.chat('Đã dừng đặt đập block.');
      } else {
        bot.chat('Chưa có hoạt động.');
      }
    }

    if (message === '!bot sleep') {
      trySleep();
    }
  });
});

// Hàm bắt đầu đặt và đập liên tục
function startFarming() {
  farmingInterval = setInterval(async () => {
    try {
      const blockName = 'dirt'; 

      const item = bot.inventory.items().find(item => item.name === blockName);
      if (!item) {
        bot.chat(`Không có block "${blockName}" để đặt!`);
        farming = false;
        stopFarming();
        return;
      }

      await bot.equip(item, 'hand');

      const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 1));
      if (!referenceBlock) {
        console.log('Không có block dưới chân để tham chiếu.');
        return;
      }

      await bot.placeBlock(referenceBlock, new Vec3(0, 1, 1));
      console.log('Đã đặt block.');

      await bot.waitForTicks(40); 

      const blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 1));
      if (blockAbove && blockAbove.name === blockName) {
        await bot.dig(blockAbove);
        console.log('Đã đập block.');
      } else {
        console.log('Không tìm thấy block để đập.');
      }
    } catch (err) {
      console.log('Lỗi trong quá trình đặt/đập:', err);
    }
  }, 2500); 
}

// Hàm dừng đặt đập
function stopFarming() {
  if (farmingInterval) {
    clearInterval(farmingInterval);
    farmingInterval = null;
  }
}

// Hàm tìm giường và cố gắng ngủ hoặc set spawn
async function trySleep() {
  const bed = bot.findBlock({
    matching: block => block.name.includes('bed'),
    maxDistance: 4
  });

  if (!bed) {
    bot.chat('Không tìm thấy giường gần đây!');
    return;
  }

  try {
    await bot.sleep(bed);
    bot.chat('Đã ngủ thành công!');
  } catch (err) {
    if (err.message.includes('You can only sleep at night')) {
      bot.chat('Trời sáng, không thể ngủ. Đang ấn giường để set spawn...');
      try {
        await bot._genericPlace(bed, new Vec3(0, 1, 0), { forceLook: true }); 
        bot.chat('Đã set spawn thành công!');
      } catch (clickErr) {
        bot.chat('Không thể set spawn: ' + clickErr.message);
      }
    } else {
      bot.chat('Lỗi khi ngủ: ' + err.message);
    }
  }
}

bot.on('error', (err) => {
  console.log('Bot bị lỗi:', err);
});

bot.on('end', () => {
  console.log('Bot đã bị ngắt kết nối.');
});


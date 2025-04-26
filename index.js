const mineflayer = require("mineflayer");
const { Vec3 } = require('vec3');

const bot = mineflayer.createBot({
  host: "lluevtyB.aternos.me",
  port: 44038,
  username: "Nhingi",
  version: "1.20.1",
  auth: "offline",
});

let farming = false;
let farmingInterval = null;
const BLOCK_NAME = 'dirt'; // Block cần đặt và đập

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
        bot.chat('Đang hoạt động rồi!');
      }
    }

    if (message === '!bot 0') {
      if (farming) {
        farming = false;
        stopFarming();
        bot.chat('Đã dừng hoạt động.');
      } else {
        bot.chat('Chưa có hoạt động nào để dừng.');
      }
    }

    if (message === '!bot sleep') {
      trySleep();
    }
  });
});

// Hàm bắt đầu đặt đập liên tục
async function startFarming() {
  farmingInterval = setInterval(async () => {
    try {
      const item = bot.inventory.items().find(i => i.name === BLOCK_NAME);
      if (!item) {
        bot.chat(`Không có block "${BLOCK_NAME}" để đặt.`);
        stopFarming();
        return;
      }

      await bot.equip(item, 'hand');

      const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 1));
      if (!referenceBlock || referenceBlock.name === 'air') {
        console.log('Không có block tham chiếu dưới chân.');
        return;
      }

      // Đặt block tại vị trí đã xác định
      try{
        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 1));
      } catch (err){
        
      }
      console.log('Đã đặt block.');

      // Đợi để block được đặt, sau đó đập
      const placedBlock = bot.blockAt(bot.entity.position.offset(0, 1, 1));
      if (placedBlock && placedBlock.name === BLOCK_NAME) {
        await bot.dig(placedBlock);
        console.log('Đã đập block.');
      } else {
        console.log('Không tìm thấy block để đập.');
      }

    } catch (err) {
      console.log('Lỗi khi đặt/đập:', err.message);
    }
  }, 2500); // Đặt lại sau mỗi 2.5s
}

// Dừng hoạt động đặt đập
function stopFarming() {
  clearInterval(farmingInterval);
  farmingInterval = null;
}

// Hàm tìm giường và ngủ/set spawn
async function trySleep() {
  const bed = bot.findBlock({ matching: block => block.name.includes('bed'), maxDistance: 4 });

  if (!bed) {
    bot.chat('Không tìm thấy giường gần đây!');
    return;
  }

  try {
    await bot.sleep(bed);
    bot.chat('Đã ngủ thành công!');
  } catch (err) {
    if (err.message.includes('You can only sleep at night')) {
      bot.chat('Trời sáng, đang ấn giường để set spawn...');
      try {await bot._genericPlace(bed, new Vec3(0, 1, 0), { forceLook: true });
        bot.chat('Đã set spawn thành công!');
      } catch (clickErr) {
        bot.chat('Không thể set spawn: ' + clickErr.message);
      }
    } else {
      bot.chat('Lỗi khi ngủ: ' + err.message);
    }
  }
}

bot.on('error', err => console.log('Bot lỗi:', err.message));
bot.on('end', () => console.log('Bot đã ngắt kết nối.'));

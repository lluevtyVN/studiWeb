const mineflayer = require("mineflayer");
const { Vec3 } = require("vec3");

const bot = mineflayer.createBot({
  host: "lluevtyB.aternos.me",
  port: 44038,
  username: "Nhingi",
  version: "1.20.1",
  auth: "offline",
});

let farming = false;
let farmingInterval = null;
let wandering = false;
let wanderingInterval = null;
let isDigging = false; // Biến để theo dõi trạng thái đào
const BLOCK_NAME = "dirt"; // Block cần đặt và đập
const PLACE_INTERVAL = 4000; // Tăng thời gian giữa các lần đặt/đập để giảm tải server (ms)
const WANDER_RANGE = 4; // Phạm vi di chuyển (block)
const JUMP_INTERVAL_MIN = 3000; // Thời gian tối thiểu giữa các lần nhảy (ms)
const JUMP_INTERVAL_MAX = 5000; // Thời gian tối đa giữa các lần nhảy (ms)
const MAX_RETRIES = 2; // Số lần thử lại khi đặt block thất bại

bot.once("spawn", () => {
  console.log("Bot đã vào server!");
  startWandering(); // Bắt đầu wandering ngay khi spawn

  bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    if (message === "!bot 1") {
      if (!farming) {
        farming = true;
        stopWandering(); // Dừng wandering khi bắt đầu farming
        startFarming();
        bot.chat("Bắt đầu đặt và đập block!");
      } else {
        bot.chat("Bot đang hoạt động rồi!");
      }
    } else if (message === "!bot 0") {
      if (farming) {
        farming = false;
        stopFarming();
        startWandering(); // Tiếp tục wandering sau khi dừng farming
        bot.chat("Đã dừng hoạt động.");
      } else {
        bot.chat("Chưa có hoạt động nào để dừng.");
      }
    } else if (message === "!bot sleep") {
      stopWandering(); // Dừng wandering khi ngủ
      await trySleep();
      startWandering(); // Tiếp tục wandering sau khi ngủ
    }
  });

  // Theo dõi trạng thái đào
  bot.on("diggingStarted", () => {
    isDigging = true;
  });
  bot.on("diggingCompleted", () => {
    isDigging = false;
  });
  bot.on("diggingAborted", () => {
    isDigging = false;
  });
});

// Hàm bắt đầu đặt và đập block liên tục
async function startFarming() {
  farmingInterval = setInterval(async () => {
    if (!farming || isDigging) return; // Bỏ qua nếu đang đào hoặc không hoạt động

    try {
      // Tìm item trong inventory
      const item = bot.inventory.items().find((i) => i.name === BLOCK_NAME);
      if (!item) {
        bot.chat(`Không có block "${BLOCK_NAME}" trong inventory.`);
        stopFarming();
        startWandering(); // Tiếp tục wandering nếu hết item
        return;
      }

      // Trang bị item
      await bot.equip(item, "hand");

      // Tìm block tham chiếu (dưới chân bot, phía trước 1 block)
      const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 1));
      if (!referenceBlock || referenceBlock.name === "air" || !referenceBlock.boundingBox) {
        console.log("Block tham chiếu không hợp lệ (air hoặc không rắn).");
        return;
      }

      // Kiểm tra vị trí đặt block
      const placePos = referenceBlock.position.plus(new Vec3(0, 1, 0));
      const blockAtPlacePos = bot.blockAt(placePos);
      if (blockAtPlacePos && blockAtPlacePos.name !== "air") {
        console.log("Vị trí đặt block đã có block khác.");
        return;
      }

      // Thử đặt block với cơ chế retry
      let placed = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
          console.log(`Đã đặt block ${BLOCK_NAME} (thử ${attempt}).`);
          placed = true;
          break;
        } catch (err) {
          console.error(`Thử ${attempt} thất bại: ${err.message}`);
          if (attempt === MAX_RETRIES) {
            console.log("Hết số lần thử, bỏ qua đặt block.");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Chờ trước khi thử lại
        }
      }

      if (!placed) return;

      // Chờ và kiểm tra block vừa đặt
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Tăng thời gian chờ server
      const placedBlock = bot.blockAt(placePos);

      if (placedBlock && placedBlock.name === BLOCK_NAME) {
        isDigging = true; // Đánh dấu trạng thái đào
        await bot.dig(placedBlock);
        console.log(`Đã đập block ${BLOCK_NAME}.`);
      } else {
        console.log("Không tìm thấy block vừa đặt để đập.");
      }
    } catch (err) {
      console.error("Lỗi trong quá trình đặt/đập:", err.message);
    }
  }, PLACE_INTERVAL);
}

// Dừng hoạt động đặt/đập
function stopFarming() {
  if (farmingInterval) {
    clearInterval(farmingInterval);
    farmingInterval = null;
  }
  farming = false;
}

// Hàm bắt đầu di chuyển và nhảy vòng vòng
function startWandering() {
  if (wandering || farming) return; // Không chạy nếu đang wandering hoặc farming
  wandering = true;

  const startPos = bot.entity.position.clone(); // Lưu vị trí ban đầu

  wanderingInterval = setInterval(async () => {
    if (!wandering || farming || isDigging) return; // Bỏ qua nếu đang đào, farming hoặc không wandering

    try {
      // Chọn hướng di chuyển ngẫu nhiên
      const directions = [
        new Vec3(1, 0, 0), // Phải
        new Vec3(-1, 0, 0), // Trái
        new Vec3(0, 0, 1), // Tiến
        new Vec3(0, 0, -1), // Lùi
      ];
      const direction = directions[Math.floor(Math.random() * directions.length)];

      // Tính vị trí mới
      const newPos = bot.entity.position.plus(direction);
      const distance = newPos.distanceTo(startPos);

      // Kiểm tra giới hạn phạm vi 4 block
      if (distance > WANDER_RANGE) {
        console.log("Đạt giới hạn phạm vi, bỏ qua di chuyển.");
        return;
      }

      // Kiểm tra block dưới chân tại vị trí mới (phải là block rắn)
      const blockBelow = bot.blockAt(newPos.offset(0, -1, 0));
      if (!blockBelow || blockBelow.name === "air" || !blockBelow.boundingBox) {
        console.log("Không phải mặt phẳng, bỏ qua di chuyển.");
        return;
      }

      // Kiểm tra block phía trên (phải là air để di chuyển)
      const blockAtNewPos = bot.blockAt(newPos);
      const blockAbove = bot.blockAt(newPos.offset(0, 1, 0));
      if (blockAtNewPos.name !== "air" || blockAbove.name !== "air") {
        console.log("Đường bị chặn, bỏ qua di chuyển.");
        return;
      }

      // Di chuyển
      bot.setControlState("forward", true);
      bot.lookAt(newPos.offset(0, 1.6, 0)); // Nhìn về vị trí mới
      await new Promise((resolve) => setTimeout(resolve, 500)); // Di chuyển trong 0.5s
      bot.setControlState("forward", false);

      // Nhảy ngẫu nhiên
      if (Math.random() < 0.5) {
        bot.setControlState("jump", true);
        await new Promise((resolve) => setTimeout(resolve, 200));
        bot.setControlState("jump", false);
        console.log("Bot nhảy!");
      }
    } catch (err) {
      console.error("Lỗi khi wandering:", err.message);
    }
  }, Math.floor(Math.random() * (JUMP_INTERVAL_MAX - JUMP_INTERVAL_MIN) + JUMP_INTERVAL_MIN));
}

// Dừng di chuyển vòng vòng
function stopWandering() {
  if (wanderingInterval) {
    clearInterval(wanderingInterval);
    wanderingInterval = null;
  }
  wandering = false;
  bot.setControlState("forward", false);
  bot.setControlState("jump", false);
}

// Hàm tìm giường và ngủ/set spawn
async function trySleep() {
  try {
    const bed = bot.findBlock({
      matching: (block) => block.name.includes("bed"),
      maxDistance: 4,
    });

    if (!bed) {
      bot.chat("Không tìm thấy giường trong phạm vi 4 block!");
      return;
    }

    try {
      await bot.sleep(bed);
      bot.chat("Đã ngủ thành công!");
    } catch (err) {
      if (err.message.includes("You can only sleep at night")) {
        bot.chat("Trời sáng, đang thử set spawn...");
        try {
          await bot.activateBlock(bed); // Thử tương tác với giường để set spawn
          bot.chat("Đã set spawn thành công!");
        } catch (clickErr) {
          bot.chat(`Không thể set spawn: ${clickErr.message}`);
        }
      } else {
        bot.chat(`Lỗi khi ngủ: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("Lỗi khi tìm giường:", err.message);
    bot.chat("Lỗi khi tìm giường!");
  }
}

// Xử lý lỗi và sự kiện
bot.on("error", (err) => console.error("Bot lỗi:", err.message));
bot.on("end", () => {
  console.log("Bot đã ngắt kết nối.");
  stopFarming();
  stopWandering(); // Dừng tất cả hoạt động khi ngắt kết nối
});

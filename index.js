const mineflayer = require("mineflayer");
const { Vec3 } = require("vec3");
const n = require("./new.js"); // Giữ dòng này, đảm bảo new.js tồn tại

let bot = mineflayer.createBot({
  host: "uyuy4174.aternos.me",
  port: 43335,
  username: "Nhingi",
  version: "1.20.1",
  auth: "offline",
});

let farming = false;
let farmingInterval = null;
let wandering = false;
let wanderingInterval = null;
let isDigging = false; // Biến để theo dõi trạng thái đào
let isTryingToSleep = false; // Biến để theo dõi trạng thái tìm giường
const BLOCK_NAME = "dirt"; // Block cần đặt và đập
const PLACE_INTERVAL = 4000; // Thời gian giữa các lần đặt/đập (ms)
const WANDER_RANGE = 4; // Phạm vi di chuyển wandering (block)
const JUMP_INTERVAL_MIN = 3000; // Thời gian tối thiểu giữa các lần nhảy (ms)
const JUMP_INTERVAL_MAX = 5000; // Thời gian tối đa giữa các lần nhảy (ms)
const MAX_RETRIES = 2; // Số lần thử lại khi đặt block thất bại
const SLEEP_RANGE = 3; // Phạm vi tìm giường (±3 block, tương đương 6x6)
const RECONNECT_DELAY = 5000; // Độ trễ giữa các lần thử lại (ms)
const MAX_RECONNECT_ATTEMPTS = 3; // Số lần thử kết nối lại tối đa
let reconnectAttempts = 0; // Đếm số lần thử kết nối lại

// Hàm di chuyển đến vị trí với phá block cỏ/đất cản đường
async function moveToPosition(targetPos) {
  try {
    const currentPos = bot.entity.position.floored();
    const path = [currentPos, targetPos]; // Đơn giản hóa: di chuyển thẳng
    for (const pos of path.slice(1)) {
      const blockAtPos = bot.blockAt(pos);
      const blockAbove = bot.blockAt(pos.offset(0, 1, 0));

      // Phá block cỏ hoặc đất cản đường
      for (const block of [blockAtPos, blockAbove]) {
        if (block && (block.name === "grass" || block.name === "dirt")) {
          console.log(`Phá block ${block.name} tại ${block.position}`);
          isDigging = true;
          await bot.dig(block);
          isDigging = false;
        }
      }

      // Kiểm tra lại sau khi phá
      if (bot.blockAt(pos).name !== "air" || bot.blockAt(pos.offset(0, 1, 0)).name !== "air") {
        console.log("Đường vẫn bị chặn sau khi phá, dừng di chuyển.");
        return false;
      }

      // Di chuyển đến vị trí
      bot.setControlState("forward", true);
      await bot.lookAt(pos.offset(0, 1.6, 0));
      await new Promise((resolve) => setTimeout(resolve, 500));
      bot.setControlState("forward", false);
    }
    return true;
  } catch (err) {
    console.error("Lỗi khi di chuyển:", err.message);
    return false;
  }
}

// Hàm thử kết nối lại server
function reconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log("Đã đạt giới hạn số lần thử kết nối lại, dừng bot.");
    return;
  }

  reconnectAttempts++;
  console.log(`Thử kết nối lại lần ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} sau ${RECONNECT_DELAY/1000}s...`);

  setTimeout(() => {
    bot = mineflayer.createBot({
 host: "uyuy4174.aternos.me",
  port: 43335,
      username: "Nhingi",
      version: "1.20.1",
      auth: "offline",
    });
    setupBotEvents(); // Thiết lập lại các sự kiện cho bot mới
  }, RECONNECT_DELAY);
}

// Thiết lập các sự kiện cho bot
function setupBotEvents() {
  bot.once("spawn", () => {
    console.log("Bot đã vào server!");
    reconnectAttempts = 0; // Đặt lại số lần thử khi kết nối thành công
    startWandering(); // Bắt đầu wandering ngay khi spawn
  });

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

  // Kiểm tra thời gian để tự ngủ khi trời tối
  bot.on("time", async () => {
    // Kiểm tra bot.world và bot.world.time trước khi truy cập worldTime
    if (
      isTryingToSleep ||
      farming ||
      !bot.world ||
      !bot.world.time ||
      bot.world.time.worldTime < 13000 ||
      bot.world.time.worldTime >= 23000
    ) {
      return;
    }

    isTryingToSleep = true;
    stopWandering(); // Dừng wandering để tìm giường
    stopFarming(); // Dừng farming để tìm giường
    console.log("Trời tối, bot đang tìm giường để ngủ...");
    await trySleep();
    isTryingToSleep = false;
    startWandering(); // Tiếp tục wandering sau khi thử ngủ
  });

  // Xử lý khi bị kick
  bot.on("kicked", (reason) => {
    console.log(`Bot bị kick khỏi server: ${reason}`);
    reconnect(); // Thử kết nối lại
  });

  // Xử lý lỗi và ngắt kết nối
  bot.on("error", (err) => console.error("Bot lỗi:", err.message));
  bot.on("end", () => {
    console.log("Bot đã ngắt kết nối.");
    stopFarming();
    stopWandering(); // Dừng tất cả hoạt động khi ngắt kết nối
    reconnect(); // Thử kết nối lại
  });
}

// Thiết lập sự kiện cho bot ban đầu
setupBotEvents();

// Hàm xoay bot 90 độ (ngẫu nhiên trái/phải)
async function rotateBot() {
  try {
    const currentYaw = bot.entity.yaw;
    const turnDirection = Math.random() < 0.5 ? 1 : -1; // Ngẫu nhiên trái/phải
    const newYaw = currentYaw + (Math.PI / 2) * turnDirection; // Xoay 90 độ
    await bot.look(newYaw, bot.entity.pitch);
    console.log("Bot đã xoay 90 độ để thử hướng mới.");
  } catch (err) {
    console.error("Lỗi khi xoay bot:", err.message);
  }
}

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
      const offset = new Vec3(0, -1, 1); // Hướng phía trước
      const referenceBlock = bot.blockAt(bot.entity.position.offset(offset.x, offset.y, offset.z));
      if (!referenceBlock || referenceBlock.name === "air" || !referenceBlock.boundingBox) {
        console.log("Block tham chiếu không hợp lệ (air hoặc không rắn).");
        await rotateBot(); // Xoay bot nếu block tham chiếu không hợp lệ
        return;
      }

      // Kiểm tra vị trí đặt block
      const placePos = referenceBlock.position.plus(new Vec3(0, 1, 0));
      const blockAtPlacePos = bot.blockAt(placePos);
      if (blockAtPlacePos && blockAtPlacePos.name !== "air") {
        console.log("Vị trí đặt block bị chặn bởi block khác.");
        await rotateBot(); // Xoay bot nếu vị trí bị chặn
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
            console.log("Hết số lần thử, xoay bot để thử hướng mới.");
            await rotateBot(); // Xoay bot nếu hết số lần thử
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Chờ trước khi thử lại
        }
    }

    if (!placed) return;

      // Chờ và kiểm tra block vừa đặt
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Tăng thời gian chờ server
      const placedBlock = bot.blockAt(placePos);

      if (placedBlock && placedBlock.name === BLOCK_NAME) {
        isDigging = true; // Đánh dấu trạng thái đào
        await bot.dig(placedBlock);
        console.log(`Đã đập block ${BLOCK_NAME}.`);
      } else {
        console.log("Không tìm thấy block vừa đặt để đập.");
        await rotateBot(); // Xoay bot nếu không tìm thấy block
      }
    } catch (err) {
      console.error("Lỗi trong quá trình đặt/đập:", err.message);
      await rotateBot(); // Xoay bot nếu gặp lỗi
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
  if (wandering || farming || isTryingToSleep) return; // Không chạy nếu đang wandering, farming, hoặc tìm giường	// Kiểm tra block phía trên (phải là air để di chuyển)
      const blockAtNewPos = bot.blockAt(newPos);
      const blockAbove = bot.blockAt(newPos.offset(0, 1, 0));
      if (blockAtNewPos.name !== "air" || blockAbove.name !== "air") {
        console.log("Đường bị chặn, xoay bot.");
        await rotateBot(); // Xoay bot nếu đường bị chặn
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
      await rotateBot(); // Xoay bot nếu gặp lỗi
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

// Hàm tìm giường và ngủ
async function trySleep() {
  try {
    // Tìm giường trong phạm vi 6x6 (±3 block)
    const bed = bot.findBlock({
      matching: (block) => block.name.includes("bed"),
      maxDistance: SLEEP_RANGE,
    });

    if (!bed) {
      bot.chat("Không tìm thấy giường trong phạm vi 6x6!");
      return;
    }

    // Di chuyển đến giường
    const bedPos = bed.position.floored();
    const moved = await moveToPosition(bedPos);
    if (!moved) {
      bot.chat("Không thể di chuyển đến giường!");
      return;
    }

    // Thử ngủ
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

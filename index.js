const mineflayer = require("mineflayer");
const n = require("./new.js");
const bot = mineflayer.createBot({
  host: "lluevtyB.aternos.me",
  port: 44038,
  username: "Nhingi",
  version: "1.20.1",
  auth: "offline",
});

// Khi bot đăng nhập
bot.on("login", () => {
  console.log("Đã đăng nhập!");
  bot.chat("Hello, mình là bot!");
});

// Tự động nhảy tại chỗ
bot.on("spawn", () => {
  setInterval(() => {
    bot.setControlState("jump", true);
    setTimeout(() => bot.setControlState("jump", false), 500);
  }, 3000);
});

// Khi bot bị kick hoặc lỗi
bot.on("kicked", (reason) => console.log("Bị kick:", reason));
bot.on("error", (err) => console.log("Lỗi:", err));

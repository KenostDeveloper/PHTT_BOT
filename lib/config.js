"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");

/** Читает переменную окружения, при отсутствии — значение по умолчанию. */
function env(name, fallback = undefined) {
    const value = process.env[name];
    if (value === undefined || value.trim() === "") return fallback;
    return value.trim();
}

function envBool(name, fallback = false) {
    const value = env(name);
    if (value === undefined) return fallback;
    return ["1", "true", "yes", "on", "да"].includes(value.toLowerCase());
}

function envInt(name, fallback) {
    const value = Number(env(name));
    return Number.isFinite(value) ? value : fallback;
}

function envFloat(name, fallback) {
    const value = Number(env(name));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Ищет каталог с бинарниками poppler (pdftocairo/pdftoppm/pdfinfo).
 * Нужен, потому что на Linux это /usr/bin, а на macOS — /usr/local/bin
 * или /opt/homebrew/bin.
 */
function detectPopplerPath() {
    const configured = env("POPPLER_PATH");
    if (configured) return configured;

    const candidates = [
        "/usr/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/local/bin",
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, "pdftocairo"))) return dir;
    }
    // Пусть node-poppler сам ищет бинарники в PATH.
    return undefined;
}

const BOT_TOKEN = env("BOT_TOKEN");
if (!BOT_TOKEN) {
    console.error(
        "BOT_TOKEN не задан. Скопируйте .env.example в .env и заполните значения.",
    );
    process.exit(1);
}

/** Описание корпусов: чат для рассылки + публичный канал для перекрёстных ссылок. */
const CORPUSES = [
    {
        id: "1",
        title: "1 корпус",
        chatId: env("CHAT_ID_CORPUS_1"),
        channel: env("CHANNEL_CORPUS_1", "@phttgroup"),
    },
    {
        id: "2",
        title: "2 корпус",
        chatId: env("CHAT_ID_CORPUS_2"),
        channel: env("CHANNEL_CORPUS_2", "@phttoff"),
    },
    {
        id: "3",
        title: "3 корпус",
        chatId: env("CHAT_ID_CORPUS_3"),
        channel: env("CHANNEL_CORPUS_3", "@permphtt"),
    },
].filter((corpus) => {
    if (!corpus.chatId) {
        console.warn(
            `CHAT_ID_CORPUS_${corpus.id} не задан — корпус ${corpus.id} будет пропущен.`,
        );
        return false;
    }
    return true;
});

if (CORPUSES.length === 0) {
    console.error("Не задан ни один CHAT_ID_CORPUS_*. Нечего рассылать.");
    process.exit(1);
}

module.exports = {
    BOT_TOKEN,
    CORPUSES,

    SCHEDULE_URL: env("SCHEDULE_URL", "https://phtt.ru/raspisanie_zanyatiy/"),
    SITE_ORIGIN: env("SITE_ORIGIN", "https://phtt.ru"),

    PORT: envInt("PORT", 5555),
    HOST: env("HOST", "127.0.0.1"),
    CHECK_CRON: env("CHECK_CRON", "*/1 * * * *"),
    CHECK_ON_START: envBool("CHECK_ON_START", true),
    RUN_ONCE: envBool("RUN_ONCE", false),

    /**
     * Только запомнить текущее состояние сайта, ничего не отправляя.
     * Нужен при переезде на новую версию, чтобы не продублировать то,
     * что уже разослал старый бот: `npm run sync`.
     */
    SYNC_ONLY: envBool("SYNC_ONLY", false),

    /**
     * Отправлять ли расписание при самом первом запуске (когда локальной
     * истории ещё нет). По умолчанию выключено, чтобы новая установка не
     * прислала в канал всё сразу.
     */
    SEND_ON_FIRST_RUN: envBool("SEND_ON_FIRST_RUN", false),

    /** Polling не нужен — бот только публикует. Включается при необходимости. */
    ENABLE_POLLING: envBool("ENABLE_POLLING", false),

    POPPLER_PATH: detectPopplerPath(),

    /**
     * Ширина итоговой картинки в пикселях. 2560 — максимальный размер,
     * который Telegram хранит для фотографий, поэтому текст остаётся читаемым
     * при увеличении.
     */
    IMAGE_WIDTH: envInt("IMAGE_WIDTH", 2560),
    /** DPI черновой отрисовки для поиска полей и пустых областей. */
    PROBE_DPI: envInt("PROBE_DPI", 30),
    /** Белое поле вокруг обрезанного содержимого, в долях страницы. */
    IMAGE_PADDING: envFloat("IMAGE_PADDING", 0.012),

    ADMIN_USERNAME: env("ADMIN_USERNAME", "@kenostdev"),
    FALLBACK_URL: env(
        "FALLBACK_URL",
        "https://t.me/vitehubbot?startapp=gifts_16dd2850-6998-42f1-a788-b0c57dc0fdc2",
    ),

    HTTP_TIMEOUT: envInt("HTTP_TIMEOUT", 20000),
    SEND_RETRIES: envInt("SEND_RETRIES", 3),

    DIRS: {
        state: path.resolve(env("STATE_DIR", "./info")),
        pdf: path.resolve(env("PDF_DIR", "./Rasp")),
    },
};

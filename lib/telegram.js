"use strict";

const fs = require("fs");
const path = require("path");

// Тип файла указывается явно ниже, поэтому отключаем предупреждение
// библиотеки о будущей смене content-type по умолчанию.
process.env.NTBA_FIX_350 = process.env.NTBA_FIX_350 || "1";
const TelegramBot = require("node-telegram-bot-api");

const config = require("./config");
const log = require("./logger");

const bot = new TelegramBot(config.BOT_TOKEN, {
    polling: config.ENABLE_POLLING,
});

const MEDIA_GROUP_LIMIT = 10;
const CAPTION_LIMIT = 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Подпись под расписанием. */
function buildCaption(corpus, dateText) {
    const others = config.CORPUSES.filter((item) => item.id !== corpus.id);

    const lines = [
        "<b>Расписание занятий</b>",
        `${escapeHtml(corpus.title)} · ${escapeHtml(dateText)}`,
    ];

    if (others.length) {
        lines.push("", "<b>Другие корпуса</b>");
        for (const item of others) {
            lines.push(`${escapeHtml(item.title)} — ${escapeHtml(item.channel)}`);
        }
    }

    lines.push(
        "",
        `Администратор: ${escapeHtml(config.ADMIN_USERNAME)}`,
        "",
        "🚀 <b>Хочешь, чтобы всё грузилось без тормозов?</b>",
        `Забирай быстрый доступ в боте — <a href="${escapeHtml(config.FALLBACK_URL)}">жми сюда 👉</a>`,
    );

    const caption = lines.join("\n");
    return caption.length > CAPTION_LIMIT ? caption.slice(0, CAPTION_LIMIT) : caption;
}

/** Повтор с учётом Telegram-ошибки 429 (too many requests). */
async function withRetry(label, action) {
    let lastError;

    for (let attempt = 1; attempt <= config.SEND_RETRIES; attempt += 1) {
        try {
            return await action();
        } catch (error) {
            lastError = error;
            const retryAfter = error?.response?.body?.parameters?.retry_after;
            const wait = retryAfter ? (retryAfter + 1) * 1000 : 2000 * attempt;
            log.warn(
                `${label} — попытка ${attempt}/${config.SEND_RETRIES} не удалась: ${error.message}`,
            );
            if (attempt < config.SEND_RETRIES) await sleep(wait);
        }
    }

    throw lastError;
}

const photoOptions = (file) => ({
    filename: path.basename(file),
    contentType: "image/png",
});

const chunk = (items, size) => {
    const result = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
    return result;
};

/**
 * Отправляет расписание картинками: одна страница — одно фото,
 * подпись прикрепляется к первой картинке первой группы.
 */
async function sendSchedule(chatId, images, caption) {
    const groups = chunk(images, MEDIA_GROUP_LIMIT);

    for (let g = 0; g < groups.length; g += 1) {
        const group = groups[g];
        const groupCaption = g === 0 ? caption : undefined;

        if (group.length === 1) {
            await withRetry("sendPhoto", () =>
                bot.sendPhoto(
                    chatId,
                    fs.createReadStream(group[0]),
                    {
                        caption: groupCaption,
                        parse_mode: groupCaption ? "HTML" : undefined,
                    },
                    photoOptions(group[0]),
                ),
            );
        } else {
            await withRetry("sendMediaGroup", () =>
                bot.sendMediaGroup(
                    chatId,
                    group.map((file, index) => ({
                        type: "photo",
                        media: fs.createReadStream(file),
                        fileOptions: photoOptions(file),
                        ...(index === 0 && groupCaption
                            ? { caption: groupCaption, parse_mode: "HTML" }
                            : {}),
                    })),
                ),
            );
        }

        if (g < groups.length - 1) await sleep(1500);
    }
}

module.exports = { bot, buildCaption, sendSchedule, escapeHtml };

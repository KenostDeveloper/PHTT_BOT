"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const schedule = require("node-schedule");

const config = require("./lib/config");
const log = require("./lib/logger");
const site = require("./lib/site");
const state = require("./lib/state");
const { downloadPdf } = require("./lib/pdf");
const { pdfToImages } = require("./lib/images");
const { buildCaption, sendSchedule } = require("./lib/telegram");

const status = {
    startedAt: new Date().toISOString(),
    lastCheckAt: null,
    lastSuccessAt: null,
    lastError: null,
    sentTotal: 0,
};

let running = false;

process.on("unhandledRejection", (reason) => log.error("Необработанный промис:", reason));
process.on("uncaughtException", (error) => log.error("Неперехваченное исключение:", error));

/** Обрабатывает одно расписание (одну ячейку таблицы на сайте). */
async function processSlot(corpus, slot, firstRun) {
    const previousHash = state.readHash(corpus.id, slot.slot);
    const pdfPath = path.join(config.DIRS.pdf, `rasp-${corpus.id}-${slot.slot}.pdf`);

    const { hash } = await downloadPdf(slot.url, pdfPath);

    if (previousHash === hash) return false;

    // Первый запуск без истории: запоминаем текущее состояние молча,
    // чтобы не завалить канал всеми расписаниями сразу.
    if (firstRun && !previousHash && !config.SEND_ON_FIRST_RUN) {
        state.writeHash(corpus.id, slot.slot, hash);
        log.info(
            `Корпус ${corpus.id} (${slot.slot}, ${slot.date}): первый запуск — запомнил без отправки`,
        );
        return false;
    }

    log.info(`Корпус ${corpus.id} (${slot.slot}): расписание на ${slot.date} обновилось`);

    const { images, cleanup } = await pdfToImages(pdfPath);
    try {
        await sendSchedule(corpus.chatId, images, buildCaption(corpus, slot.date));
    } finally {
        cleanup();
    }

    // Хеш записываем только после успешной отправки — иначе при сбое
    // расписание будет отправлено на следующей проверке.
    state.writeHash(corpus.id, slot.slot, hash);
    status.sentTotal += 1;
    log.info(`Корпус ${corpus.id}: отправлено ${images.length} изображений`);
    return true;
}

async function checkAll() {
    if (running) {
        log.warn("Предыдущая проверка ещё выполняется — пропускаю запуск");
        return;
    }
    running = true;
    status.lastCheckAt = new Date().toISOString();

    const firstRun = !state.hasAnyHistory();

    try {
        const parsed = await site.getSchedules();

        for (const corpus of config.CORPUSES) {
            const found = parsed.find((item) => item.id === corpus.id);
            if (!found || found.slots.length === 0) {
                log.warn(`Корпус ${corpus.id}: ссылок на сайте не найдено`);
                continue;
            }

            for (const slot of found.slots) {
                try {
                    await processSlot(corpus, slot, firstRun);
                } catch (error) {
                    status.lastError = `корпус ${corpus.id}/${slot.slot}: ${error.message}`;
                    log.error(`Корпус ${corpus.id} (${slot.slot}):`, error.message);
                }
            }
        }

        status.lastSuccessAt = new Date().toISOString();
    } catch (error) {
        status.lastError = error.message;
        log.error("Ошибка проверки расписания:", error.message);
    } finally {
        running = false;
    }
}

async function main() {
    fs.mkdirSync(config.DIRS.pdf, { recursive: true });
    fs.mkdirSync(config.DIRS.state, { recursive: true });

    log.info("Корпуса в работе:", config.CORPUSES.map((c) => c.id).join(", "));
    log.info("Poppler:", config.POPPLER_PATH || "из PATH");
    log.info("Ширина картинок:", `${config.IMAGE_WIDTH}px`);

    if (config.RUN_ONCE) {
        await checkAll();
        process.exit(0);
    }

    const app = express();
    app.get("/health", (_req, res) =>
        res.json({
            ok: status.lastCheckAt === null || status.lastSuccessAt !== null,
            running,
            ...status,
        }),
    );
    app.listen(config.PORT, config.HOST, () =>
        log.info(`Сервис запущен: http://${config.HOST}:${config.PORT}/health`),
    );

    const job = schedule.scheduleJob(config.CHECK_CRON, checkAll);
    log.info("Расписание проверок:", config.CHECK_CRON, "→", job ? "ок" : "ОШИБКА CRON");

    if (config.CHECK_ON_START) await checkAll();
}

main().catch((error) => {
    log.error("Не удалось запустить приложение:", error);
    process.exit(1);
});

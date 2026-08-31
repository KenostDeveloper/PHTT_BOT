"use strict";

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const log = require("./logger");
const { USER_AGENT } = require("./site");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Скачивает PDF один раз: этот же буфер используется и для сравнения с
 * предыдущей версией, и для конвертации в картинки.
 */
async function downloadPdf(url, destPath, attempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const { data } = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: config.HTTP_TIMEOUT,
                maxContentLength: 50 * 1024 * 1024,
                headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,*/*" },
            });

            const buffer = Buffer.from(data);
            if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
                throw new Error("Сервер вернул не PDF (возможно, страница с ошибкой)");
            }

            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, buffer);
            return { path: destPath, hash: sha256(buffer), bytes: buffer.length };
        } catch (error) {
            lastError = error;
            const code = error?.response?.status;
            log.warn(`Загрузка ${url} — попытка ${attempt}/${attempts}: ${error.message}`);
            // 404/403 — файл на сайте убрали или ссылка битая, повтор не поможет.
            if (code >= 400 && code < 500) break;
            if (attempt < attempts) await sleep(2000 * attempt);
        }
    }

    throw lastError;
}

module.exports = { downloadPdf, sha256 };

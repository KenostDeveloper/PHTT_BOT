"use strict";

const fs = require("fs");
const path = require("path");

const config = require("./config");
const log = require("./logger");
const { sha256 } = require("./pdf");

const STATE_DIR = config.DIRS.state;

// Старые версии бота хранили PDF целиком в base64 (файлы по 300 КБ).
// Теперь хранится только хеш, а прежние файлы переводятся в новый формат
// без повторной рассылки.
const LEGACY_FILES = { a: (id) => `${id}.txt`, b: (id) => `${id}-2.txt` };

const statePath = (corpusId, slot) =>
    path.join(STATE_DIR, `${corpusId}-${slot}.sha256`);

function ensureDir() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
}

function migrateLegacy(corpusId, slot) {
    const legacyName = LEGACY_FILES[slot]?.(corpusId);
    if (!legacyName) return null;

    const legacyPath = path.join(STATE_DIR, legacyName);
    if (!fs.existsSync(legacyPath)) return null;

    try {
        const base64 = fs.readFileSync(legacyPath, "utf8").replace(/^data:.*?base64,/, "").trim();
        if (!base64) return null;

        const hash = sha256(Buffer.from(base64, "base64"));
        writeHash(corpusId, slot, hash);
        // Старый файл не удаляем — его можно убрать вручную, когда убедитесь,
        // что бот работает: `rm info/*.txt`.
        log.info(
            `История корпуса ${corpusId} (${slot}) переведена в новый формат (${legacyName} больше не нужен)`,
        );
        return hash;
    } catch (error) {
        log.warn(`Не удалось перенести ${legacyPath}:`, error.message);
        return null;
    }
}

/** @returns {string|null} хеш последнего разосланного PDF */
function readHash(corpusId, slot) {
    ensureDir();
    const file = statePath(corpusId, slot);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim() || null;
    return migrateLegacy(corpusId, slot);
}

function writeHash(corpusId, slot, hash) {
    ensureDir();
    fs.writeFileSync(statePath(corpusId, slot), hash);
}

/** Есть ли вообще история — чтобы первый запуск не разослал всё сразу. */
function hasAnyHistory() {
    ensureDir();
    return fs
        .readdirSync(STATE_DIR)
        .some((f) => f.endsWith(".sha256") || f.endsWith(".txt"));
}

module.exports = { readHash, writeHash, hasAnyHistory };

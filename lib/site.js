"use strict";

const axios = require("axios");
const cheerio = require("cheerio");

const config = require("./config");
const log = require("./logger");

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

function absoluteUrl(href) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return href;
    return config.SITE_ORIGIN.replace(/\/$/, "") + (href.startsWith("/") ? href : `/${href}`);
}

async function fetchHtml(url = config.SCHEDULE_URL) {
    const { data } = await axios.get(url, {
        timeout: config.HTTP_TIMEOUT,
        responseType: "text",
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "ru,en;q=0.8" },
    });
    return cheerio.load(data);
}

/**
 * Разбирает таблицу расписаний.
 *
 * Разметка страницы: строка-заголовок «N корпус» (одна ячейка с colspan),
 * следом строка с двумя ячейками — ссылками на PDF. Разбор идёт по
 * заголовкам, а не по жёстким индексам строк, поэтому добавление или
 * перестановка корпусов на сайте не ломает бота.
 *
 * @returns {Array<{id: string, slots: Array<{slot: string, url: string, date: string}>}>}
 */
function parseSchedulePage($) {
    const corpuses = new Map();
    let currentId = null;

    $("div.content table tr").each((_, row) => {
        const $row = $(row);
        const cells = $row.children("td, th");
        const rowText = normalizeText($row.text());
        const headerMatch = /^(\d+)\s*корпус/i.exec(rowText);

        // Строка-заголовок корпуса.
        if (headerMatch && cells.length <= 1) {
            currentId = headerMatch[1];
            if (!corpuses.has(currentId)) corpuses.set(currentId, []);
            return;
        }

        if (!currentId) return;

        cells.each((columnIndex, cell) => {
            const $link = $(cell).find("a[href]").first();
            const href = $link.attr("href");
            if (!href || href === "undefined" || href.includes("undefined")) return;
            if (!/\.pdf(\?|$)/i.test(href)) return;

            corpuses.get(currentId).push({
                // Буква колонки: расписание слева и справа хранится раздельно.
                slot: String.fromCharCode(97 + columnIndex),
                url: absoluteUrl(href),
                date: normalizeText($link.text()) || "неизвестную дату",
            });
        });
    });

    return [...corpuses.entries()].map(([id, slots]) => ({ id, slots }));
}

async function getSchedules() {
    const $ = await fetchHtml();
    const corpuses = parseSchedulePage($);
    log.info(
        "Найдено на сайте:",
        corpuses.map((c) => `${c.id} корпус: ${c.slots.length} шт.`).join(", ") ||
            "ничего",
    );
    return corpuses;
}

module.exports = { fetchHtml, parseSchedulePage, getSchedules, absoluteUrl, USER_AGENT };

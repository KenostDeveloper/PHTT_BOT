"use strict";

const stamp = () =>
    new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

const format = (args) =>
    args
        .map((a) => (a instanceof Error ? a.stack || a.message : a))
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : a));

module.exports = {
    info: (...args) => console.log(`[${stamp()}]`, ...format(args)),
    warn: (...args) => console.warn(`[${stamp()}] WARN`, ...format(args)),
    error: (...args) => console.error(`[${stamp()}] ERROR`, ...format(args)),
};

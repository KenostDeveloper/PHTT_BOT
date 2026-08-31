"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Poppler } = require("node-poppler");

const config = require("./config");
const log = require("./logger");

const poppler = new Poppler(config.POPPLER_PATH);

// Ограничения Telegram для фотографий.
const TG_MAX_SUM_SIDES = 9800; // ширина + высота
const TG_MAX_RATIO = 19; // соотношение сторон
const TG_MAX_BYTES = 9.5 * 1024 * 1024;

const INK_THRESHOLD = 245; // яркость, ниже которой пиксель считается «краской»
const MIN_SCALE = 600;
const MAX_SCALE = 14000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Poppler добавляет к имени номер страницы — находим реальный файл. */
function resolveOutput(dir, basename, extension) {
    const exact = path.join(dir, `${basename}${extension}`);
    if (fs.existsSync(exact)) return exact;

    const match = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(basename) && f.endsWith(extension))
        .sort();
    return match.length ? path.join(dir, match[0]) : null;
}

/** Размеры страниц PDF в пунктах. */
async function getPageGeometry(pdfPath) {
    const info = await poppler.pdfInfo(pdfPath, {
        firstPageToConvert: 1,
        lastPageToConvert: 9999,
    });
    const text = String(info);

    const pages = Number(/^Pages:\s+(\d+)/m.exec(text)?.[1] || 0);
    if (!pages) throw new Error("Не удалось определить количество страниц PDF");

    const fallback = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(text);
    const sizes = [];
    for (let page = 1; page <= pages; page += 1) {
        const perPage = new RegExp(
            `^Page\\s+${page}\\s+size:\\s+([\\d.]+) x ([\\d.]+)`,
            "m",
        ).exec(text);
        const source = perPage || fallback;
        if (!source) throw new Error("Не удалось определить размер страницы PDF");
        sizes.push({ width: Number(source[1]), height: Number(source[2]) });
    }
    return sizes;
}

/** Читает бинарный PGM (P5), который отдаёт pdftoppm -gray. */
function readPgm(file) {
    const buffer = fs.readFileSync(file);
    const tokens = [];
    let pos = 0;

    while (tokens.length < 4 && pos < buffer.length) {
        while (pos < buffer.length && /\s/.test(String.fromCharCode(buffer[pos]))) pos += 1;
        if (buffer[pos] === 0x23) {
            // комментарий до конца строки
            while (pos < buffer.length && buffer[pos] !== 0x0a) pos += 1;
            continue;
        }
        const start = pos;
        while (pos < buffer.length && !/\s/.test(String.fromCharCode(buffer[pos]))) pos += 1;
        tokens.push(buffer.toString("ascii", start, pos));
    }
    pos += 1; // единственный разделитель после maxval

    if (tokens[0] !== "P5") throw new Error(`Неожиданный формат PGM: ${tokens[0]}`);
    const width = Number(tokens[1]);
    const height = Number(tokens[2]);
    return { width, height, data: buffer.subarray(pos, pos + width * height) };
}

/**
 * Черновая отрисовка страницы в маленький серый растр, чтобы найти границы
 * содержимого. Возвращает долю страницы (0..1), занятую текстом и таблицей.
 */
async function measureContent(pdfPath, page, workDir) {
    const basename = `probe-${page}`;
    await poppler.pdfToPpm(pdfPath, path.join(workDir, basename), {
        firstPageToConvert: page,
        lastPageToConvert: page,
        grayscaleFile: true,
        resolutionXYAxis: config.PROBE_DPI,
        singleFile: true,
    });

    const file = resolveOutput(workDir, basename, ".pgm");
    if (!file) throw new Error("Черновая отрисовка страницы не удалась");

    const { width, height, data } = readPgm(file);
    fs.rmSync(file, { force: true });

    const rows = new Array(height).fill(0);
    const columns = new Array(width).fill(0);
    for (let y = 0; y < height; y += 1) {
        const offset = y * width;
        for (let x = 0; x < width; x += 1) {
            if (data[offset + x] < INK_THRESHOLD) {
                rows[y] += 1;
                columns[x] += 1;
            }
        }
    }

    const first = (arr) => arr.findIndex((v) => v > 0);
    const last = (arr) => {
        for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] > 0) return i;
        return -1;
    };

    if (first(rows) === -1) return null; // пустая страница

    return {
        x0: first(columns) / width,
        x1: (last(columns) + 1) / width,
        y0: first(rows) / height,
        y1: (last(rows) + 1) / height,
    };
}

/** Приводит область к ограничениям Telegram, расширяя её в пределах страницы. */
function fitToTelegram(rect, pageWidthPx, pageHeightPx) {
    let { x, y, width, height } = rect;

    // Слишком вытянутая картинка — добавляем полей по короткой стороне.
    for (let i = 0; i < 4 && Math.max(width, height) / Math.min(width, height) > TG_MAX_RATIO; i += 1) {
        if (width > height) {
            const target = Math.min(pageHeightPx, Math.ceil(width / TG_MAX_RATIO));
            const grow = target - height;
            y = clamp(y - Math.floor(grow / 2), 0, pageHeightPx);
            height = Math.min(target, pageHeightPx - y);
        } else {
            const target = Math.min(pageWidthPx, Math.ceil(height / TG_MAX_RATIO));
            const grow = target - width;
            x = clamp(x - Math.floor(grow / 2), 0, pageWidthPx);
            width = Math.min(target, pageWidthPx - x);
        }
    }

    return { x, y, width, height };
}

/**
 * Отрисовывает одну страницу PDF в PNG: обрезает пустые поля и рендерит
 * содержимое сразу в нужном разрешении (без промежуточного масштабирования,
 * поэтому текст остаётся резким).
 */
async function renderPage(pdfPath, page, size, workDir, index, targetWidth) {
    let box = null;
    try {
        box = await measureContent(pdfPath, page, workDir);
    } catch (error) {
        log.warn(`Не удалось измерить поля страницы ${page}:`, error.message);
    }
    if (!box) return null;

    const pad = config.IMAGE_PADDING;
    const fx0 = clamp(box.x0 - pad, 0, 1);
    const fy0 = clamp(box.y0 - pad, 0, 1);
    const fx1 = clamp(box.x1 + pad, 0, 1);
    const fy1 = clamp(box.y1 + pad, 0, 1);

    const cropWidthFraction = Math.max(fx1 - fx0, 0.05);
    const cropHeightFraction = Math.max(fy1 - fy0, 0.05);

    const longSide = Math.max(size.width, size.height);
    const basename = `page-${String(index).padStart(2, "0")}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const wanted = Math.round(targetWidth * 0.75 ** attempt);
        let pageWidthPx = wanted / cropWidthFraction;
        let scale = clamp(
            Math.round((pageWidthPx / size.width) * longSide),
            MIN_SCALE,
            MAX_SCALE,
        );

        const pxPerPt = scale / longSide;
        pageWidthPx = Math.floor(size.width * pxPerPt);
        const pageHeightPx = Math.floor(size.height * pxPerPt);

        let rect = {
            x: Math.floor(fx0 * pageWidthPx),
            y: Math.floor(fy0 * pageHeightPx),
            width: Math.ceil(cropWidthFraction * pageWidthPx),
            height: Math.ceil(cropHeightFraction * pageHeightPx),
        };
        rect.width = Math.min(rect.width, pageWidthPx - rect.x);
        rect.height = Math.min(rect.height, pageHeightPx - rect.y);
        rect = fitToTelegram(rect, pageWidthPx, pageHeightPx);

        // Сумма сторон ограничена — уменьшаем масштаб пропорционально.
        const sum = rect.width + rect.height;
        if (sum > TG_MAX_SUM_SIDES) {
            const factor = TG_MAX_SUM_SIDES / sum;
            scale = Math.max(MIN_SCALE, Math.floor(scale * factor));
            const px = scale / longSide;
            const w = Math.floor(size.width * px);
            const h = Math.floor(size.height * px);
            rect = {
                x: Math.floor(fx0 * w),
                y: Math.floor(fy0 * h),
                width: Math.min(Math.ceil(cropWidthFraction * w), w - Math.floor(fx0 * w)),
                height: Math.min(Math.ceil(cropHeightFraction * h), h - Math.floor(fy0 * h)),
            };
        }

        const previous = resolveOutput(workDir, basename, ".png");
        if (previous) fs.rmSync(previous, { force: true });

        await poppler.pdfToCairo(pdfPath, path.join(workDir, basename), {
            firstPageToConvert: page,
            lastPageToConvert: page,
            pngFile: true,
            singleFile: true,
            scalePageTo: scale,
            cropXAxis: rect.x,
            cropYAxis: rect.y,
            cropWidth: rect.width,
            cropHeight: rect.height,
        });

        const file = resolveOutput(workDir, basename, ".png");
        if (!file) throw new Error(`Не удалось отрисовать страницу ${page}`);

        const bytes = fs.statSync(file).size;
        if (bytes <= TG_MAX_BYTES) {
            log.info(
                `Страница ${page}: ${rect.width}x${rect.height}px, ${(bytes / 1024 / 1024).toFixed(2)} МБ`,
            );
            return file;
        }
        log.warn(
            `Страница ${page} весит ${(bytes / 1024 / 1024).toFixed(2)} МБ — уменьшаю разрешение`,
        );
    }

    return resolveOutput(workDir, basename, ".png");
}

/**
 * Превращает PDF расписания в набор PNG (по одному на страницу).
 * Каталог с картинками нужно удалить после отправки — используйте cleanup().
 */
async function pdfToImages(pdfPath, { targetWidth = config.IMAGE_WIDTH } = {}) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "phtt-rasp-"));
    try {
        const sizes = await getPageGeometry(pdfPath);
        const images = [];

        for (let i = 0; i < sizes.length; i += 1) {
            const file = await renderPage(
                pdfPath,
                i + 1,
                sizes[i],
                workDir,
                images.length + 1,
                targetWidth,
            );
            if (file) images.push(file);
            else log.info(`Страница ${i + 1} пустая — пропускаю`);
        }

        if (images.length === 0) throw new Error("PDF не содержит непустых страниц");
        return { images, workDir, cleanup: () => cleanup(workDir) };
    } catch (error) {
        cleanup(workDir);
        throw error;
    }
}

function cleanup(workDir) {
    try {
        fs.rmSync(workDir, { recursive: true, force: true });
    } catch (error) {
        log.warn("Не удалось удалить временный каталог:", error.message);
    }
}

module.exports = { pdfToImages, getPageGeometry, measureContent };

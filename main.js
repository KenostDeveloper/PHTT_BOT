const axios = require('axios');
const cherio = require('cheerio');
const express = require('express');
const { DownloaderHelper } = require('node-downloader-helper');
const schedule = require('node-schedule');
const fs = require('fs');
const { Poppler } = require("node-poppler");
var path = require('path');

const TelegramBot = require('node-telegram-bot-api');
const pdf2base64 = require('pdf-to-base64');

const PORT = 5555;
const token = '6044941057:AAFDcuZwPqM58_jqJ64LQD5lKebZB8-nyvQ';
const chat_id1 = '-1001683480810'; // 1 корпус
const chat_id2 = '-1002068004495'; // 2 корпус
const chat_id3 = '-1002122308269'; // 3 корпус

// const token = '6044941057:AAFDcuZwPqM58_jqJ64LQD5lKebZB8-nyvQ';
// const chat_id1 = '-1001969732629';
// const chat_id2 = '-1001969732629';
// const chat_id3 = '-1001969732629';

// TEST: -1001969732629
const bot = new TelegramBot(token, { polling: true });

// Обработка неперехваченных ошибок
process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанное отклонение промиса в:', promise, 'причина:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Неперехваченное исключение:', error);
});

const getHTML = async (url) => {
    try {
        const { data } = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return cherio.load(data);
    } catch (error) {
        console.error('Ошибка при получении HTML:', error.message);
        throw error;
    }
}

// Загрузка PDF
const downloadFile = async (link, path, name) => {
    try {
        return new Promise((resolve, reject) => {
            const download = new DownloaderHelper(link, path, {
                fileName: name + '.pdf',
                timeout: 15000
            });

            download.on('error', (err) => {
                console.error('Ошибка загрузки:', err);
                reject(err);
            });

            download.on('end', () => {
                console.log('Загрузка завершена:', name);
                resolve();
            });

            download.start();
        });
    } catch (error) {
        console.error('Ошибка в функции download:', error.message);
        throw error;
    }
}

// Конвертация PDF в изображения
async function convertImage(pdfPath, numberCorpus) {
    try {
        const poppler = new Poppler('/usr/bin');

        if (numberCorpus === '2') {
            // Специальная обработка для 2 корпуса
            const optionsList = [
                {
                    firstPageToConvert: 1,
                    lastPageToConvert: 1,
                    pngFile: true,
                    scalePageTo: 5000,
                    cropWidth: 3000,
                    cropHeight: 1470
                },
                {
                    firstPageToConvert: 1,
                    lastPageToConvert: 1,
                    pngFile: true,
                    scalePageTo: 5000,
                    cropYAxis: 1470,
                    cropWidth: 3000,
                    cropHeight: 1900
                },
                {
                    firstPageToConvert: 2,
                    lastPageToConvert: 2,
                    pngFile: true,
                    scalePageTo: 5000,
                    cropWidth: 3000,
                    cropHeight: 1950
                },
                {
                    firstPageToConvert: 2,
                    lastPageToConvert: 2,
                    pngFile: true,
                    scalePageTo: 5000,
                    cropYAxis: 1940,
                    cropWidth: 3000,
                    cropHeight: 1000
                }
            ];

            for (let i = 0; i < optionsList.length; i++) {
                const outputFile = `rasp-${numberCorpus}-${i}`;
                await poppler.pdfToCairo(pdfPath, outputFile, optionsList[i]);
                console.log('Конвертирован файл:', outputFile);
            }
        } else {
            // Стандартная обработка для 1 и 3 корпусов
            const options = {
                firstPageToConvert: 1,
                lastPageToConvert: 2,
                pngFile: true,
            };

            const outputFile = 'rasp-' + numberCorpus;
            await poppler.pdfToCairo(pdfPath, outputFile, options);
            console.log('Конвертирован файл:', outputFile);
        }
    } catch (error) {
        console.error('Ошибка при конвертации изображения:', error.message);
        throw error;
    }
}

// Получение даты из расписания
function getScheduleDate($, numberCorpus, isSecondLink = false) {
    try {
        const rowIndex = numberCorpus * 2 - 1;
        const colIndex = isSecondLink ? 1 : 0;
        
        const dateText = $(`div.content tbody tr:eq(${rowIndex}) > td:eq(${colIndex}) a`)
            .contents()
            .first()
            .text()
            .trim();
        
        return dateText || 'неизвестную дату';
    } catch (error) {
        console.error('Ошибка при получении даты:', error.message);
        return 'неизвестную дату';
    }
}

// Функция для создания подписи
function createCaption(dateText, reclam) {
    return `Расписание занятий на ${dateText}${reclam}\n\n🧑‍💻 @kenostru • kenost.com`;
}

// Основная функция парсинга
async function parse() {
    try {
        console.log('Начало парсинга...', new Date().toLocaleString());
        const $ = await getHTML('https://phtt.ru/raspisanie_zanyatiy/');

        // Вспомогательная функция для безопасного извлечения ссылок
        const getLink = (row, col) => {
            try {
                const element = $(`div.content tbody tr:eq(${row}) > td:eq(${col}) a`);
                if (element.length > 0) {
                    const href = element.attr('href');
                    if (href && href !== 'undefined' && !href.includes('undefined')) {
                        return href.startsWith('http') ? href : 'https://phtt.ru' + href;
                    }
                }
                return null;
            } catch (error) {
                console.error('Ошибка при извлечении ссылки:', error.message);
                return null;
            }
        };

        // 1 корпус
        let linkParse1_1 = getLink(1, 0);
        let linkParse1_2 = getLink(1, 1);

        // 2 корпус
        let linkParse2_1 = getLink(3, 0);
        let linkParse2_2 = getLink(3, 1);

        // 3 корпус
        let linkParse3_1 = getLink(5, 0);
        let linkParse3_2 = getLink(5, 1);

        console.log('Найдены ссылки:', {
            '1 корпус': { 
                link1: linkParse1_1, 
                link2: linkParse1_2 
            },
            '2 корпус': { 
                link1: linkParse2_1, 
                link2: linkParse2_2 
            },
            '3 корпус': { 
                link1: linkParse3_1, 
                link2: linkParse3_2 
            }
        });

        // Проверяем корпуса даже если найдена только одна ссылка
        if (linkParse1_1 || linkParse1_2) {
            await check(linkParse1_1, linkParse1_2, '1');
        } else {
            console.log('Не найдено ни одной ссылки для 1 корпуса');
        }

        if (linkParse2_1 || linkParse2_2) {
            await check(linkParse2_1, linkParse2_2, '2');
        } else {
            console.log('Не найдено ни одной ссылки для 2 корпуса');
        }

        if (linkParse3_1 || linkParse3_2) {
            await check(linkParse3_1, linkParse3_2, '3');
        } else {
            console.log('Не найдено ни одной ссылки для 3 корпуса');
        }

    } catch (error) {
        console.error('Критическая ошибка парсинга:', error.message);
    }
}

// Функция проверки и обработки изменений расписания
async function check(linkOne, linkTwo, numberCorpus) {
    try {
        console.log(`Проверка корпуса ${numberCorpus}...`);
        console.log(`Ссылка 1: ${linkOne || 'не найдена'}`);
        console.log(`Ссылка 2: ${linkTwo || 'не найдена'}`);
        
        const fileInfoOne = './info/' + numberCorpus + ".txt";
        const fileInfoTwo = './info/' + numberCorpus + "-2.txt";
        const pdfPath = './Rasp/rasp-' + numberCorpus + '.pdf';

        // Создаем директории если они не существуют
        if (!fs.existsSync('./info')) fs.mkdirSync('./info', { recursive: true });
        if (!fs.existsSync('./Rasp')) fs.mkdirSync('./Rasp', { recursive: true });

        // Читаем существующие данные или создаем пустые файлы
        let actualBase64One = '';
        let actualBase64Two = '';
        
        try {
            if (fs.existsSync(fileInfoOne)) {
                actualBase64One = fs.readFileSync(fileInfoOne, 'utf8');
            }
            if (fs.existsSync(fileInfoTwo)) {
                actualBase64Two = fs.readFileSync(fileInfoTwo, 'utf8');
            }
        } catch (readError) {
            console.error('Ошибка чтения файлов:', readError.message);
        }

        const $ = await getHTML('https://phtt.ru/raspisanie_zanyatiy/');

        // Получаем новые данные в base64 только для найденных ссылок
        let base64LinkOne = null;
        let base64LinkTwo = null;

        if (linkOne) {
            try {
                base64LinkOne = await pdf2base64(linkOne);
            } catch (pdfError) {
                console.error(`Ошибка преобразования PDF для первой ссылки корпуса ${numberCorpus}:`, pdfError.message);
            }
        }

        if (linkTwo) {
            try {
                base64LinkTwo = await pdf2base64(linkTwo);
            } catch (pdfError) {
                console.error(`Ошибка преобразования PDF для второй ссылки корпуса ${numberCorpus}:`, pdfError.message);
            }
        }

        // Определяем какое расписание изменилось
        const changedFirst = linkOne && base64LinkOne && actualBase64One !== base64LinkOne;
        const changedSecond = linkTwo && base64LinkTwo && actualBase64Two !== base64LinkTwo;

        if (!changedFirst && !changedSecond) {
            console.log(`Расписание ${numberCorpus} корпуса не изменилось`);
            return;
        }

        console.log(`Расписание ${numberCorpus} корпуса изменилось!`);

        // Обрабатываем изменения
        if (changedFirst && base64LinkOne) {
            fs.writeFileSync(fileInfoOne, base64LinkOne);
            console.log(`Обновлено первое расписание для корпуса ${numberCorpus}`);
        }

        if (changedSecond && base64LinkTwo) {
            fs.writeFileSync(fileInfoTwo, base64LinkTwo);
            console.log(`Обновлено второе расписание для корпуса ${numberCorpus}`);
        }

        // Определяем какое расписание нужно скачать и отправить
        let downloadLink = null;
        let isSecondLink = false;

        if (changedFirst && linkOne) {
            downloadLink = linkOne;
            isSecondLink = false;
        } else if (changedSecond && linkTwo) {
            downloadLink = linkTwo;
            isSecondLink = true;
        } else if (linkOne) {
            // Если нет изменений, но есть ссылка - используем первую найденную
            downloadLink = linkOne;
            isSecondLink = false;
        } else if (linkTwo) {
            downloadLink = linkTwo;
            isSecondLink = true;
        }

        if (!downloadLink) {
            console.log(`Нет доступных ссылок для скачивания корпуса ${numberCorpus}`);
            return;
        }

        // Удаляем старый PDF если существует
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }

        // Скачиваем новый PDF
        await downloadFile(downloadLink, './Rasp', 'rasp-' + numberCorpus);

        // Конвертируем в изображения
        await convertImage(path.resolve(pdfPath), numberCorpus);

        // Отправляем в Telegram
        const chat_id = numberCorpus === '1' ? chat_id1 : numberCorpus === '2' ? chat_id2 : chat_id3;
        const reclam = numberCorpus === '1' ? '\n2 корпус: @phttoff\n3 корпус: @permphtt' :
                      numberCorpus === '2' ? '\n1 корпус: @phttgroup\n3 корпус: @permphtt' :
                      '\n1 корпус: @phttgroup\n2 корпус: @phttoff';

        const dateText = getScheduleDate($, numberCorpus, isSecondLink);
        const caption = createCaption(dateText, reclam);

        if (numberCorpus === '3') {
            const pathIMG = './rasp-3-1.png';
            if (fs.existsSync(pathIMG)) {
                await bot.sendPhoto(chat_id, fs.createReadStream(pathIMG), {
                    caption: caption
                });
                // Очистка временных файлов
                setTimeout(() => fs.existsSync(pathIMG) && fs.unlinkSync(pathIMG), 5000);
            }
        } else if (numberCorpus === '2') {
            await bot.sendDocument(chat_id, pdfPath, {
                caption: caption
            });
        } else {
            const pathIMG1 = './rasp-1-1.png';
            const pathIMG2 = './rasp-1-2.png';
            
            if (fs.existsSync(pathIMG1) && fs.existsSync(pathIMG2)) {
                await bot.sendMediaGroup(chat_id, [
                    {
                        type: "photo",
                        media: fs.createReadStream(pathIMG1),
                        caption: caption
                    },
                    {
                        type: "photo",
                        media: fs.createReadStream(pathIMG2)
                    }
                ]);
                // Очистка временных файлов
                setTimeout(() => {
                    fs.existsSync(pathIMG1) && fs.unlinkSync(pathIMG1);
                    fs.existsSync(pathIMG2) && fs.unlinkSync(pathIMG2);
                }, 5000);
            }
        }

        console.log(`Расписание для корпуса ${numberCorpus} успешно отправлено`);

    } catch (error) {
        console.error(`Ошибка в функции check для корпуса ${numberCorpus}:`, error.message);
    }
}

// Основная функция
async function main() {
    try {
        const app = express();
        app.listen(PORT, '127.0.0.1', () => {
            console.log('Бот запущен на порту:', PORT);
            console.log('Начинаем мониторинг расписания...');
        });

        // Первоначальная проверка при запуске
        await parse();

    } catch (error) {
        console.error('Ошибка при запуске приложения:', error.message);
    }
}

// Планировщик - проверка каждую минуту
schedule.scheduleJob('*/1 * * * *', async () => {
    console.log('--- Проверка расписания по расписанию ---');
    await parse();
});

// Запуск приложения
main().catch(console.error);
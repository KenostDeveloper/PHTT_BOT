const axios = require('axios');
const cherio = require('cheerio');
const express = require('express')
const { DownloaderHelper } = require('node-downloader-helper');
const schedule = require('node-schedule');
const fs = require('fs');
const { Poppler } = require("node-poppler");
var path = require('path');


const TelegramBot = require('node-telegram-bot-api');
const pdf2base64 = require('pdf-to-base64');
const e = require('express');

const PORT = 5555;
const token = '6044941057:AAFDcuZwPqM58_jqJ64LQD5lKebZB8-nyvQ';
const chat_id1 = '-1001969732629' //-1001683480810
const chat_id2 = '-1001969732629' //-1002068004495
const chat_id3 = '-1001969732629' //-1002122308269

//-1001969732629 TEST

const bot = new TelegramBot(token, {polling: true});

const getHTML = async (url) => {
    const {data} = await axios.get(url)
    return cherio.load(data);
}


//Загрузка pdf
const download = async (link, path, name) => {
    const download = new DownloaderHelper(link, path, {
        fileName: name + '.pdf'
    });
    download.start();
}

async function convertImage(pdfPath, numberCorpus) {
    const poppler = new Poppler();

    if(numberCorpus == '2'){
        for(let i = 0; i<=3; i++){
            let options = {};
            switch(i){
                case 0:
                    options = {
                        firstPageToConvert: 1,
                        lastPageToConvert: 1,
                        pngFile: true,
                        scalePageTo: 5000,
                        cropWidth: 3000,
                        cropHeight: 1470
                    };
                    break
                case 1:
                    options = {
                        firstPageToConvert: 1,
                        lastPageToConvert: 1,
                        pngFile: true,
                        scalePageTo: 5000,
                        cropYAxis: 1470,
                        cropWidth: 3000,
                        cropHeight: 1900
                    };
                    break
                case 2:
                    options = {
                        firstPageToConvert: 2,
                        lastPageToConvert: 2,
                        pngFile: true,
                        scalePageTo: 5000,
                        cropWidth: 3000,
                        cropHeight: 1950
                    };
                    break
                case 3:
                    options = {
                        firstPageToConvert: i < 2? 1 : 2,
                        lastPageToConvert: i < 2? 1 : 2,
                        pngFile: true,
                        scalePageTo: 5000,
                        cropYAxis: 1940,
                        cropWidth: 3000,
                        cropHeight: 1000
                    };
                    break
            }
            


            const outputFile =  `rasp-${numberCorpus}-${i}`;
            const res = await poppler.pdfToCairo(pdfPath, outputFile, options);
            console.log(res);

            
        }
    }else{
        const options = {
            firstPageToConvert: 1,
            lastPageToConvert: 2,
            pngFile: true,
        };

        const outputFile =  'rasp-' + numberCorpus;

        const res = await poppler.pdfToCairo(pdfPath, outputFile, options);
        console.log(res);
    }

    
    
}

async function parse() {
    const $ = await getHTML('https://phtt.ru/raspisanie_zanyatiy/');

    //1 корпус
    let linkParse1_1 = 'https://phtt.ru' + $('div.content tbody tr:eq(1) > td:eq(0) a').eq(0).attr('href');
    let linkParse1_2 = 'https://phtt.ru' + $('div.content tbody tr:eq(1) > td:eq(1) a').attr('href');

    //2 корпус
    let linkParse2_1 = 'https://phtt.ru' + $('div.content tbody tr:eq(3) > td:eq(0) a').eq(0).attr('href');
    let linkParse2_2 = 'https://phtt.ru' + $('div.content tbody tr:eq(3) > td:eq(1) a').attr('href');

    //3 корпус
    let linkParse3_1 = 'https://phtt.ru' + $('div.content tbody tr:eq(5) > td:eq(0) a').eq(0).attr('href');
    let linkParse3_2 = 'https://phtt.ru' + $('div.content tbody tr:eq(5) > td:eq(1) a').attr('href');

    check(linkParse1_1, linkParse1_2, '1')
    check(linkParse2_1, linkParse2_2, '2')
    check(linkParse3_1, linkParse3_2, '3')
}

//Функция которая проверяет расписание на сайте и загруженное расписание
async function check(linkOne, linkTwo, numberCorpus){

    //Получаем файлы куда записывать данные
    let fileInfoOne = './info/' + numberCorpus + ".txt";
    let fileInfoTwo = './info/' + numberCorpus + "-2.txt";


    //Считываем файл
    const actualBase64One = fs.readFileSync(fileInfoOne, 'utf8');
    const actualBase64Two = fs.readFileSync(fileInfoTwo, 'utf8');

    const $ = await getHTML('https://phtt.ru/raspisanie_zanyatiy/');


    //Получть файл pdf  в Base64
    pdf2base64(linkOne).then((base64LinkOne) => {
        pdf2base64(linkTwo).then((base64LinkTwo) => {
            try{
                if(actualBase64One == base64LinkOne){
                    if(actualBase64Two == base64LinkTwo){
                        console.log('Расписание ' + numberCorpus + " корпуса не изменилось")
                    }else{
                        //Обновилось левое расписание (2)
                        //Очищяем тектовый документ
                        fs.writeFile(fileInfoTwo, '', function(){console.log('Расписание ' + numberCorpus + ' корпуса изменилось')})
                        //Удаляем старый pdf файл
                        if (fs.existsSync('./Rasp/rasp-'+ numberCorpus +'.pdf')) { 
                            fs.unlinkSync('./Rasp/rasp-'+ numberCorpus +'.pdf')
                        }

                        //Загружаем новый
                        download(linkTwo, './Rasp', 'rasp-'+numberCorpus);
                        //Записываем новый Base64
                        fs.appendFileSync(fileInfoTwo, base64LinkTwo);
                        

                        setTimeout(() => {
                            //Абсолютный путь до pdf файла
                            const absolutePath = path.resolve("./Rasp/rasp-"+ numberCorpus +".pdf");
                            
                            //Конвертировать pdf в img
                            convertImage(absolutePath, numberCorpus);
                            let chat_id = '';
                            let reclam = '';
                            
                            if(numberCorpus == '1'){
                                chat_id = chat_id1;
                                reclam = '\n2 корпус: @phttoff\n3 корпус: @permphtt'
                            }else if(numberCorpus == '2'){
                                chat_id = chat_id2;
                                reclam = '\n1 корпус: @phttgroup\n3 корпус: @permphtt'
                            }else{
                                chat_id = chat_id3;
                                reclam = '\n1 корпус: @phttgroup\n2 корпус: @phttoff'
                            }

                            let data = $(`div.content tbody tr:eq(${numberCorpus * 2 - 1}) > td:eq(1) a`).contents().first().text();


                            console.log('-----------------', numberCorpus)

                            if(numberCorpus == '3'){
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-1.png'
    
                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                    }, 5000)
                                }, 5000)
                            } else if(numberCorpus == '2'){
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-0-1.png'
                                    let pathIMG2 = './rasp-'+ numberCorpus +'-1-1.png'
                                    let pathIMG3 = './rasp-'+ numberCorpus +'-2-2.png'
                                    let pathIMG4 = './rasp-'+ numberCorpus +'-3-2.png'

                                    console.log('-----------------pathIMG', pathIMG)

                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG2)
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG3)
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG4)
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                        if (fs.existsSync(pathIMG2)) { 
                                            fs.unlinkSync(pathIMG2)
                                        }
                                        if (fs.existsSync(pathIMG3)) { 
                                            fs.unlinkSync(pathIMG3)
                                        }
                                        if (fs.existsSync(pathIMG4)) { 
                                            fs.unlinkSync(pathIMG4)
                                        }
                                    }, 5000)
                                }, 15000)
                            }else{
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-1.png'
                                    let pathIMG2 = './rasp-'+ numberCorpus +'-2.png'

                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG2)
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                        if (fs.existsSync(pathIMG2)) { 
                                            fs.unlinkSync(pathIMG2)
                                        }
                                    }, 5000)
                                }, 5000)
                            }
                            
                        }, 5000);
                        

                        
                    }
            
                }else if(actualBase64Two == base64LinkTwo){
                    if(actualBase64One == base64LinkOne){
                        console.log('Расписание ' + numberCorpus + " корпуса не изменилось")
                    }else{
                        //Обновилось правое расписание (1)
                        //Очищяем тектовый документ
                        fs.writeFile(fileInfoOne, '', function(){console.log('Расписание ' + numberCorpus + ' корпуса изменилось')})
                        //Удаляем старый pdf файл
                        if (fs.existsSync('./Rasp/rasp-'+ numberCorpus +'.pdf')) { 
                            fs.unlinkSync('./Rasp/rasp-'+ numberCorpus +'.pdf')
                        }
                        
                        setTimeout(() => {
                            //Загружаем новый
                            download(linkOne, './Rasp', 'rasp-'+numberCorpus);
                        }, 2000)

                        //Записываем новый Base64
                        fs.appendFileSync(fileInfoOne, base64LinkOne);

                        //Конвертировать pdf в img

                        setTimeout(() => {
                            //Абсолютный путь до pdf файла
                            const absolutePath = path.resolve("./Rasp/rasp-"+ numberCorpus +".pdf");
                            
                            //Конвертировать pdf в img
                            convertImage(absolutePath, numberCorpus);
                            let chat_id = '';
                            
                            if(numberCorpus == '1'){
                                chat_id = chat_id1;
                                reclam = '\n2 корпус: @phttoff\n3 корпус: @permphtt'
                            }else if(numberCorpus == '2'){
                                chat_id = chat_id2;
                                reclam = '\n1 корпус: @phttgroup\n3 корпус: @permphtt'
                            }else{
                                chat_id = chat_id3;
                                reclam = '\n1 корпус: @phttgroup\n2 корпус: @phttoff'
                            }

                            let data = $(`div.content tbody tr:eq(${numberCorpus * 2 - 1}) > td:eq(0) a`).contents().first().text();

    
                            if(numberCorpus == '3'){
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-1.png'
    
                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                    }, 5000)
                                }, 5000)
                            } else if(numberCorpus == '2'){
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-0-1.png'
                                    let pathIMG2 = './rasp-'+ numberCorpus +'-1-1.png'
                                    let pathIMG3 = './rasp-'+ numberCorpus +'-2-2.png'
                                    let pathIMG4 = './rasp-'+ numberCorpus +'-3-2.png'

                                    console.log('-----------------pathIMG', pathIMG)

                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG2)
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG3)
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG4)
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                        if (fs.existsSync(pathIMG2)) { 
                                            fs.unlinkSync(pathIMG2)
                                        }
                                        if (fs.existsSync(pathIMG3)) { 
                                            fs.unlinkSync(pathIMG3)
                                        }
                                        if (fs.existsSync(pathIMG4)) { 
                                            fs.unlinkSync(pathIMG4)
                                        }
                                    }, 5000)
                                }, 15000)
                            }else{
                                setTimeout(() => {
                                    let pathIMG = './rasp-'+ numberCorpus +'-1.png'
                                    let pathIMG2 = './rasp-'+ numberCorpus +'-2.png'

                                    bot.sendMediaGroup(chat_id, [
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG),
                                            caption: 'Расписание занятий на '+ data + reclam,
                                        },
                                        {
                                            type: "photo",
                                            media: fs.createReadStream(pathIMG2)
                                        }
                                    ]);

                                    setTimeout(() => {
                                        if (fs.existsSync(pathIMG)) { 
                                            fs.unlinkSync(pathIMG)
                                        }
                                        if (fs.existsSync(pathIMG2)) { 
                                            fs.unlinkSync(pathIMG2)
                                        }
                                    }, 5000)
                                }, 5000)
                            }
                        }, 5000);
                    }
                }else{
                    console.log('Оба расписания ' + numberCorpus + " корпуса изменилось")
                    //Обновились оба расписания (1 и 2)
                    //Очищяем тектовый документ
                    fs.writeFile(fileInfoTwo, '', function(){console.log('Расписание 1 обновлено')});
                    fs.writeFile(fileInfoOne, '', function(){console.log('Расписание 2 обновлено')});
                    
                    if (fs.existsSync('./Rasp/rasp-'+ numberCorpus +'.pdf')) { 
                        fs.unlinkSync('./Rasp/rasp-'+ numberCorpus +'.pdf')
                    }

                    setTimeout(() => {
                        //Загружаем новый
                        download(linkOne, './Rasp', 'rasp-'+numberCorpus);
                    }, 2000)
                    

                    //Записываем новый Base64
                    fs.appendFileSync(fileInfoTwo, base64LinkTwo);
                    fs.appendFileSync(fileInfoOne, base64LinkOne);

                    //Конвертировать pdf в img
                    setTimeout(() => {
                        //Абсолютный путь до pdf файла
                        const absolutePath = path.resolve("./Rasp/rasp-"+ numberCorpus +".pdf");
                        
                        //Конвертировать pdf в img
                        convertImage(absolutePath, numberCorpus);
                        let chat_id = '';
                        
                        if(numberCorpus == '1'){
                            chat_id = chat_id1;
                            reclam = '\n2 корпус: @phttoff\n3 корпус: @permphtt'
                        }else if(numberCorpus == '2'){
                            chat_id = chat_id2;
                            reclam = '\n1 корпус: @phttgroup\n3 корпус: @permphtt'
                        }else{
                            chat_id = chat_id3;
                            reclam = '\n1 корпус: @phttgroup\n2 корпус: @phttoff'
                        }


                        let data = $(`div.content tbody tr:eq(${numberCorpus * 2 - 1}) > td:eq(0) a`).contents().first().text();

                        if(numberCorpus != '3'){
                            setTimeout(() => {
                                let pathIMG = './rasp-'+ numberCorpus +'-1.png'
                                let pathIMG2 = './rasp-'+ numberCorpus +'-2.png'

                                bot.sendMediaGroup(chat_id, [
                                    {
                                        type: "photo",
                                        media: fs.createReadStream(pathIMG),
                                        caption: 'Расписание занятий на '+ data + reclam,
                                    },
                                    {
                                        type: "photo",
                                        media: fs.createReadStream(pathIMG2)
                                    }
                                ]);

                                setTimeout(() => {
                                    if (fs.existsSync(pathIMG)) { 
                                        fs.unlinkSync(pathIMG)
                                    }
                                    if (fs.existsSync(pathIMG2)) { 
                                        fs.unlinkSync(pathIMG2)
                                    }
                                }, 5000)
                            }, 5000)
                        }else{
                            setTimeout(() => {
                                let pathIMG = './rasp-'+ numberCorpus +'-1.png'

                                bot.sendMediaGroup(chat_id, [
                                    {
                                        type: "photo",
                                        media: fs.createReadStream(pathIMG),
                                        caption: 'Расписание занятий на '+ data + reclam,
                                    }
                                ]);

                                setTimeout(() => {
                                    if (fs.existsSync(pathIMG)) { 
                                        fs.unlinkSync(pathIMG)
                                    }
                                }, 5000)
                            }, 5000)
                        }
                    }, 5000);

                }
            }catch(e){
                console.log(e)
            }
            
        })
    })

    
    
}


async function main() {
    const app = express();
    app.listen(PORT, '127.0.0.1', () => console.log('Запуск на порту:', PORT));
}

schedule.scheduleJob('*/1 * * * *', () => {
    parse()
})

main()
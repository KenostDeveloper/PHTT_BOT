const axios = require('axios');
const cherio = require('cheerio');
const express = require('express')
const { DownloaderHelper } = require('node-downloader-helper');
const schedule = require('node-schedule');
const fs = require('fs');
const fsExtra = require('fs-extra');
var telegram = require('telegram-bot-api');
const pathPDF = require('path')
const pdfConverter = require('pdf-poppler')

const path = './Rasp'
const path2 = './Rasp2'
const pathInfo = './Helps/info.txt'
const pathInfo2 = './Helps/info2.txt'
const PORT = 9999;

const imgPage = './img'

const token = '6044941057:AAFDcuZwPqM58_jqJ64LQD5lKebZB8-nyvQ';
const chat_id = '-1001969732629';

const api = new telegram({token: '6044941057:AAFDcuZwPqM58_jqJ64LQD5lKebZB8-nyvQ'})


async function main() {
    const app = express();
    app.listen(PORT, '127.0.0.1', () => console.log('Listening on Port:', PORT));
}

function convertImage(pdfPath) {

    let option = {
        format : 'jpeg',
        out_dir : imgPage,
        out_prefix : pathPDF.basename(pdfPath, pathPDF.extname(pdfPath)),
        page: null
    }

    pdfConverter.convert(pdfPath, option)
    .then(() => {
        console.log('file converted')
    })
    .catch(err => {
        console.log('an error has occurred in the pdf converter ' + err)
    })
}


const download = async (link, path) => {
    const download = new DownloaderHelper(link, path);
    download.start();
}



async function parse() {

    const getHTML = async (url) => {
        const {data} = await axios.get(url)
        return cherio.load(data);
    }

    const $ = await getHTML('https://phtt.ru/raspisanie_zanyatiy/');
    let pageParseOne = $('div.content tbody tr:eq(1) > td:eq(0) a').eq(0).attr('href');
    let pageParseTwo = $('div.content tbody tr:eq(1) > td:eq(1) a').attr('href');

    pageParseOne = 'https://phtt.ru' + pageParseOne
    pageParseTwo = 'https://phtt.ru' + pageParseTwo

    const fileSelect = fs.readFileSync(pathInfo, 'utf8');
    const fileSelect2 = fs.readFileSync(pathInfo2, 'utf8');

    if(pageParseOne == fileSelect){
        if(fileSelect2 == pageParseTwo){
            console.log("Расписание не изменилось")
        }else{
            fs.writeFile(pathInfo2, '', function(){console.log('Расписание 2 обновлено')})
            fsExtra.emptyDirSync(path2);
            download(pageParseTwo, path2)
            fs.appendFileSync(pathInfo2, pageParseTwo);

            setTimeout(() => {
                fsExtra.emptyDirSync(imgPage);
                fs.readdirSync( path2 ).forEach( file => {
                    //полный путь до файла пдф
                    const absolutePath = pathPDF.resolve( path2, file );
            
                    // Конвертировать пдф в изображение
                    convertImage(absolutePath)
                });

                setTimeout(() => {
                    fs.readdir("./img", (err,filename)=>{

                        let pathREQ = './img/' + filename[0]
                        let pathREQ2 = './img/' + filename[1]
                        
                        setTimeout(() => {
                            api.sendPhoto({
                                chat_id: chat_id,
                                caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(1) a').contents().first().text()} 1/2`,
                                photo: fs.createReadStream(pathREQ)
                            })
                            console.log("Рассписание опубликованно 1/2")

                            setTimeout(() => {
                                api.sendPhoto({
                                    chat_id: chat_id,
                                    caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(1) a').contents().first().text()} 2/2`,
                                    photo: fs.createReadStream(pathREQ2)
                                })
                                console.log("Рассписание опубликованно 2/2")
                            }, 2000)
                        }, 2000)

                    })
                }, 10000)
            }, 5000);

        }
    }else if(pageParseTwo == fileSelect2){
        if(pageParseOne == fileSelect){
            console.log("Расписание не изменилось")
        }else{
            fs.writeFile(pathInfo, '', function(){console.log('Расписание 1 обновлено')})
            fsExtra.emptyDirSync(path);
            download(pageParseOne, path)
            fs.appendFileSync(pathInfo, pageParseOne);

            setTimeout(() => {
                fsExtra.emptyDirSync(imgPage);
                fs.readdirSync( path ).forEach( file => {
                    //полный путь до файла пдф
                    const absolutePath = pathPDF.resolve( path, file );
            
                    // Конвертировать пдф в изображение
                    convertImage(absolutePath)
                });

                setTimeout(() => {
                    fs.readdir("./img", (err,filename)=>{

                        let pathREQ = './img/' + filename[0]
                        let pathREQ2 = './img/' + filename[1]
                        
                        setTimeout(() => {
                            api.sendPhoto({
                                chat_id: chat_id,
                                caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(0) a').eq(0).contents().first().text()} 1/2`,
                                photo: fs.createReadStream(pathREQ)
                            })
                            console.log("Рассписание опубликованно 1/2")

                            setTimeout(() => {
                                api.sendPhoto({
                                    chat_id: chat_id,
                                    caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(0) a').eq(0).contents().first().text()} 2/2`,
                                    photo: fs.createReadStream(pathREQ2)
                                })
                                console.log("Рассписание опубликованно 2/2")
                            }, 2000)
                        }, 2000)

                    })
                }, 10000)
            }, 5000);

        }
    }else{
        fs.writeFile(pathInfo2, '', function(){console.log('Расписание 2 обновлено ...')})
        fsExtra.emptyDirSync(path2);
        fs.writeFile(pathInfo, '', function(){console.log('Расписание 1 обновлено ...')})
        fsExtra.emptyDirSync(path);
        download(pageParseOne, path)
        fs.appendFileSync(pathInfo, pageParseOne);
        download(pageParseTwo, path2)
        fs.appendFileSync(pathInfo2, pageParseTwo);
        console.log("ХМ ХМ ХМ... Обновленны оба расписания!")

        setTimeout(() => {
            fsExtra.emptyDirSync(imgPage);

            fs.readdirSync( path ).forEach( file => {
                //полный путь до файла пдф
                const absolutePath = pathPDF.resolve( path, file );
        
                // Конвертировать пдф в изображение
                convertImage(absolutePath)
            });

            setTimeout(() => {
                fs.readdir("./img", (err,filename)=>{

                    let pathREQ = './img/' + filename[0]
                    let pathREQ2 = './img/' + filename[1]
                    
                    setTimeout(() => {
                        api.sendPhoto({
                            chat_id: chat_id,
                            caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(1) a').contents().first().text()} 1/2`,
                            photo: fs.createReadStream(pathREQ)
                        })
                        console.log("Рассписание опубликованно 1/2")

                        setTimeout(() => {
                            api.sendPhoto({
                                chat_id: chat_id,
                                caption: `Рассписание занятий на ${$('div.content tbody tr:eq(1) > td:eq(1) a').contents().first().text()} 2/2`,
                                photo: fs.createReadStream(pathREQ2)
                            })
                            console.log("Рассписание опубликованно 2/2")
                        }, 2000)
                    }, 2000)

                })
            }, 10000)
        }, 5000);
    }

}


schedule.scheduleJob('*/1 * * * *', () => {
    parse()
})

main()
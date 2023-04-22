'use strict';

let kvth = new kvtHelper(),
    kvtSettings = {},
    config = {};

async function getCurrentTabId() {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab.id;
}

const getObjectFromLocalStorage = async function (key) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(key, function (value) {
                resolve(value[key]);
            });
        } catch (ex) {
            reject(ex);
        }
    });
};

const saveObjectInLocalStorage = async function(obj) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(obj, function() {
            resolve();
            });
        } catch (ex) {
            reject(ex);
        }
    });
};

const sendMessagePromise = async function (tabId, tp) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, {type: tp}, function (response) {
            if (response && response.msg === tp) {
                resolve(response)
            } else {
                reject('Не удалось загрузить config psid. Расширение работает только на странице терминала! Зайдите в терминал или обновите страницу терминала.')
            }
        });
    });
}

async function run() {
    // Тянем config psid
    config = await sendMessagePromise(await getCurrentTabId(), "config").catch(err => {
        chrome.notifications.create("", {
            title: "Ошибка загрузки config",
            message: err,
            type: "basic",
            iconUrl: "icons/icon48.png"
        })

        document.querySelector('body').innerHTML = `<div class="content-tabs">${kvth._errW(err)}</div>`;
    })

    if (config !== undefined) {
        let accounts = await getBrokerAccounts(config.psid || 0)
        if (accounts) {
            let select = document.getElementById('statsFor')
    
            for (let item of accounts) {
                let el = document.createElement('option');
                el.value = item.brokerAccountId;
                el.innerHTML = item.name || 'Брокерский счёт Тинькофф';
                select.appendChild(el);
            }
        }
    }

    // input & checkbox set&get settings
    for (const key of ['fromDate', 'toDate', 'telegramId', 'kvtToken', 'kvtQuotes', 'compactQuotes', 'customNameQuotes', 'alorToken', 'alorPortfolio', 'kvtFastVolumePrice', 'kvtFastVolumeSize', 'kvtFastSumRelation', 'compactStyle', 'fastSTIG', 'styleTS', 'rcktMonConnect', 'kvtFastVolumePriceRound', 'hideShortsBrokers', 'statsFor', 'printTicker', 'printMinQty', 'debug']) {
        let el = document.getElementById(key),
            val = await getObjectFromLocalStorage(key)

        if (el.getAttribute('type') === 'checkbox') {
            val && (el.checked = kvtSettings[key] = true);
            el.onchange = function () {
                var obj= {};
                obj[key] = kvtSettings[key] = el.checked || false;
                saveObjectInLocalStorage(obj);
            }
        } else if (el.tagName === 'SELECT' && el.getAttribute('multiple') !== null) {
            if (val && val.length) {
                kvtSettings[key] = val;
                for ( var i = 0, l = el.options.length, o; i < l; i++ ) {
                    o = el.options[i];
                    if ( val.includes(o.value)) {
                        o.selected = true;
                    }
                }
            }

            el.onchange = function (e) {
                let values = []

                for ( var i = 0, l = el.options.length, o; i < l; i++ ) {
                    o = el.options[i];
                    if (o.selected) {
                        values.push(o.value)
                    }                    
                }

                var obj= {};
                obj[key] = kvtSettings[key] = values || [];
                saveObjectInLocalStorage(obj);
            }
        } else {
            val && (el.value = kvtSettings[key] = val);
            el.onchange = function () {
                var obj= {};
                obj[key] = kvtSettings[key] = el.value || '';
                saveObjectInLocalStorage(obj);
            }
        }
    }

    /**
     * array input & checkbox 
     */ 
    for (const key of ['StigFastSum_stig', 'StigFastSum_bot', 'StigFastSum_rcktmon']) {
        let elemtnts = document.querySelectorAll(`input[name^=${key}]`),
            val = await getObjectFromLocalStorage(key) || {}

        elemtnts.forEach(el => {
            let keyName = el.name.match(/\[(.*)\]/)[1]
           
            if (val[keyName]) {
                el.value = val[keyName]
            }

            el.onchange = function () {
                let obj = {}
                obj[key] = getInputsValuesByKey(key)

                saveObjectInLocalStorage(obj);
            }
        })
    }

    function getInputsValuesByKey(key) {
        let elemtnts = document.querySelectorAll(`input[name^=${key}]`),
            values = {};

        elemtnts.forEach(el => {            
            let keyName = el.name.match(/\[(.*)\]/)[1]
            if (el.value) {
                values[keyName] = el.value;
            }          
        })

        return values;
    }

    // set default value firs time
    if (!await getObjectFromLocalStorage('customNameQuotes')) {
        let event = new Event("change");
        document.getElementById('customNameQuotes').dispatchEvent(event);
    }

    if (kvtSettings.alorPortfolio) {
        document.getElementById('statsFor').insertAdjacentHTML('beforeend', `<option value="alor" ${kvtSettings.statsFor === 'alor' ? 'selected' : ''}>Alor SPBX</option>`);
        document.getElementById('statsFor').insertAdjacentHTML('beforeend', `<option value="alor_moex" ${kvtSettings.statsFor === 'alor_moex' ? 'selected' : ''}>Alor MOEX</option>`);
    }

    // Кнопка загрузить отчет
    document.getElementById('kvShowReport').addEventListener('click', async function (e) {
        let reportWindow = document.getElementById('reportWindow'),
            m = new Date(),
            offset = kvth.createUTCOffset(m),
            fromDate = document.getElementById('fromDate').value,
            toDate = document.getElementById('toDate').value;

        if (!fromDate) {
            document.querySelector('[data-set-time=from_morning]').click();
            fromDate = document.getElementById('fromDate').value;
        }

        if (!toDate) {
            let td = new Date();
            td.setDate(td.getDate() + 1);
            toDate = getYmd(td)['strYmdhm']
        }

        fromDate += offset;
        toDate += offset;

        let strYmd = getYmd(new Date(fromDate))['strYmd'],
            fromDateTime = new Date(fromDate).getTime(),
            toDateTime = new Date(toDate).getTime();

        reportWindow.innerHTML = 'Загрузка...';

        let result = [],
            tickers = {},
            corrss = {}; // Результат по валютам. 

        if (kvtSettings.statsFor === 'alor' || kvtSettings.statsFor === 'alor_moex') {
            try {
                let alor_operations = [],
                    exchange = 'alor_moex' === kvtSettings.statsFor ? 'MOEX' : 'SPBX',
                    operationsToday = await kvtAlorGetStatsToday(kvtSettings.alorPortfolio, exchange),
                    operationsHistory = await kvtAlorGetStatsHistory(kvtSettings.alorPortfolio, exchange, strYmd);

                console.log('сегодняшние', operationsToday)
                console.log('operationsHistory', operationsHistory)

                if (operationsToday.result === 'error') {
                    throw new Error(operationsToday.status)
                }
                if (operationsHistory.result === 'error') {
                    throw new Error(operationsHistory.status)
                }

                await getStats()

                // Если операций больше 1000, ищем ласт сделку, и от неё отталкиваемся еще раз
                async function getStats(last_order_id) {
                    let operationsHistory = await kvtAlorGetStatsHistory(kvtSettings.alorPortfolio, exchange, strYmd, last_order_id)

                    if (operationsHistory.result === 'error') {
                        throw new Error(operationsHistory.status)
                    }

                    console.log('operationsHistory', operationsHistory)

                    alor_operations.push(...operationsHistory)

                    if (operationsHistory.length >= 999) {
                        let last_order = operationsHistory[operationsHistory.length - 1];
                        console.error('last order', last_order)
                        await getStats(last_order.id)
                    }
                }

                console.log('Загружено', alor_operations.length)
                console.log('Сегодняшних', operationsToday.length)

                alor_operations.push(...operationsToday)

                const yesterday = {}; //Определим позы оставшиеся со вчера

                //Расчет поз которые были на начало дня, которые потом отсечем
                /*for (trade of alor_operations){
                    if (!yesterday[trade.symbol]){
                        yesterday[trade.symbol] = 0;
                    }
                    yesterday[trade.symbol] += (trade.qty * (trade.side == "buy" ? -1 : 1));
                }

                console.table(yesterday)*/

                //Отсекаем "вчерашние" позы
                /*for (trade of alor_operations){
                    aqty = yesterday[trade.symbol];
                    if (!aqty) {
                        continue
                    }
                    cqty = trade.qty
                    if ((cqty * aqty) < 0) {
                        trade.qty = 0;
                        yesterday[trade.symbol] -= cqty; //увеличим срезаемые операции, если были операции не гасящие вчерашний остаток
                    } else {
                        pqty = Math.min(cqty, aqty); //отрежем операции гасящие вчерашний остаток
                        trade.qty -= pqty;
                        yesterday[trade.symbol] -= pqty;
                    }
                }*/

                reportWindow.innerHTML = 'Обработка...';

                alor_operations.reverse()

                alor_operations.forEach(function (e) {

                    let d = new Date(e.date).getTime();

                    if (e.symbol && e.qty && d >= fromDateTime && d <= toDateTime ) {

                        let id = e.symbol;
                        newLine(id, e.symbol, '', 'trade', '', e.exchange)

                        if (e.side === "sell") {
                            tickers[id]["Сделок продажи"]++
                            tickers[id]["Сумма продаж"] += Math.abs((e.price * e.qty) || 0)
                            tickers[id]["Количество"] -= (e.qty || 0);
                            tickers[id]["Комиссия"] += Math.abs(e.commission || 0)

                            if (tickers[id]["Количество"] === 0) {
                                tickers[id]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[id]["Сумма открытой позы"] -= Math.abs((e.price * e.qty) || 0)
                            }

                        } else if (e.side === "buy") {
                            tickers[id]["Сделок покупки"]++
                            tickers[id]["Сумма покупок"] += Math.abs((e.price * e.qty) || 0)
                            tickers[id]["Количество"] += e.qty;
                            tickers[id]["Комиссия"] += Math.abs(e.commission || 0)

                            if (tickers[id]["Количество"] === 0) {
                                tickers[id]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[id]["Сумма открытой позы"] += Math.abs((e.price * e.qty) || 0)
                            }
                        }
                    }
                })

                Object.keys(tickers).forEach(function (e) {
                    return result.push(tickers[e])
                })

                reportWindow.innerHTML = 'Запрашиваем валюты тикеров...';

                // Запросим инфу по тикерам, что бы узнать валюту и лотность
                for (let i = 0; i < result.length; i++) {
                    let res = await kvtAlorGetInfoSymbol(result[i]['Тикер'], result[i]['exchange']);

                    result[i]["Сумма продаж"] = result[i]["Сумма продаж"] * res.lotsize;
                    result[i]["Сумма покупок"] = result[i]["Сумма покупок"] * res.lotsize;
                    result[i]["Сумма открытой позы"] = result[i]["Сумма открытой позы"] * res.lotsize;

                    result[i]['Валюта'] = res.currency || 'USD';
                    currs(result[i]['Валюта']);
                    corrss[result[i]['Валюта']]['Комиссия'] += Math.abs(result[i]["Комиссия"] || 0)
                }

                reportWindow.innerHTML = 'Итоговая обработка...';
            } catch (e) {
                reportWindow.innerHTML = `Не удалось загрузить финансовый результат Алор. Ошибка: ${e.message}`

                chrome.notifications.create("", {
                    title: "Финансовый результат Алор",
                    message: "Ошибка: " + e.message,
                    type: "basic",
                    iconUrl: "icons/icon48.png"
                })
            }
        } else {
            try {
                if (config === undefined) {
                    throw new Error('Не удалось загрузить config. Обновите страницу терминала.')
                }
                
                let tinkoff_operations = [];
                let limit = 300,
                    iteration = 0,
                    cursor = 0;
                                
                await loadTi()

                async function loadTi() {
                    let {operations, nextCursor} = await getOperationsByCursor(cursor, limit),
                        nextExist = 0;
    
                    operations = operations.filter(i => {
                        let d = new Date(i.date).getTime();

                        // Если есть операции больше чем toDateTime, ставим маркер nextExist = 1, тем самым еще раз запрашиваем операции.
                        if (d >= toDateTime) {
                            nextExist = 1;
                        }

                        return d >= fromDateTime && d <= toDateTime;
                    })

                    tinkoff_operations.push(...operations);
                    iteration++;
    
                    // Загружаем еще одну пачку если кол-во операций = лимиту
                    // ИЛИ если в выгруженных операциях есть операции больше чем toDateTime
                    if (nextExist || operations.length === limit) {
                        if (iteration > 2) {
                            limit = 1000;
                        }

                        cursor = nextCursor;

                        await loadTi()
                    }
                }

                console.log(tinkoff_operations)

                tinkoff_operations.forEach(e => {
                    "RUR" === e.payment.currency && (e.payment.currency="RUB");

                    let c = e.payment.currency || '';

                    let id;

                    if (['coupon', 'taxCpn'].includes(e.type)) {
                        id = `${e.isin}_${e.payment.currency || ''}_coupon`
                    }

                    if (['taxDvd', 'dividend'].includes(e.type)) {
                        id = `${e.isin}_${e.payment.currency || ''}_dividend`
                    }

                    if (['sell', 'buy', 'brokCom'].includes(e.type)) {
                        id = `${e.ticker}_${e.payment.currency || ''}`
                    }

                    if (e.instrumentType === 'futures') {
                        id = `${e.ticker}_Pt.`
                        newLine(id, e.ticker, e.payment.currency, 'futures', e.name)
                    }


                    switch (e.type) {
                        case 'sell' : {
                            currs(c)
                            newLine(id, e.ticker, e.payment.currency, 'trade')
                               
                            tickers[id]["Сделок продажи"]++;
                            tickers[id]["Сумма продаж"] += Math.abs(e.payment.value || 0)
                            tickers[id]["Количество"] -= (e.doneRest || 0);

                            if (tickers[id]["Количество"] === 0) {
                                tickers[id]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[id]["Сумма открытой позы"] -= Math.abs(e.payment.value || 0)
                            }
                            break
                        }

                        case 'buy' : {
                            currs(c)
                            newLine(id, e.ticker, e.payment.currency, 'trade')
                                                        
                            tickers[id]["Сделок покупки"]++;                            
                            tickers[id]["Сумма покупок"] += Math.abs(e.payment.value || 0);
                            tickers[id]["Количество"] += e.doneRest;                             

                            if (tickers[id]["Количество"] === 0) {
                                tickers[id]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[id]["Сумма открытой позы"] += Math.abs(e.payment.value || 0)
                            }                                                       

                            break
                        }

                        // Начисление вариационной маржи
                        case 'accruingVarMargin' : {
                            currs(c)                           
                            corrss[c]['Маржа'] += Math.abs(e.payment.value || 0)

                            // FIXME:
                            /* e.childOperations.forEach(fut => {
                                tc = `${fut.ticker}_Pt.`
                                nl(tc, e, 'futures')

                                tickers[fut.ticker]["Профит фьюч"] += Math.abs(fut.value || 0);                                
                            }) */

                            //accruingVarMarginInstrument
                            //writingOffVarMarginInstrument

                            break
                        }

                        // Списание вариационной маржи
                        case 'writeOffVarMargin' : {
                            currs(c)                            
                            corrss[c]['Маржа'] -= Math.abs(e.payment.value || 0)
                            break
                        }


                        // Комиссия брокера
                        case 'brokCom' : {
                            currs(c)
                            newLine(id, e.ticker, e.payment.currency)

                            tickers[id]["Комиссия"] += Math.abs(e.payment.value || 0)
                            corrss[c]['Комиссия'] += Math.abs(e.payment.value || 0)                            
                            break
                        }

                        // Удержание налога
                        case 'tax' : {
                            currs(c)
                            corrss[c]['НДФЛ'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Удержание налога по ставке 15%
                        case 'tax15' : {
                            currs(c)
                            corrss[c]['НДФЛ'] += Math.abs(e.payment.value || 0)
                            //corrss[c]['НДФЛ 15%'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Корректировка налога
                        case 'taxBack' : {
                            currs(c)
                            corrss[c]['НДФЛ'] -= Math.abs(e.payment.value || 0)
                            break
                        }

                        // Списание комиссии за обслуживание
                        case 'regCom' : {
                            currs(c)
                            corrss[c]['Обслуживание'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Гербовый сбор                        
                        case 'stampDuty' : {
                            currs(c)
                            corrss[c]['Гербовый сбор'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Списание комиссии за непокрытую позицию
                        case 'marginCom' : {
                            currs(c)
                            corrss[c]['Маржиналка'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Списание комиссии за следование
                        case 'followingCom' : {
                            currs(c)
                            corrss[c]['Автоследование'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Списание комиссии за результат
                        case 'followingResultCom' : {
                            currs(c)
                            corrss[c]['Автоследование рез.'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Выплата купонов по облигациям
                        case 'coupon' : {
                            let id = `${e.isin}_${e.payment.currency || ''}_coupon`
                            newLine(id, e.isin, e.payment.currency, 'coupon', e.name)                            
                            currs(c)
                            
                            tickers[id]["Сумма покупок"] += 0;
                            tickers[id]["Сумма продаж"] += Math.abs(e.payment.value || 0)

                            corrss[c]['Купоны'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Удержание НДФЛ по купонам
                        case 'taxCpn' : {
                            
                            let id = `${e.isin}_${e.payment.currency || ''}_coupon`
                            newLine(id, e.isin, e.payment.currency, 'coupon')
                            currs(c)
                            
                            tickers[id]["Комиссия"] += Math.abs(e.payment.value || 0)
                            corrss[c]['Купоны налог'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Выплата дивидендов по акциям
                        case 'dividend' : {

                            let id = `${e.isin}_${e.payment.currency || ''}_dividend`
                            newLine(id, e.isin, e.payment.currency, 'dividend', e.name)
                            currs(c)

                            tickers[id]["Сумма покупок"] = 0;
                            tickers[id]["Сумма продаж"] += Math.abs(e.payment.value || 0)
                            corrss[c]['Дивиденды'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Удержание НДФЛ по дивидендам
                        case 'taxDvd' : {

                            let id = `${e.isin}_${e.payment.currency || ''}_dividend`
                            newLine(id, e.isin, e.payment.currency, 'dividend')
                            currs(c)
                            
                            tickers[id]["Комиссия"] += Math.abs(e.payment.value || 0)
                            corrss[c]['Дивиденды налог'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        // Комиссия за валютный остаток
                        case 'cashCom' : {
                            currs(c)                       
                            corrss[c]['Валютный остаток'] += Math.abs(e.payment.value || 0)
                            break
                        }

                        case 'payIn' : {

                            break
                        }

                        case 'payOut' : {

                            break
                        }
                    }
                })

                Object.keys(tickers).forEach(function (e) {
                    return result.push(tickers[e])
                })

                async function getOperationsByCursor(cursor = 0, limit = 200) {
                    let reqUrl = '';
    
                    if (kvtSettings.statsFor) {
                        reqUrl += `&brokerAccountId=${kvtSettings.statsFor}`
                    }
                    if (cursor) {
                        reqUrl += `&cursor=${cursor}`
                    }
        
                    return await fetch(`https://api-invest-gw.tinkoff.ru/ca-operations/api/v1/user/operations?overnightsDisabled=false&withoutCommissions=false&status=executed&limit=${limit}&appName=invest_terminal&sessionId=${config.psid}${reqUrl}`, {
                        method: "GET",
                        headers: {
                            "x-app-version": "2.0.0"
                        }
                    }).then(function (e) {
                        return e.json();
                    }).then(function (e) {
                        return {operations: (e.items || []), nextCursor: e.nextCursor}
                    })
                }
            } catch (error) {
                reportWindow.innerHTML = kvth._errW('Не удалось загрузить config. Обновите страницу терминала.');
                chrome.notifications.create("", {
                    title: "Финансовый результат",
                    message: "Не удалось загрузить config. Обновите страницу терминала.",
                    type: "basic",
                    iconUrl: "icons/icon48.png"
                })
            }
        } 

        generateTable(result)

        /**
         * Список тикеров - Детали
         * @param {*} id symbol_type
         * @param {*} symbol 
         * @param {*} currency RUB, USD, HKD
         * @param {*} type trade, coupon, futures, dividend
         * @param {*} companyName 
         * @param {*} exchange 
         */
        function newLine (id, symbol, currency = '', type = '', companyName = '', exchange = '') {
            if (!tickers[id]) {
                tickers[id] = {
                    "type": type,
                    "Тикер": symbol,
                    "Валюта": currency,
                    "companyName": companyName,
                    "exchange": exchange,
                    "Комиссия": 0,
                    "Сумма покупок": 0,
                    "Сумма продаж": 0,
                    "Сделок покупки": 0,
                    "Сделок продажи": 0,
                    "Количество": 0,
                    "Сумма открытой позы": 0,
                };
            }
        }


        /**
         * список валют и данные торговле в валюте
         */
        function currs(currency) {
            if (void 0 === corrss[currency]) {                
                let c = {
                    "Чистыми": 0,                    
                    "Комиссия": 0,

                    "Сделок покупки": 0,
                    "Сделок продажи": 0,
                    "Оборот": 0,

                    "Маржа": 0,
                    "Дивиденды": 0, // dividend
                    "Купоны": 0, // coupon

                    // расходы
                    "НДФЛ": 0, // tax
                    "НДФЛ 15%": 0, // tax15
                    "Маржиналка": 0, // marginCom
                    "Автоследование": 0, // followingCom
                    "Автоследование рез.": 0, // followingResultCom                    
                    "Дивиденды налог": 0, // taxDvd                    
                    "Купоны налог": 0, // taxCpn
                    "Обслуживание": 0, // regCom  
                    "Валютный остаток": 0, // cashCom             
                    "Гербовый сбор": 0 // stampDuty
                };                

                corrss[currency] = c;
            }
        }

        function generateTable (res) {    
            
            console.log('res', res)
            console.log('corrss', corrss)
    
            // Перебираем результат по тикерам, дополняя currs
            res.forEach(ticker => {
                let currency = ticker["Валюта"]

                if (ticker["Количество"] > 0) {
                    ticker["Сумма покупок"] -= ticker["Сумма открытой позы"]
                } else if (ticker["Количество"] < 0) {
                    ticker["Сумма продаж"] += ticker["Сумма открытой позы"]
                }
                
                if (ticker['type'] !== 'futures') {
                    corrss[currency]['Чистыми'] += ticker["Сумма продаж"] - ticker["Сумма покупок"] - ticker["Комиссия"]
                }
                
                corrss[currency]['Сделок покупки'] += ticker['Сделок покупки']
                corrss[currency]['Сделок продажи'] += ticker['Сделок продажи']
                corrss[currency]['Оборот'] += ticker['Сумма покупок'] + ticker['Сумма продаж']
            })

            // Итоговая таблица по валютам
            let topTable = '<div class="top-table">';
            Object.keys(corrss).forEach(function (i) {

                let e = corrss[i],
                    currency = kvth._c(i),
                    otherComm = e['НДФЛ'] + e['НДФЛ 15%'] + e['Маржиналка'] + e['Автоследование'] + e['Автоследование рез.'] + e['Дивиденды налог'] + e['Купоны налог'] + e['Обслуживание'] + e['Валютный остаток'] + e['Гербовый сбор'],
                    profit = e['Чистыми'] - (e['НДФЛ'] + e['НДФЛ 15%'] + e['Маржиналка'] + e['Автоследование'] + e['Автоследование рез.'] + e['Обслуживание'] + e['Валютный остаток'] + e['Гербовый сбор']) + e['Маржа'];

                topTable += `<ul>`
                topTable += `<li><span>Чистыми:</span> ${kvth._ft(profit)} ${currency}</li>`

                if (e['Маржа']) {
                    topTable += `<li><span class="turquoise-bg" title="Вариационная маржа">Маржа:</span> ${kvth._ft(e['Маржа'])} ${currency}</li>`
                }
                if (e['Дивиденды']) {
                    topTable += `<li><span class="purple-bg">Дивиденды:</span> ${kvth._ft(e['Дивиденды']-e['Дивиденды налог'])} ${currency}</li>`
                }
                if (e['Купоны']) {
                    topTable += `<li><span class="blue-bg">Купоны:</span> ${kvth._ft(e['Купоны']-e['Купоны налог'])} ${currency}</li>`
                }
                if (e['Комиссия']) {
                    topTable += `<li>Комиссия:</span> ${kvth._ft(e['Комиссия'])} ${currency}</li>`
                }                    
                if (otherComm !== 0) {
                    topTable += `<li><a class="btnShowMore">Прочие комисси:</a> ${kvth._ft(otherComm)} ${currency}`
                    
                    topTable += `<div class="hidden">`
                    if (e['НДФЛ']) {
                        topTable += `<span>НДФЛ:</span> ${kvth._ft(e['НДФЛ'])} ${currency}<br/>`
                    }
                    if (e['НДФЛ 15%']) {
                        topTable += `<span>НДФЛ 15%:</span> ${kvth._ft(e['НДФЛ 15%'])} ${currency}<br/>`
                    }
                    if (e['Маржиналка']) {
                        topTable += `<span title="Списание комиссии за непокрытую позицию">Маржиналка:</span> ${kvth._ft(e['Маржиналка'])} ${currency}<br/>`
                    }
                    if (e['Автоследование']) {
                        topTable += `<span>Автоследование:</span> ${kvth._ft(e['Автоследование'])} ${currency}<br/>`
                    }
                    if (e['Автоследование рез.']) {
                        topTable += `<span title="Списание комиссии за результат">Автоследование рез.:</span> ${kvth._ft(e['Автоследование рез.'])} ${currency}<br/>`
                    }
                    if (e['Дивиденды налог']) {
                        topTable += `<span>Дивиденды налог:</span> ${kvth._ft(e['Дивиденды налог'])} ${currency}<br/>`
                    }
                    if (e['Купоны налог']) {
                        topTable += `<span>Купоны налог:</span> ${kvth._ft(e['Купоны налог'])} ${currency}<br/>`
                    }
                    if (e['Обслуживание']) {
                        topTable += `<span title="Списание комиссии за обслуживание">Обслуживание:</span> ${kvth._ft(e['Обслуживание'])} ${currency}<br/>`
                    }
                    if (e['Валютный остаток']) {
                        topTable += `<span title="Комиссия за валютный остаток">Валютный остаток:</span> ${kvth._ft(e['Валютный остаток'])} ${currency}<br/>`
                    }
                    if (e['Гербовый сбор']) {
                        topTable += `<span>Гербовый сбор:</span> ${kvth._ft(e['Гербовый сбор'])} ${currency}`
                    }

                    topTable += `</div></li>`;
                }
                
                if (e['Оборот'] > 0) {
                    topTable += `<li>Оборот:</span> ${kvth._ft(e['Оборот'])} ${currency}</li>`
                }

                if (e['Сделок покупки']+e['Сделок продажи'] > 0) {
                    topTable += `<li><span title="buy/sell (совершенных)">Сделок:</span>: ${e['Сделок покупки']} / ${e['Сделок продажи']} (${e['Сделок покупки']+e['Сделок продажи']})</li>`
                }
                
                topTable += `</ul>`
                
            });
            topTable += '</div>';

            reportWindow.innerHTML = topTable;
        

            /*
            * Таблица по тикерам
            */
            let table = '<table class="report_table" id="sortable">' +
                '<thead><tr>' +
                '<th>тикер</th>' +
                '<th>профит</th>' +
                '<th>comm</th>' +
                '<th title="buy/sell (совершенных)">сделок</th>' +
                '<th>сумма buy/sell</th>' +
                '<th></th>' +
                '</tr></thead><tbody>';

            let flagPosition = 0, // флаг открытых позиций.
                flagFutures = 0; // Флаг для фьючей

            res.forEach(function (e) {
                let profit = e["Сумма продаж"] - e["Сумма покупок"] - e["Комиссия"]

                if (e.type === 'futures') {
                    profit = e["Сумма продаж"] - e["Сумма покупок"];
                    e['Валюта'] = 'Pt.'
                }

                let cssClass = '';
                0 !== e["Количество"] && (cssClass = "yellow-bg", flagPosition = 1);
                'coupon' === e["type"] && (cssClass = "blue-bg");
                'dividend' === e["type"] && (cssClass = "purple-bg");
                'futures' === e["type"] && (cssClass = "turquoise-bg", flagFutures = 1);
                                
                table += `<tr class="${cssClass}">` +
                    `<td>${e['Тикер']}</td>` +
                    `<td data-sort="${kvth._rt(profit)}">${kvth._style(profit)}</td>` +
                    `<td data-sort="${kvth._rt(e['Комиссия'])}">${kvth._ft(e['Комиссия'])}</td>` +
                    `<td>${e['Сделок покупки']} / ${e['Сделок продажи']} (${(e['Сделок покупки'] + e['Сделок продажи'])})</td>` +
                    `<td data-sort="${kvth._rt(e['Сумма покупок'] + e['Сумма продаж'])}">${kvth._ft(e['Сумма покупок'])} / ${kvth._ft(e['Сумма продаж'])}</td>` +
                    `<td data-sort="${e['Валюта']}">${kvth._c(e['Валюта'])}</td>` +
                    `</tr>`;
            });
            table += '</tbody></table>';

            if (flagPosition) {
                table += '<div class="note">* открытые позиции не учитываются в результате и помечаются в таблице <span class="yellow-bg">цветом</span></div>'
            }
            if (flagFutures) {
                table += '<div class="note">* Результат по фьючерсам см. в поле <span class="turquoise-bg">маржа</span>. В таблице результат ПРИБЛИЗИТЕЛЬНЫЙ.</div>'
            }

            reportWindow.innerHTML += table;

            new Tablesort(document.getElementById('sortable'));

            return res;
        }
    });


    // Установка времени
    document.querySelectorAll('[data-set-time]').forEach(function (el) {
        el.addEventListener('click', function () {

            let fromDate = document.getElementById('fromDate'),
                toDate = document.getElementById('toDate');

            let morning = getYmd(getMorning());
            let monday = getYmd(getMonday());
            
            toDate.value = ''

            switch (el.getAttribute('data-set-time')) {
                case 'from_morning' :
                default:
                    fromDate.value = morning['strYmdhm']
                    break

                case 'from_week' :
                    fromDate.value = `${monday['strYmd']}T${morning['hour']}:${morning['min']}`
                    break

                case 'from_mount' :
                    fromDate.value = `${monday.year}-${monday.month}-01T${morning['hour']}:${morning['min']}`
                    break
            }

            fromDate.onchange()
            toDate.onchange()            
        })
    })



    /**
     * Загружаем группы тикеров
     */
    let tickersWindow = document.getElementById('tickersWindow'),
        notifyBox = document.getElementById('notifyBox'),
        tickersGroups = document.getElementById('tickersGroups'),
        groupTickersList = document.getElementById('groupTickersList'),
        listTickersDelete = [];

    // загрузить группы тикеров
    document.getElementById('kvLoadGroupsTicker').addEventListener('click', async function (e) {
        notifyBox.innerHTML = 'Загрузка групп...'
        let groups = await getFavoritesGroups(config.psid)

        if (!groups) {
            notifyBox.innerHTML = 'Нет групп или ошибка.'
        }

        groups.forEach(s => {
            const option = document.createElement("option");
            option.value = s.id;
            option.text = s.name;
            tickersGroups.appendChild(option);
        })

        tickersWindow.classList.remove("d-none");

        notifyBox.innerHTML = '';
    });


    // загрузить тикеры группы
    tickersGroups.addEventListener('change', async opt => {

        let instruments = await getFavoritesInstrumentsByGroup(config.psid, opt.target.value)

        listTickersDelete.splice(0, listTickersDelete.length)
        groupTickersList.value = instruments.map(item => listTickersDelete.push(item.ticker) && item.ticker).join(' ');
    })


    // сохранить тикеры группы
    document.getElementById('saveGroupTickers').addEventListener('click', async function (e) {

        let groupId = tickersGroups.value,
            items = groupTickersList.value.split(' ').map(item => item.toUpperCase());

        notifyBox.innerHTML = 'Удаляю текущие инструменты из группы.'        
        await deleteFavoritesInstrumentsInGroup(config.psid, groupId, listTickersDelete) // Удалим инструменты из группы

        notifyBox.innerHTML = 'Добавляю новые инструменты в группу.'   
        await addFavoritesInstrumentsInGroup(config.psid, groupId, items) // добавим в неё новые

        notifyBox.innerHTML = 'Успешно сохранено.'
    })


    // экспорт групп и тикеров в них в *.json
    document.getElementById('exportGroupsTickers').addEventListener('click', async function (e) {
        
        notifyBox.innerHTML = 'Загрузка групп...'

        let count = 1,
            exportRes = [],
            groups = await getFavoritesGroups(config.psid)
            
        for (let s of groups) {
            notifyBox.innerHTML = `Загрузка тикеров из групп. ${count} из ${groups.length + 1}`

            let instruments = await getFavoritesInstrumentsByGroup(config.psid, s.id),
                tickers = [];
           
            instruments.map(item => tickers.push(item.ticker) && item.ticker);
            exportRes.push({id: s.id, name: s.name, tickers: tickers})
            count++
        }

        notifyBox.innerHTML = `Группы и тикеры загружены. Проверьте загрузки в браузере.`

        let src = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportRes)),
            link = document.createElement("a");

        link.setAttribute("href", src);
        link.setAttribute("download", "kvt_GroupsAndTickers.json");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });


    // экспорт групп и тикеров в них в *.json
    document.getElementById('importGroupsTickers').addEventListener('click', async function (e) {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', function(){
        if (this.files.length > 0) {
            let reader = new FileReader();

            reader.addEventListener('load', async function() {
                let result = JSON.parse(reader.result)
                
                // достаем текущие группы, что бы потом можно было по ID сравнить или по имени?
                notifyBox.innerHTML = `Загружаем текущие группы`
                let groups = await getFavoritesGroups(config.psid),
                    count_created = 0

                for (let item of result) {
                    let findGroupKey = Object.keys(groups).find(key => groups[key].name === item.name) || null;

                    if (findGroupKey) {
                        await deleteFavoritesInstrumentsInGroup(config.psid, groups[findGroupKey].id, groups[findGroupKey].instruments)
                        await addFavoritesInstrumentsInGroup(config.psid, groups[findGroupKey].id, item.instruments)
                    } else {
                        // создаем группу
                        notifyBox.innerHTML = `Создаем группу <b>${item.name}</b>`
                        await addFavoritesGroup(config.psid, item.name, item.tickers)
                    }

                    count_created++;
                }

                notifyBox.innerHTML = `Готово. Импортированно ${count_created} групп;`


            });

            reader.readAsText(this.files[0]); // Read the uploaded file
        }
    });


    // удалить все избранные тикеры и группы
    document.getElementById('deleteAllGroup').addEventListener('click', async function (e) {
        if (confirm("Уверены что хотите удалить все группы избранного и тикеры?") == true) {
            let count = 1,
                groups = await getFavoritesGroups(config.psid)
                
            for (let s of groups) {
                notifyBox.innerHTML = `Удаление групп и тикеров. ${count} из ${groups.length + 1}`

                await deleteFavoritesGroup(config.psid, s.id)
                count++
            }

            notifyBox.innerHTML = `Группы и тикеры удалены. Обновите страницу терминала.`
        }
    });



    /**
     * Принты
     */
    document.getElementById('kvtLoadPrintsTicker').addEventListener('click', function (e) {
        loadPrintsTicker()
    });

    document.getElementById('kvtDownloadPrintsTicker').addEventListener('click', function (e) {
        loadPrintsTicker(1)
    });

    // Установим дату на сегодня UTC
    (function setPrintDate() {
        let m = new Date();

        document.getElementById('printDate').value = `${m.getUTCFullYear()}-${(m.getUTCMonth() + 1 + "").padStart(2, "0")}-${(m.getUTCDate() + "").padStart(2, "0")}`
    })();

    document.getElementById('printTicker').addEventListener("keydown", function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadPrintsTicker()
        }
    });
}

// 03:49:00 старт торгов по UTC +3 часа = мск, +10 = хабаровск
function getMorning() {
    let d = new Date()

    d.setUTCHours(3)
    d.setUTCMinutes(49)
    d.setUTCSeconds(0)

    return d;
}

function getMonday() {
    let today = new Date();

    today.setUTCHours(3)
    today.setUTCMinutes(49)
    today.setUTCSeconds(0)

    let day = today.getUTCDay() || 7;

    if( day !== 1 ) {
        today.setUTCHours(-24 * (day - 1));
    }

    return today
}

function getYmd(m = new Date()) {
    let year = m.getFullYear(),
        month = (m.getMonth() + 1 + "").padStart(2, "0"),
        date = (m.getDate() + "").padStart(2, "0"),
        hour = (m.getHours() + "").padStart(2, "0"),
        min = (m.getMinutes() + "").padStart(2, "0"),
        strYmd = `${year}-${month}-${date}`,
        strYmdhm = `${strYmd}T${hour}:${min}`

    return {year: year, month: month, date: date, hour: hour, min: min, strYmd: strYmd, strYmdhm: strYmdhm}    
}

async function loadPrintsTicker(onlyDownload = 0) {
    let printsWindow = document.getElementById('printsWindow'),
        printTicker = document.getElementById('printTicker').value,
        printDate = document.getElementById('printDate').value,
        printMinQty = document.getElementById('printMinQty').value;

    if (printTicker) {
        printsWindow.innerHTML  = 'Загрузка...';

        await fetch(`https://kvalood.ru/trades?token=${kvtSettings.kvtToken}&symbol=${printTicker}&date=${printDate}`, {}
        ).then(e => {
            return e.json()            
        }).then(res => {

            var time = performance.now();
            
            if (res.status === 'ERROR') {
                throw res
            }

            if(res.payload && res.payload.trades && res.payload.trades.length) {

                // Объём в деньгах, Покупки/продажи, объём продаж/объём покупок
                let stat = {vol_money: 0, buy_count: 0, sell_count: 0, buy_vol: 0, sell_vol: 0},
                    table = '<table class="report_table mt-2">' +
                        '<thead><tr>' +
                        '<th>цена</th>' +
                        '<th>объем шт</th>' +
                        '<th>объём</th>' +
                        '<th>время</th>' +
                        '</tr></thead><tbody>',
                    limit_show = 4000, // Лимит отображения строк в таблице
                    showed = 0; // Показано строк, если 0 не показывать таблицу

                // ["25.15", 1, "buy", 1668094774648]
                for (let i = 0; i < res.payload.trades.length; i++) {
                    let tr = res.payload.trades[i],
                        vol = tr[0] * tr[1] * res.payload.lotsize

                    res.payload.trades[i][3] = kvth._tsToTime(tr[3], 1)

                    if (tr[1] >= printMinQty) {
                        if (showed < limit_show) {
                            showed++;
                            !onlyDownload ? table += '<tr' + (tr[2] === 'sell' ? ' class="side-sell"' : ' class="side-buy"') + '>' +
                            '<td>' + kvth._ft(tr[0]) + '</td>' +
                            '<td>' + tr[1] + '</td>' +
                            '<td>' + kvth._ft(vol) + '</td>' +
                            '<td>' + tr[3] + '</td>' +
                            '</tr>' : '';
                        }                       
                    }

                    stat.vol_money += vol
                    if (tr[2] === 'sell') {
                        stat.sell_count += tr[1]
                        stat.buy_vol += vol
                    } else {
                        stat.buy_count += tr[1]
                        stat.sell_vol += vol
                    }
                }

                table += '</tbody></table>';

                if (showed === limit_show) {
                    table = kvth._errW(`В таблице показаны последние ${limit_show} сделок, чтобы не грузить ПК`) + table;
                }

                // БЛОК СТАТИСТИКИ
                let statBlock = ''
                if (stat.buy_vol && stat.sell_vol) {
                    statBlock = `
                        <div class="printsStats mb-2">
                            <div class="printsStats__headline d-flex g-2 mb-1" style="gap: 13px;">
                                <div>Объём: <span>${kvth.sizeFormat((stat.buy_vol + stat.sell_vol))} ${res.payload.currency}</span></div>
                                <div>Покупок: <span>${kvth.sizeFormat((stat.buy_vol))} ${res.payload.currency}</span></div>
                                <div>Продаж: <span>${kvth.sizeFormat((stat.sell_vol))} ${res.payload.currency}</span></div>
                            </div>
                            <div class="printsStats__percentage"><div class="printsStats__percentagej-buy" style="width: ${(stat.buy_vol * 100 / (stat.buy_vol + stat.sell_vol)).toFixed()}%"></div></div>
                        </div>
                    `;
                }

                if (!showed) {
                    table = 'Нечего показывать'
                }

                if (onlyDownload) {
                    table = ''
                    downloadCSV(res.payload.trades, `${printTicker}_${printDate}`)
                }

                printsWindow.innerHTML = statBlock + (showed ? table : '');
            } else {
                printsWindow.innerHTML  = 'Нет сделок';
            }

            time = performance.now() - time;
            console.log('Время выполнения = ', time);
            
        }).catch(err => {
            console.log(err)
            printsWindow.innerHTML = kvth._errW(`${err.status}: ${err.message}`)
        })
    } else {
        printsWindow.innerHTML  = kvth._errW('укажите тикер');
    }
}

function downloadCSV (jsonData, filename = 'CSV') {
    let json = jsonData,
        fields = Object.keys(json[0]),
        replacer = function(key, value) { return value === null ? '' : value },
        csv = json.map(function(row){
            return fields.map(function(fieldName){
                return JSON.stringify(row[fieldName], replacer)
            }).join(',')
        })

    csv.unshift(fields.join(',')) // add header column
    csv = csv.join('\r\n');

    let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        link = document.createElement("a");

    if (link.download !== undefined) { // feature detection
        // Browsers that support HTML5 download attribute
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename + '.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Показать подробнее
document.body.addEventListener( 'click', function ( e ) {
    if( e.target.classList.contains("btnShowMore")) { 
        let block = e.target.parentElement.querySelector('.hidden')
        "block" === block.style.display ? block.style.display="none" : block.style.display="block";
    };
});

/**
 * Список счетов аккаунта
 * @returns []
 */
async function getBrokerAccounts (psid) {
    return await fetch(`https://api-invest.tinkoff.ru/trading/user/broker_accounts?appName=invest_terminal&appVersion=&sessionId=${psid}`, {
        method: "POST",
    }).then(function (e) {
        return e.json();
    }).then(function (e) {
        return ((e.payload || {} ).accounts || [])
    }).catch(err => {
        console.error(`[kvt] getBrokerAccounts ERR`, err)
        return null
    })
}

/**
 * Список групп инструментов
 * @param {*} psid 
 * @returns 
 */
async function getFavoritesGroups(psid) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/list?appName=invest_terminal&appVersion=2.0.0&sessionId=${psid}`, {})
        .then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return (e.payload || {}).groups || []
        }).catch(err => {
            console.error(`[kvt] getFavoritesGroups ERR`, err)
            return null
        })
}

/**
 * Создаем группу инструментов
 * @param {*} psid 
 */
async function addFavoritesGroup(psid, groupName, instruments = []) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/create?appName=invest_terminal&appVersion=2.0.0&sessionId=${psid}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({color:"#C7E6FF",emoji:"🙂",instruments: instruments, name: groupName})
    })
        .then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return e
        }).catch(err => {
            console.error(`[kvt] addFavoritesGroup ERR`, err)
            return null
        })
}

/**
 * Удалить группу инструментов
 * @param {*} psid 
 * @param {*} group_id 
 * @returns 
 */
async function deleteFavoritesGroup(psid, group_id) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/delete?groupId=${group_id}&appName=invest_terminal&appVersion=2.0.0&sessionId=${psid}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
    })
        .then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return e
        }).catch(err => {
            console.error(`[kvt] deleteFavoritesGroup ERR`, err)
            return null
        })
}

/**
 * Список тикеров группы инструментов
 * @param {*} psid 
 * @param {*} group_id 
 * @returns 
 */
async function getFavoritesInstrumentsByGroup(psid, group_id) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/instruments/get?appName=invest_terminal&appVersion=2.0.0&tag=All&sortType=Custom&groupId=${group_id}&limit=1000&offset=0&sessionId=${psid}`, {})
        .then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return (e.payload || {}).instruments || []
        }).catch(err => {
            console.error(`[kvt] getFavoritesInstrumentsByGroup ERR`, err)
            return null
        })
}

/**
 * Удалить тикеры из группы инструментов
 * @param {*} psid 
 * @param {*} group_id 
 * @param {*} instruments 
 * @returns 
 */
async function deleteFavoritesInstrumentsInGroup(psid, group_id, instruments) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/instruments/delete?appName=invest_terminal&appVersion=2.0.0&groupId=${group_id}&sessionId=${psid}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({instruments: instruments})
    })
        .then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return e
        }).catch(err => {
            console.error(`[kvt] deleteFavoritesInstrumentsInGroup ERR`, err)
            return null
        })
}

/**
 * Добавить тикеры в группу инструментов
 * @param {*} psid 
 * @param {*} group_id 
 * @param {*} instruments 
 * @returns 
 */
async function addFavoritesInstrumentsInGroup(psid, group_id, instruments) {
    return await fetch(`https://www.tinkoff.ru/api/invest/favorites/groups/instruments/add?appName=invest_terminal&appVersion=2.0.0&groupId=${group_id}&sessionId=${psid}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({instruments: instruments})
        }).then(e => {
            if (e.ok === true && e.status === 200) {
                return e.json()
            } else {
                throw e
            }
        })
        .then(e => {
            return e
        }).catch(err => {
            console.error(`[kvt] addFavoritesInstrumentsInGroup ERR`, err)
            return null
        })
}




run()



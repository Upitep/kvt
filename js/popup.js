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
                reject('Не удалось загрузить config psid. Зайдите на страницу терминала или обновите её.')
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
    for (const key of ['fromDate', 'toDate', 'telegramId', 'kvtToken', 'kvtQuotes', 'compactQuotes', 'customNameQuotes', 'alorToken', 'alorPortfolio', 'kvtFastVolumePrice', 'kvtFastVolumeSize', 'kvtSTIGFastVolSumBot', 'kvtSTIGFastVolSumRcktMon', 'kvtFastSumRelation', 'compactStyle', 'styleTS', 'showNullOperation', 'rcktMonConnect', 'kvtFastVolumePriceRound', 'hideShortsBrokers', 'statsFor', 'printTicker', 'printMinQty', 'debug']) {
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

    // set default value firs time
    if (!await getObjectFromLocalStorage('customNameQuotes')) {
        let event = new Event("change");
        document.getElementById('customNameQuotes').dispatchEvent(event);
    }

    // Кнопка загрузить отчет
    document.getElementById('kvShowReport').addEventListener('click', async function (e) {
        let reportWindow = document.getElementById('reportWindow'),
            m = new Date(),
            i = kvth.createUTCOffset(m),
            fromDate = document.getElementById('fromDate').value,
            toDate = document.getElementById('toDate').value,
            c = (m.getMonth() + 1 + "").padStart(2, "0"),
            l = (m.getDate() + "").padStart(2, "0");

        fromDate = fromDate ? fromDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T00:00:00";
        toDate = toDate ? toDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T23:59:59";
        fromDate += i;
        toDate += i;

        reportWindow.innerHTML = 'Загрузка...';

        if (kvtSettings.statsFor === 'alor') {
            try {
                let alorDate = new Date(fromDate),
                    alorDateTo = new Date(toDate),
                    alorTime = new Date(fromDate).getTime(),
                    df = alorDate.getFullYear() + '-' + (alorDate.getMonth() + 1 + "").padStart(2, "0") + '-' + alorDate.getDate(),
                    alor_operations = [],
                    operationsToday = await kvtAlorGetStatsToday(kvtSettings.alorPortfolio),
                    operationsHistory = await kvtAlorGetStatsHistory(kvtSettings.alorPortfolio, df),
                    result = [];

                console.log('сегодняшние', operationsToday)
                console.log('operationsHistory', operationsHistory)
                //console.log(df)

                if (operationsToday.result === 'error') {
                    throw new Error(operationsToday.status)
                }
                if (operationsHistory.result === 'error') {
                    throw new Error(operationsHistory.status)
                }

                await getStats()

                // Если операций больше 1000, ищем ласт сделку, и от неё отталкиваемся еще раз
                async function getStats(last_order_id) {
                    let operationsHistory = await kvtAlorGetStatsHistory(kvtSettings.alorPortfolio, df, last_order_id)

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

                alor_operations = alor_operations.filter(i => {
                    console.log(new Date(i.date).getTime() > alorTime)
                    return new Date(i.date).getTime() > alorTime
                })


                // alor_operations.splice(0, 1);
                //console.table(alor_operations)
                //console.error(alor_operations.length)

                const yesterday = {}, //Определим позы оставшиеся со вчера
                    tickers = {}

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

                alor_operations.reverse()

                alor_operations.forEach(function (e) {

                    if (e.symbol && e.qty) {

                        let t = e.symbol;

                        if (void 0 === tickers[t]) {
                            let ts = {};
                            ts["Тикер"] = t;
                            ts["Валюта"] = 'USD';
                            ts["Сумма покупок"] = 0;
                            ts["Сумма продаж"] = 0;
                            ts["Сделок покупки"] = 0;
                            ts["Сделок продажи"] = 0;
                            ts["Финансовый результат"] = 0;
                            ts["Количество"] = 0;
                            ts["Сумма открытой позы"] = 0;

                            tickers[t] = ts;
                        }

                        if (e.side === "sell") {
                            tickers[t]["Сделок продажи"]++
                            tickers[t]["Сумма продаж"] += Math.abs((e.price * e.qty) || 0)
                            tickers[t]["Количество"] -= (e.qty || 0);
                        } else if (e.side === "buy") {
                            tickers[t]["Сделок покупки"]++
                            tickers[t]["Сумма покупок"] += Math.abs((e.price * e.qty) || 0)
                            tickers[t]["Количество"] += e.qty;
                        }
                    }
                })

                Object.keys(tickers).forEach(function (e) {
                    return result.push(tickers[e])
                })

                console.table(tickers)

                let total = {},
                    currencies = [];

                result.forEach(function (e) {

                    if (void 0 === total[e['Валюта']]) {
                        total[e['Валюта']] = {
                            commission: 0,
                            result: 0,
                            buyCount: 0,
                            sellCount: 0,
                            buySum: 0,
                            sellSum: 0
                        }
                    }
                    /*if (e["Количество"] > 0) {
                        e["Сумма покупок"] -= e["Сумма открытой позы"]
                    } else if (e["Количество"] < 0) {
                        e["Сумма продаж"] += e["Сумма открытой позы"]
                    }*/

                    e["Финансовый результат"] = e["Сумма продаж"] - e["Сумма покупок"]

                    total[e['Валюта']].result += e["Финансовый результат"]
                    total[e['Валюта']].buyCount += e['Сделок покупки']
                    total[e['Валюта']].sellCount += e['Сделок продажи']
                    total[e['Валюта']].buySum += e['Сумма покупок']
                    total[e['Валюта']].sellSum += e['Сумма продаж']
                });

                // Итоговая таблица
                Object.keys(total).forEach(function (e) {
                    total[e].currency = e;
                    return currencies.push(total[e])
                })

                let topTable = '<div class="top-table">';
                currencies.forEach(function (e) {
                    topTable += '' +
                        '<div>' +
                        '<span>Чистыми:</span> ' + kvth._ft(e.result) + ' ' + kvth._c(e.currency) + '<br/>' +
                        'Оборот: ' + kvth._ft(e.buySum + e.sellSum) + ' ' + kvth._c(e.currency) + '<br/>' +
                        '<span title="buy/sell (совершенных)">Сделок:</span> ' + e.buyCount + ' / ' + e.sellCount + ' (' + (e.buyCount + e.sellCount) + ') ' +
                        '</div>'
                    ;
                });
                topTable += '</div>';

                reportWindow.innerHTML = topTable;

                /*
                * Итоговая таблица по тикерам
                */
                let table = '<table class="report_table" id="sortable">' +
                    '<thead><tr>' +
                    '<th>тикер</th>' +
                    '<th>профит</th>' +
                    '<th title="buy/sell (совершенных)">кол-во сделок</th>' +
                    '<th>сумма buy/sell</th>' +
                    '<th></th>' +
                    '</tr></thead><tbody>';

                result.forEach(function (e) {
                    if (!kvtSettings.showNullOperation && e["Финансовый результат"] === 0/* || e['Сумма открытой позы']*/) {
                        return false;
                    }

                    table += '<tr' + (e['Количество'] !== 0 ? ' class="yellow-bg"' : '') + '>' +
                        '<td>' + e['Тикер'] + '</td>' +
                        '<td data-sort="' + kvth._rt(e['Финансовый результат']) + '">' + kvth._style(e['Финансовый результат']) + '</td>' +
                        '<td>' + e['Сделок покупки'] + ' / ' + e['Сделок продажи'] + ' (' + (e['Сделок покупки'] + e['Сделок продажи']) + ')</td>' +
                        '<td data-sort="' + kvth._rt(e['Сумма покупок'] + e['Сумма продаж']) + '">' + kvth._ft(e['Сумма покупок']) + ' / ' + kvth._ft(e['Сумма продаж']) + '</td>' +
                        '<td data-sort="' + e['Валюта'] + '">' + kvth._c(e['Валюта']) + '</td>' +
                        '</tr>';
                });
                table += '</tbody></table><div class="note">* открытые позиции не учитываются в результате и помечаются в таблице <span class="yellow-bg">цветом</span></div>';

                reportWindow.innerHTML += table;

                new Tablesort(document.getElementById('sortable'));

                return result;
                /*} else {
                    reportWindow.innerHTML = 'Нет сделок за выбранный период или ТИ вернул фигу';
                }*/


                /*if (stats.result && stats.result === 'error') {
                    reportWindow.innerHTML = '';
                    chrome.notifications.create("", {
                        title: "Финансовый результат Алор",
                        message: "Не удалось загрузить",
                        type: "basic",
                        iconUrl: "icons/icon48.png"
                    })
                }*/

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
            if (config !== undefined) {
                let reqBody = {to: toDate, from: fromDate, overnightsDisabled: !0}

                if (kvtSettings.statsFor) {
                    reqBody.brokerAccountId = kvtSettings.statsFor
                }
                
                await fetch(`https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=${config.versionApi}&sessionId=${config.psid}`, {
                    method: "POST",
                    body: JSON.stringify(reqBody)
                }).then(function (e) {
                    return e.json();
                }).then(function (e) {

                    console.log(e)

                    let operations = ((e.payload || {}).items || []),
                        result = []

                    /**
                     * Базовый - ВАЛЮТА
                     * Структура: 
                     *  - ВАЛЮТА->ТИКЕР->
                     */

                    if (operations.length) {

                        let tickers = {},
                            operationsReversed = operations.reverse();

                        operationsReversed.forEach(function (e) {

                            if (e.ticker && e.currency) {

                                let tc = e.ticker + e.currencies;

                                if (void 0 === tickers[tc]) {
                                    let ts = {};
                                    ts["Тикер"] = e.ticker;
                                    ts["Валюта"] = e.currency;
                                    ts["issuer"] = e.issuer;
                                    ts["Комиссия"] = 0;
                                    ts["Финансовый результат"] = 0;
                                    ts["Финансовый результат с учётом комиссии"] = 0;
                                    ts["Сумма покупок"] = 0;
                                    ts["Сумма продаж"] = 0;
                                    ts["Сделок покупки"] = 0;
                                    ts["Сделок продажи"] = 0;
                                    ts["Совершенных сделок"] = 0;
                                    ts["Отмененных сделок"] = 0;
                                    ts["Количество"] = 0;
                                    ts["Сумма открытой позы"] = 0;

                                    tickers[tc] = ts;
                                }

                                if (e.status === "decline") {
                                    tickers[tc]["Отмененных сделок"]++;
                                } else if (e.status === "done") {

                                    switch (e.operationType) {
                                        case 'Sell' : {
                                            tickers[tc]["Сделок продажи"]++
                                            //tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                                            tickers[tc]["Сумма продаж"] += Math.abs(e.payment || 0)
                                            tickers[tc]["Количество"] -= (e.quantity || 0);

                                            if (tickers[tc]["Количество"] === 0) {
                                                tickers[tc]["Сумма открытой позы"] = 0;
                                            } else {
                                                tickers[tc]["Сумма открытой позы"] -= Math.abs(e.payment || 0)
                                            }
                                            break
                                        }

                                        case 'Buy' : {
                                            tickers[tc]["Сделок покупки"]++
                                            //tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                                            tickers[tc]["Сумма покупок"] += Math.abs(e.payment || 0)
                                            tickers[tc]["Количество"] += e.quantity;

                                            if (tickers[tc]["Количество"] === 0) {
                                                tickers[tc]["Сумма открытой позы"] = 0;
                                            } else {
                                                tickers[tc]["Сумма открытой позы"] += Math.abs(e.payment || 0)
                                            }
                                            break
                                        }

                                        // Комиссия брокера
                                        case 'BrokCom' : {
                                            tickers[tc]["Комиссия"] += Math.abs(e.payment || 0)
                                            
                                            break
                                        }

                                        // Начисление вариационной маржи
                                        case 'AccruingVarMargin' : {

                                            break
                                        }

                                        // Списание вариационной маржи
                                        case 'WriteOffVarMargin' : {

                                            break
                                        }

                                        // Списание комиссии за непокрытую позицию
                                        case 'MarginCom' : {

                                            break
                                        }

                                        // Списание комиссии за следование
                                        case 'FollowingCom' : {

                                            break
                                        }

                                        // Списание комиссии за результат
                                        case 'FollowingResultCom' : {

                                            break
                                        }

                                        // Выплата купонов по облигациям
                                        case 'Coupon' : {
                                            tickers[tc]["Сумма покупок"] = 0;
                                            tickers[tc]["Сумма продаж"] += Math.abs(e.payment || 0)
                                            tickers[tc]["НДФЛ"] += Math.abs(e.payment || 0)
                                            break
                                        }

                                        // Удержание НДФЛ по купонам
                                        case 'TaxCpn' : {
                                            tickers[tc]["НДФЛ"] += Math.abs(e.payment || 0)
                                            break
                                        }

                                        // Выплата дивидендов по акциям
                                        case 'Dividend' : {

                                            break
                                        }

                                        // Удержание НДФЛ по дивидендам
                                        case 'TaxDvd' : {

                                            break
                                        }

                                        case 'PayIn' : {

                                            break
                                        }

                                        case 'PayOut' : {

                                            break
                                        }
                                    }
                                }
                            }
                        })

                        Object.keys(tickers).forEach(function (e) {
                            return result.push(tickers[e])
                        })

                        console.table(result)

                        let total = {},
                            currencies = [];

                        result.forEach(function (e) {

                            if (void 0 === total[e['Валюта']]) {
                                total[e['Валюта']] = {
                                    commission: 0,
                                    result: 0,
                                    buyCount: 0,
                                    sellCount: 0,
                                    declineCount: 0,
                                    buySum: 0,
                                    sellSum: 0
                                }
                            }
                            if (e["Количество"] > 0) {
                                e["Сумма покупок"] -= e["Сумма открытой позы"]
                            } else if (e["Количество"] < 0) {
                                e["Сумма продаж"] += e["Сумма открытой позы"]
                            }

                            e["Финансовый результат"] = e["Сумма продаж"] - e["Сумма покупок"]
                            e["Финансовый результат с учётом комиссии"] = e["Сумма продаж"] - e["Сумма покупок"] - e["Комиссия"]

                            total[e['Валюта']].result += e["Финансовый результат с учётом комиссии"]
                            total[e['Валюта']].commission += e["Комиссия"]
                            total[e['Валюта']].buyCount += e['Сделок покупки']
                            total[e['Валюта']].sellCount += e['Сделок продажи']
                            total[e['Валюта']].declineCount += e['Отмененных сделок']
                            total[e['Валюта']].buySum += e['Сумма покупок']
                            total[e['Валюта']].sellSum += e['Сумма продаж']
                        });

                        // Итоговая таблица
                        Object.keys(total).forEach(function (e) {
                            total[e].currency = e;
                            return currencies.push(total[e])
                        })

                        let topTable = '<div class="top-table">';
                        currencies.forEach(function (e) {
                            topTable += '' +
                                '<div>' +
                                '<span>Чистыми:</span> ' + kvth._ft(e.result) + ' ' + kvth._c(e.currency) + '<br/>' +
                                'Комиссия: ' + kvth._ft(e.commission) + ' ' + kvth._c(e.currency) + '<br/>' +
                                'Оборот: ' + kvth._ft(e.buySum + e.sellSum) + ' ' + kvth._c(e.currency) + '<br/>' +
                                '<span title="buy/sell (совершенных/отмененных)">Сделок:</span> ' + e.buyCount + ' / ' + e.sellCount + ' (' + (e.buyCount + e.sellCount) + ' / ' + e.declineCount + ') ' +
                                '</div>'
                            ;
                        });
                        topTable += '</div>';

                        reportWindow.innerHTML = topTable;

                        /*
                        * Итоговая таблица по тикерам
                        */
                        let table = '<table class="report_table" id="sortable">' +
                            '<thead><tr>' +
                            '<th>тикер</th>' +
                            '<th>профит</th>' +
                            '<th>comm</th>' +
                            '<th title="buy/sell (совершенных/отмененных)">кол-во сделок</th>' +
                            '<th>сумма buy/sell</th>' +
                            '<th></th>' +
                            '</tr></thead><tbody>';

                        result.forEach(function (e) {
                            if (!kvtSettings.showNullOperation && e["Финансовый результат"] === 0/* || e['Сумма открытой позы']*/) {
                                return false;
                            }

                            table += '<tr' + (e['Количество'] !== 0 ? ' class="yellow-bg"' : '') + '>' +
                                '<td>' + e['Тикер'] + '</td>' +
                                '<td data-sort="' + kvth._rt(e['Финансовый результат с учётом комиссии']) + '">' + kvth._style(e['Финансовый результат с учётом комиссии']) + '</td>' +
                                '<td data-sort="' + kvth._rt(e['Комиссия']) + '">' + kvth._ft(e['Комиссия']) + '</td>' +
                                '<td>' + e['Сделок покупки'] + ' / ' + e['Сделок продажи'] + ' (' + (e['Сделок покупки'] + e['Сделок продажи']) + ' / ' + e["Отмененных сделок"] + ')</td>' +
                                '<td data-sort="' + kvth._rt(e['Сумма покупок'] + e['Сумма продаж']) + '">' + kvth._ft(e['Сумма покупок']) + ' / ' + kvth._ft(e['Сумма продаж']) + '</td>' +
                                '<td data-sort="' + e['Валюта'] + '">' + kvth._c(e['Валюта']) + '</td>' +
                                '</tr>';
                        });
                        table += '</tbody></table><div class="note">* открытые позиции не учитываются в результате и помечаются в таблице <span class="yellow-bg">цветом</span></div>';

                        reportWindow.innerHTML += table;

                        new Tablesort(document.getElementById('sortable'));

                        return result;
                    } else {
                        reportWindow.innerHTML = 'Нет сделок за выбранный период или ТИ вернул фигу';
                    }
                }).catch(function (error) {
                    reportWindow.innerHTML = '';
                    console.error(error)
                    chrome.notifications.create("", {
                        title: "Финансовый результат",
                        message: "Не удалось загрузить",
                        type: "basic",
                        iconUrl: "icons/icon48.png"
                    })
                });
            } else {
                reportWindow.innerHTML = kvth._errW('Не удалось загрузить config. Обновите страницу терминала.');
                chrome.notifications.create("", {
                    title: "Финансовый результат",
                    message: "Не удалось загрузить config. Обновите страницу терминала.",
                    type: "basic",
                    iconUrl: "icons/icon48.png"
                })
            }
        }
    });


    // Установка времени
    document.querySelectorAll('[data-set-time]').forEach(function (el) {
        el.addEventListener('click', function () {

            let m = new Date(),
                fromDate = document.getElementById('fromDate'),
                toDate = document.getElementById('toDate'),
                year = m.getUTCFullYear(),
                mount = (m.getUTCMonth() + 1 + "").padStart(2, "0"),
                day = (m.getUTCDate() + "").padStart(2, "0");

            let time = year + "-" + mount + "-" + day + "T",
                monday = getMonday()

            switch (el.getAttribute('data-set-time')) {
                case 'from_morning':
                default:
                    // TODO: Если меньше 7 часов, то выводить предыдущий день m.getDate()
                    // if (m.getHours() < 7)
                    fromDate.value = time + '06:59'
                    toDate.value = ''
                    break

                case 'from_week' :
                    fromDate.value = monday.getUTCFullYear() + "-" + (monday.getUTCMonth() + 1 + "").padStart(2, "0") + "-" + (monday.getUTCDate() + "").padStart(2, "0") + "T" + '06:59'
                    toDate.value = ''
                    break

                case 'from_mount' :
                    fromDate.value = monday.getUTCFullYear() + "-" + (monday.getUTCMonth() + 1 + "").padStart(2, "0") + "-" + "1".padStart(2, "0") + "T" + '06:59'
                    toDate.value = ''
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
        tickersGroups = document.getElementById('tickersGroups'),
        groupTickersList = document.getElementById('groupTickersList'),
        listTickersDelete = [];

    // загрузить группы тикеров
    document.getElementById('kvLoadGroupsTicker').addEventListener('click', function (e) {
        fetch("https://www.tinkoff.ru/api/invest/favorites/groups/list?appName=invest_terminal&appVersion=" + config.versionApi + "&sessionId=" + config.psid, {})
            .then(res => res.json())
            .then(res => {
                res.payload.groups.forEach(s => {
                    const option = document.createElement("option");
                    option.value = s.id;
                    option.text = s.name;
                    tickersGroups.appendChild(option);
                })

                tickersWindow.classList.remove("d-none");
            })
    });

    // загрузить тикеры группы
    tickersGroups.addEventListener('change', opt => {

        fetch("https://www.tinkoff.ru/api/invest/favorites/groups/instruments/get?tag=All&sortType=Custom&groupId=" + opt.target.value + "&limit=1000&offset=0&appName=invest_terminal&appVersion=" + config.versionApi + "&sessionId=" + config.psid)
            .then(res => res.json())
            .then(e => {
                listTickersDelete.splice(0, listTickersDelete.length)
                groupTickersList.value = e.payload.instruments.map(item => listTickersDelete.push(item.ticker) && item.ticker).join(' ');
            })
    })

    // сохранить тикеры группы
    document.getElementById('saveGroupTickers').addEventListener('click', function (e) {

        let groupId = tickersGroups.value,
            items = groupTickersList.value.split(' ').map(item => item.toUpperCase());

        fetch("https://www.tinkoff.ru/api/invest/favorites/groups/instruments/delete?groupId=" + groupId + "&appName=invest_terminal&appVersion=" + config.versionApi + "&sessionId=" + config.psid, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({instruments: listTickersDelete})
        }).then(
            res => res.json()
        ).then(res => {
            fetch("https://www.tinkoff.ru/api/invest/favorites/groups/instruments/add?groupId=" + groupId + "&appName=invest_terminal&appVersion=" + config.versionApi + "&sessionId=" + config.psid, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({instruments: items})
            }).then(
                res => res.json()
            ).then(e => {
                chrome.notifications.create("", {
                    title: "Тикеры",
                    message: e.status === 'Ok' ? 'Успешно сохранено' : e.payload.message,
                    type: "basic",
                    iconUrl: "icons/icon48.png"
                })
            });
        })
    })


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

function getMonday() {
    let today = new Date(),
        day = today.getDay() || 7;

    if( day !== 1 ) {
        today.setHours(-24 * (day - 1));
    }

    return today
}

async function loadPrintsTicker(onlyDownload = 0) {
    let printsWindow = document.getElementById('printsWindow'),
        printTicker = document.getElementById('printTicker').value,
        printDate = document.getElementById('printDate').value,
        printMinQty = document.getElementById('printMinQty').value;

    if (printTicker) {
        printsWindow.innerHTML  = 'Загрузка...';

        await fetch(`https://kvalood.ru/trades?token=${kvtSettings.kvtToken}&ticker=${printTicker}&date=${printDate}`, {}
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

                    res.payload.trades[i][3] = kvth._tsToTime(tr[3])

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
        console.error(`[kvt] getBrokerAccounts ERR ${err}`)
        return null
    })
}

run()



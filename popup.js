'use strict';

let storage = chrome.storage.local,
    settings = {},
    config = {};

// запрос на данные ТИ
document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({currentWindow: !0, active: !0}, function (e) {
        e = e[0];
        chrome.tabs.sendMessage(e.id, {type: "config"})
    })
});

// ответ на данные ТИ
chrome.runtime.onMessage.addListener(function (e, t, o) {
    if (e && "config" === e.msg) {
        config = e;
    }
});

// input settings
let settingsInput = ['fromDate', 'toDate', 'telegramId'];
settingsInput.forEach(function (st) {
    storage.get(st, (result) => {
        var t = document.getElementById(st);
        if(result[st]) {
            t.value = result[st];
        }
        t.onchange = function () {
            var obj= {};
            obj[st] = t.value || '';
            storage.set(obj);
        }
    });
});

// checkbox settings
let settingsSwitch = ['compactStyle', 'showNullOperation'];
settingsSwitch.forEach(function (st) {
    storage.get(st, (result) => {
        var t = document.getElementById(st);

        if(result[st]) {
            t.checked = settings[st] = true;
        }
        t.onchange = function () {
            var obj= {};
            obj[st] = settings[st] = t.checked || false;
            storage.set(obj);
        }
    });
});


// Кнопка загрузить отчет
document.getElementById('kvShowReport').addEventListener('click', function (e){
    let reportWindow = document.getElementById('reportWindow'),
        m = new Date(),
        i = createUTCOffset(m),
        fromDate = document.getElementById('fromDate').value,
        toDate = document.getElementById('toDate').value,
        c = (m.getMonth() + 1 + "").padStart(2, "0"), l = (m.getDate() + "").padStart(2, "0");

    fromDate = fromDate ? fromDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T00:00:00";
    toDate = toDate ? toDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T23:59:59";

    fromDate += i;
    toDate += i;

    reportWindow.innerHTML  = 'Загрузка...';

    fetch("https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=" + config.versionApi + "&sessionId=" + config.psid, {
        method: "POST",
        body: JSON.stringify({to: toDate, from: fromDate, overnightsDisabled: !0})
    }).then(function (e) {
        return e.json();
    }).then(function (e) {

        let operations = ((e.payload || {}).items || []).filter(function (e) {
                return ((e || {}).ticker || "").toUpperCase()
            }),
            result = []

        if (operations.length) {

            let tickers = {},
                operationsReversed = operations.reverse();

            operationsReversed.forEach(function (e) {

                if (e.ticker && e.currency) {

                    let t = e.ticker;

                    if (void 0 === tickers[t]) {
                        let ts = {};
                        ts["Тикер"] = t;
                        ts["Валюта"] = e.currency;
                        ts["Комиссия"] = 0;
                        ts["Сумма покупок"] = 0;
                        ts["Сумма продаж"] = 0;
                        ts["Сделок покупки"] = 0;
                        ts["Сделок продажи"] = 0;
                        ts["Совершенных сделок"] = 0;
                        ts["Отмененных сделок"] = 0;
                        ts["Финансовый результат"] = 0;
                        ts["Финансовый результат с учётом комиссии"] = 0;
                        ts["Количество"] = 0;
                        ts["Цена"] = 0;
                        ts["Сумма открытой позы"] = 0;

                        tickers[t] = ts;
                    }

                    if (e.status === "decline") {
                        tickers[t]["Отмененных сделок"]++;
                    } else if (e.status === "done") {
                        if (e.operationType === "Sell") {
                            tickers[t]["Сделок продажи"]++
                            tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                            tickers[t]["Сумма продаж"] += Math.abs(e.payment || 0)
                            tickers[t]["Количество"] -= (e.quantity || 0);

                            if (tickers[t]["Количество"] === 0) {
                                tickers[t]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[t]["Сумма открытой позы"] -= Math.abs(e.payment || 0)
                            }

                        } else if (e.operationType === "Buy") {
                            tickers[t]["Сделок покупки"]++
                            tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                            tickers[t]["Сумма покупок"] += Math.abs(e.payment || 0)
                            tickers[t]["Количество"] += e.quantity;

                            if (tickers[t]["Количество"] === 0) {
                                tickers[t]["Сумма открытой позы"] = 0;
                            } else {
                                tickers[t]["Сумма открытой позы"] += Math.abs(e.payment || 0)
                            }
                        }
                    }
                }
            })

            Object.keys(tickers).forEach(function (e) {
                return result.push(tickers[e])
            })

            let total = {},
                currencies = [];

            result.forEach(function (e) {

                if (void 0 === total[e['Валюта']]) {
                    total[e['Валюта']] = {commission: 0, result: 0, buyCount: 0, sellCount: 0, declineCount: 0, buySum: 0, sellSum: 0}
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

            reportWindow.innerHTML = '';

            // Итоговая таблица
            Object.keys(total).forEach(function (e) {
                total[e].currency = e;
                return currencies.push(total[e])
            })

            let topTable = '<div class="top-table">';
            currencies.forEach(function (e) {
                topTable += '' +
                    '<div>' +
                    '<span>Чистыми:</span> ' + _ft(e.result) + ' ' + _c(e.currency) + '<br/>' +
                    'Комиссия: ' + _ft(e.commission) + ' ' + _c(e.currency) + '<br/>' +
                    'Оборот: ' + _ft(e.buySum + e.sellSum) + ' ' + _c(e.currency) + '<br/>' +
                    '<span title="buy/sell (совершенных/отмененных)">Сделок:</span> ' + e.buyCount + ' / ' + e.sellCount + ' (' + (e.buyCount + e.sellCount) + ' / ' + e.declineCount + ') ' +
                    '</div>'
                ;
            });
            topTable += '</div>';

            reportWindow.innerHTML += topTable;

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
                if (!settings.showNullOperation && e["Финансовый результат"] === 0/* || e['Сумма открытой позы']*/) {
                    return false;
                }

                table += '<tr' + (e['Количество'] !== 0 ? ' class="open-ticker"' : '') + '>' +
                    '<td>' + e['Тикер'] + '</td>' +
                    '<td data-sort="' + _rt(e['Финансовый результат с учётом комиссии']) + '">' + _style(e['Финансовый результат с учётом комиссии']) + '</td>' +
                    '<td data-sort="' + _rt(e['Комиссия']) + '">' + _ft(e['Комиссия']) + '</td>' +
                    '<td>' + e['Сделок покупки'] + ' / ' + e['Сделок продажи'] + ' (' + (e['Сделок покупки'] + e['Сделок продажи']) + ' / ' + e["Отмененных сделок"] + ')</td>' +
                    '<td data-sort="' + _rt(e['Сумма покупок'] + e['Сумма продаж']) + '">' + _ft(e['Сумма покупок']) + ' / ' + _ft(e['Сумма продаж']) + '</td>' +
                    '<td data-sort="' + e['Валюта'] + '">' + _c(e['Валюта']) + '</td>' +
                    '</tr>';
            });
            table += '</tbody></table><div class="note">* открытые позиции не учитываются в результате и помечаются в таблице <span class="open-ticker">цветом</span></div>';

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
});

function _pad(e) {
    return e < 10 ? "0" + e : e
}

function createUTCOffset(e) {
    var t = 0 < e.getTimezoneOffset() ? "-" : "+", e = Math.abs(e.getTimezoneOffset());
    return t + _pad(Math.floor(e / 60)) + ":" + _pad(e % 60)
}

let formatter = new Intl.NumberFormat("ru");
function _ft(e) {
    return formatter.format(e.toFixed(2))
}

function _style(e) {
    if(e < 0) {
        return '<span class="red">' + _ft(e) + '</span>';
    } else {
        return _ft(e)
    }
}

function _rt(e) {
    return e.toFixed(2)
}

function _c(currency) {
    let symbols = {
        'USD': '$', 'RUB': '₽', 'EUR': '€'
    };

    return symbols[currency] || currency;
}



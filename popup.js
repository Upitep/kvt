'use strict';


let inputFromDate = document.getElementById('fromDate'),
    inputToDate = document.getElementById('toDate');

chrome.storage.local.get(['fromDate', 'toDate'], (result) => {
    inputFromDate.value = result.fromDate ? result.fromDate : ''
    inputToDate.value = result.toDate ? result.toDate : ''
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('kvShowReport').addEventListener('click', function (e){
        chrome.tabs.query({currentWindow: !0, active: !0}, function (e) {
            e = e[0];
            chrome.tabs.sendMessage(e.id, {type: "psid"})
        })
    });
});

chrome.runtime.onMessage.addListener(function (e, t, o) {
    if (e && "psid" === e.msg) {

        let reportWindow = document.getElementById('reportWindow'),
            m = new Date(),
            i = createUTCOffset(m),
            fromDate = inputFromDate.value,
            toDate = inputToDate.value,
            c = (m.getMonth() + 1 + "").padStart(2, "0"), l = (m.getDate() + "").padStart(2, "0");

        fromDate = fromDate ? fromDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T00:00:00";
        toDate = toDate ? toDate.replace(" ", "T") : m.getFullYear() + "-" + c + "-" + l + "T23:59:59";

        // установим дату из кеша
        chrome.storage.local.set({fromDate: fromDate, toDate: toDate});

        fromDate += i;
        toDate += i;

        reportWindow.innerHTML  = 'Загрузка...';

        fetch("https://api-invest.tinkoff.ru/trading/user/operations?appName=invest_terminal&appVersion=" + e.versionApi + "&sessionId=" + e.psid, {
            method: "POST",
            body: JSON.stringify({to: toDate, from: fromDate, overnightsDisabled: !0})
        }).then(function (e) {
            return e.json();
        }).then(function (e) {

            let operations = ((e.payload || {}).items || []).filter(function (e) {
                    return ((e || {}).ticker || "").toUpperCase()
                }),
                result = [],
                currencies = [];

            if (operations.length) {

                let tickers = {};

                operations.forEach(function (e) {

                    if(e.ticker && e.currency) {

                        let t = e.ticker;

                        if(void 0 === tickers[t]) {
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

                            tickers[t] = ts;
                        }

                        if (e.status === "decline") {
                            tickers[t]["Отмененных сделок"]++;
                        } else if(e.status === "done") {
                            if (e.operationType === "Sell") {
                                // ticker[e.ticker].s++
                                tickers[t]["Сделок продажи"]++
                                tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                                tickers[t]["Сумма продаж"] += Math.abs(e.payment || 0)

                            } else if (e.operationType === "Buy") {
                                //tickers[t].s++
                                tickers[t]["Сделок покупки"]++
                                tickers[t]["Комиссия"] += Math.abs(e.commission || 0)
                                tickers[t]["Сумма покупок"] += Math.abs(e.payment || 0)
                            }
                        }
                    }
                })

                Object.keys(tickers).forEach(function (e) {
                    return result.push(tickers[e])
                })

                let total = {};
                result.forEach(function (e) {

                    e["Финансовый результат"] = e["Сумма продаж"] - e["Сумма покупок"]
                    e["Финансовый результат с учётом комиссии"] = e["Сумма продаж"] - e["Сумма покупок"] - e["Комиссия"]

                    if(e["Финансовый результат"] === 0) {
                        return false;
                    }

                    if(void 0 === total[e['Валюта']]) {
                        total[e['Валюта']] = {commission: 0, result: 0, buyCount: 0, sellCount: 0, buySum: 0, sellSum: 0}
                    }

                    total[e['Валюта']].result += e["Финансовый результат с учётом комиссии"]
                    total[e['Валюта']].commission += e["Комиссия"]
                    total[e['Валюта']].buyCount += e['Сделок покупки']
                    total[e['Валюта']].sellCount += e['Сделок продажи']
                    total[e['Валюта']].buySum += e['Сумма покупок']
                    total[e['Валюта']].sellSum += e['Сумма продаж']

                });

                reportWindow.innerHTML = '';

                // Итоговая таблица
                Object.keys(total).forEach(function (e) {
                    total[e].currency = e;
                    return currencies.push(total[e])
                })

                currencies.forEach(function (e) {
                    reportWindow.innerHTML += '' +
                        '<p>Чистая прибыль: ' + _ft(e.result) + ' ' + e.currency + '<br/>' +
                        'Комиссия: '+ _ft(e.commission) + ' ' + e.currency + '<br/>' +
                        'Оборот: '+ _ft(e.buySum + e.sellSum) + ' ' + e.currency + '</p>'
                    ;
                });

                let table = '<table class="report_table" id="sortable">' +
                    '<thead><tr>' +
                    '<th>тикер</th>' +
                    '<th>прибыль</th>' +
                    '<th>комиссия</th>' +
                    '<th>сделок buy/sell</th>' +
                    '<th>сумма buy/sell</th>' +
                    '<th>валюта</th>' +
                    '</tr></thead><tbody>';
                result.forEach(function (e) {
                    if(e["Финансовый результат"] === 0) {
                        return false;
                    }

                    table += '<tr>' +
                        '<td>'+e['Тикер']+'</td>'+
                        '<td>'+_style(e['Финансовый результат с учётом комиссии']) +'</td>'+
                        '<td>'+_ft(e['Комиссия'])+'</td>'+
                        '<td>'+e['Сделок покупки']+ ' / ' + e['Сделок продажи'] + '</td>'+
                        '<td>'+_ft(e['Сумма покупок'])+ ' / ' + _ft(e['Сумма продаж']) + '</td>'+
                        '<td>' + e['Валюта'] + '</td>'+
                        '</tr>';
                });
                table += '</tbody></table>';

                reportWindow.innerHTML += table;

                new Tablesort(document.getElementById('sortable'));

                return result;
            }
        }).catch(function (e) {
            console.error(e)
            return console.error(e), chrome.notifications.create("", {
                title: "Финансовый результат",
                message: "Не удалось загрузить",
                type: "basic",
                iconUrl: "icons/icon48.png"
            })
        })

    }
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



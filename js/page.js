"use strict";

let kvtd = false,
    kvth,
    kvtSettings,
    kvtStates = {
        kvts: {},
        rcktMon: {}
    },
    kvtSymbolInfo = {},
    kvtGroups = {
        1: "rgb(255, 212, 80)",
        2: "rgb(255, 123, 118)",
        3: "rgb(163, 129, 255)",
        4: "rgb(77, 195, 247)",
        5: "rgb(174, 213, 127)",
        6: "rgb(77, 161, 151)",
        7: "rgb(255, 183, 76)",
        8: "rgb(248, 163, 77)",
        9: "rgb(255, 136, 99)",
        10: "rgb(238, 128, 93)",
        11: "rgb(255, 120, 167)",
        12: "rgb(212, 93, 140)",
        13: "rgb(188, 113, 201)",
        14: "rgb(124, 174, 255)",
        15: "rgb(75, 208, 225)",
        16: "rgb(115, 176, 119)",
    },
    kvtWidgets = {
        spbTS: {
            name: 'T&S',
            icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 15C11.866 15 15 11.866 15 8C15 4.134 11.866 1 8 1C4.134 1 1 4.134 1 8C1 11.866 4.134 15 8 15ZM10.6745 9.62376L8.99803 8.43701L8.9829 4.5097C8.98078 3.95742 8.53134 3.51143 7.97906 3.51356C7.42678 3.51568 6.98079 3.96512 6.98292 4.5174L7.00019 9.00001C7.00152 9.34537 7.18096 9.66281 7.47482 9.84425L9.62376 11.3255C10.0937 11.6157 10.7099 11.4699 11 11C11.2901 10.5301 11.1444 9.91391 10.6745 9.62376Z" fill="rgb(var(--pro-icon-color))"></path></svg>',
            template: '<div class="kvt-widget"><div class="kvt-widget-inner"><table class="kvt-widget-table"><thead><tr><th>Price</th><th>Size</th><th>Vol.</th><th>Time</th></tr></thead><tbody class="kvt-widget-content"></tbody></table></div></div>',
            templateItem: (jd, widgetId) => {
                let line = document.createElement('tr');
                line.classList.add(`type-${jd.side}`);
                line.setAttribute("data-ts-id", jd.id);
                line.innerHTML = `<td>${jd.price}</td><td>${jd.qty}</td><td>${kvth._ft(jd.qty * jd.price * jd.lotSize)}</td><td>${kvth._tsToTime(jd.timestamp).padStart(12)}</td>`;
                line.onclick = function() {
                    kvt.setPrice(widgetId, jd.price)
                }

                return line;
            },
            unsubscribe: unsubscribe_TS
        },
        getdp: {
            name: 'GETDP',
            icon: '',
            template: '<div class="kvt-widget"><div class="kvt-widget-inner"><table class="kvt-widget-table"><thead><tr><th>Symb</th><th>Size</th><th>Price</th><th>Vol.$</th><th>Time</th></tr></thead><tbody class="kvt-widget-content"></tbody></table></div></div>',
            templateItem: (jd) => {
                let line = document.createElement('tr');
                line.classList.add(`type-${jd.side}`);
                line.classList.add('getdp-item');
                line.setAttribute("data-ts-id", jd.id);

                line.innerHTML = `<td class="item-ticker"><div><span>${jd.text}</span><span class="item-ticker-symbol">${jd.symbol}</span><span>${jd.smallCap ? '⚠️' : ''}</span></div></td><td>${kvth.sizeFormat(jd.qty)}</td><td>${kvth._ft(jd.price)}</td><td class="item-total">${kvth.sizeFormat(jd.qty * jd.price)}</td><td class="item-timestamp">${kvth._tsToTime(jd.timestamp).padStart(12)}</td>`

                let stig = createSTIGline(jd.symbol);
                
                stig && line.querySelector('.item-ticker').insertAdjacentElement('beforeEnd', stig);
                return line;
            },
            unsubscribe: unsubscribe_getdp
        }
    },
    kvtWidgetsSettings = {};


// TODO: обернуть всё в класс
class KvaloodTools {

    constructor () {

    }

    /**
     * Загружаем виджеты из localStorage
     */
    widgetsLoad() {
        let widgets = JSON.parse(localStorage.getItem("_kvt-widgets") || "{}")
    
        if (Object.keys(widgets).length) {
            setTimeout(function() {
                kvtd ?? console.log('[kvt][widgetsLoad] БД Есть виджеты')
                Object.keys(widgets).forEach(i => {
                    let widget = document.querySelector(`[data-widget-id=${i}]`)
    
                    if (widget) {
                        kvtd ?? console.log('[kvt][widgetsLoad] Виджет есть', i, widget)
                        kvtCreateWidget(widget)
                    } else {
                        // kvtd ?? console.log('[kvt][widgetsLoad] Виджета НЕТ, но он в БД', i, widget)
                        // delete kvtWidgets[i]
                    }
                })
    
                //localStorage.setItem("_kvt-widgets", JSON.stringify(kvtWidgets))
            }, 1)
        } else {
            kvtd ?? console.log('[kvt][widgetsLoad]', 'Виджетов нет')
        }
    }

    /**
     * Установим тикер в группу     * 
     * @param {*} symbol 
     * @param {*} group_id 
     * @param {*} type При указании type, устанавливает быстрый объём
     * @returns 
     */
    setSymbolInGroup(symbol, group_id, type) {
        let widget = kvt.getGroupWidget(group_id);
    
        if (!widget) {
            kvtd ?? console.error(`[kvt][setSymbolInGroup] Виджет не найден. ${symbol} ${group_id} ${type}`)
            return null;
        }
        let reactObjectName = Object.keys(widget).find(function (key) {
            return key.startsWith("__reactFiber$")
        });
    
        let target = widget[reactObjectName].memoizedProps.children.find(function (child) {
            return typeof child === 'object' && child !== null
        })
    
        target && target._owner.memoizedProps.selectSymbol(symbol)
    
        if (type) {
            this.setFastSum(widget, symbol, type)
        }
    }

    /**
     * Установим быстрый объём при переходе к тикеру из бота или рокетмуна
     */
    async setFastSum (widget, symbol, type) {
        let assetSymbol = this.getWidgetAssetDetail(widget),
            targetSum = 0,
            currencies = {'PIPS': 'rub'},
            currency = currencies[assetSymbol.currency] ? currencies[assetSymbol.currency] : assetSymbol.currency;        

        if (kvtSettings[type] && kvtSettings[type][currency]) {
            targetSum = kvtSettings[type][currency]
        }

        // Заранее указанный объём в деньгах для конкретных тикеров
        if (window.__kvtFastSumRelation === undefined && kvtSettings.kvtFastSumRelation) {
            window.__kvtFastSumRelation = {};
            (kvtSettings.kvtFastSumRelation.split(',') || []).forEach(grp => {
                let t = grp.split(':')
                t[0] && t[1] ? window.__kvtFastSumRelation[t[0]] = t[1] : false;
            })
        }        

        if (window.__kvtFastSumRelation && window.__kvtFastSumRelation[symbol]) {
            targetSum = window.__kvtFastSumRelation[symbol]
        }

        if (targetSum) {
            setTimeout(async () => {
                let {price} = await this.getSymbolPriceLot(widget, symbol);
                this.setFastVolume(widget, (targetSum / price / assetSymbol.lotSize).toFixed());
            }, 600)
        }
    }

    /**
     * Цена и лотность из html
     * @param {*} widget 
     * @returns 
     */
    async getSymbolPriceLot(widget, symbol) {
        let price_block = widget.querySelector('[class^="src-components-OrderHeader-styles-price-"] > div').innerHTML,
            price = parseFloat(price_block.replace(/\s+/g, '').replace(/[,]+/g, '.')),
            future_price = 0;

        if (price_block.endsWith('пт.')) {
            if (!kvtSettings.brokerAccountId) {
                kvtSettings.brokerAccountId = await kvt.getBrokerAccounts()
            }

            future_price = await kvt.getFullPriceLimit(symbol, price, kvtSettings.brokerAccountId);                            
            kvtd ?? console.log(`[kvt] стоимость фьча html=${price_block}, и из запроса=${future_price}`)
        }

        return {price, future_price}
    }

    /**
     * Быстрые кнопки в шт.
     * @param {*} widget 
     */
    async addFastVolumeSizeButtons(widget) {
        if (widget && kvtSettings.kvtFastVolumeSize) {     
               
            await kvt.waitForElm(`[data-widget-id="${widget.getAttribute('data-widget-id')}"] [class^="src-components-OrderHeader-styles-price-"]`).then(e => {
                let block = widget.querySelector('[class*="src-modules-CombinedOrder-components-OrderSummary-OrderSummary-orderSummary-"]')
                let insertBlock = widget.querySelector('.kvtFastVolumeSize');
        
                if (!insertBlock) {
                    block.insertAdjacentHTML("beforebegin", '<div class="kvtFastVolumeSize"></div>');
                    insertBlock = widget.querySelector('.kvtFastVolumeSize');
                } else {
                    insertBlock.innerHTML = ''
                }
        
                for (let vol of kvtSettings.kvtFastVolumeSize.split(',')) {
                    vol = vol.replace(/\D/g,'')
                    let vel = document.createElement('span')
                    vel.setAttribute('data-kvt-volume', vol);
                    vel.innerHTML = vol;
        
                    insertBlock.insertAdjacentElement('beforeend', vel)
                    vel.onclick = e => {
                        kvt.setFastVolume(widget, vol)
                    }
                }
            })        
        }
    }

    /**
     * Быстрые кнопки в деньгах
     * @param {*} widget 
     */
    async addFastVolumePriceButtons(widget) {

        if (widget && kvtSettings.kvtFastVolumePrice) {

            await this.waitForElm(`[data-widget-id="${widget.getAttribute('data-widget-id')}"] [class^="src-components-OrderHeader-styles-price-"]`)

            let insertBlock = widget.querySelector('.kvtFastVolumePrice');
            if (!insertBlock) {
                widget.querySelector('[class^="src-modules-CombinedOrder-components-OrderSummary-OrderSummary-orderSummary-"]').insertAdjacentHTML("beforebegin", '<div class="kvtFastVolumePrice"></div>');
                insertBlock = widget.querySelector('.kvtFastVolumePrice');
            } else {
                insertBlock.innerHTML = ''
            }

            // Узнаём цену, и если можем вставить кнопку, вставляем ?

            for (let i of kvtSettings.kvtFastVolumePrice.split(',')) {
                let vel = document.createElement('span')
                vel.setAttribute('data-kvt-volume', i);
                vel.innerHTML = kvth.sizeFormat(i);
                insertBlock.insertAdjacentElement('beforeend', vel)
                vel.onclick = e => {
                    this.velButtonClick(e.target)
                }            
            }
        }    
    }

    /**
     * При клике на кнопку быстрого объёма в деньгах, рассчитываем кол-во
     * @param {*} e 
     */
    async velButtonClick(e) {
        let vol = e.getAttribute('data-kvt-volume');
        let widget = e.closest('[data-widget-type="COMBINED_ORDER_WIDGET"]')        
        let price_block = widget.querySelector('[class^="src-components-OrderHeader-styles-price-"] > div').innerHTML,
            price = parseFloat(price_block.replace(/\s+/g, '').replace(/[,]+/g, '.')),
            future_price = 0;

        let assetSymbol = this.getWidgetAssetDetail(widget)

        if (price_block.endsWith('пт.')) {
            if (!kvtSettings.brokerAccountId) {
                kvtSettings.brokerAccountId = await kvt.getBrokerAccounts()
            }

            let symbol = widget.getAttribute('data-symbol-id')

            future_price = await kvt.getFullPriceLimit(symbol, price, kvtSettings.brokerAccountId);                            
            kvtd ?? console.log(`[kvt] стоимость фьча html=${price_block}, и из запроса=${future_price}`)
        }

        let prc = future_price !== 0 ? future_price : price

        this.setFastVolume(widget, Number((vol / prc / assetSymbol.lotSize).toFixed()))
    }

    /**
     * Установка быстрого объёма в шт. в окне заявки
     * @param {*} widget 
     * @param {*} vol 
     */
    setFastVolume(widget, vol) {
        let input = widget.querySelector('[class^="src-modules-CombinedOrder-components-OrderForm-OrderForm-leftInput-"]')
        input.querySelector('input').focus() // ставим фокус на поле цены
        input = input.nextSibling
        input = input.querySelector('input')
    
        vol = vol.toString()
    
        let i = kvt.reactGetEl(input)
    
        i.onChange({
            target: {value: vol},
            currentTarget: {value: vol}
        })
    }

    /**
     * Установка цены в виджет "заявка"
     * @param {*} widgetId 
     * @param {*} vol 
     */
    setPrice(widgetId, vol) {
        let widget = document.querySelector('[data-widget-id="'+ widgetId +'"]'),
            group_id = this.getWidgetGroup(widget)

        if (group_id) {
            let widgetOrder = this.getGroupWidget(group_id)

            if (widgetOrder) {
                let input = widgetOrder.querySelector('[class^="src-modules-CombinedOrder-components-OrderForm-OrderForm-leftInput-"]')
                input = input.querySelector('input')
            
                vol = vol.toString()
            
                let i = kvt.reactGetEl(input)
            
                i.onChange({
                    target: {value: vol},
                    currentTarget: {value: vol}
                })
            }
        }
    }

    /**
     * Ждём появления html элемента
     */
    waitForElm(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
    
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                }
            });
    
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    reactGetEl (t) {
        var e = Object.keys(t).find(function (t) {
            return t.startsWith("__reactProps$")
        });
        return e ? t[e] : null
    }

    customRound(val, n = 100) {
        return Math.round(val / n) * n;
    }

    /**
     * Установка индикации состояния сервиса
     * @param {string} name 
     * @param {init} state 
     * @param {string} msg 
     * @param {string} httpCode 
     */
    setState(name, state, msg, httpCode) {
        kvtStates[name] = {state: state, msg: msg, httpCode: httpCode}
    
        let st = document.querySelector(`[data-kvt-state-name=${name}]`)
        if (st) {
            st.setAttribute("data-kvt-state-value", state)
            st.setAttribute("title", `${name} - ${msg}`)
        }
    }

    /**
     * Получим состояние подключения к сервису 
     * @param {*} name 
     * @returns 0 - disconnected, 1 - connect proccess, 2 - connected
     */
    getState(name) {
        return ((kvtStates[name] || {}).state || 0)
    }

    /**
     * Запрос на информацию о тикере (у каких брокеров шорты итд.)
     * @param {*} widget 
     */
    getSymbolInfo(widget) {
        kvtd ?? console.log('[kvt][getSymbolInfo]', widget, widget.getAttribute("data-symbol-id"))

        if (window.__kvtWS && window.__kvtWS.readyState === 1) {                
            let widgetId = widget.getAttribute('data-widget-id');
            kvtSymbolInfo[widgetId] = kvth.uuidv4();

            window.__kvtWS.send(JSON.stringify({
                user_id: kvtSettings.telegramId,
                type: 'symbolInfo',
                symbol: widget.getAttribute("data-symbol-id"),
                guid: kvtSymbolInfo[widgetId] 
            }));

            let block = widget.querySelector('.kvt-shortsBrokers')
            if (block) block.remove()
        } else {
            if (this.getState('kvts') !== 0) {
                setTimeout(function(){
                    kvt.getSymbolInfo(widget)
                }, 700)
            }
            kvtd ?? console.log('[kvt][getSymbolInfo]', 'Нет данных, сокет не готов')
        }
    }

    /**
     * Информация о тикере, лотность, биржа, итд.
     * @param {*} widget 
     * @returns 
     */
    getWidgetAssetDetail(widget) {
        let reactObjectName = Object.keys(widget).find(function (key) {
            return key.startsWith("__reactFiber$")
        });
        
        let target = widget[reactObjectName].memoizedProps.children.find(function (child) {
            return typeof child === 'object' && child !== null
        })

        return target && target._owner.memoizedProps.asset || null
    }

    /**
     * Get used brokerAccountId
     * @returns 
     */
    async getBrokerAccounts () {
        return await fetch(`https://api-invest.tinkoff.ru/trading/user/broker_accounts?appName=invest_terminal&appVersion=&sessionId=${kvtSettings.psid}`, {
            method: "POST",
        }).then(function (e) {
            return e.json();
        }).then(function (e) {
            return ((e.payload || {} ).accounts || [])[0].brokerAccountId
        }).catch(err => {
            console.error(`[kvt] getBrokerAccounts ERR ${err}`)
            return null
        })
    }

    /**
     * 
     * @param {string} ticker 
     * @param {number} price 
     * @param {number} brokerAccountId 
     * @param {number} quantity 
     * @returns 
     */
    async getFullPriceLimit (ticker, price, brokerAccountId, quantity = 1) {
        return await fetch(`https://api-invest.tinkoff.ru/trading/order/full_price_limit?appName=invest_terminal&appVersion=2.0.0&sessionId=${kvtSettings.psid}`, {
            method: "POST",
            body: JSON.stringify({"quantity":quantity, "price":price, "operationType":"Buy", "brokerAccountId": brokerAccountId, "ticker": ticker})
        }).then(function (e) {
            return e.json();
        }).then(function (e) {
            return (((e.payload || {} ).fullAmount || {}).value || null)
        }).catch(err => {
            console.error(`[kvt] getFullPriceLimit ERR ${err}`)
            return null
        })
    }

    /**
     * Информация о тикере через API ти
     * @param {*} ticker 
     * @returns 
     */
    async symbolDetail (ticker) {
        return await fetch(`https://api-invest.tinkoff.ru/trading/stocks/get?ticker=${ticker}&appName=invest_terminal&appVersion=2.0.0&sessionId=${kvtSettings.psid}`).then(function (e) {
            return e.json();
        }).then(function (e) {
            return e.payload || {}
        }).catch(err => {
            console.error(`[kvt] getFullPriceLimit ERR ${err}`)
            return null
        })
    }

    /**
     * Найдём виджет "заявка" по group_id
     * @param {*} group_id 
     * @returns 
     */
    getGroupWidget(group_id){
        let orderWidgetObject;
        document.querySelectorAll('[data-widget-type="COMBINED_ORDER_WIDGET"]').forEach(function (widget) {
            if (widget.querySelector('div[class^="src-core-components-GroupMenu-GroupMenu-icon-"][style*="color: ' + kvtGroups[group_id] + '"]')) {
                orderWidgetObject = widget;
            }
        })
        return orderWidgetObject;
    }

    /**
     * Узнаем группу виджета
     * @param {*} widget 
     */
    getWidgetGroup(widget) {
        let color = ((widget.querySelector('div[class^="src-core-components-GroupMenu-GroupMenu-icon-"]').style) || null).color || null
        
        return color ? Object.keys(kvtGroups).find(key => kvtGroups[key] === color) : false;        
    }

    /**
     * Все активные виджеты "заявка"
     * @returns 
     */
    getActiveGroupsWidget() {
        let activeGroupsIds = [];

        document.querySelectorAll('div[class^="src-core-components-GroupMenu-GroupMenu-icon-"]').forEach(item => {
            let group_id = Object.keys(kvtGroups).find(key => kvtGroups[key] === item.style.color)

            if (group_id && !activeGroupsIds.includes(group_id)) {
                activeGroupsIds.push(group_id)
            }
        })
             
        return activeGroupsIds.sort((a, b) => a - b);
    }

    /**
     * Заполним индексы в шапке
     * @param {*} quotes 
     */
    setQuotes(quotes) {
        Object.keys(quotes).forEach(symb => {
            let block = document.querySelector(`[class*=src-containers-Profile-styles-wallet-] > [data-kvt-quote="${symb}"]`)

            if (block) {
                let val = block.querySelector('.qt-v'),
                    percent = block.querySelector('.qt-p');

                val && quotes[symb].v !== val.innerHTML && (quotes[symb].v > val.innerHTML ? val.setAttribute("class", "qt-v profit") : val.setAttribute("class", "qt-v loss"));

                val.textContent = quotes[symb].v;
                percent.textContent = `(${quotes[symb].p}%)`;

                setTimeout(function(){
                    val.setAttribute("class", "qt-v")
                }, 700)

                if (quotes[symb].p >= 0) {
                    percent.setAttribute("class", "qt-p profit");
                    percent.textContent = `(+${quotes[symb].p}%)`;
                } else {
                    percent.setAttribute("class", "qt-p loss");
                    percent.textContent = `(${quotes[symb].p}%)`;
                }
            }
        })
    }
}

const kvt = new KvaloodTools();


let kvtInject_TIMER = setInterval(() => {
    if (document.querySelector("[data-kvt-extension]") !== null) {
        clearInterval(kvtInject_TIMER)

        kvth = new kvtHelper()
        kvtSettings = JSON.parse(document.querySelector("[data-kvt-extension]").innerHTML)

        if (kvtSettings.debug) {
            kvtd = null
        }

        // Подключаемся к сервисам
        if (kvtSettings.telegramId && kvtSettings.kvtToken) {
            kvt.setState('kvts', 1, 'Connect...');
            kvt_connect()
        } else {
            kvtd ?? console.warn('[kvt]', 'telegramId и/или kvt токен не установлен')
            kvt.setState('kvts', 0, `telegramId и/или kvt токен не установлен`)
        }

        // Подключение к rcktMon
        if (kvtSettings.rcktMonConnect) {
            rcktMonConnect();
        } else {
            kvtd ?? console.warn('[kvt]', `Опция 'Переключать тикеры из RcktMon' выключена`)
            kvt.setState('rcktMon', 0, `Опция 'Переключать тикеры из RcktMon' выключена`)
        }

        // Запуск оболочки
        let kvtInit_TIMER = setInterval(() => {
            let kvtRoot = document.getElementById("root")
            if (kvtRoot && kvtRoot.querySelector("header") && !kvtRoot.classList.contains('kvtRoot')) {
                kvtRoot.classList.add('kvtRoot')
                kvtd ?? console.log('[kvt] !!! INITED !!!')
                kvtRun()
                clearInterval(kvtInit_TIMER)
            }
        }, 100);

    }
}, 100);


function kvtRun() {

    // STATE: Индикация соединений
    document.querySelector('[class*=src-containers-Profile-styles-buttons-]').insertAdjacentHTML('afterbegin', '<div class="kvt-state"></div>')
    let kvtState = document.querySelector('.kvt-state')
    Object.keys(kvtStates).forEach(i => {
        kvtState.insertAdjacentHTML('beforeend', `<div data-kvt-state-name="${i}" data-kvt-state-value="${(kvtStates[i].state || 0)}" title="${i} - ${(kvtStates[i].msg || 'нет попыток подключиться')}"></div>`)
    });

    /**
     *
     */
    new MutationObserver(function (mutationsList, observer) {
        for (let mutation of mutationsList) {
            if (!mutation.removedNodes.length) {
                if (mutation.target && mutation.type === 'childList') {

                    // Добавляем в меню кнопку виджета
                    let ptMenu = mutation.target.querySelector(".pro-menu")
                    if (ptMenu && !ptMenu.classList.contains("kvt-menu-load")) {
                        ptMenu.classList.add('kvt-menu-load')
                        let modelItem = Array.from(ptMenu.querySelectorAll('[class*="pro-text-overflow-ellipsis"]'))
                            .find(item => /^уведомления/gi.test(item.textContent))

                        if (modelItem && modelItem.parentNode) {
                            modelItem = modelItem.parentNode

                            var deliverySelector = ptMenu.querySelector('[class*="divider"]');
                            ptMenu.insertAdjacentElement("beforeend", deliverySelector.cloneNode(true));

                            Object.keys(kvtWidgets).forEach(i => {
                                let newItem = ptMenu.insertAdjacentElement('beforeend', modelItem.parentNode.cloneNode(true))

                                newItem.querySelector('.pro-icon').innerHTML = kvtWidgets[i].icon;
                                newItem.querySelector('[class*="text"]').textContent = kvtWidgets[i].name
                                newItem.onclick = function () {
                                    window['__kvtNewWidget'] = i
                                    modelItem.click()
                                }
                            })
                        }

                        // Создаем кнопки быстрого перехода к стакану
                        let s = mutation.target.querySelector('[data-qa-tag="menu-item"] [data-qa-tag="tag"] > .pro-tag-content')
                        if (s && s.innerHTML !== 'Новый') {
                            createSTIG(s.innerHTML)
                            break
                        }
                    }

                    // Создаём Виджеты
                    kvtCreateWidget(mutation.target.closest('[data-widget-type="SUBSCRIPTIONS_WIDGET"]'))

                    // Если добавили новый виджет заявки / сменили таб
                    let el = mutation.target.closest('[data-widget-type="COMBINED_ORDER_WIDGET"]')
                    if (el && !el.classList.contains('kvt-widget-load')) {
                        el.classList.add('kvt-widget-load')
                        kvt.addFastVolumeSizeButtons(el)
                        kvt.addFastVolumePriceButtons(el)
                        kvt.getSymbolInfo(el)
                    }
                }            
            }
        }
    }).observe(document.body, {
        childList: true,
        subtree: true
    })


    /**
     * Генерим быстрые переходы к группе по тикеру из разных виджетов
     */
    if (kvtSettings.fastSTIG) {

        new MutationObserver(function (mutationsList, observer) {
            for (let mutation of mutationsList) {
                
                for (let node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue; // only html elemtnts, NO text
                    
                    if (node.hasAttribute('data-index') && node.hasAttribute('data-known-size') && node.hasAttribute('data-index-in-group') ) {
    
                        if (node.tagName === 'DIV') {
                            if (node.firstChild.matches('[class*="src-modules-Orders-containers-styles-item-"]')) {
                                // Активные заявки
                                let item = node.firstChild.querySelector('.UICard')
                                item.setAttribute('data-kvt-itemSTIG-load', '')
        
                                let stig = createSTIGline(item.getAttribute('data-symbol-id'))
        
                                if (stig) {
                                    item.querySelector('[class*=src-modules-Orders-containers-components-styles-header-]').insertAdjacentElement("beforeend", stig)
                                }
                            } else if (node.firstChild.matches('[class*="src-modules-Timeline-containers-components-TimelineList-styles-wrapper-"]')) {
                                // История операций
                                let item = node.firstChild.querySelector('.UICard')
                                item.setAttribute('data-kvt-itemSTIG-load', '')
        
                                let stig = createSTIGline(item.getAttribute('data-symbol-id'))
        
                                if (stig) {
                                    item.querySelector('[class*=src-components-TickerInfo-TickerInfo-container-]').insertAdjacentElement("beforeend", stig)
                                }
                            }
                        } else if (node.tagName === 'TR') {
                            node.setAttribute('data-kvt-itemSTIG-load', '')
                            let symbol = node.getAttribute('data-symbol-id')
                            let stig = createSTIGline(symbol)
                            if (stig) {
                                node.firstChild.insertAdjacentElement("beforeend", stig)
                            }
                        }
                        
                    } else if (node.tagName === 'TBODY' && node.getAttribute('data-test-id') === "virtuoso-viewport") {
                        // Вставляем список в виджете инструменты
    
                        // перебираем элементы
                        node.querySelectorAll('tr').forEach(tr => {
                            tr.setAttribute('data-kvt-itemSTIG-load', '')
                            let symbol = tr.getAttribute('data-symbol-id')
                            let stig = createSTIGline(symbol)
                            if (stig) {
                                tr.firstChild.insertAdjacentElement("beforeend", stig)
                            }
                        })
                    }
                }
    
            }
        }).observe(document.body, {
            childList: true,
            subtree: true
        })
    
        new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes') {
                    // при смене data-symbol-id у tr item в "инструменты" и "портфель"
                    if (mutation.target.tagName === 'TR' && mutation.target.hasAttribute('data-index') && mutation.target.hasAttribute('data-known-size') && mutation.target.hasAttribute('data-index-in-group') ) {
                        let symbol = mutation.target.getAttribute('data-symbol-id')
                        let stig = createSTIGline(symbol)
                        if (stig) {
                            mutation.target.firstChild.insertAdjacentElement("beforeend", stig)
                        }
                    }
                }
            })
        }).observe(document.body, {
            childList: true,
            subtree: true,
            attributeFilter: ['data-symbol-id']
        }) 
    }

    kvt.widgetsLoad()

    if (kvtSettings.kvtQuotes && kvtSettings.kvtQuotes.length) {
        subscribe_quotes()

        let quotesBlock = document.querySelector('[class*=src-containers-Profile-styles-wallet-]'),
            deliver = quotesBlock.querySelector('[class*="src-containers-Profile-styles-divider"]'),
            newDeliver = deliver.insertAdjacentElement("afterend", deliver.cloneNode(true));

        if (kvtSettings.compactQuotes) {
            quotesBlock.classList.add('compactQuotes')
        }

        let customNames = {};
        if (kvtSettings.customNameQuotes) {            
            kvtSettings.customNameQuotes.split(",").filter(String).forEach(el => {
                let id = el.split(':');
                customNames[id[0]] = id[1]
            })
        }

        kvtSettings.kvtQuotes.forEach(s => {
            newDeliver.insertAdjacentHTML("beforebegin", `<div data-kvt-quote="${s}">${customNames[s] ? customNames[s] : s}:<span class="qt-v">N/A</span><span class="qt-p">(N/A)</span></div>`)
        })
    }

    // при загрузке страницы работаем с виджетами заявки
    let widgets = document.querySelectorAll('[data-widget-type="COMBINED_ORDER_WIDGET"]')
    if (widgets.length) {
        widgets.forEach(function (widget) {
            widget.classList.add('kvt-widget-load')
            kvt.addFastVolumeSizeButtons(widget)
            kvt.addFastVolumePriceButtons(widget)
            kvt.getSymbolInfo(widget)
        })
    }

    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes') {
                // При смене data-symbol-id у виджета "заявка"
                if (mutation.target.getAttribute('data-widget-type') === 'COMBINED_ORDER_WIDGET') {
                    let symbol = mutation.target.getAttribute('data-symbol-id')
                    let prevSymbol = mutation.oldValue

                    if (prevSymbol !== symbol) {
                        kvt.addFastVolumeSizeButtons(mutation.target)
                        kvt.addFastVolumePriceButtons(mutation.target)
                        kvt.getSymbolInfo(mutation.target)
                    }
                }

                // При смене табов
                if (mutation.target.getAttribute('id') === 'SpacePanel') {

                    delete window.__kvtWidgetGroups; // очистим группы

                    //  отписываемся от разных данных
                    if (window.__kvtTs) {
                        for (let item of window.__kvtTs) {
                            unsubscribe_TS(item.widgetId)
                        }
                    }

                    if (window.__kvtGetdp) {
                        for (let item of window.__kvtGetdp) {
                            unsubscribe_getdp(item.widgetId)
                        }
                    }
                }
            }
        })
    }).observe(document.body, {
        childList: true,
        subtree: true,
        attributeOldValue: true,
        attributeFilter: ['data-symbol-id', 'data-space-id']
    })    
}

function kvt_connect(resubscribe = false) {
    window.__kvtWS = new WebSocket(`wss://kvalood.ru?id=${kvtSettings.telegramId}&token=${kvtSettings.kvtToken}&ver=${kvtSettings.extensionVer}`);
    //window.__kvtWS = new WebSocket(`ws://localhost:28972?id=${kvtSettings.telegramId}&token=${kvtSettings.kvtToken}&ver=${kvtSettings.extensionVer}`);

    window.__kvtWS.onopen = (e) => {
        kvtd ?? console.log("[kvt][kvts ws]", "Подключен к серверу kvts");
        kvt.setState('kvts', 2, `Подключен к серверу kvts`)

        // Переподписка на Getdp
        if (window.__kvtGetdp && resubscribe) {
            for (let item of window.__kvtGetdp) {
                subscribe_getdp(item.widgetId, item.symbol)
            }
        }

        // Переподписка на TS
        if (window.__kvtTs && resubscribe) {
            for (let item of window.__kvtTs) {
                kvtd ?? console.warn('subscribe_TS_5')
                subscribe_TS(item.widgetId, item.symbol, item.guid)
            }
        }

        if (kvtSettings.kvtQuotes) {
            subscribe_quotes()
        }

        window.__kvtWS.onmessage = (message) => {
            let msg = JSON.parse(message.data);

            switch (msg.type) {
                case 'setSymbol':
                    kvt.setSymbolInGroup(msg.symbol, msg.group, 'StigFastSum_bot')
                    break

                case 'ts': {
                    if (msg.data && msg.symbol && window.__kvtTs) {
                        let objs = window.__kvtTs.filter(item => item.symbol === msg.symbol)
                        objs.forEach(w => {
                            insetItemsContent(w.widgetId, msg.data)
                        })
                    }                    
                }

                case 'symbolInfo': {
                    let widgetId = Object.keys(kvtSymbolInfo).find(key => kvtSymbolInfo[key] === msg.guid),
                        widget = document.querySelector('[data-widget-id="'+ widgetId +'"]')

                    if (widget && msg.data) {
                        if (msg.data.shortsBrokers && !kvtSettings.hideShortsBrokers) {
                            let block = widget.querySelector('.kvt-shortsBrokers span'),                                
                                blockVal = msg.data.shortsBrokers.length > 0 ? msg.data.shortsBrokers.join(", ") : '—';

                            if (block) {
                                block.innerHTML = blockVal;
                            } else {
                                let OrderBody = widget.querySelector('[class*="OrderBody-OrderBody-scrollContainer-"]');
                                OrderBody && OrderBody.insertAdjacentHTML("beforeend", '<div class="kvt-shortsBrokers">🩳 <span>' + blockVal +'</span></div>')
                            }
                        }

                        let titleBlock = widget.querySelector('[class^=src-components-TickerInfo-TickerInfo-firstColumn-]');

                        if (msg.data.smallCap) {
                            !titleBlock.querySelector('.smallCap') ? titleBlock.insertAdjacentHTML('afterbegin', '<span class="smallCap" title="Компания малой капитализации с повышенной комиссией СПБ биржи">⚠️</span>') : '';                          
                        }

                        if (msg.data.noSync) {
                            !titleBlock.querySelector('.noSync') ? titleBlock.insertAdjacentHTML('afterbegin', '<span class="noSync" title="Возможно акция без синхронизации с США">⛔️</span>') : '';                          
                        }

                        if (msg.data.blockQ) {
                            !titleBlock.querySelector('.blockQ') ? titleBlock.insertAdjacentHTML('afterbegin', '<span class="blockQ" title="Возможно поломанна синхронизация с США. Нельзя сдать в Q">🆘</span>') : '';                          
                        }
                    }

                    break;
                }

                case 'getdp': {
                    if (msg.data && window.__kvtGetdp) {                        
                        let objs = window.__kvtGetdp.filter(item => (msg.symbol && item.symbol === msg.symbol) || (!msg.symbol && !item.symbol))
    
                        objs.forEach(w => {
                            insetItemsContent(w.widgetId, msg.data)
                        })
                    }

                    break;
                }

                case 'quotes': {
                    if (msg.payload) {
                        kvt.setQuotes(msg.payload)
                    }
                }
            }
        };
    };

    window.__kvtWS.onclose = (event) => {
        let msg
        if (event.wasClean) {
            msg = `Соединение закрыто чисто, код=${event.code} причина=${event.reason}`
        } else {
            msg = `Соединение прервано, код=${event.code} причина=${event.reason}`

            setTimeout(function() {
                kvt_connect(true);
            }, 5000);
        }

        kvtd ?? console.log('[kvt][kvts ws][close]', msg);
        kvt.setState('kvts', 0, msg)
    };

    window.__kvtWS.onerror = (error) => {
        kvtd ?? console.warn('[kvt][kvts ws][error]', error.message);
    };
}

function rcktMonConnect() {
    window.__RcktMonWS = new WebSocket('ws://localhost:51337');

    window.__RcktMonWS.onopen = (e) => {
        kvtd ?? console.log('[kvt][RcktMon ws]', 'connected to RcktMon');
        kvt.setState('rcktMon', 2, 'connected to RcktMon')
    };

    window.__RcktMonWS.onmessage = (message) => {
        const msg = JSON.parse(message.data);
        kvtd ?? console.log('[kvt][RcktMon ws][Message]', msg);
        kvt.setSymbolInGroup(msg.ticker, msg.group, 'StigFastSum_rcktmon');
    }

    window.__RcktMonWS.onclose = (event) => {
        let msg
        if (event.wasClean) {
            msg = `Соединение закрыто чисто, код=${event.code} причина=${event.reason}`
        } else {
            msg = `Соединение прервано, код=${event.code} причина=${event.reason}`
            if (event.code !== 1006) {
                setTimeout(function () {
                    rcktMonConnect();
                }, 5000);
            }
        }
        kvtd ?? console.log('[kvt][RcktMon ws][close]', msg);
        kvt.setState('rcktMon', 0, msg)
    };

    window.__RcktMonWS.onerror = (error) => {
        kvtd ?? console.warn('[kvt][RcktMon ws][error]', error.message);
    };
}



function createSTIGline(symbol) {
    !window.__kvtWidgetGroups ? window.__kvtWidgetGroups = kvt.getActiveGroupsWidget() : 0

    if (window.__kvtWidgetGroups.length && symbol && symbol !== 'mainCurrency') {
        let el = document.createElement('div');
        el.classList.add('getdp-stigButtons')
        for (let i of window.__kvtWidgetGroups) {    
            el.insertAdjacentElement("beforeEnd", createVel(symbol, i));        
        }
        el.onclick = e => {
            e.stopPropagation();
        } 
        return el;
    } else {
        return false;
    }
}


function createSTIG(symbol) {

    let groups = kvt.getActiveGroupsWidget()

    if (groups.length) {
        let t = document.querySelector('.kvt-menu-load [class*=src-components-Menu-styles-item-]'),
            el = document.querySelector('.kvt-stigButtons');

        if (el != null) {
            el.innerHTML = '';
        } else {
            el = document.createElement('div');
            el.className = 'kvt-stigButtons';
            t.insertAdjacentElement("afterend", el);
        }

        for (let i of groups) {
            el.insertAdjacentElement("beforeEnd", createVel(symbol, i));
        }
    }
}

function createVel(symbol, groupId) {
    let vel = document.createElement('div')

    vel.className = 'kvt-stig-item';
    vel.style.cssText = "color: " + kvtGroups[groupId];
    vel.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="7" fill="currentColor"></circle></svg>';

    vel.onclick = e => {
        e.stopPropagation();
        kvt.setSymbolInGroup(symbol, groupId, 'StigFastSum_stig')
    }

    return vel;
}


function kvtCreateWidget(widget) {
    if (widget && !widget.getAttribute('data-kvt-widget-load')) {
        let storageWidgets = JSON.parse(localStorage.getItem("_kvt-widgets") || "{}"),
            widgetID = widget.getAttribute("data-widget-id"),
            symbol = widget.getAttribute("data-symbol-id") || '',
            widgetType,
            onClose = function () {};     

        if (typeof storageWidgets[widgetID] !== 'undefined') {
            widgetType = storageWidgets[widgetID]['type'] ? storageWidgets[widgetID]['type'] : storageWidgets[widgetID];
        } else if (window[`__kvtNewWidget`]) {
            widgetType = window[`__kvtNewWidget`]
            storageWidgets[widgetID] = {type: widgetType, settings: {}}
            window[`__kvtNewWidget`] = false;
        }

        if (Object.keys(kvtWidgets).includes(widgetType)) {            
            kvtd ?? console.log(`[kvt][kvtCreateWidget] вызвали изменение виджета ${widgetID}`)
                       
            widget.setAttribute('data-kvt-widget-load', widgetType)
            kvtWidgetsSettings[widgetID] = storageWidgets[widgetID] = {type: widgetType, settings: ((storageWidgets[widgetID] || {}).settings || {})}
            
            localStorage.setItem("_kvt-widgets", JSON.stringify(storageWidgets))
            
            if (widgetType === 'spbTS') {
                initWidget(widget, widgetType, symbol)
                kvtd ?? console.log('[kvt][spbTS]', 'хотим подписаться на ', widgetID, symbol)

                if (kvtSettings['styleTS']) {
                    widget.querySelector('.kvt-widget').classList.add(`styleTS_${kvtSettings['styleTS']}`)
                }
                
                if (symbol.length) {
                    kvtd ?? console.warn('subscribe_TS_3')
                    subscribe_TS(widgetID, symbol)
                }
                observeWidgetChangeSymbol(widget, widgetType, (newSymbol) => {
                    unsubscribe_TS(widgetID);
                    kvtd ?? console.warn('subscribe_TS_4')
                    subscribe_TS(widgetID, newSymbol);
                })
                onClose = unsubscribe_TS

                generateSettings(widget, widgetType, widgetID)
            }
    
            if (widgetType === 'getdp') {
                initWidget(widget, widgetType, symbol)
                subscribe_getdp(widgetID, symbol)
                observeWidgetChangeSymbol(widget, widgetType, (newSymbol) => {
                    unsubscribe_getdp(widgetID);                
                    subscribe_getdp(widgetID, newSymbol);
                })
                onClose = unsubscribe_getdp
                
                generateSettings(widget, widgetType, widgetID)
            }


            function generateSettings(widget, widgetType, widgetID) {

                let setting_btn = widget.querySelector('[class*="src-core-components-WidgetBody-WidgetBody-portalIcons-"]')

                setting_btn.innerHTML = `<div class="src-containers-IconsPortal-styles-popoverTarget-3etvx"><div class="pro-popover-content"><span data-qa-tag="icon" data-qa-icon="settings-small-filled" class="src-containers-IconsPortal-styles-icon-2TlS0 pro-icon-interactive pro-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="rgb(var(--pro-icon-color))" fill-rule="evenodd" clip-rule="evenodd" d="M7 14a6 6 0 0 0 2 0v-2a4 4 0 0 0 1 0l1 1a6 6 0 0 0 2-2l-1-1a4 4 0 0 0 0-1h2V8a6 6 0 0 0 0-1h-2a4 4 0 0 0 0-1l1-1-2-2-1 1H9V2a6 6 0 0 0-2 0v2H6L5 3 4 4 3 5l1 1v1H2a6 6 0 0 0 0 2h2a4 4 0 0 0 0 1l-1 1 1 1a6 6 0 0 0 1 1l1-1a4 4 0 0 0 1 0v2Zm3-6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"></path></svg></span></div></div>`;

                setting_btn.addEventListener("click", function () {
                    "block" === kws.style.display ? kws.style.display="none" : kws.style.display="block";
                })

                widget.querySelector('.kvt-widget').insertAdjacentHTML("beforeend", '<div class="kvt-widget-settings"></div>')
                let kws = widget.querySelector('.kvt-widget-settings')

                let settings_list = [];
                
                // Настройки
                if (widgetType === 'spbTS') {
                    settings_list = ['lotSize_show']

                    kws.innerHTML = `<div class="pro-input-group sectionItem"><label>Показывать real-time принты лотностью от</label><input type="number" oninput="validity.valid||(value='');" name="lotSize_show" class="pro-input"></div><button type="button" class="pro-button pro-small pro-intent-primary"><span class="pro-button-text">Сохранить</span></button>`
                }

                if (widgetType === 'getdp') {
                
                    settings_list = ['subsgetdp', 'getdp_audio']
    
                    kws.innerHTML = `<label class="pro-control pro-switch pro-align-right sectionItem"><input type="checkbox" name="getdp_audio"><span class="pro-control-indicator"></span>Аудио уведомление </label>

                    <label class="pro-control pro-switch pro-align-right sectionItem"><input type="checkbox" name="subsgetdp"><span class="pro-control-indicator"></span>MOEX </label>
    
                    <label class="pro-control pro-switch pro-align-right sectionItem"><input type="checkbox" name="subsgetdp2"><span class="pro-control-indicator"></span>SPBX BIG </label>
    
                    <label class="pro-control pro-switch pro-align-right sectionItem"><input type="checkbox" name="subsgetdp3"><span class="pro-control-indicator"></span>SPBX PRIVATE </label>
                    
                    <button type="button" class="pro-button pro-small pro-intent-primary"><span class="pro-button-text">Сохранить</span></button>`
                }

                // загружаем настройки
                for (const id of settings_list) {
                    let el = kws.querySelector(`[name=${id}]`)

                    if (el.getAttribute('type') === 'checkbox') {
                        el.checked = kvtWidgetsSettings[widgetID].settings[id] || false;
                    } else if (el.tagName === 'SELECT' && el.getAttribute('multiple') !== null) {
                        
                    } else if (el.getAttribute('type') === 'number') {
                        el.value = kvtWidgetsSettings[widgetID].settings[id] || '';
                    } else {
                        el.value = kvtWidgetsSettings[widgetID].settings[id] || '';
                    }
                }

                // Сохраняем настройки
                kws.querySelector('button').addEventListener('click', function () {
                    storageWidgets = JSON.parse(localStorage.getItem("_kvt-widgets") || "{}")
                    kvtWidgetsSettings[widgetID]['settings'] = {}

                    for (const id of settings_list) {
                        let el = kws.querySelector(`[name=${id}]`)

                        if (el.getAttribute('type') === 'checkbox') {
                            kvtWidgetsSettings[widgetID]['settings'][id] = el.checked
                        } else if (el.tagName === 'SELECT' && el.getAttribute('multiple') !== null) {
                            
                        } else {
                            kvtWidgetsSettings[widgetID]['settings'][id] = el.value || '';
                        }
                    }

                    storageWidgets[widgetID] = kvtWidgetsSettings[widgetID]
                    localStorage.setItem("_kvt-widgets", JSON.stringify(storageWidgets))
                    
                    kws.style.display = 'none'
                })

            }            
    
            // отписка при закрытии виджета
            widget.querySelector('[class*="src-core-components-WidgetBody-WidgetBody-icons-"] [data-qa-icon="cross"]').addEventListener("click", function () {
                onClose(widgetID)
                storageWidgets = JSON.parse(localStorage.getItem("_kvt-widgets") || "{}")
                delete storageWidgets[widgetID]
                localStorage.setItem("_kvt-widgets", JSON.stringify(storageWidgets))
            })
        }
    }
}

function initWidget(widget, widgetType, symbol = '') {
    widget.querySelector('[class*="-WidgetBody-title-"]').textContent = `${kvtWidgets[widgetType].name} ${symbol}`

    if (widget.getAttribute('data-kvt-widget-init')) {
        widget.querySelector('.kvt-widget-content').innerHTML = ''
    } else {
        widget.setAttribute('data-kvt-widget-init', widgetType)
        let widgetContent = widget.querySelector('.widget')
        widgetContent.parentNode.removeChild(widgetContent)

        widget.lastElementChild.firstChild.insertAdjacentHTML("beforeend", kvtWidgets[widgetType].template)
    }
}

function insetItemsContent(widgetId, data) {
    let widget = document.querySelector('[data-widget-id="'+ widgetId +'"]'),
        wContent = widget ? widget.querySelector('.kvt-widget-content') : 0,
        wType = widget && wContent ? widget.getAttribute('data-kvt-widget-load') : 0;

    if (widget && wContent && wType) {
        if (data.length > 1) {
            wContent.innerHTML = ''
            let todayDate = new Date().getUTCDate(),
                sepDate = todayDate;

            for (let jd of data) {
                let jdTime = new Date(jd.timestamp),
                    jdDate = jdTime.getUTCDate();

                if (jdDate !== todayDate && sepDate !== jdDate) {
                    sepDate = jdDate
                    wContent.insertAdjacentHTML('beforeend', `<tr class="type-separator"><td colspan="100%">🔸🔸🔹🔹 ${(jdTime.getUTCDate() + "").padStart(2, "0")}-${(jdTime.getUTCMonth() + 1 + "").padStart(2, "0")}-${jdTime.getUTCFullYear()} 🔹🔹🔸🔸</td></tr>`)
                }

                wContent.insertAdjacentElement('beforeend', kvtWidgets[wType].templateItem(jd, widgetId))
            }
        } else {
            for (let jd of data) {
                if(jd.qty >= (((kvtWidgetsSettings[widgetId] || {}).settings || {}).lotSize_show || 1)) {
                    wContent.insertAdjacentElement('afterbegin', kvtWidgets[wType].templateItem(jd, widgetId))
                    if (399 < wContent.children.length) {
                        wContent.lastChild.remove();
                    }
                }
            }
        }
    }    
}

function observeWidgetChangeSymbol(widget, widgetType, callback) {
    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes') {
                let symbol = mutation.target.getAttribute('data-symbol-id')
                let prevSymbol = mutation.oldValue

                kvtd ?? console.log('[kvt][observeWidgetChangeSymbol]', `newSymbol: ${symbol}`, `prevSymbol: ${prevSymbol}`)

                if (prevSymbol !== symbol) {
                    initWidget(widget, widgetType, symbol)
                    callback(symbol)
                }
            }
        })
    }).observe(widget, {
        attributeOldValue: true,
        attributeFilter: ['data-symbol-id']
    })
}

async function subscribe_TS(widgetId, symbol) {
    !window.__kvtTs ? window.__kvtTs = [] : 0
    let obj = {widgetId: widgetId, symbol: symbol}

    window.__kvtTs = window.__kvtTs.filter(i => i.widgetId !== widgetId);
    window.__kvtTs.push(obj)

    kvtd ?? console.log('[kvt][subscribe_TS]', obj.widgetId, obj.symbol)
    
    if (window.__kvtWS && window.__kvtWS.readyState === 1) {
        window.__kvtWS.send(JSON.stringify({
            type: 'subscribeTS',
            symbol: symbol
        }));
    } else {
        if (kvt.getState('kvts') !== 0) {
            setTimeout(function(){
                subscribe_TS(widgetId, symbol, obj.guid)
            }, 700)
        }
        kvtd ?? console.log('[kvt][subscribe_TS]', 'Не подписался, сокет не готов')
    }
}

function unsubscribe_TS(widgetId) {

    kvtd ?? console.log('[kvt][unsubscribe_TS]', widgetId)

    let obj = window.__kvtTs ? window.__kvtTs.find(item => item.widgetId === widgetId) : 0
    
    if (obj) {

        // Вдруг на один и тот же тикер подписан несколько раз
        let anotherSubs = window.__kvtTs ? window.__kvtTs.find(item => item.widgetId !== widgetId && item.symbol === obj.symbol) || false : false;

        if (window.__kvtWS && window.__kvtWS.readyState === 1 && !anotherSubs) {
            window.__kvtWS.send(JSON.stringify({
                type: 'unsubscribeTS',
                symbol: obj.symbol
            }));

            kvtd ?? console.log('[kvt][unsubscribe_TS]', 'отписался от ', widgetId)
        }

        // удалим
        window.__kvtTs = window.__kvtTs.filter((item) => item.widgetId !== widgetId);
    }
}


function subscribe_getdp(widgetId, symbol) {
    !window.__kvtGetdp ? window.__kvtGetdp = [] : 0

    let obj = {widgetId: widgetId, symbol: symbol}

    window.__kvtGetdp = window.__kvtGetdp.filter(i => i.widgetId !== widgetId);
    window.__kvtGetdp.push(obj)

    kvtd ?? console.log('[kvt][subscribe_getdp]', widgetId, obj)

    // Запросим последние getdp записи    
    if (window.__kvtWS && window.__kvtWS.readyState === 1) {
        window.__kvtWS.send(JSON.stringify({
            type: 'getdp',
            symbol: symbol,
        }));

        kvtd ?? console.log('[kvt][subscribe_getdp]', 'подписался')
    } else {
        if (kvt.getState('kvts') !== 0) {
            setTimeout(function(){
                subscribe_getdp(widgetId, symbol)
            }, 200)
        }
        
        kvtd ?? console.log('[kvt][subscribe_getdp]', 'Не подписался, сокет не готов') // TODO: Удалить это, или будет спам ошибок 
    }
}

function unsubscribe_getdp(widgetId) {

    kvtd ?? console.log('[kvt][unsubscribe_getdp]', widgetId)

    let obj = window.__kvtGetdp ? window.__kvtGetdp.find(item => item.widgetId === widgetId) : 0

    if (obj) {

        // Вдруг на один и тот же тикер подписан несколько раз, или открыто несколько getdp без тикера 
        let anotherSubs = window.__kvtGetdp ? window.__kvtGetdp.find(item => item.widgetId !== widgetId && (item.symbol === obj.symbol || item.symbol === '' && obj.symbol === '') ) || false : false;

        if (window.__kvtWS && window.__kvtWS.readyState === 1 && !anotherSubs) {
            window.__kvtWS.send(JSON.stringify({
                user_id: kvtSettings.telegramId,
                type: 'unsubscribe',
                symbol: obj.symbol
            }));

            kvtd ?? console.log('[kvt][unsubscribe_getdp]', 'отписался от ', widgetId)
        } else {
            kvtd ?? console.log('[kvt][unsubscribe_getdp]', 'Не отписался, сокет не готов')
        }

        window.__kvtGetdp = window.__kvtGetdp.filter((item) => item.widgetId !== widgetId);
    } else {
        kvtd ?? console.log('[kvt][unsubscribe_getdp]', 'такой подписки нет')
    }
}

function subscribe_quotes() {
    kvtd ?? console.log(`[kvt][subscribe_quotes] вызов`)

    if (window.__kvtWS && window.__kvtWS.readyState === 1) {
        window.__kvtWS.send(JSON.stringify({
            user_id: kvtSettings.telegramId,
            type: 'quotes',
            symbols: kvtSettings.kvtQuotes
        }));

        kvtd ?? console.log(`[kvt][subscribe_quotes] подписался`)
    } else {
        if (kvt.getState('kvts') !== 0) {
            setTimeout(function(){
                subscribe_quotes()
            }, 200)
        }
        
        kvtd ?? console.log(`[kvt][subscribe_quotes] Не подписался, сокет не готов`)
    }
}

function getKvtTsByGuid(guid) {
    return window.__kvtTs ? window.__kvtTs.find(item => item.guid === guid) : 0
}


let kvtAlorJWT;

async function kvtSyncAlorAccessToken() {
    if (kvtAlorJWT && !kvtIsTokenExpired(kvtAlorJWT)) return;
    return await fetch('https://oauth.alor.ru/refresh?token=' + kvtSettings.alorToken, {method: 'POST'}).then(e => {
        if (e.ok === true && e.status === 200) {
            return e.json()
        } else {
            throw e
        }
    }).then(e => {
        kvtAlorJWT = e.AccessToken;
        return e
    }).catch(err => {
        return err
    })
}

function kvtIsTokenExpired(token) {
    if (token) {
        try {
            const [, bs] = token.split('.');
            const {exp: exp} = JSON.parse(window.atob(bs).toString())
            if (typeof exp === 'number') {
                return Date.now() + 1000 >= exp * 1000;
            }
        } catch {
            return true;
        }
    }
    return true;
}

async function kvtAlorGetInfoSymbol(symbol, exchange = 'SPBX') {
    await kvtSyncAlorAccessToken()    

    return await fetch(`https://api.alor.ru/md/v2/Securities/${exchange}/${symbol}`, {
        headers: {
            'Authorization': 'Bearer ' + kvtAlorJWT
        }
    }).then(e => {
        if (e.ok === true && e.status === 200) {
            return e.json()
        } else {
            throw e
        }
    }).catch(err => {
        return {result: 'error', status: err.status + ' ' + err.statusText};
    })
}

async function kvtAlorGetStatsToday(portfolio, exchange = 'SPBX') {
    await kvtSyncAlorAccessToken()

    return await fetch(`https://api.alor.ru/md/v2/Clients/${exchange}/${portfolio}/trades`, {
        headers: {
            'Authorization': 'Bearer ' + kvtAlorJWT
        }
    }).then(e => {
        if (e.ok === true && e.status === 200) {
            return e.json()
        } else {
            throw e
        }
    }).catch(err => {
        return {result: 'error', status: err.status + ' ' + err.statusText};
    })
}

async function kvtAlorGetStatsHistory(portfolio, exchange = 'SPBX', dateFrom, tradeNumFrom, dateTo) {

    await kvtSyncAlorAccessToken()

    const url = new URL(`https://api.alor.ru/md/stats/${exchange}/${portfolio}/history/trades`);

    if (dateFrom) {
        url.searchParams.append("dateFrom", dateFrom);
    }

    if (dateTo) {
        url.searchParams.append("dateTo", dateTo);
    }

    if (tradeNumFrom) {
        url.searchParams.append("from", tradeNumFrom);
    }

    return await fetch(url.toString(), {
        headers: {
            'Authorization': 'Bearer ' + kvtAlorJWT
        }
    }).then(e => {
        if (e.ok === true && e.status === 200) {
            return e.json()
        } else {
            throw e
        }
    }).then(items => {
        if (tradeNumFrom) {
            return items.filter(item => {
                return item.id !== tradeNumFrom
            })
        } else {
            return items
        }
    }).catch(err => {
        return {result: 'error', status: err.status + ' ' + err.statusText};
    })
}
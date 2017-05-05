"use strict";

/**
 * Fixed by CF 2017-05-05
 *
 * Possible will needed to install if dependency will corrupted
 * "navigator": "^1.0.1",
 * "promise": "^7.1.1",
 * "jquery-deferred": "^0.3.1",
 * "request": "*",
 * "htmlparser": "^1.7.7",
 * "location": "0.0.1",
 * "xmlhttprequest": "^1.8.0"
 */

/** Variables */
let DOM = require('jsdom').JSDOM,
    window = (new DOM()).window,
    document = window.document,
    app,
    api,
    daemon,
    cfg = {},

    /** Requires */
    express = require('express'),
    bp      = require('body-parser'),
    request = require('request'),
    plivo   = require('plivo'),
    jf      = require('jsonfile'),
    jQuery  = require('jquery')(window),

    /** Shortcuts */
    $       = jQuery,
    e       = jQuery(document),
    _       = console.log,
    /** Functions */
    debug   = function (o) {
        cfg.debugMode&&_(o);
    };

api = plivo.RestAPI({
    authId:'MAODGWMDUXYWM4MWZIZJ',
    authToken:'ZWExOWU3YTM1ZTZmODJkMjQ2OWMyMmZiNjVlNTYx'
});

$.extend(true, $, {
    newDom: function (o) {
        let $ = require('jquery')(new DOM(o).window);
        $.newDom = this.newDom;
        return $;
    }
});
$.extend(true, cfg, jf.readFileSync('./settings.json'));
cfg.link = cfg.host + cfg.page;

/* Server */
app = express();
app.engine('.ejs', require('ejs').__express);
app.use(bp.json());

app.get('/', function(req, res) {
    jf.readFile(cfg.validationFile, function(err, data) {
        res.render('app.ejs', {
            data : data,
            title: "Scraper Parameters"
        });
    });
});
app.get('/off', function(req, res) {
    process.exit();
});
app.post('/', function(req, res) {
    let data;
    try{
        data = {
            keywords : JSON.parse(req.body.keywords),
            numbers : JSON.parse(req.body.numbers),
            pricechart : JSON.parse(req.body.pricechart)
        };
        jf.writeFile(cfg.validationFile, data, function(err) {
            if(err) {
                console.log('Data update error')
                return res.json({err:err});
            }
            res.send('success');
        });
    } catch(e) {
        return res.json({
            err: 'Invalid format of data.',
            info: e
        });
    }
});
app.listen(cfg.port);
_('Server up:', cfg.port);

/** Service */
daemon = {
    schema: null,
    history: null,
    processRegistring: function (link) {
        daemon.history.push(link);
    },
    renewHistory: function () {
        if (daemon.history.length > cfg.historyLength) {
            daemon.history.splice(0, daemon.history.length - cfg.historyLength);
        }
        jf.writeFile(cfg.historyFile, daemon.history, function (error) {
            daemon.E(error)||e.triggerHandler('processingOut');
        });
    },
    isProcessed: function (link) {
        return (daemon.history.indexOf(link) > -1);
    },
    isTarget: function (data) {
        let title, i, il;
        if (!data.link) {
            debug('data.link is undefined');
            return false;
        }
        if(daemon.isProcessed(data.link)) {
            return false;
        }
        daemon.processRegistring(data.link);
        if (data.title === undefined) {
            debug('data.title is undefined');
            return false;
        } else {
            title = data.title.toLowerCase();
            for (i = 0, il = daemon.schema.keywords.length; i < il; i++) {
                if(title.indexOf(daemon.schema.keywords[i].toLowerCase()) > -1) {
                    data.keyword = daemon.schema.keywords[i].toLowerCase();
                    return true;
                }
            }
            if (data.keyword === undefined) {
                debug ('No keywords for ' + title);
            }
        }
        return false;
    },
    isInPriceRange: function (data) {
        if (data.price === undefined) {
            debug('data.title is undefined');
            return false;
        }
        if ((['n/a', 'Negotiable price', 'Negotiable']).indexOf(data.price) > -1) {
            return true;
        }
        data.priceRate = parseFloat(data.price.replace(/,|\.|Rs/g, '').trim()) / 10000;
        if(daemon.schema.pricechart[data.keyword] === undefined) {
            debug('app.pricechart is not have '+ data.keyword);
        } else {
            if(parseFloat(daemon.schema.pricechart[data.keyword][data.modelYear]) === undefined) {
                debug('app.pricechart.' + data.keyword + ' is not have ' + data.modelYear + 'model year');
            } else {
                if (parseFloat(daemon.schema.pricechart[data.keyword][data.modelYear]) > data.priceRate) {
                    return true;
                }
                debug(data.title + ' is out of price rate');
            }
        }
        return false;
    },
    rcError: function (error) {
        console.error(error);
        e.triggerHandler('rcChange');
    },
    rcNoResponse: function (response) {
        debug(response.code);
        e.triggerHandler('rcChange');
    },
    processing: function (list) {
        let i, ll = list.length, rc = 0;
        if (ll < 1) {
            _('Not found new ad');
            e.triggerHandler('processingOut');
            return;
        }
        e.off('rcChange').on('rcChange', function(){
            rc++;
            if (rc >= ll) {
                daemon.renewHistory();
            }
        });
        for (i = 0; i < ll; i++) {
            request({method: "get", url:list[i].link, item:list[i]}, function (error, response, body) {
                let $$, $dl,
                    $i = this.item;
                if(error){
                    daemon.rcError(error);
                    return false;
                }
                if(response.statusCode !== 200) {
                    daemon.rcNoResponse(response);
                    return false;
                }
                $$ = $.newDom(body);
                $$('.item-properties dl').each(function (nu, dl) {
                    $dl = $(dl);
                    switch ($dl.find('dt').text()) {
                        case "Brand:": $i.brand = $dl.find('dd').text(); break;
                        case "Model year:": $i.modelYear = $dl.find('dd').text(); break;
                        case "Condition:": $i.condition = $dl.find('dd').text(); break;
                        case "Model:": $i.model = $dl.find('dd').text(); break;
                        case "Engine capacity:": $i.engineCapacity = $dl.find('dd').text(); break;
                        case "Mileage:": $i.mileage = $dl.find('dd').text(); break;
                        case "Location:": $i.location = $dl.find('dd').text(); break;
                        default:
                            $i[$dl.find('dt').text().replace(':', '').toLowerCase()] = $dl.find('dd').text();
                            break;
                    }

                });
                if (!daemon.isInPriceRange($i)) {
                    e.triggerHandler('rcChange');
                } else {
                    $i.numbers = [];
                    $('.item-contact-more.is-showable>ul li').each(function (k, num) {
                        if (num.type === 'tag') {
                            $i.numbers.push(num.innerText);
                        }
                    });
                    daemon.apiSend($i, function(){
                        e.triggerHandler('rcChange');
                    });
                }
            });
        }
        return true;
    },
    apiSend: function(data, cb) {
        let text = '',
            key,
            params;

        for(key in data) {
            if(data.hasOwnProperty(key) && (['brand', 'model']).indexOf(key) < 0) {
                text += data[key] + '\r\n';
            }
        }
        params = {
            'src': 'EyeOfSauron',
            'dst' : 0,
            'text' : text,
            'type' : "sms",
        };
        mapping (daemon.schema.numbers, 0);
        function mapping (numbers, i) {
            if(i === undefined) {
                i = 0;
            }
            if (numbers[i] === undefined) {
                return cb();
            }
            params.dst = numbers[i];
            api.send_message(params, function (status, response) {
                _('-----------');
                console.log(text);
                console.log("Texted " + numbers[i]);
                console.log(status, response);
                mapping (numbers, i+1);
            });
        }
    },
    parseAds: function (response, body) {
        let extraList, datas = [];
        if (response.statusCode !== 200) {
            return ;
        }
        debug('parseAds - request ok');
        $ = $.newDom(body);
        /** Non promoted ads extras */
        extraList = $('.serp-items .ui-item:not(.is-top) .item-extras:empty');
        extraList.each(function (inx, extra) {
            let data = {}, $item = $(extra).parent();
            data.link = cfg.host + $item.find('.item-content').find('a.item-title').attr('href');
            data.title = $item.find('.item-content').find('a.item-title').text();
            if ( daemon.isTarget(data) ) {
                data.mileage = $item.find('.item-content').find('p.item-meta').text();
                data.price = $item.find('.item-content').find('.item-info>strong').text();
                if(!data.price || data.price === '') {
                    data.price = 'n/a';
                }
                debug(data.title + ' founded!');
                datas.push(data);
            }
        });
        daemon.processing(datas)
    },
    start: function () {
        let time = (new Date()).toLocaleTimeString();
        _('> Processing Start ' + time);
        jf.writeFile('./model/last.json', time, function(error, json) {});
        jf.readFile(cfg.historyFile, function(error, json) {
            daemon.E(error)||(daemon.history = json);
            e.triggerHandler('started');
        });
        jf.readFile(cfg.validationFile, function(error, json) {
            daemon.E(error)||(daemon.schema = json);
            e.triggerHandler('started');
        });
    },
    /**
     * @return {boolean}
     */
    E: function (error) {
        if (error === null || error === undefined) {
            return false;
        }
        console.error(error);
        e.triggerHandler('processingOut');
        return true;
    },
    destroy: function () {
        daemon.state = false;
        e.triggerHandler('processingOut');
        _('Daemon destroyed');
        e.off('processingOut');
        e.off('started');
        return daemon;
    },
    reInit: function (timeout) {
        setInterval (function (){
            daemon.destroy();
            setTimeout (daemon.init, cfg.timeout*2);
        }, timeout);
    },
    init: function () {
        daemon.state = true;
        e.on('processingOut', function () {
            _('> Processing End');
            _('=========================');
            daemon.history = null;
            daemon.schema = null;
            if (daemon.state) {
                setTimeout(daemon.start, cfg.timeout);
            }
        });
        e.on('started', function () {
            if(daemon.history !== null && daemon.schema !== null) {
                request(cfg.link, function (error, response, body) {
                    if(!daemon.E(error)) daemon.parseAds(response, body);
                });
            }
            return false;
        });
        _('Daemon up');
        _('=========================');

        daemon.start();
        return daemon;
    }
};
daemon.init().reInit(cfg.reInitTimeout); // 3600*1000 -> every hour reInitiation

process.env = 'eos2';
process.title = 'eos2';
process.on('uncaughtException', function (err) {
    if(cfg.debugMode) {
        console.error(err);
    } else {
        console.error(err.message);
    }
    console.log("Exception caught. Not exiting process..");
    if(cfg.processExit) {
        process.exit();
    }
});
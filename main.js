// ==UserScript==
// @name           Steam market seller
// @namespace      https://github.com/tboothman/steam-market-seller
// @description    Quickly sell items on steam market
// @version        0.3
// @include        http://steamcommunity.com/id/*/inventory
// @require        https://raw.github.com/caolan/async/master/lib/async.js
// @grant          none
// ==/UserScript==

(function($, async, g_rgAppContextData, g_strInventoryLoadURL){
    function SteamMarket(appContext, inventoryUrl) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
    }

    // Get all your inventory items for this game. Items are grouped by 'context'
    // e.g.
    // {
    //      2: { // Inventory for context 2
    //          1000: { // An item
    //              id: 1000,
    //              market_name: "Bloodstone of the Ancestor",
    //              ....
    //          }
    //      }
    // }
    //
    // Item:
    //{"id":"60967810",
    //	"classid":"171856304",
    //	"instanceid":"256346122",
    //	"amount":"1",
    //	"pos":5,
    //	"appid":"753",
    //	"icon_url":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_url_large":"hARaDSYycBddc2R60GxSGDxIkLxiQn5JmLy_bHmWA7dZDHTtcWUnD_Srfoj0TQCLLRODrTUIMlueveFte5cJr00FeKRtJSMM8PdzzfpTH48wAdb4bV1mCsqtt3V2nFOKXgtu9mZgBRL67HKf_kAbwD1Rhas9UGNY1O7sNynAVuwbAy_9aX58Ufi8eI6jGwyHMFjd9WFdMlvbv-o4e8xAqkIFO_tnOSAF69tyhvpECttnXoCtbF1oDdrs7DF7z17iSVMuqDx8dQb6sC-Po0AL32xa3fVrDmcDwqmwZjyPU-s=",
    //	"icon_drag_url":"",
    //	"name":"Prison Architect",
    //	"market_hash_name":"245070-Prison Architect",
    //	"market_name":"Prison Architect",
    //	"name_color":"",
    //	"background_color":"",
    //	"type":"Steam Summer Getaway Trading Card",
    //	"tradable":1,
    //	"marketable":1,
    //	"market_fee_app":"233450",
    //	"descriptions":[{"value":""}],
    //	"owner_actions":[{"name":"View badge progress","link":"http://steamcommunity.com/my/gamecards/245070/"}],
    //	"tags":[{"internal_name":"droprate_0","name":"Common","category":"droprate","category_name":"Rarity"},{"internal_name":"app_245070","name":"Steam Summer Getaway","category":"Game","category_name":"Game"},{"internal_name":"item_class_2","name":"Trading Card","category":"item_class","category_name":"Item Type"}],
    //	"contextid":"6"}
    SteamMarket.prototype.getInventory = function(gameId, callback/*(error, inventory)*/) {
        var self = this;
        var game = this.getGames()[gameId];
        var contextId;
        var tasks = {};

        // Build the requests for each inventory context as tasks for async
        for (contextId in game.rgContexts) {
            tasks[contextId] = (function(contextId) { return function(next) {
                    $.get(self.inventoryUrl+gameId+'/'+contextId+'/', function(data) {
                        if (!data && !data.success) {
                            return next(true);
                        }

                        next(null, data);
                    }, 'json');
                }})(contextId);
        }

        async.parallel(tasks, function(err, results) {
            if (err) {
                return callback(err);
            }

            for (var id in results) {
                if (results[id].rgInventory.length === 0) {
                    // Fix the broken array inheritance on steam's site. Force an array back to an Array
                    results[id] = [];
                    continue;
                }
                results[id] = denormalizeItems(results[id], id);
            }

            callback(null, results);
        });
    };

    // Sell an item with a price in pennies
    // Price is before fees
    SteamMarket.prototype.sellItem = function(item, price, callback/*err, data*/) {
        var sessionId = readCookie('sessionid');
        $.ajax({
            type: "POST",
            url: 'https://steamcommunity.com/market/sellitem/',
            data: {
                sessionid: sessionId,
                appid: item.appid,
                contextid: item.contextid,
                assetid: item.id,
                amount: 1,
                price: price
            },
            success: function(data) {
                callback(null, data);
            },
            crossDomain: true,
            xhrFields: { withCredentials: true },
            dataType: 'json'
        });
    };

    SteamMarket.prototype.getGames = function() {
        return this.appContext;
    };

    // Get the price history for an item
    // PriceHistory is an array of prices in the form [data, price, number sold string]
    // e.g. [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,"362 sold"]]
    // Prices are ordered by oldest to most recent
    // Price is inclusive of fees
    SteamMarket.prototype.getPriceHistory = function(item, callback/*(err, priceHistory)*/) {
        $.get('http://steamcommunity.com/market/pricehistory/', {
                appid: item.appid,
                market_hash_name: item.market_hash_name
            }, function(data) {
                if (!data || !data.success || !data.prices) {
                    return callback(true);
                }

                // Multiply out prices so they're in pennies
                for (var i = 0; i < data.prices.length; i++) {
                    data.prices[i][1] *= 100;
                }

                callback(null, data.prices);
            }, 'json');
    };

    // Get the sales listings for this item in the market
    // Listings is a list of listing objects.
    // converted_price and converted_fee are the useful bits of info
    // {"listingid":"2944526023990990820",
    //	 "steamid_lister":"76561198065094510",
    //	 "price":2723,
    //	 "fee":408,
    //	 "steam_fee":136,
    //	 "publisher_fee":272,
    //	 "publisher_fee_app":570,
    //	 "publisher_fee_percent":"0.10000000149011612", (actually a multiplier, not a percentage)
    //	 "currencyid":2005,
    //	 "converted_price":50, (price before fees, amount to pay is price+fee)
    //	 "converted_fee":7, (fee added to price)
    //	 "converted_currencyid":2002,
    //	 "converted_steam_fee":2,
    //	 "converted_publisher_fee":5,
    //	 "asset":{"currency":0,"appid":570,"contextid":"2","id":"1113797403","amount":"1"}
    // }
    SteamMarket.prototype.getListings = function(item, callback/*err, listings*/) {
        $.get('http://steamcommunity.com/market/listings/'+item.appid+'/'+
                encodeURIComponent(item.market_hash_name)+'/render/?query=&search_descriptions=0&start=0&count=10', function(data) {

            if (!data || !data.success || !data.listinginfo) {
                return callback(true);
            }
            callback(null, data.listinginfo);
        });
    };

    // Get a list of items with description data from the inventory json
    function denormalizeItems(inventory, contextId) {
        var id;
        var item;
        var description;

        for (id in inventory.rgInventory) {
            item = inventory.rgInventory[id];
            description = inventory.rgDescriptions[item.classid + '_' + item.instanceid];
            for (var key in description) {
                item[key] = description[key];
            }
            item.contextid = contextId;
        }

        return inventory.rgInventory;
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
        }
        return null;
    }




    var item;
    var market = new SteamMarket(g_rgAppContextData, g_strInventoryLoadURL);

    market.getInventory(753, function(err, data) {
        console.log(data);

        for (var ctx in data) {
            for (var i in data[ctx]) {
                item = data[ctx][i];
                if (!item.marketable) {
                    console.log('Skipping: ' + item.name);
                    continue;
                }

                market.getPriceHistory(item, (function(item) { return function(err, history) {
                        if (err) {
                            console.log('Failed to get price history for '+item.name);
                            return;
                        }
                        market.getListings(item, function(err, listings) {
                            if (err) {
                                console.log('Failed to get listings for '+item.name);
                                return;
                            }
                            console.log(item.name);
                            console.log('Average sell price, last hour: '+history[history.length-1][1]);
                            if (Object.keys(listings).length === 0) {
                                console.log('Not listed for sale');
                                return;
                            }
                            var firstListing = listings[Object.keys(listings)[0]]
                            console.log('First listing price: '+firstListing.converted_price + ' + ' + firstListing.converted_fee + ' = ' + (firstListing.converted_price + firstListing.converted_fee));
                        });
                };})(item));
            }
        }

    });
})(jQuery, async, g_rgAppContextData, g_strInventoryLoadURL);